import { AUTOTILE_PATTERNS, PATTERN_COUNT } from './tables.ts';

export interface RgbaImage {
  width: number;
  height: number;
  /** Row-major RGBA, 4 bytes per pixel. */
  data: Uint8Array;
}

export type AutotileFormat =
  | { kind: 'rmxp-autotile'; frames: number }
  | { kind: 'single-animated'; frames: number };

/**
 * Detects an RMXP autotile by its dimensions (tileSize is 32 for RMXP/Essentials):
 * - 3 tiles x 4 tiles per frame, frames laid out horizontally: a full 48-pattern autotile.
 * - 1 tile tall: a non-connecting animated single tile (frames = width / tileSize).
 */
export function detectAutotileFormat(width: number, height: number, tileSize = 32): AutotileFormat {
  const frameWidth = tileSize * 3;
  if (height === tileSize * 4 && width % frameWidth === 0 && width > 0) {
    return { kind: 'rmxp-autotile', frames: width / frameWidth };
  }
  if (height === tileSize && width % tileSize === 0 && width > 0) {
    return { kind: 'single-animated', frames: width / tileSize };
  }
  if (height === tileSize * 6 && width % frameWidth === 0) {
    throw new Error(
      `${width}x${height} looks like an Essentials "expanded" autotile (96x192 per frame); not supported yet`,
    );
  }
  throw new Error(`${width}x${height} is not an RMXP autotile layout for ${tileSize}px tiles`);
}

/**
 * Composes one 32x32 tile (pattern 0..47, frame 0..frames-1) from an RMXP autotile image,
 * exactly as Essentials' AutotileExpander does: four 16x16 minis placed TL, TR, BL, BR.
 */
export function composeAutotileTile(src: RgbaImage, pattern: number, frame: number, tileSize = 32): Uint8Array {
  const minis = AUTOTILE_PATTERNS[pattern];
  if (!minis) throw new Error(`pattern ${pattern} out of range`);
  const half = tileSize / 2;
  const frameOffset = frame * tileSize * 3;
  const out = new Uint8Array(tileSize * tileSize * 4);
  minis.forEach((mini, quarter) => {
    const pos = mini - 1;
    const sx = (pos % 6) * half + frameOffset;
    const sy = Math.floor(pos / 6) * half;
    const dx = (quarter % 2) * half;
    const dy = Math.floor(quarter / 2) * half;
    for (let row = 0; row < half; row++) {
      const from = ((sy + row) * src.width + sx) * 4;
      const to = ((dy + row) * tileSize + dx) * 4;
      out.set(src.data.subarray(from, from + half * 4), to);
    }
  });
  return out;
}

export interface ExpandedAutotile {
  format: AutotileFormat;
  /** Patterns per frame: 48 for a connecting autotile, 1 for a single animated tile. */
  patterns: number;
  tile(pattern: number, frame: number): Uint8Array;
}

export function expandAutotile(src: RgbaImage, tileSize = 32): ExpandedAutotile {
  const format = detectAutotileFormat(src.width, src.height, tileSize);
  if (format.kind === 'single-animated') {
    return {
      format,
      patterns: 1,
      tile: (_pattern, frame) => cropTile(src, frame * tileSize, 0, tileSize),
    };
  }
  return {
    format,
    patterns: PATTERN_COUNT,
    tile: (pattern, frame) => composeAutotileTile(src, pattern, frame, tileSize),
  };
}

export function cropTile(src: RgbaImage, x: number, y: number, tileSize = 32): Uint8Array {
  const out = new Uint8Array(tileSize * tileSize * 4);
  for (let row = 0; row < tileSize; row++) {
    const from = ((y + row) * src.width + x) * 4;
    out.set(src.data.subarray(from, from + tileSize * 4), row * tileSize * 4);
  }
  return out;
}
