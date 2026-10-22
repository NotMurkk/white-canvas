// Image inspection: file-type sniffing, PNG decoding, sha256, and RMXP asset-kind / tile-size detection.
import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';
import { detectAutotileFormat, type RgbaImage } from '@tdmm/autotile';

export type SniffedType = 'png' | 'jpeg' | 'gif' | 'webp' | 'bmp' | 'unknown';

export function sniffImageType(bytes: Uint8Array): SniffedType {
  const b = (i: number) => bytes[i] ?? -1;
  if (b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47) return 'png';
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return 'jpeg';
  if (b(0) === 0x47 && b(1) === 0x49 && b(2) === 0x46 && b(3) === 0x38) return 'gif';
  if (b(0) === 0x52 && b(1) === 0x49 && b(2) === 0x46 && b(3) === 0x46 && b(8) === 0x57 && b(9) === 0x45 && b(10) === 0x42 && b(11) === 0x50) return 'webp';
  if (b(0) === 0x42 && b(1) === 0x4d) return 'bmp';
  return 'unknown';
}

/** Extensions we refuse, with the reason shown to the user. */
export function rejectionForExtension(ext: string): string | null {
  switch (ext.toLowerCase()) {
    case '.jpg':
    case '.jpeg':
      return 'JPEG previews are resized/compressed; download the original PNG';
    case '.gif':
      return 'GIF files are previews or re-encodes (palette/size changed); download the original PNG';
    case '.webp':
      return 'WebP files are resized/compressed previews (DeviantArt serves these); download the original PNG';
    case '.bmp':
      return 'BMP is not supported; download the original PNG';
    default:
      return null;
  }
}

export function rejectionForSniffed(type: SniffedType): string | null {
  if (type === 'png') return null;
  if (type === 'jpeg') return 'this ".png" is really a JPEG: JPEG previews are resized/compressed; download the original PNG';
  if (type === 'webp') return 'this ".png" is really a WebP preview; download the original PNG';
  if (type === 'gif') return 'this ".png" is really a GIF; download the original PNG';
  return 'not a PNG file (bad signature): the download may be incomplete or an HTML error page';
}

export function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export interface InspectedPng {
  width: number;
  height: number;
  sha256: string;
  bytes: number;
  image: RgbaImage;
}

