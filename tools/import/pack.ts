// Writing assets/raw/<pack_id>/: image files, dated terms snapshot and a PackManifest pack.json.
// An existing pack.json is never rewritten from scratch: new files/assets are merged into the raw
// JSON so human edits (licence review, tiles, regions, extra keys) survive.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PackManifest } from '@tdmm/map-format';
import {
  type CatalogRow,
  cleanTitle,
  creditLine,
  licenseStatus,
  normalizeUrl,
  rippedFromOfficial,
  siteName,
} from './catalog.ts';
import { type Detection, describeDetection, sha256 } from './image.ts';
import { baseName, parseDeviantArtFileName } from './match.ts';

export interface ImageItem {
  /** Top-level download this image came from (file or bundle name in the inbox). */
  download: string;
  /** "file.png" or "bundle.zip!/dir/file.png" */
  origin: string;
  /** Desired file name inside the pack folder (already safe and flattened). */
  targetName: string;
  /** The image's own file name (no folders): the asset is named after it. */
  assetHint: string;
  /** More specific name used when assetHint collides (the flattened bundle path). */
  altHint: string;
  data: Uint8Array;
  sha256: string;
  width: number;
  height: number;
  detection: Detection;
}

export interface TermsItem {
  /** Where the text came from: "x.txt" (sibling paste) or "bundle.zip!/credits.txt". */
  label: string;
  data: Uint8Array;
}

export interface PackPlan {
  packId: string;
  row: CatalogRow;
  tilePx: 16 | 32;
  /** Set when images of one catalog row were split by tile size into several packs. */
  splitOf?: string;
  images: ImageItem[];
  terms: TermsItem[];
}

export interface PackWriteResult {
  packId: string;
  dir: string;
  created: boolean;
  addedAssets: { name: string; file: string; origin: string; detection: Detection }[];
  /** Images already present in the pack (same sha256), so nothing was added for them. */
  alreadyPresent: ImageItem[];
  termsFile: string | null;
}

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;

