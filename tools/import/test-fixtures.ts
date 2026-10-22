// Test helpers: deterministic PNGs and temp folders. No network, no real downloads.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

export const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const REAL_CATALOG = join(REPO_ROOT, 'asset-catalog', 'tilesets.csv');

export interface PngOptions {
  /** Every art pixel is a 2x2 block (Essentials-style 32 px sheet drawn on a 16 px grid). */
  doubled?: boolean;
  /** One flat opaque colour. */
  flat?: boolean;
  seed?: number;
}

/** A w x h opaque PNG of deterministic noise (different seeds give different bytes). */
export function makePng(width: number, height: number, opts: PngOptions = {}): Uint8Array {
  const png = new PNG({ width, height });
  let s = (opts.seed ?? 1) >>> 0 || 1;
  const rnd = () => {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    return s >>> 24;
  };
  const cw = opts.doubled ? Math.ceil(width / 2) : width;
  const ch = opts.doubled ? Math.ceil(height / 2) : height;
  const src = new Uint8Array(cw * ch * 4);
  for (let i = 0; i < cw * ch; i++) {
    src[i * 4] = opts.flat ? 40 : rnd();
    src[i * 4 + 1] = opts.flat ? 160 : rnd();
    src[i * 4 + 2] = opts.flat ? 60 : rnd();
    src[i * 4 + 3] = 255;
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const si = opts.doubled ? ((y >> 1) * cw + (x >> 1)) * 4 : (y * width + x) * 4;
      const di = (y * width + x) * 4;
      for (let k = 0; k < 4; k++) png.data[di + k] = src[si + k]!;
    }
  }
  return new Uint8Array(PNG.sync.write(png));
}

/** The first bytes of a JPEG; enough for sniffing. */
export const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);

/** DeviantArt's download name for a deviation: "<title>_by_<artist>_d<base36 id>.png". */
export function daFileName(title: string, artist: string, deviationId: number, ext = '.png'): string {
  return `${title}_by_${artist}_d${deviationId.toString(36)}${ext}`;
}

export function makeTempDir(prefix = 'tdmm-import-'): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function removeTempDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

export function writeFile(path: string, data: Uint8Array | string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, data);
}