/** Decodes a PNG fully (so truncated downloads are caught). Throws with a readable message. */
export function inspectPng(bytes: Uint8Array): InspectedPng {
  const reject = rejectionForSniffed(sniffImageType(bytes));
  if (reject) throw new Error(reject);
  let png: PNG;
  try {
    png = PNG.sync.read(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  } catch (e) {
    throw new Error(`cannot decode PNG (truncated or corrupt download?): ${(e as Error).message}`);
  }
  return {
    width: png.width,
    height: png.height,
    sha256: sha256(bytes),
    bytes: bytes.byteLength,
    image: { width: png.width, height: png.height, data: new Uint8Array(png.data.buffer, png.data.byteOffset, png.data.length) },
  };
}

export type Doubling = 'doubled' | 'native' | 'unknown';

/**
 * Is this art a 2x nearest-neighbour upscale (each art pixel a uniform 2x2 block)? Gen 3 style art is
 * drawn on a 16 px grid; Essentials-ready sheets are those doubled to 32 px. We compare even-aligned
 * 2x2 blocks with odd-aligned ones, so flat colour fills (uniform at any alignment) don't count as proof.
 */
export function detectDoubling(img: RgbaImage): Doubling {
  const aligned = uniformBlockRatio(img, 0);
  const offset = uniformBlockRatio(img, 1);
  if (aligned === null || offset === null) return 'unknown';
  if (aligned >= 0.97 && aligned - offset >= 0.03) return 'doubled';
  if (aligned < 0.9) return 'native';
  return 'unknown';
}

function uniformBlockRatio(img: RgbaImage, start: number): number | null {
  const { width, height, data } = img;
  let blocks = 0;
  let uniform = 0;
  const px = (x: number, y: number) => (y * width + x) * 4;
  const same = (a: number, b: number) =>
    (data[a + 3] === 0 && data[b + 3] === 0) ||
    (data[a] === data[b] && data[a + 1] === data[b + 1] && data[a + 2] === data[b + 2] && data[a + 3] === data[b + 3]);
  for (let y = start; y + 1 < height; y += 2) {
    for (let x = start; x + 1 < width; x += 2) {
      const p = px(x, y);
      const q = px(x + 1, y);
      const r = px(x, y + 1);
      const s = px(x + 1, y + 1);
      if (data[p + 3] === 0 && data[q + 3] === 0 && data[r + 3] === 0 && data[s + 3] === 0) continue;
      blocks++;
      if (same(p, q) && same(p, r) && same(p, s)) uniform++;
    }
  }
  return blocks < 16 ? null : uniform / blocks;
}

export interface Detection {
  kind: 'autotile' | 'tileset';
  layout: 'rmxp-autotile' | 'single-animated' | 'rmxp-sheet' | 'grid' | 'loose';
  tilePx: 16 | 32;
  /** Autotiles only. */
  frames?: number;
  frameMs?: number;
  /** Notes worth keeping in pack.json (source.notes). */
  notes: string[];
  /** Problems to print in the import summary. */
  warnings: string[];
}

/** Essentials autotile speed suffix: "Sea[3].png" = 3/20 s per frame = 150 ms. Default 250 ms. */
export function frameMsFromName(fileName: string): number {
  const m = /\[(\d{1,3})\]/.exec(fileName);
  const n = m ? Number(m[1]) : 0;
  return n > 0 ? n * 50 : 250;
}

function tryAutotile(width: number, height: number, tilePx: 16 | 32) {
  try {
    return detectAutotileFormat(width, height, tilePx);
  } catch {
    return null;
  }
}

/**
 * Asset kind and native tile size from the image dimensions (and pixel doubling, for loose sheets):
 *  - RMXP autotile: 3x4 tiles per frame, frames side by side (96x128/frame at 32 px, 48x64 at 16 px)
 *  - animated single tile: one tile tall (32 or 16 px), width a multiple of it
 *  - tileset: width 256 = RMXP sheet at 32 px, width 128 = same layout at 16 px, else a best guess
 */
export function detectAsset(width: number, height: number, fileName: string, doubling: Doubling = 'unknown'): Detection {
  const notes: string[] = [];
  const warnings: string[] = [];
  if (width % 16 !== 0 || height % 16 !== 0) {
    warnings.push(`${width}x${height} is not a multiple of 16: looks like a resized preview (download the original file)`);
  }
  const frameMs = frameMsFromName(fileName);
  const auto32 = height === 128 ? tryAutotile(width, height, 32) : null;
  if (auto32?.kind === 'rmxp-autotile') return { kind: 'autotile', layout: 'rmxp-autotile', tilePx: 32, frames: auto32.frames, frameMs, notes, warnings };
  const auto16 = height === 64 ? tryAutotile(width, height, 16) : null;
  if (auto16?.kind === 'rmxp-autotile') return { kind: 'autotile', layout: 'rmxp-autotile', tilePx: 16, frames: auto16.frames, frameMs, notes, warnings };
  for (const px of [32, 16] as const) {
    if (height !== px) continue;
    const strip = tryAutotile(width, height, px);
    if (strip?.kind === 'single-animated') {
      return { kind: 'autotile', layout: 'single-animated', tilePx: px, frames: strip.frames, frameMs, notes, warnings };
    }
  }

  if (height === 192 && width % 96 === 0) {
    warnings.push(`${width}x${height} looks like an Essentials "expanded" autotile (96x192 per frame); the atlas builder cannot expand it yet, so it is imported as a tileset`);
  }
  if (width === 256) {
    if (height % 32 !== 0) notes.push(`height ${height} is not a multiple of 32: irregular RMXP sheet`);
    if (doubling === 'native') notes.push('256 px wide (RMXP 32 px sheet) but not pixel-doubled: check the tile size');
    return { kind: 'tileset', layout: height % 32 === 0 ? 'rmxp-sheet' : 'loose', tilePx: 32, notes, warnings };
  }
  if (width === 128) {
    if (height % 16 !== 0) notes.push(`height ${height} is not a multiple of 16: irregular sheet`);
    if (doubling === 'doubled') notes.push('128 px wide but pixel-doubled: may be a 32 px sheet 4 tiles wide, check the tile size');
    return { kind: 'tileset', layout: height % 16 === 0 ? 'rmxp-sheet' : 'loose', tilePx: 16, notes, warnings };
  }

  const fits32 = width % 32 === 0 && height % 32 === 0;
  const fits16 = width % 16 === 0 && height % 16 === 0;
  let tilePx: 16 | 32;
  let reason: string;
  if (doubling === 'doubled' && width % 32 === 0) {
    tilePx = 32;
    reason = 'art is pixel-doubled, so 32 px tiles';
  } else if (doubling === 'native' && fits16) {
    tilePx = 16;
    reason = 'art is not pixel-doubled, so native 16 px tiles';
  } else if (fits16 && !fits32) {
    tilePx = 16;
    reason = 'dimensions fit a 16 px grid only';
  } else if (fits32) {
    tilePx = 32;
    reason = 'dimensions fit a 32 px grid';
  } else {
    tilePx = doubling === 'doubled' ? 32 : 16;
    reason = doubling === 'doubled' ? 'art is pixel-doubled' : 'default for Gen 3 style art';
  }
  const gridOk = width % tilePx === 0 && height % tilePx === 0;
  notes.push(`${width}x${height}: tile size ${tilePx} px is a guess (${reason}); check it`);
  if (!gridOk) notes.push(`${width}x${height} does not fit a ${tilePx} px grid: loose/irregular sheet, needs hand-made regions`);
  return { kind: 'tileset', layout: gridOk ? 'grid' : 'loose', tilePx, notes, warnings };
}

export function describeDetection(d: Detection): string {
  if (d.kind === 'autotile') {
    const what = d.layout === 'single-animated' ? 'animated tile' : 'autotile';
    return `${what} ${d.tilePx}px x${d.frames}${(d.frames ?? 1) > 1 ? ` @${d.frameMs}ms` : ''}`;
  }
  return `tileset ${d.tilePx}px${d.layout === 'loose' ? ' (loose)' : d.layout === 'grid' ? ' (guessed)' : ''}`;
}
