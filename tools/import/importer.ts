// Core of `npm run packs:import`: downloads/ inbox -> assets/raw/<pack_id>/ packs.
// Pure of process state (no cwd, no exit): tests point it at temp directories.
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync } from 'node:fs';
import { extname, isAbsolute, join, relative } from 'node:path';
import { type CatalogRow, loadCatalog, packIdForRow, rowRef } from './catalog.ts';
import { detectAsset, detectDoubling, inspectPng, rejectionForExtension } from './image.ts';
import { type Candidate, Matcher, type MatchResult, baseName, describeRow, loadMatchOverrides, matchJsonLine, overrideFor } from './match.ts';
import {
  type ImageItem,
  type PackPlan,
  type PackWriteResult,
  type TermsItem,
  PackError,
  flattenPath,
  loadIndex,
  packHasSha,
  safeFileName,
  saveIndex,
  summarizeAssets,
  writePack,
} from './pack.ts';
import { BundleSafetyError, DEFAULT_LIMITS, type Bundle, type BundleLimits, extractZip, readFolderBundle, stripCommonRoot } from './zip.ts';

export interface ImportOptions {
  /** Repo root; defaults for the other paths are resolved against it. */
  root: string;
  /** Inbox of manual downloads (default <root>/downloads). */
  inbox?: string;
  /** Output folder for raw packs (default <root>/assets/raw). */
  out?: string;
  /** Catalog CSV (default <root>/asset-catalog/tilesets.csv). */
  catalog?: string;
  /** YYYY-MM-DD used for retrieved_at and terms_<date>.txt (default: local today). */
  today?: string;
  /** Plan and report, but write and move nothing. */
  dryRun?: boolean;
  limits?: BundleLimits;
}

export type Status = 'imported' | 'skipped' | 'rejected' | 'unmatched';

export interface ReportRow {
  status: Status;
  download: string;
  packs: string[];
  details: string;
  warnings: string[];
  candidates?: Candidate[];
  matchJsonLine?: string;
  /** Moved to <inbox>/processed/ */
  moved?: boolean;
}

export interface ImportReport {
  inbox: string;
  out: string;
  today: string;
  dryRun: boolean;
  nothingToImport: boolean;
  rows: ReportRow[];
  packs: PackWriteResult[];
}

export function localToday(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Unmatched downloads list at most 3 candidates, and only ones scoring at least this. */
const MIN_CANDIDATE_SCORE = 0.15;
const IGNORED_NAMES =/^(match\.json|processed|desktop\.ini|thumbs\.db|\.ds_store)$/i;
const TEXT_EXT = new Set(['.txt', '.md']);
const ARCHIVE_EXT = new Set(['.rar', '.7z', '.tar', '.gz', '.tgz', '.bz2', '.xz']);

interface Download {
  name: string;
  abs: string;
  type: 'png' | 'zip' | 'folder' | 'other';
  sibling?: { name: string; abs: string };
  images: ImageItem[];
  terms: TermsItem[];
  warnings: string[];
  match?: MatchResult;
  row?: CatalogRow;
  /** Images skipped because they were imported before (or appear twice in this run). */
  duplicates: { origin: string; pack: string }[];
  result?: ReportRow;
  packs: Set<string>;
  failed: boolean;
}

/** Text files next to a download: "<base>.txt" or "<file>.txt" ("x.png.txt"). */
function siblingNames(entryName: string, isFolder: boolean): string[] {
  const base = isFolder ? entryName : entryName.slice(0, entryName.length - extname(entryName).length);
  return [`${base}.txt`, `${entryName}.txt`].map((n) => n.toLowerCase());
}

function ignoredSummary(ignored: Bundle['ignored']): string | null {
  const parts = Object.entries(ignored)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([ext, n]) => `${ext} x${n}`);
  return parts.length ? `ignored bundle entries (only .png/.txt/.md are kept): ${parts.join(', ')}` : null;
}

function loadImage(d: Download, origin: string, names: { targetName: string; assetHint: string; altHint: string }, data: Uint8Array): ImageItem {
  const info = inspectPng(data);
  const doubling = detectDoubling(info.image);
  const detection = detectAsset(info.width, info.height, names.assetHint, doubling);
  for (const w of detection.warnings) d.warnings.push(`${origin}: ${w}`);
  return { download: d.name, origin, ...names, data, sha256: info.sha256, width: info.width, height: info.height, detection };
}

