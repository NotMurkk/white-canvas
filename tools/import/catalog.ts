// The tileset catalog (asset-catalog/tilesets.csv) and what a row implies for a pack manifest.
import { readFileSync } from 'node:fs';
import { parseCsvRecords } from './csv.ts';

export interface CatalogRow {
  /** 0-based position among the data rows (stable for one CSV version only). */
  index: number;
  tab: string;
  artist: string;
  category1: string;
  category2: string;
  generation: string;
  source: string;
  title: string;
  url: string;
  credits: string;
  /** The "number" column. Numbered per tab, so NOT unique on its own (see rowRef). */
  number: number | null;
}

const COLUMNS = ['tab', 'artist', 'category1', 'category2', 'generation', 'source', 'title', 'url', 'credits', 'number'] as const;

export function parseCatalog(csvText: string): CatalogRow[] {
  return parseCsvRecords(csvText, COLUMNS).map((r, index) => {
    const n = Number.parseFloat(r.number ?? '');
    return {
      index,
      tab: r.tab ?? '',
      artist: r.artist ?? '',
      category1: r.category1 ?? '',
      category2: r.category2 ?? '',
      generation: r.generation ?? '',
      source: r.source ?? '',
      title: r.title ?? '',
      url: r.url ?? '',
      credits: r.credits ?? '',
      number: Number.isFinite(n) ? n : null,
    };
  });
}

export function loadCatalog(path: string): CatalogRow[] {
  return parseCatalog(readFileSync(path, 'utf8'));
}

/** A unique, human-typeable reference to a row: "<tab>#<number>" (e.g. "Outdoor Tilesets#161"). */
export function rowRef(row: CatalogRow): string {
  return `${row.tab}#${row.number ?? `row${row.index + 1}`}`;
}

/** Lowercase host+path without protocol, "www.", query, fragment or trailing slash. */
export function normalizeUrl(url: string): string {
  return url
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '');
}

/** Catalog "source" column without decorations like "Bisafans.de <http://bisafans.de/>". */
export function siteName(row: CatalogRow): string {
  return row.source.replace(/<[^>]*>/g, '').trim() || hostOf(row.url) || 'unknown';
}

