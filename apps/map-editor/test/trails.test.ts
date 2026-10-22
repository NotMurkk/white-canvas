import { describe, expect, it } from 'vitest';
import type { Route } from '@tdmm/pathing';
import { summarizeRun, trimRoute } from '../src/editor/trails.ts';

/** West-to-east route along row 2 of a 6-wide map, walking in and out past the edges. */
function route(id: string, exit: string): Route {
  const points: [number, number][] = [[-0.5, 2.5], [0.5, 2.5], [2.5, 2.5], [5.5, 2.5], [6.5, 2.5]];
  const lengths = [0, 1, 3, 6, 7];
  return { id, spawn: 'w', exit, kind: 'ground', cells: [], points, lengths };
}

describe('last-run trails', () => {
  it('trims a route polyline to a distance', () => {
    const r = route('w', 'e');
    expect(trimRoute(r.points, r.lengths, 3)).toEqual([[-0.5, 2.5], [0.5, 2.5], [2.5, 2.5]]);
    expect(trimRoute(r.points, r.lengths, 0.5)).toEqual([[-0.5, 2.5]]);
  });

  it('summarizes how far each route got, leaks per exit and where stragglers stopped', () => {
    const a = route('w', 'e');
    const s = summarizeRun(
      [
        { enemy: 'grunt', route: a, dist: 7, leaked: true, flying: false },
        { enemy: 'grunt', route: a, dist: 4, leaked: false, flying: false },
        { enemy: 'grunt', route: a, dist: 0, leaked: false, flying: false },
      ],
      [{ id: 'e', cell: [5, 2] }],
    )!;
    expect([s.enemies, s.leaked]).toEqual([3, 1]);
    expect(s.routes).toHaveLength(1);
    expect(s.routes[0]!.points.at(-1)).toEqual([6.5, 2.5]); // one leaked, so the trail runs the whole way
    expect(s.leaks).toEqual([{ exit: 'e', x: 5.5, y: 2.5, count: 1 }]);
    expect(s.stops).toEqual([{ x: 3.5, y: 2.5, enemy: 'grunt', flying: false }]); // the one at dist 0 hadn't entered yet

    const partial = summarizeRun([{ enemy: 'grunt', route: a, dist: 4, leaked: false, flying: false }], [])!;
    expect(partial.routes[0]!.points).toEqual([[-0.5, 2.5], [0.5, 2.5], [2.5, 2.5], [3.5, 2.5]]);
    expect(summarizeRun([], [])).toBeNull();
  });
});