function loadBundle(d: Download, bundle: Bundle) {
  const strip = stripCommonRoot(bundle.files.map((f) => f.path));
  const sep = d.type === 'zip' ? '!/' : '/';
  for (const f of bundle.files) {
    const origin = `${d.name}${sep}${f.path}`;
    const rel = strip(f.path);
    if (f.path.toLowerCase().endsWith('.png')) {
      const flat = flattenPath(rel);
      const leaf = safeFileName(rel.split('/').pop() ?? rel);
      try {
        // keep the original file name when the bundle has no folders, else the flattened path
        d.images.push(loadImage(d, origin, { targetName: rel.includes('/') ? flat : leaf, assetHint: leaf, altHint: flat }, f.data));
      } catch (e) {
        d.warnings.push(`${origin}: skipped, ${(e as Error).message}`);
      }
    } else {
      d.terms.push({ label: origin, data: f.data });
    }
  }
  const ig = ignoredSummary(bundle.ignored);
  if (ig) d.warnings.push(ig);
}

function moveToProcessed(inbox: string, name: string): string {
  const dir = join(inbox, 'processed');
  mkdirSync(dir, { recursive: true });
  const ext = extname(name);
  const base = name.slice(0, name.length - ext.length);
  let target = join(dir, name);
  for (let n = 2; existsSync(target); n++) target = join(dir, `${base} (${n})${ext}`);
  renameSync(join(inbox, name), target);
  return target;
}