/** A file name that is safe on Windows and inside a file: URL (no #, ?, %, separators or control chars). */
export function safeFileName(name: string, maxLength = 150): string {
  let s = name.replace(/[\x00-\x1f<>:"/\\|?*#%]/g, '_').replace(/[. ]+$/, '').trim();
  const dot = s.lastIndexOf('.');
  let base = dot > 0 ? s.slice(0, dot) : s;
  const ext = dot > 0 ? s.slice(dot).toLowerCase() : '';
  if (WINDOWS_RESERVED.test(base)) base = `_${base}`;
  if (base === '') base = 'file';
  if (base.length + ext.length > maxLength) {
    const h = sha256(new TextEncoder().encode(base)).slice(0, 8);
    base = `${base.slice(0, maxLength - ext.length - 9)}_${h}`;
  }
  s = base + ext;
  return s;
}

/** "Outdoor/Trees/Big.png" -> "Outdoor__Trees__Big.png" */
export function flattenPath(path: string): string {
  return safeFileName(path.split('/').map((p) => p.replace(/__+/g, '_')).join('__'));
}

/** Asset key part: [a-z0-9_-], DeviantArt "_by_<artist>_<code>" and Essentials "[x]" suffixes removed. */
export function assetSlug(fileName: string): string {
  const da = parseDeviantArtFileName(fileName);
  const base = da ? da.title : baseName(fileName.split('/').pop() ?? fileName);
  const s = base
    .replace(/\[\d+\]/g, '')
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/['\p{Pi}\p{Pf}]/gu, '')
    .replace(/[^a-z0-9-]+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^[_-]+|[_-]+$/g, '')
    .slice(0, 64)
    .replace(/[_-]+$/, '');
  return s || 'asset';
}

export function readJsonFile(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8').replace(/^\s+/, ''));
}

export function writeJsonFile(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

/** Decodes a pasted terms file: UTF-8 (with or without BOM), UTF-16 with BOM, else Windows-1252. */
export function decodeText(data: Uint8Array): string {
  if (data[0] === 0xff && data[1] === 0xfe) return new TextDecoder('utf-16le').decode(data.subarray(2));
  if (data[0] === 0xfe && data[1] === 0xff) return new TextDecoder('utf-16be').decode(data.subarray(2));
  try {
    const s = new TextDecoder('utf-8', { fatal: true }).decode(data);
    return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
  } catch {
    return new TextDecoder('windows-1252').decode(data);
  }
}

/** One text: copied verbatim. Several: combined into one UTF-8 file with a header per source. */
export function termsContent(terms: TermsItem[], today: string): Uint8Array {
  if (terms.length === 1) return terms[0]!.data;
  const parts = [`Terms and credits text collected by tools/import-packs.ts on ${today}.`, ''];
  for (const t of terms) {
    parts.push(`===== ${t.label} =====`, decodeText(t.data).replace(/\r\n/g, '\n').trimEnd(), '');
  }
  return new TextEncoder().encode(parts.join('\n'));
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i++) if (a[i] !== b[i]) return false;
  return true;
}

type RawManifest = Record<string, unknown> & {
  source?: Record<string, unknown>;
  license?: Record<string, unknown>;
  assets?: Record<string, unknown>;
};

export class PackError extends Error {}

export function loadExistingManifest(dir: string): RawManifest | null {
  const path = join(dir, 'pack.json');
  if (!existsSync(path)) return null;
  let raw: unknown;
  try {
    raw = readJsonFile(path);
  } catch (e) {
    throw new PackError(`${path} is not valid JSON (${(e as Error).message}); fix it, then run the import again`);
  }
  const parsed = PackManifest.safeParse(raw);
  if (!parsed.success) {
    throw new PackError(`${path} does not validate (${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}); fix it, then run the import again`);
  }
  return raw as RawManifest;
}

function existingFiles(raw: RawManifest | null): { file: string; sha256: string }[] {
  const files = raw?.source?.files;
  if (!Array.isArray(files)) return [];
  return files.filter((f): f is { file: string; sha256: string } => !!f && typeof f === 'object' && typeof (f as { sha256?: unknown }).sha256 === 'string');
}

/** True if this pack folder already holds an image with this sha256 (per its pack.json, file present). */
export function packHasSha(dir: string, sha: string): boolean {
  try {
    const raw = existsSync(join(dir, 'pack.json')) ? (readJsonFile(join(dir, 'pack.json')) as RawManifest) : null;
    return existingFiles(raw).some((f) => f.sha256 === sha && existsSync(join(dir, f.file)));
  } catch {
    return false;
  }
}

function uniqueName(wanted: string, taken: Set<string>): string {
  const dot = wanted.lastIndexOf('.');
  const base = dot > 0 ? wanted.slice(0, dot) : wanted;
  const ext = dot > 0 ? wanted.slice(dot) : '';
  let name = wanted;
  for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${base}_${n}${ext}`;
  taken.add(name.toLowerCase());
  return name;
}

function assetEntry(file: string, d: Detection) {
  return d.kind === 'autotile'
    ? { kind: 'autotile' as const, file, frameMs: d.frameMs ?? 250 }
    : { kind: 'tileset' as const, file, tiles: {}, regions: {} };
}

/** Plans file names and the manifest, validates it, then writes images, terms and pack.json. */
export function writePack(outDir: string, plan: PackPlan, today: string, dryRun = false): PackWriteResult {
  const dir = join(outDir, plan.packId);
  const existing = loadExistingManifest(dir);
  const row = plan.row;
  if (existing) {
    const url = existing.source?.url;
    if (typeof url === 'string' && row.url && normalizeUrl(url) !== normalizeUrl(row.url)) {
      throw new PackError(`${join(dir, 'pack.json')} belongs to ${url}, not ${row.url}; resolve the pack id clash by hand`);
    }
    const px = (existing.format as { native_tile_px?: unknown } | undefined)?.native_tile_px;
    if (px !== plan.tilePx) throw new PackError(`${join(dir, 'pack.json')} is a ${String(px)} px pack; cannot add ${plan.tilePx} px images to it`);
  }

  // which images are new to this pack
  const have = new Map(existingFiles(existing).map((f) => [f.sha256, f.file]));
  const alreadyPresent: ImageItem[] = [];
  const fresh: ImageItem[] = [];
  for (const img of plan.images) {
    if (have.has(img.sha256) || fresh.some((f) => f.sha256 === img.sha256)) alreadyPresent.push(img);
    else fresh.push(img);
  }

  // file names: keep original names; never overwrite a different file already in the folder
  const onDisk = existsSync(dir) ? readdirSync(dir) : [];
  const taken = new Set(onDisk.map((n) => n.toLowerCase()));
  taken.add('pack.json');
  const files = fresh.map((img) => ({ img, name: uniqueName(img.targetName, taken) }));

  // asset names
  const assetsTaken = new Set(Object.keys(existing?.assets ?? {}));
  const added: PackWriteResult['addedAssets'] = [];
  for (const { img, name } of files) {
    let slug = assetSlug(img.assetHint);
    if (assetsTaken.has(slug)) slug = assetSlug(img.altHint);
    const base = slug;
    for (let n = 2; assetsTaken.has(slug); n++) slug = `${base}_${n}`;
    assetsTaken.add(slug);
    added.push({ name: slug, file: name, origin: img.origin, detection: img.detection });
  }

  // terms snapshot
  let termsFile: string | null = null;
  let termsBytes: Uint8Array | null = null;
  if (plan.terms.length && fresh.length) {
    termsBytes = termsContent(plan.terms, today);
    const wanted = `terms_${today}.txt`;
    let candidate = wanted;
    for (let n = 2; ; n++) {
      const p = join(dir, candidate);
      if (!existsSync(p)) break;
      if (sameBytes(new Uint8Array(readFileSync(p)), termsBytes)) {
        termsBytes = null; // identical snapshot already there
        break;
      }
      candidate = `terms_${today}_${n}.txt`;
    }
    termsFile = candidate;
  }

  const fileEntries = files.map(({ img, name }) => ({ file: name, sha256: img.sha256, w: img.width, h: img.height, bytes: img.data.byteLength, from: img.origin }));
  const notes = files.flatMap(({ img, name }) => img.detection.notes.map((n) => `${name}: ${n}`));
  const termsEntry = termsFile ? { file: termsFile, from: plan.terms.map((t) => t.label) } : null;

  let manifest: RawManifest;
  if (!existing) {
    const status = licenseStatus(row);
    const ripped = rippedFromOfficial(row);
    const reviewNotes: string[] = [];
    if (status === 'unknown') reviewNotes.push(`catalog credits column is "${row.credits}": license.status stays "unknown" until someone reads the terms`);
    if (ripped === 'unknown') reviewNotes.push('ripped_from_official is "unknown": set "none" or "partial" after reading the terms');
    reviewNotes.push('upstream_credits is empty: add artists the terms ask you to credit too');
    if (!termsFile) reviewNotes.push('no terms snapshot: paste the page description into a .txt next to the download and re-import, or add one by hand');
    manifest = {
      pack_id: plan.packId,
      name: plan.splitOf ? `${cleanTitle(row)} (${plan.tilePx} px)` : cleanTitle(row),
      source: {
        site: siteName(row),
        url: row.url || null,
        retrieved_at: today,
        catalog_number: row.number,
        catalog_tab: row.tab,
        catalog_title: row.title,
        catalog_credits: row.credits,
        files: fileEntries,
        terms: termsEntry ? [termsEntry] : [],
        notes: [...reviewNotes, ...notes],
      },
      artist: { name: row.artist || 'unknown' },
      upstream_credits: [],
      license: {
        spdx: null,
        credit_line: creditLine(row),
        status,
        raw_redistribution: 'unspecified',
        terms_snapshot: termsFile,
      },
      ripped_from_official: ripped,
      visibility: 'private-only',
      format: { native_tile_px: plan.tilePx, scale: plan.tilePx === 16 ? 2 : 1 },
      assets: Object.fromEntries(added.map((a) => [a.name, assetEntry(a.file, a.detection)])),
    };
    if (plan.splitOf) (manifest.source as Record<string, unknown>).split_of = plan.splitOf;
  } else {
    manifest = structuredClone(existing);
    const source = (manifest.source ??= {});
    source.files = [...(Array.isArray(source.files) ? source.files : []), ...fileEntries];
    const oldTerms = Array.isArray(source.terms) ? (source.terms as { file?: unknown }[]) : [];
    if (termsEntry && !oldTerms.some((t) => t?.file === termsEntry.file)) source.terms = [...oldTerms, termsEntry];
    if (notes.length) {
      const old = Array.isArray(source.notes) ? (source.notes as unknown[]) : [];
      source.notes = [...old, ...notes.filter((n) => !old.includes(n))];
    }
    const license = (manifest.license ??= {});
    if (termsFile && (license.terms_snapshot === null || license.terms_snapshot === undefined)) license.terms_snapshot = termsFile;
    const assets = (manifest.assets ??= {});
    for (const a of added) assets[a.name] = assetEntry(a.file, a.detection);
  }

  const check = PackManifest.safeParse(manifest);
  if (!check.success && !existing && check.error.issues.some((i) => i.path.join('.') === 'source.url')) {
    (manifest.source as Record<string, unknown>).url = null;
    ((manifest.source as Record<string, unknown>).notes as string[]).push(`catalog URL "${row.url}" is not a valid URL`);
  }
  const final = PackManifest.safeParse(manifest);
  if (!final.success) {
    throw new PackError(`generated pack.json for ${plan.packId} does not validate: ${final.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  }

  if (!dryRun && fresh.length) {
    mkdirSync(dir, { recursive: true });
    for (const { img, name } of files) writeFileSync(join(dir, name), img.data, { flag: 'wx' });
    if (termsFile && termsBytes) writeFileSync(join(dir, termsFile), termsBytes, { flag: 'wx' });
    writeJsonFile(join(dir, 'pack.json'), manifest);
  }
  return { packId: plan.packId, dir, created: !existing, addedAssets: added, alreadyPresent, termsFile };
}

export function summarizeAssets(added: PackWriteResult['addedAssets']): string {
  const counts = new Map<string, number>();
  for (const a of added) {
    const d = describeDetection(a.detection);
    counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  return [...counts].map(([d, n]) => (n > 1 ? `${n}x ${d}` : d)).join(', ');
}

// ---------------------------------------------------------------- assets/raw/_index.json

export interface RawIndex {
  /** sha256 of every imported image -> pack_id */
  sha256: Record<string, string>;
}

export function loadIndex(outDir: string): RawIndex {
  const path = join(outDir, '_index.json');
  if (!existsSync(path)) return { sha256: {} };
  const raw = readJsonFile(path) as Record<string, unknown>;
  const map = raw && typeof raw === 'object' && raw.sha256 && typeof raw.sha256 === 'object' ? (raw.sha256 as Record<string, unknown>) : raw;
  const out: RawIndex = { sha256: {} };
  for (const [k, v] of Object.entries(map ?? {})) if (/^[0-9a-f]{64}$/.test(k) && typeof v === 'string') out.sha256[k] = v;
  return out;
}

export function saveIndex(outDir: string, index: RawIndex): void {
  mkdirSync(outDir, { recursive: true });
  const sorted = Object.fromEntries(Object.entries(index.sha256).sort(([a], [b]) => (a < b ? -1 : 1)));
  writeJsonFile(join(outDir, '_index.json'), {
    note: 'Generated by tools/import-packs.ts: sha256 of every imported image -> pack_id. Safe to delete (it is rebuilt as packs are re-imported).',
    sha256: sorted,
  });
}
