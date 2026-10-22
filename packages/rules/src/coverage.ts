// Path coverage: how much enemy path a tower at a cell can reach. Drives the editor's test-tower
// stamp and coverage heatmap. Per cell it is the expected length of path (in tiles) inside the
// tower's range for one enemy, so each route counts by its share of the enemies that walk it.
import type { Route } from '@tdmm/pathing';
import { rangeMultiplierAt, type BuildableMap } from './placement.ts';
import type { MapState, Registries } from './state.ts';

/** Length of a polyline (tile units) inside a circle. */
export function lengthInCircle(points: readonly (readonly [number, number])[], cx: number, cy: number, r: number): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1]!;
    const [bx, by] = points[i]!;
    const dx = bx - ax;
    const dy = by - ay;
    const a = dx * dx + dy * dy;
    if (a === 0) continue;
    const fx = ax - cx;
    const fy = ay - cy;
    const b = 2 * (fx * dx + fy * dy);
    const c = fx * fx + fy * fy - r * r;
    const disc = b * b - 4 * a * c;
    if (disc <= 0) continue;
    const sq = Math.sqrt(disc);
    const t0 = Math.max(0, (-b - sq) / (2 * a));
    const t1 = Math.min(1, (-b + sq) / (2 * a));
    if (t1 > t0) total += (t1 - t0) * Math.sqrt(a);
  }
  return total;
}

/**
 * Share of enemies per route, from simulated counts (the clear check's per-round `byRoute`).
 * Routes nobody walks get 0. With no counts yet, every route counts equally.
 */
export function routeShares(routes: readonly Route[], counts?: Record<string, number>[] | null): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const c of counts ?? []) for (const [id, n] of Object.entries(c)) totals[id] = (totals[id] ?? 0) + n;
  // Counts for routes that no longer exist (the path changed since the last run) don't count.
  const sum = routes.reduce((a, r) => a + (totals[r.id] ?? 0), 0);
  const shares: Record<string, number> = {};
  for (const r of routes) shares[r.id] = sum > 0 ? (totals[r.id] ?? 0) / sum : 1 / routes.length;
  return shares;
}

export interface TowerCoverage {
  /** Range in tiles after the cell's terrain and zone multipliers. */
  range: number;
  /** Expected tiles of path in range per enemy (routes weighted by share). */
  expected: number;
  /** Tiles of each route in range (unweighted), for routes it reaches. */
  byRoute: { id: string; length: number }[];
}

/** Coverage of one tower standing on cell (x, y) with base range `radius` tiles. */
export function towerCoverage(s: MapState, reg: Registries, routes: readonly Route[], shares: Record<string, number>, x: number, y: number, radius: number): TowerCoverage {
  const range = radius * rangeMultiplierAt(s, reg, x, y);
  let expected = 0;
  const byRoute: TowerCoverage['byRoute'] = [];
  for (const r of routes) {
    const length = lengthInCircle(r.points, x + 0.5, y + 0.5, range);
    if (length <= 0) continue;
    byRoute.push({ id: r.id, length });
    expected += length * (shares[r.id] ?? 0);
  }
  return { range, expected, byRoute };
}

/** Expected path in range for a tower on every cell that takes one (0 elsewhere). */
export function coverageMap(s: MapState, reg: Registries, routes: readonly Route[], shares: Record<string, number>, radius: number, buildable: BuildableMap): Float32Array {
  const out = new Float32Array(s.width * s.height);
  const live = routes.filter((r) => (shares[r.id] ?? 0) > 0);
  for (let i = 0; i < out.length; i++) {
    if (buildable.block[i]) continue;
    const x = i % s.width;
    const y = Math.floor(i / s.width);
    out[i] = towerCoverage(s, reg, live, shares, x, y, radius).expected;
  }
  return out;
}
