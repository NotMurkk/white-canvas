// Safe bundle extraction: zips (fflate) and already-extracted folders, both into memory.
import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { unzipSync } from 'fflate';

export interface BundleLimits {
  /** Total uncompressed bytes of the kept entries. */
  maxTotalBytes: number;
  /** Entries in the archive (all of them, kept or not). */
  maxEntries: number;
}

export const DEFAULT_LIMITS: BundleLimits = { maxTotalBytes: 512 * 1024 * 1024, maxEntries: 5000 };

export const KEPT_EXTENSIONS = ['.png', '.txt', '.md'] as const;

export interface BundleFile {
  /** Path inside the bundle, "/"-separated, validated (no "..", not absolute). */
  path: string;
  data: Uint8Array;
}

export interface Bundle {
  files: BundleFile[];
  /** Entries left out, counted by extension (".jpg": 3), so the summary can mention them. */
  ignored: Record<string, number>;
}

export class BundleSafetyError extends Error {}

const extOf = (p: string) => {
  const m = /\.[^./]+$/.exec(p);
  return m ? m[0].toLowerCase() : '(none)';
};

/** Throws BundleSafetyError for absolute paths, drive letters, "..", NUL or empty segments. */
export function checkEntryPath(name: string): string {
  if (name.includes('\0')) throw new BundleSafetyError(`entry "${name}" contains a NUL byte`);
  const norm = name.replace(/\\/g, '/');
  if (norm.startsWith('/') || /^[A-Za-z]:/.test(norm)) throw new BundleSafetyError(`entry "${name}" has an absolute path`);
  const parts = norm.split('/');
  if (parts.some((p) => p === '..')) throw new BundleSafetyError(`entry "${name}" contains a ".." segment (path traversal)`);
  return parts.filter((p) => p !== '' && p !== '.').join('/');
}

/** macOS resource forks and Windows/macOS clutter. */
export function isJunkPath(path: string): boolean {
  const parts = path.split('/');
  const last = parts[parts.length - 1] ?? '';
  return parts.some((p) => p === '__MACOSX' || p === '.DS_Store') || last.startsWith('._') || /^(thumbs\.db|desktop\.ini)$/i.test(last);
}

/**
 * Extracts .png/.txt/.md entries from a zip held in memory. The whole archive is rejected
 * (BundleSafetyError) if any entry has an unsafe path or the limits are exceeded; sizes are checked
 * from the central directory before anything is inflated, and fflate never writes past the declared
 * size, so a lying header cannot blow up memory.
 */
export function extractZip(zip: Uint8Array, limits: BundleLimits = DEFAULT_LIMITS): Bundle {
  const ignored: Record<string, number> = {};
  const kept: { raw: string; path: string; size: number }[] = [];
  let entries = 0;
  let total = 0;
  let raw: Record<string, Uint8Array>;
  try {
    raw = unzipSync(zip, {
      filter: (f) => {
        entries++;
        if (entries > limits.maxEntries) throw new BundleSafetyError(`more than ${limits.maxEntries} entries`);
        const path = checkEntryPath(f.name);
        if (f.name.endsWith('/') || path === '') return false; // directory entry
        const ext = extOf(path);
        if (isJunkPath(path)) return false;
        if (!(KEPT_EXTENSIONS as readonly string[]).includes(ext)) {
          ignored[ext] = (ignored[ext] ?? 0) + 1;
          return false;
        }
        total += f.originalSize;
        if (total > limits.maxTotalBytes) {
          throw new BundleSafetyError(`uncompressed size exceeds ${Math.round(limits.maxTotalBytes / 1024 / 1024)} MB`);
        }
        if (f.compression !== 0 && f.compression !== 8) {
          throw new BundleSafetyError(`entry "${f.name}" uses compression method ${f.compression} (only stored/deflate are supported)`);
        }
        kept.push({ raw: f.name, path, size: f.originalSize });
        return true;
      },
    });
  } catch (e) {
    if (e instanceof BundleSafetyError) throw e;
    throw new BundleSafetyError(`cannot read zip (corrupt, encrypted or not a zip): ${(e as Error).message}`);
  }
  const files: BundleFile[] = [];
  const seen = new Set<string>();
  for (const k of kept) {
    const data = raw[k.raw];
    if (!data) continue;
    if (data.byteLength !== k.size) throw new BundleSafetyError(`entry "${k.raw}" is ${data.byteLength} bytes but its header says ${k.size}`);
    const key = k.path.toLowerCase();
    if (seen.has(key)) throw new BundleSafetyError(`entry "${k.raw}" appears twice`);
    seen.add(key);
    files.push({ path: k.path, data });
  }
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { files, ignored };
}

/** Reads an extracted bundle folder (e.g. Windows "Extract All") with the same filters and limits. */
export function readFolderBundle(dir: string, limits: BundleLimits = DEFAULT_LIMITS): Bundle {
  const ignored: Record<string, number> = {};
  const files: BundleFile[] = [];
  let entries = 0;
  let total = 0;
  const walk = (abs: string, rel: string) => {
    for (const name of readdirSync(abs).sort()) {
      const childAbs = join(abs, name);
      const childRel = rel ? `${rel}/${name}` : name;
      const st = lstatSync(childAbs);
      if (st.isSymbolicLink()) {
        ignored['(symlink)'] = (ignored['(symlink)'] ?? 0) + 1;
        continue;
      }
      if (++entries > limits.maxEntries) throw new BundleSafetyError(`more than ${limits.maxEntries} entries`);
      if (st.isDirectory()) {
        walk(childAbs, childRel);
        continue;
      }
      if (!st.isFile() || isJunkPath(childRel)) continue;
      const ext = extOf(childRel);
      if (!(KEPT_EXTENSIONS as readonly string[]).includes(ext)) {
        ignored[ext] = (ignored[ext] ?? 0) + 1;
        continue;
      }
      total += st.size;
      if (total > limits.maxTotalBytes) throw new BundleSafetyError(`folder exceeds ${Math.round(limits.maxTotalBytes / 1024 / 1024)} MB`);
      files.push({ path: childRel, data: new Uint8Array(readFileSync(childAbs)) });
    }
  };
  walk(dir, '');
  return { files, ignored };
}

/** Drops a single top-level folder shared by every entry ("Pack v2/a.png", "Pack v2/b.png" -> "a.png", "b.png"). */
export function stripCommonRoot(paths: string[]): (p: string) => string {
  const first = paths[0]?.split('/') ?? [];
  if (first.length < 2) return (p) => p;
  const root = first[0]!;
  if (!paths.every((p) => p.split('/').length > 1 && p.split('/')[0] === root)) return (p) => p;
  return (p) => p.slice(root.length + 1);
}
