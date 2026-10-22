// Matching downloaded file names to catalog rows, plus downloads/match.json overrides.
import { existsSync, readFileSync } from 'node:fs';
import {
  type CatalogRow,
  cleanTitle,
  normalizeUrl,
  parseDeviantArtUrl,
  rowRef,
} from './catalog.ts';

export interface DeviantArtName {
  /** Title slug, e.g. "path_tiles_ex_dirt". */
  title: string;
  /** Artist slug as it appears in the file name ("j_treecko252" for J-Treecko252). */
  artist: string;
  /** Deviation id decoded from the "d<base36>" code, or null if the code is missing. */
  deviationId: number | null;
  /** True when the name carries a preview suffix such as "-fullview" or "-pre". */
  preview: boolean;
}

/** Strips the extension and Windows' " (1)" duplicate-download suffix. */
export function baseName(fileName: string): string {
  return fileName
    .replace(/\.[A-Za-z0-9]{1,5}$/, '')
    .replace(/\s*\(\d+\)$/, '')
    .trim();
}

/**
 * DeviantArt download names: "<title_slug>_by_<artist_slug>_d<base36 id>[-suffix].png",
 * e.g. "apartment_building_tiles_01_by_j_treecko252_dexy3pk.png" (exy3pk in base 36 = 903544904).
 */
export function parseDeviantArtFileName(fileName: string): DeviantArtName | null {
  const base = baseName(fileName).toLowerCase();
  const withCode = /^(.+)_by_([a-z0-9_-]+)_d([0-9a-z]{4,8})(-[a-z0-9-]+)?$/.exec(base);
  if (withCode) {
    const id = Number.parseInt(withCode[3]!, 36);
    return {
      title: withCode[1]!,
      artist: withCode[2]!,
      deviationId: Number.isSafeInteger(id) ? id : null,
      preview: /fullview|pre|\d+w|\d+t/.test(withCode[4] ?? ''),
    };
  }
  const noCode = /^(.+)_by_([a-z0-9_-]+)$/.exec(base);
  if (noCode) return { title: noCode[1]!, artist: noCode[2]!, deviationId: null, preview: false };
  return null;
}