function hostOf(url: string): string {
  const m = /^[a-z]+:\/\/(?:www\.)?([^/?#]+)/i.exec(url.trim());
  return m ? m[1]!.toLowerCase() : '';
}

export function isDeviantArt(row: CatalogRow): boolean {
  return /(^|\.)deviantart\.com$/.test(hostOf(row.url));
}

export function isEeveeExpo(row: CatalogRow): boolean {
  return /(^|\.)eeveeexpo\.com$/.test(hostOf(row.url));
}

export function isSpritersResource(row: CatalogRow): boolean {
  return /spriters-resource\.com$/.test(hostOf(row.url)) || /spriters resource/i.test(row.source);
}

/** "https://www.deviantart.com/j-treecko252/art/Path-Tiles-EX-Dirt-884688469" -> { artist, slug, id } */
export function parseDeviantArtUrl(url: string): { artist: string; slug: string; id: number } | null {
  const m = /deviantart\.com\/([^/]+)\/art\/(.+?)-(\d+)\/?(?:[?#].*)?$/i.exec(url.trim());
  if (!m) return null;
  return { artist: m[1]!.toLowerCase(), slug: m[2]!, id: Number(m[3]) };
}

/** "https://eeveeexpo.com/resources/621/" or ".../resources/some-name.621/" -> 621 */
export function eeveeExpoResourceId(url: string): number | null {
  const m = /eeveeexpo\.com\/resources\/(?:[^/]*\.)?(\d+)(?:\/|$)/i.exec(url.trim());
  return m ? Number(m[1]) : null;
}

/** Lowercase ASCII slug of [a-z0-9] runs joined by `sep`. */
export function slugify(text: string, sep = '-', maxLength = 64): string {
  const s = text
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/['\p{Pi}\p{Pf}]/gu, '')
    .replace(/[^a-z0-9]+/g, sep)
    .split(sep)
    .filter(Boolean)
    .join(sep);
  return s.slice(0, maxLength).replace(new RegExp(`\\${sep}+$`), '');
}

/** The row's title without site boilerplate (" by X on DeviantArt", " | Eevee Expo", ...). */
export function cleanTitle(row: CatalogRow): string {
  let t = row.title.replace(/\s+/g, ' ').trim();
  if (/^https?:\/\//i.test(t)) {
    // e.g. the GitHub row, whose title is its URL: use the last path segment
    const last = t.replace(/[?#].*$/, '').replace(/\/+$/, '').split('/').pop() ?? t;
    try {
      t = decodeURIComponent(last);
    } catch {
      t = last;
    }
  }
  const strips = [
    /\s+by\s+.+?\s+on\s+DeviantArt\s*$/i,
    /\s+on\s+DeviantArt\s*$/i,
    /\s*\|\s*Eevee Expo\s*$/i,
    /\s+-\s+Eevee Expo\s*$/i,
    /\s+-\s+The Spriters Resource\s*$/i,
    /\s+-\s+The Pok[eé]Community Forums\s*$/i,
    /\s+:\s+r\/[A-Za-z0-9_]+\s*$/,
  ];
  for (const re of strips) t = t.replace(re, '');
  if (isEeveeExpo(row)) t = t.replace(/^Tiles\s+-\s+/i, '');
  return t.trim() || row.title.trim() || row.url;
}

/** Stable pack id: da-<artist>-<deviation id>, ee-<resource id>, tsr-<sheet id>, else <site>-<slug>. */
export function packIdForRow(row: CatalogRow): string {
  const da = parseDeviantArtUrl(row.url);
  if (da) return sanitizeId(`da-${da.artist}-${da.id}`);
  const ee = eeveeExpoResourceId(row.url);
  if (ee !== null) return `ee-${ee}`;
  const tsr = /spriters-resource\.com\/.*\/sheet\/(\d+)/i.exec(row.url);
  if (tsr) return `tsr-${tsr[1]}`;
  const reddit = /reddit\.com\/r\/[^/]+\/comments\/([a-z0-9]+)/i.exec(row.url);
  if (reddit) return `reddit-${reddit[1]!.toLowerCase()}`;
  const pc = /pokecommunity\.com\/threads\/(?:[^/]*\.)?(\d+)/i.exec(row.url);
  if (pc) return `pokecommunity-${pc[1]}`;
  const site = slugify(siteName(row).replace(/\.[a-z]{2,4}$/i, ''), '-', 24) || 'site';
  const slug = slugify(cleanTitle(row), '-', 48) || `row${row.index + 1}`;
  return sanitizeId(`${site}-${slug}`);
}

export function sanitizeId(text: string): string {
  const s = text
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '');
  return /^[a-z0-9]/.test(s) ? s : `p${s}`;
}

/** Catalog credit marks: ☆ credit required, ❉ credit appreciated, "Ripped..." official rips, "?" unknown. */
export function creditMark(row: CatalogRow): 'required' | 'appreciated' | 'ripped' | 'unknown' {
  const c = row.credits.trim();
  if (c.codePointAt(0) === 0x2606) return 'required';
  if (c.codePointAt(0) === 0x2749) return 'appreciated';
  if (/^ripped/i.test(c)) return 'ripped';
  return 'unknown';
}

/** Qualifiers in the credits column that mean the cataloguer was unsure of the terms. */
const UNSURE = /unsure|no information|depends|check/i;

/**
 * "ok" when the catalog marks the row ☆ or ❉ (usable with credit in a non-commercial fan game),
 * "unknown" otherwise, and also when the mark is qualified as unsure ("❉(unsure)", "☆ (check descriptions)").
 */
export function licenseStatus(row: CatalogRow): 'ok' | 'unknown' {
  const mark = creditMark(row);
  if (mark !== 'required' && mark !== 'appreciated') return 'unknown';
  return UNSURE.test(row.credits) ? 'unknown' : 'ok';
}

export function rippedFromOfficial(row: CatalogRow): 'full' | 'unknown' {
  return creditMark(row) === 'ripped' || isSpritersResource(row) ? 'full' : 'unknown';
}

export function creditLine(row: CatalogRow): string {
  return `${cleanTitle(row)} by ${row.artist.trim() || 'unknown artist'}`;
}