/** Runs the import. Throws only for setup problems (missing catalog, unreadable match.json). */
export function runImport(opts: ImportOptions): ImportReport {
  const root = opts.root;
  const inbox = opts.inbox ?? join(root, 'downloads');
  const out = opts.out ?? join(root, 'assets', 'raw');
  const catalogPath = opts.catalog ?? join(root, 'asset-catalog', 'tilesets.csv');
  const today = opts.today ?? localToday();
  const dryRun = opts.dryRun ?? false;
  const limits = opts.limits ?? DEFAULT_LIMITS;
  const report: ImportReport = { inbox, out, today, dryRun, nothingToImport: false, rows: [], packs: [] };

  mkdirSync(inbox, { recursive: true });
  const entries = readdirSync(inbox, { withFileTypes: true })
    .filter((e) => !IGNORED_NAMES.test(e.name) && !e.name.startsWith('.'))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  if (entries.length === 0) {
    report.nothingToImport = true;
    return report;
  }

  // ---- classify entries; pair .txt files with their downloads
  const texts = new Map<string, { name: string; abs: string }>();
  const downloads: Download[] = [];
  for (const e of entries) {
    const abs = join(inbox, e.name);
    if (lstatSync(abs).isSymbolicLink()) {
      report.rows.push({ status: 'skipped', download: e.name, packs: [], details: 'symbolic link (not followed)', warnings: [] });
      continue;
    }
    const ext = extname(e.name).toLowerCase();
    if (e.isFile() && TEXT_EXT.has(ext)) {
      texts.set(e.name.toLowerCase(), { name: e.name, abs });
      continue;
    }
    const type: Download['type'] = e.isDirectory() ? 'folder' : ext === '.png' ? 'png' : ext === '.zip' ? 'zip' : 'other';
    downloads.push({ name: e.name, abs, type, images: [], terms: [], warnings: [], duplicates: [], packs: new Set(), failed: false });
  }
  for (const d of downloads) {
    for (const s of siblingNames(d.name, d.type === 'folder')) {
      const t = texts.get(s);
      if (t) {
        d.sibling = t;
        texts.delete(s);
        break;
      }
    }
  }
  const finish = (d: Download, row: Omit<ReportRow, 'download' | 'warnings'>) => {
    d.result = { ...row, download: d.name, warnings: [...d.warnings] };
  };

  // ---- reject what we can tell from the name alone
  for (const d of downloads) {
    if (d.type !== 'other') continue;
    const ext = extname(d.name).toLowerCase();
    const reason =
      rejectionForExtension(ext) ??
      (ARCHIVE_EXT.has(ext)
        ? `${ext} archives are not supported: extract it into a folder inside downloads/ (or re-pack it as .zip)`
        : `unsupported file type "${ext || '(none)'}" (expected .png, .zip or a folder)`);
    finish(d, { status: 'rejected', packs: [], details: reason });
  }

  const pending = downloads.filter((d) => !d.result);
  if (pending.length) {
    if (!existsSync(catalogPath)) throw new Error(`catalog not found: ${catalogPath} (expected the tileset catalog CSV)`);
    const matcher = new Matcher(loadCatalog(catalogPath));
    const overrides = loadMatchOverrides(join(inbox, 'match.json'));

    // ---- load images and bundle texts
    for (const d of pending) {
      try {
        if (d.type === 'png') {
          const data = new Uint8Array(readFileSync(d.abs));
          const name = safeFileName(d.name);
          d.images.push(loadImage(d, d.name, { targetName: name, assetHint: name, altHint: name }, data));
        } else if (d.type === 'zip') {
          if (statSync(d.abs).size > limits.maxTotalBytes) throw new BundleSafetyError(`zip is larger than ${Math.round(limits.maxTotalBytes / 1024 / 1024)} MB`);
          loadBundle(d, extractZip(new Uint8Array(readFileSync(d.abs)), limits));
        } else {
          loadBundle(d, readFolderBundle(d.abs, limits));
        }
      } catch (e) {
        const msg = (e as Error).message;
        finish(d, { status: 'rejected', packs: [], details: e instanceof BundleSafetyError ? `unsafe or unreadable ${d.type}: ${msg}` : msg });
        continue;
      }
      if (d.images.length === 0) {
        finish(d, { status: 'rejected', packs: [], details: `${d.type} contains no usable PNG images` });
        continue;
      }
      if (d.sibling) d.terms.unshift({ label: d.sibling.name, data: new Uint8Array(readFileSync(d.sibling.abs)) });

      // ---- match to a catalog row
      const m = matcher.match(d.name, overrideFor(overrides, d.name));
      d.match = m;
      if (m.kind === 'unmatched') {
        const plausible = m.candidates.filter((c) => c.score >= MIN_CANDIDATE_SCORE);
        finish(d, {
          status: 'unmatched',
          packs: [],
          details: m.reason,
          candidates: plausible,
          matchJsonLine: matchJsonLine(d.name, plausible[0]?.row),
        });
        continue;
      }
      d.row = m.row;
      d.warnings.push(...m.warnings);
    }

    // ---- drop images imported before (by sha256) or seen earlier in this run
    const index = loadIndex(out);
    const seen = new Map<string, string>();
    for (const d of pending) {
      if (d.result || !d.row) continue;
      const fresh: ImageItem[] = [];
      for (const img of d.images) {
        const prevPack = index.sha256[img.sha256];
        if (prevPack && packHasSha(join(out, prevPack), img.sha256)) d.duplicates.push({ origin: img.origin, pack: prevPack });
        else if (seen.has(img.sha256)) d.duplicates.push({ origin: img.origin, pack: `(same as ${seen.get(img.sha256)})` });
        else {
          seen.set(img.sha256, img.origin);
          fresh.push(img);
        }
      }
      d.images = fresh;
      if (fresh.length === 0) {
        const packs = [...new Set(d.duplicates.map((x) => x.pack))];
        finish(d, { status: 'skipped', packs: packs.filter((p) => !p.startsWith('(')), details: `already imported (${packs.join(', ')})` });
      }
    }

    // ---- group by catalog row, split by tile size, write
    const groups = new Map<number, { row: CatalogRow; downloads: Download[] }>();
    for (const d of pending) {
      if (d.result || !d.row) continue;
      const g = groups.get(d.row.index) ?? { row: d.row, downloads: [] };
      g.downloads.push(d);
      groups.set(d.row.index, g);
    }
    for (const { row, downloads: group } of [...groups.values()].sort((a, b) => a.row.index - b.row.index)) {
      const baseId = packIdForRow(row);
      const images = group.flatMap((d) => d.images);
      const terms = group.flatMap((d) => d.terms);
      const bySize = new Map<16 | 32, ImageItem[]>();
      for (const img of images) bySize.set(img.detection.tilePx, [...(bySize.get(img.detection.tilePx) ?? []), img]);
      let baseSize: 16 | 32 | undefined;
      try {
        const existingPx = existsSync(join(out, baseId, 'pack.json'))
          ? (JSON.parse(readFileSync(join(out, baseId, 'pack.json'), 'utf8')) as { format?: { native_tile_px?: unknown } }).format?.native_tile_px
          : undefined;
        if (existingPx === 16 || existingPx === 32) baseSize = existingPx;
      } catch {
        // invalid JSON: writePack reports it
      }
      const sizes = [...bySize.keys()].sort((a, b) => bySize.get(b)!.length - bySize.get(a)!.length || a - b);
      baseSize ??= sizes[0];
      const split = sizes.length > 1 || (baseSize !== undefined && !bySize.has(baseSize));
      for (const px of sizes) {
        const plan: PackPlan = {
          packId: px === baseSize ? baseId : `${baseId}-${px}px`,
          row,
          tilePx: px,
          images: bySize.get(px)!,
          terms,
        };
        if (split && px !== baseSize) plan.splitOf = baseId;
        const owners = group.filter((d) => d.images.some((i) => plan.images.includes(i)));
        if (split) {
          const why = sizes.length > 1 ? 'images disagree on tile size' : `existing pack ${baseId} is ${baseSize} px`;
          for (const d of owners) d.warnings.push(`${why}: the ${px} px images go to pack ${plan.packId}`);
        }
        try {
          const res = writePack(out, plan, today, dryRun);
          report.packs.push(res);
          for (const d of owners) d.packs.add(res.packId);
          for (const img of res.alreadyPresent) {
            const d = group.find((x) => x.name === img.download);
            d?.duplicates.push({ origin: img.origin, pack: res.packId });
          }
          if (!dryRun) {
            for (const img of plan.images) index.sha256[img.sha256] = res.packId;
            saveIndex(out, index);
          }
        } catch (e) {
          const msg = e instanceof PackError ? e.message : `failed to write pack ${plan.packId}: ${(e as Error).message}`;
          for (const d of owners) {
            d.failed = true;
            d.warnings.push(msg);
          }
        }
      }
      for (const d of group) {
        if (d.failed) {
          finish(d, { status: 'rejected', packs: [...d.packs], details: 'could not write the pack (see warnings); download left in place' });
          continue;
        }
        const results = report.packs.filter((p) => d.packs.has(p.packId));
        if (!results.some((r) => r.addedAssets.some((a) => d.images.some((i) => i.origin === a.origin)))) {
          finish(d, { status: 'skipped', packs: [...d.packs], details: `already imported (${[...d.packs].join(', ')} has the same file hashes)` });
          continue;
        }
        const parts = results.map((r) => {
          const mine = r.addedAssets.filter((a) => d.images.some((i) => i.origin === a.origin));
          const what = summarizeAssets(mine);
          const verb = r.created ? 'new pack' : 'merged into existing pack';
          return `${verb}: ${mine.length} asset${mine.length === 1 ? '' : 's'}${what ? ` (${what})` : ''}`;
        });
        if (d.terms.length === 0 && results.some((r) => r.created && !r.termsFile)) d.warnings.push(`no terms snapshot: paste the page's description/terms into "${baseName(d.name)}.txt" next to the download`);
        if (d.duplicates.length) d.warnings.push(`${d.duplicates.length} image(s) were already imported and were skipped`);
        const how = d.match?.kind === 'matched' ? d.match.how : 'name';
        finish(d, { status: 'imported', packs: [...d.packs], details: `${parts.join('; ')} [${rowRef(row)}, matched by ${how}]` });
      }
    }
  }

  // ---- move finished downloads (imported or duplicate) to processed/
  for (const d of downloads) {
    const r = d.result!;
    if (dryRun || (r.status !== 'imported' && r.status !== 'skipped')) continue;
    try {
      moveToProcessed(inbox, d.name);
      if (d.sibling) moveToProcessed(inbox, d.sibling.name);
      r.moved = true;
    } catch (e) {
      r.warnings.push(`could not move to processed/ (${(e as Error).message}); move it by hand`);
    }
  }
  for (const t of texts.values()) {
    report.rows.push({
      status: 'skipped',
      download: t.name,
      packs: [],
      details: 'text file with no download of the same name (expected e.g. "<name>.png" next to "<name>.txt")',
      warnings: [],
    });
  }
  report.rows.push(...downloads.map((d) => d.result!));
  const order: Record<Status, number> = { imported: 0, skipped: 1, rejected: 2, unmatched: 3 };
  report.rows.sort((a, b) => order[a.status] - order[b.status] || (a.download < b.download ? -1 : 1));
  return report;
}