/** Lowercase alphanumeric tokens; "gen3" splits into "gen", "3" so it meets "Gen 3". */
export function tokenize(text: string): string[] {
  return text
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/['\p{Pi}\p{Pf}]/gu, '')
    .replace(/([a-z])(\d)/g, '$1 $2')
    .replace(/(\d)([a-z])/g, '$1 $2')
    .split(/[^a-z0-9]+/)
    .filter((t) => t && !STOP.has(t));
}
const STOP = new Set(['by', 'on', 'the', 'a', 'an', 'of', 'and', 'deviantart', 'eevee', 'expo', 'png', 'zip']);

const alnum = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const alnumFolded = (s: string) => alnum(s.normalize('NFKD').replace(/\p{M}+/gu, ''));

export interface Candidate {
  row: CatalogRow;
  score: number;
  titleScore: number;
  artistScore: number;
}

export type MatchResult =
  | { kind: 'matched'; row: CatalogRow; how: 'match.json' | 'deviation-id' | 'name'; score: number; warnings: string[] }
  | { kind: 'unmatched'; reason: string; candidates: Candidate[] };

export const ACCEPT_SCORE = 0.62;
export const ACCEPT_MARGIN = 0.08;

export class Matcher {
  readonly rows: CatalogRow[];
  private readonly byDeviation = new Map<number, CatalogRow>();
  private readonly byUrl = new Map<string, CatalogRow>();
  private readonly titleTokens: Set<string>[];
  /** Titles with all separators removed, so "exhibitionhall" meets "Exhibition Hall". */
  private readonly compactTitles: string[][];
  private readonly artistKeys: string[][];
  private readonly idf = new Map<string, number>();
  private readonly maxIdf: number;

  constructor(rows: CatalogRow[]) {
    this.rows = rows;
    const df = new Map<string, number>();
    this.titleTokens = rows.map((row) => {
      const tokens = new Set(tokenize(cleanTitle(row)));
      const da = parseDeviantArtUrl(row.url);
      if (da) for (const t of tokenize(da.slug)) tokens.add(t);
      for (const t of tokens) df.set(t, (df.get(t) ?? 0) + 1);
      return tokens;
    });
    this.compactTitles = rows.map((row) => {
      const keys = [alnumFolded(cleanTitle(row))];
      const da = parseDeviantArtUrl(row.url);
      if (da) keys.push(alnumFolded(da.slug));
      return keys.filter((k) => k.length >= 3);
    });
    const n = rows.length || 1;
    for (const [t, d] of df) this.idf.set(t, Math.log(1 + n / d));
    this.maxIdf = Math.log(1 + n);
    this.artistKeys = rows.map((row) => {
      const keys = new Set<string>();
      const da = parseDeviantArtUrl(row.url);
      if (da) keys.add(alnum(da.artist));
      for (const part of row.artist.split(/\s+(?:aka|and|&|\/)\s+|[()]/i)) {
        const k = alnum(part.replace(/^u\//, ''));
        if (k.length >= 3) keys.add(k);
      }
      return [...keys];
    });
    for (const row of rows) {
      const da = parseDeviantArtUrl(row.url);
      if (da) this.byDeviation.set(da.id, row);
      if (row.url) this.byUrl.set(normalizeUrl(row.url), row);
    }
  }

  findByUrl(url: string): CatalogRow | undefined {
    return this.byUrl.get(normalizeUrl(url));
  }

  findByDeviationId(id: number): CatalogRow | undefined {
    return this.byDeviation.get(id);
  }

  private weight(t: string): number {
    return this.idf.get(t) ?? this.maxIdf;
  }

  /** IDF-weighted Jaccard similarity between the file's tokens and the row's title tokens. */
  private titleSimilarity(fileTokens: Set<string>, fileCompact: string, i: number): number {
    if (fileCompact.length >= 3 && this.compactTitles[i]!.includes(fileCompact)) return 1;
    const rowTokens = this.titleTokens[i]!;
    let shared = 0;
    let union = 0;
    for (const t of fileTokens) {
      const w = this.weight(t);
      union += w;
      if (rowTokens.has(t)) shared += w;
    }
    for (const t of rowTokens) if (!fileTokens.has(t)) union += this.weight(t);
    return union === 0 ? 0 : shared / union;
  }

  private artistSimilarity(fileArtist: string | null, fileAlnum: string, i: number): number {
    const keys = this.artistKeys[i]!;
    if (fileArtist !== null) {
      const fa = alnum(fileArtist);
      return keys.includes(fa) ? 1 : 0;
    }
    let best = 0;
    for (const k of keys) {
      if (fileAlnum.includes(k)) best = 1;
      else {
        const core = k.replace(/\d+$/, '');
        if (core.length >= 4 && fileAlnum.includes(core)) best = Math.max(best, 0.5);
      }
    }
    return best;
  }

  /** All rows scored against a file name, best first. */
  rank(fileName: string): Candidate[] {
    const da = parseDeviantArtFileName(fileName);
    const base = baseName(fileName).replace(/\[\d+\]/g, ' ');
    const fileTokens = new Set(tokenize(da ? da.title : base));
    const fileCompact = alnumFolded(da ? da.title : base);
    const fileAlnum = alnum(base);
    const out: Candidate[] = this.rows.map((row, i) => {
      const titleScore = this.titleSimilarity(fileTokens, fileCompact, i);
      const artistScore = this.artistSimilarity(da ? da.artist : null, fileAlnum, i);
      const score = da ? 0.65 * titleScore + 0.35 * artistScore : 0.8 * titleScore + 0.2 * artistScore;
      return { row, score, titleScore, artistScore };
    });
    return out.sort((a, b) => b.score - a.score || a.row.index - b.row.index);
  }

  /** Match a download (file or bundle name) to a row. `override` is the match.json value, if any. */
  match(fileName: string, override?: string | number): MatchResult {
    if (override !== undefined) {
      const r = this.resolveRef(override);
      if (r.row) return { kind: 'matched', row: r.row, how: 'match.json', score: 1, warnings: [] };
      return { kind: 'unmatched', reason: `downloads/match.json: ${r.error}`, candidates: this.rank(fileName).slice(0, 3) };
    }
    const warnings: string[] = [];
    const da = parseDeviantArtFileName(fileName);
    if (da?.preview) warnings.push('file name has a DeviantArt preview suffix (-fullview/-pre): this is probably a resized preview, use the Download button');
    if (da?.deviationId != null) {
      const row = this.byDeviation.get(da.deviationId);
      if (row) {
        const rowArtist = parseDeviantArtUrl(row.url)?.artist ?? '';
        if (alnum(rowArtist) !== alnum(da.artist)) {
          warnings.push(`deviation ${da.deviationId} belongs to "${row.artist}" in the catalog, but the file name says "${da.artist}"`);
        }
        return { kind: 'matched', row, how: 'deviation-id', score: 1, warnings };
      }
    }
    const ranked = this.rank(fileName);
    const [best, second] = ranked;
    const top = ranked.slice(0, 3);
    if (!best || best.score < ACCEPT_SCORE || best.titleScore < 0.5) {
      return { kind: 'unmatched', reason: 'no catalog row matches the file name well enough', candidates: top };
    }
    if (second && best.score - second.score < ACCEPT_MARGIN) {
      return { kind: 'unmatched', reason: 'ambiguous: several catalog rows match about equally well', candidates: top };
    }
    if (!da && best.artistScore === 0 && best.titleScore < 0.8) {
      return { kind: 'unmatched', reason: 'the file name has no artist and only partly matches a title', candidates: top };
    }
    if (da && best.artistScore === 0) {
      return { kind: 'unmatched', reason: `no catalog row by artist "${da.artist}" matches the title`, candidates: top };
    }
    return { kind: 'matched', row: best.row, how: 'name', score: best.score, warnings };
  }

  /** match.json values: a catalog URL, "<tab>#<number>", or a bare number if it is unique. */
  resolveRef(ref: string | number): { row?: CatalogRow; error?: string } {
    const text = String(ref).trim();
    if (/^[a-z]+:\/\//i.test(text) || /^(www\.)?[a-z0-9-]+\.[a-z]{2,}\//i.test(text)) {
      const row = this.findByUrl(text);
      return row ? { row } : { error: `no catalog row has the URL ${text}` };
    }
    const tabbed = /^(.+?)\s*#\s*(\d+(?:\.\d+)?)$/.exec(text);
    if (tabbed) {
      const tab = tabbed[1]!.toLowerCase();
      const num = Number(tabbed[2]);
      const row = this.rows.find((r) => r.tab.toLowerCase() === tab && r.number === num);
      return row ? { row } : { error: `no catalog row "${text}" (expected "<tab>#<number>")` };
    }
    const num = Number(text.replace(/^#/, ''));
    if (text !== '' && Number.isFinite(num)) {
      const rows = this.rows.filter((r) => r.number === num);
      if (rows.length === 1) return { row: rows[0]! };
      if (rows.length === 0) return { error: `no catalog row has number ${num}` };
      return {
        error: `catalog number ${num} is used in ${rows.length} tabs; use the URL or one of: ${rows.map((r) => `"${rowRef(r)}"`).join(', ')}`,
      };
    }
    return { error: `cannot read "${text}" (use a catalog URL, "<tab>#<number>" or a number)` };
  }
}

export type MatchOverrides = Map<string, string | number>;

/** downloads/match.json: { "<download file name>": "<catalog url | tab#number | number>" } */
export function loadMatchOverrides(path: string): MatchOverrides {
  const map: MatchOverrides = new Map();
  if (!existsSync(path)) return map;
  let doc: unknown;
  try {
    doc = JSON.parse(readFileSync(path, 'utf8').replace(/^\s+/, '') /* \s includes the BOM */);
  } catch (e) {
    throw new Error(`${path} is not valid JSON: ${(e as Error).message}`);
  }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    throw new Error(`${path} must be an object: { "<download file name>": "<catalog url or number>" }`);
  }
  for (const [k, v] of Object.entries(doc as Record<string, unknown>)) {
    if (k.startsWith('$') || k.startsWith('//')) continue; // allow "$comment" style keys
    if (typeof v !== 'string' && typeof v !== 'number') throw new Error(`${path}: value for "${k}" must be a URL string or a catalog number`);
    map.set(k, v);
  }
  return map;
}

export function overrideFor(overrides: MatchOverrides, fileName: string): string | number | undefined {
  if (overrides.has(fileName)) return overrides.get(fileName);
  const lower = fileName.toLowerCase();
  for (const [k, v] of overrides) if (k.toLowerCase() === lower) return v;
  return undefined;
}

/** The exact line to add to downloads/match.json for an unmatched download. */
export function matchJsonLine(fileName: string, candidate?: CatalogRow): string {
  const value = candidate ? candidate.url || rowRef(candidate) : '<catalog url>';
  return `${JSON.stringify(fileName)}: ${JSON.stringify(value)}`;
}

export function describeRow(row: CatalogRow): string {
  return `${row.artist} - ${cleanTitle(row)} [${rowRef(row)}] ${row.url}`;
}
