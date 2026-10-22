import { describe, expect, it } from 'vitest';
import {
  AUTOTILE_PATTERNS,
  E,
  ICON_PATTERN,
  N,
  NE,
  NEIGHBORS_TO_AUTOTILE_INDEX,
  NW,
  S,
  SE,
  SW,
  W,
  neighborMask,
  patternForMask,
  resolvePattern,
} from '../src/index.ts';

type QuarterState = 'outer' | 'vertical' | 'horizontal' | 'inner' | 'fill';

// Which minis each quarter may use in each state (derived from the Essentials tables in the research notes).
const ALLOWED: Record<'TL' | 'TR' | 'BL' | 'BR', Record<QuarterState, number[]>> = {
  TL: { outer: [13], vertical: [25, 37], horizontal: [15, 17], inner: [5], fill: [27, 29, 39, 41] },
  TR: { outer: [18], vertical: [30, 42], horizontal: [14, 16], inner: [6], fill: [26, 28, 38, 40] },
  BL: { outer: [43], vertical: [19, 31], horizontal: [45, 47], inner: [11], fill: [21, 23, 33, 35] },
  BR: { outer: [48], vertical: [24, 36], horizontal: [44, 46], inner: [12], fill: [20, 22, 32, 34] },
};

function quarterState(mask: number, vertical: number, horizontal: number, diagonal: number): QuarterState {
  const v = (mask & vertical) !== 0;
  const h = (mask & horizontal) !== 0;
  if (!v && !h) return 'outer';
  if (v && !h) return 'vertical';
  if (!v && h) return 'horizontal';
  return (mask & diagonal) !== 0 ? 'fill' : 'inner';
}

describe('Essentials autotile tables', () => {
  it('has 48 patterns of 4 minis and a 256-entry mask table', () => {
    expect(AUTOTILE_PATTERNS).toHaveLength(48);
    expect(NEIGHBORS_TO_AUTOTILE_INDEX).toHaveLength(256);
    const minis = AUTOTILE_PATTERNS.flat();
    expect(minis).toHaveLength(48 * 4);
    expect(Math.min(...minis)).toBe(1);
    expect(Math.max(...minis)).toBe(48);
  });

  it('matches the quarter-tile rule for every one of the 256 neighbour masks', () => {
    for (let mask = 0; mask < 256; mask++) {
      const [tl, tr, bl, br] = AUTOTILE_PATTERNS[patternForMask(mask)]!;
      expect(ALLOWED.TL[quarterState(mask, N, W, NW)]).toContain(tl);
      expect(ALLOWED.TR[quarterState(mask, N, E, NE)]).toContain(tr);
      expect(ALLOWED.BL[quarterState(mask, S, W, SW)]).toContain(bl);
      expect(ALLOWED.BR[quarterState(mask, S, E, SE)]).toContain(br);
    }
  });

  it('uses exactly patterns 0..46 and never the icon', () => {
    const used = new Set(NEIGHBORS_TO_AUTOTILE_INDEX);
    expect(used.size).toBe(47);
    expect(used.has(ICON_PATTERN)).toBe(false);
  });

  it('maps the extremes to an island and a full fill', () => {
    expect(patternForMask(0)).toBe(46);
    expect(AUTOTILE_PATTERNS[46]).toEqual([13, 18, 43, 48]);
    expect(patternForMask(0xff)).toBe(0);
    expect(AUTOTILE_PATTERNS[0]).toEqual([27, 28, 33, 34]);
  });
});

describe('neighbour resolver', () => {
  // 5x3 grid, '#' is the terrain
  const rows = ['.....', '.###.', '.....'];
  const same = (x: number, y: number) => rows[y]![x] === '#';

  it('treats out-of-map neighbours as the same terrain', () => {
    const full = () => true;
    expect(neighborMask(0, 0, 3, 3, full)).toBe(0xff);
    expect(neighborMask(0, 0, 3, 3, () => false)).toBe(N | NE | W | SW | NW);
  });

  it('resolves a horizontal strip into end caps and a middle piece', () => {
    expect(resolvePattern(0, 0, 5, 3, same)).toBe(-1);
    const left = resolvePattern(1, 1, 5, 3, same);
    const mid = resolvePattern(2, 1, 5, 3, same);
    const right = resolvePattern(3, 1, 5, 3, same);
    expect(patternForMask(E)).toBe(left);
    expect(patternForMask(E | W)).toBe(mid);
    expect(patternForMask(W)).toBe(right);
    expect(new Set([left, mid, right]).size).toBe(3);
  });
});
