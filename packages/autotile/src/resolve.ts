import { E, N, NE, NEIGHBORS_TO_AUTOTILE_INDEX, NW, S, SE, SW, W } from './tables.ts';

/** Returns true when the cell at (x, y) counts as "the same terrain" for the autotile being resolved. */
export type SamePredicate = (x: number, y: number) => boolean;

const OFFSETS: readonly (readonly [number, number, number])[] = [
  [0, -1, N],
  [1, -1, NE],
  [1, 0, E],
  [1, 1, SE],
  [0, 1, S],
  [-1, 1, SW],
  [-1, 0, W],
  [-1, -1, NW],
];

/**
 * 8-bit neighbour mask for the cell at (x, y). Like Essentials, out-of-map neighbours count as
 * the same terrain, so terrain painted up to the border runs off the edge instead of drawing a shore.
 */
export function neighborMask(x: number, y: number, width: number, height: number, same: SamePredicate): number {
  let mask = 0;
  for (const [dx, dy, bit] of OFFSETS) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= width || ny >= height || same(nx, ny)) mask |= bit;
  }
  return mask;
}

export function patternForMask(mask: number): number {
  const pattern = NEIGHBORS_TO_AUTOTILE_INDEX[mask & 0xff];
  if (pattern === undefined) throw new Error(`bad neighbour mask ${mask}`);
  return pattern;
}

/** Pattern for the cell at (x, y), or -1 when the cell itself isn't this terrain. */
export function resolvePattern(x: number, y: number, width: number, height: number, same: SamePredicate): number {
  if (!same(x, y)) return -1;
  return patternForMask(neighborMask(x, y, width, height, same));
}