// ---------------------------------------------------------------- printing

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 3)}...`;
}

export function formatReport(report: ImportReport, root?: string): string {
  const rel = (p: string) => {
    const r = root ? relative(root, p) : '';
    return r && !r.startsWith('..') && !isAbsolute(r) ? r.replace(/\\/g, '/') : p.replace(/\\/g, '/');
  };
  if (report.nothingToImport) {
    return [
      `Nothing to import: ${rel(report.inbox)}/ is empty.`,
      'Save tileset PNGs or zips there (keep the original file names, and paste each page\'s terms into a',
      '".txt" with the same name; see asset-catalog/starter-packs.md), then run "npm run packs:import" again.',
    ].join('\n');
  }
  const lines: string[] = [];
  lines.push(`Tileset import ${report.dryRun ? '(dry run: nothing written or moved) ' : ''}${report.today}: ${rel(report.inbox)}/ -> ${rel(report.out)}/`);
  lines.push('');
  const header = ['STATUS', 'DOWNLOAD', 'PACK', 'DETAILS'];
  const table = report.rows.map((r) => [
    report.dryRun && r.status === 'imported' ? 'would import' : r.status,
    truncate(r.download, 48),
    truncate(r.packs.join(', ') || '-', 40),
    r.details,
  ]);
  const widths = header.map((h, i) => Math.max(h.length, ...table.map((row) => row[i]!.length)));
  widths[3] = Math.min(widths[3]!, 100);
  const fmt = (cells: string[]) => cells.map((c, i) => (i === cells.length - 1 ? c : c.padEnd(widths[i]!))).join('  ');
  lines.push(fmt(header));
  lines.push(fmt(widths.map((w) => '-'.repeat(w))));
  for (const row of table) lines.push(fmt(row));
  lines.push('');
  const count = (s: Status) => report.rows.filter((r) => r.status === s).length;
  lines.push(`Totals: ${count('imported')} imported, ${count('skipped')} skipped, ${count('rejected')} rejected, ${count('unmatched')} unmatched`);

  const unmatched = report.rows.filter((r) => r.status === 'unmatched');
  if (unmatched.length) {
    lines.push('', `Unmatched (left in ${rel(report.inbox)}/). Add a line to ${rel(join(report.inbox, 'match.json'))} for each, then re-run:`);
    for (const r of unmatched) {
      lines.push('', `  ${r.download}: ${r.details}`);
      if (r.candidates?.length) {
        lines.push('    top candidates:');
        r.candidates.forEach((c, i) => lines.push(`      ${i + 1}. ${Math.round(c.score * 100)}%  ${describeRow(c.row)}`));
      } else {
        lines.push('    no plausible candidates: find the row in asset-catalog/tilesets.csv and use its url');
      }
      lines.push('    match.json line:', `      ${r.matchJsonLine}`);
    }
    lines.push('', '  match.json is one object: { "<download file name>": "<catalog url, or \\"<tab>#<number>\\">", ... }');
  }

  const warned = report.rows.filter((r) => r.warnings.length);
  if (warned.length) {
    lines.push('', 'Warnings:');
    for (const r of warned) for (const w of r.warnings) lines.push(`  - ${r.download}: ${w}`);
  }
  const created = report.packs.filter((p) => p.created);
  if (created.length && !report.dryRun) {
    lines.push('', 'Review each new pack.json before using it in a theme:');
    for (const p of created) lines.push(`  - ${rel(join(p.dir, 'pack.json'))}`);
    lines.push(
      '  Read the terms snapshot, then set ripped_from_official ("none"/"partial"), upstream_credits,',
      '  license.status ("ok"/"restricted") and named tiles/regions. Raw packs stay git-ignored (private-only).',
    );
  }
  return lines.join('\n');
}
