import { describe, expect, it } from 'vitest';
import { AUTOTILE_PATTERNS, composeAutotileTile, detectAutotileFormat, expandAutotile, type RgbaImage } from '../src/index.ts';

/** A 96*frames x 128 image where every 16x16 mini is filled with (mini number, frame, 0, 255). */
function labelledAutotile(frames: number): RgbaImage {
  const width = 96 * frames;
  const height = 128;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const frame = Math.floor(x / 96);
      const mini = Math.floor(y / 16) * 6 + Math.floor((x % 96) / 16) + 1;
      data.set([mini, frame, 0, 255], (y * width + x) * 4);
    }
  }
  return { width, height, data };
}

function pixel(tile: Uint8Array, x: number, y: number) {
  const i = (y * 32 + x) * 4;
  return [tile[i], tile[i + 1]];
}

describe('autotile format detection', () => {
  it('reads frame counts from RMXP dimensions', () => {
    expect(detectAutotileFormat(96, 128)).toEqual({ kind: 'rmxp-autotile', frames: 1 });
    expect(detectAutotileFormat(384, 128)).toEqual({ kind: 'rmxp-autotile', frames: 4 });
    expect(detectAutotileFormat(256, 32)).toEqual({ kind: 'single-animated', frames: 8 });
  });

  it('rejects other sizes with a reason', () => {
    expect(() => detectAutotileFormat(96, 192)).toThrow(/expanded/);
    expect(() => detectAutotileFormat(100, 128)).toThrow(/not an RMXP autotile/);
  });
});

describe('autotile expansion', () => {
  const src = labelledAutotile(4);

  it('places the four minis of every pattern in TL, TR, BL, BR order', () => {
    for (let pattern = 0; pattern < 48; pattern++) {
      const tile = composeAutotileTile(src, pattern, 0);
      const [tl, tr, bl, br] = AUTOTILE_PATTERNS[pattern]!;
      expect(pixel(tile, 3, 3)).toEqual([tl, 0]);
      expect(pixel(tile, 20, 3)).toEqual([tr, 0]);
      expect(pixel(tile, 3, 20)).toEqual([bl, 0]);
      expect(pixel(tile, 31, 31)).toEqual([br, 0]);
    }
  });

  it('reads later frames from the matching 96px block', () => {
    const expanded = expandAutotile(src);
    expect(expanded.format).toEqual({ kind: 'rmxp-autotile', frames: 4 });
    expect(pixel(expanded.tile(0, 3), 0, 0)).toEqual([AUTOTILE_PATTERNS[0]![0], 3]);
  });
});
