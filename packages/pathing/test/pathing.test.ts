import { describe, expect, it } from 'vitest';
import { DIR_E, DIR_N, DIR_S, NO_PATH, type Exit, type Spawn } from '@tdmm/map-format';
import { PathGrid, compilePath, pointAt, routeLength, stepCells, type Cell } from '../src/index.ts';

const spawn = (id: string, x: number, y: number, kind: 'ground' | 'air' = 'ground'): Spawn => ({ id, cell: [x, y], kind });
const exit = (id: string, x: number, y: number): Exit => ({ id, cell: [x, y] });

/** Paints a stroke through the given cells, like a drag with the path tool. */
function stroke(grid: PathGrid, ...cells: Cell[]) {
  let prev = cells[0]!;
  grid.add(prev);
  for (const c of cells.slice(1)) {
    for (const step of stepCells(prev, c)) {
      grid.connect(prev, step);
      prev = step;
    }
  }
}

const compile = (grid: PathGrid, spawns: Spawn[], exits: Exit[]) =>
  compilePath({ width: grid.width, height: grid.height, path: grid.cells, spawns, exits });
const codes = (r: ReturnType<typeof compilePath>) => r.problems.map((p) => p.code).sort();

describe('stroke editing', () => {
  it('inserts an elbow for diagonal steps so the path stays 4-connected', () => {
    expect(stepCells({ x: 0, y: 0 }, { x: 1, y: 1 })).toEqual([{ x: 1, y: 0 }, { x: 1, y: 1 }]);
    const cells = stepCells({ x: 0, y: 0 }, { x: 5, y: 2 });
    let prev = { x: 0, y: 0 };
    for (const c of cells) {
      expect(Math.abs(c.x - prev.x) + Math.abs(c.y - prev.y)).toBe(1);
      prev = c;
    }
    expect(prev).toEqual({ x: 5, y: 2 });
  });

  it('records direction from the stroke and reverses when painted back', () => {
    const g = new PathGrid(4, 1);
    stroke(g, { x: 0, y: 0 }, { x: 3, y: 0 });
    expect([...g.cells]).toEqual([DIR_E, DIR_E, DIR_E, 0]);
    stroke(g, { x: 3, y: 0 }, { x: 0, y: 0 });
    expect([...g.cells]).toEqual([0, 8, 8, 8]);
  });

  it('keeps side-by-side lanes separate', () => {
    const g = new PathGrid(4, 2);
    stroke(g, { x: 0, y: 0 }, { x: 3, y: 0 });
    stroke(g, { x: 0, y: 1 }, { x: 3, y: 1 });
    expect(g.out({ x: 1, y: 0 }) & DIR_S).toBe(0);
    expect(g.out({ x: 1, y: 1 }) & DIR_N).toBe(0);
  });

  it('erasing a cell removes the links into it', () => {
    const g = new PathGrid(3, 1);
    stroke(g, { x: 0, y: 0 }, { x: 2, y: 0 });
    const edits = g.erase({ x: 1, y: 0 });
    expect([...g.cells]).toEqual([0, NO_PATH, 0]);
    expect(edits.map((e) => e.index).sort()).toEqual([0, 1]);
  });
});

describe('route compiler', () => {
  it('compiles a straight path into one route that walks in and out past the edges', () => {
    const g = new PathGrid(5, 3);
    stroke(g, { x: 0, y: 1 }, { x: 4, y: 1 });
    const r = compile(g, [spawn('west', 0, 1)], [exit('east', 4, 1)]);
    expect(r.problems).toEqual([]);
    expect(r.routes.map((x) => x.id)).toEqual(['west']);
    const route = r.routes[0]!;
    expect(route.points[0]).toEqual([-0.5, 1.5]);
    expect(route.points.at(-1)).toEqual([5.5, 1.5]);
    expect(routeLength(route)).toBe(6);
    expect(pointAt(route, 3)).toEqual([2.5, 1.5]);
  });

  it('names branch routes by the turns they take', () => {
    // west -> (2,2) splits north and south, both turn east to their own exits
    const g = new PathGrid(6, 5);
    stroke(g, { x: 0, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 0 }, { x: 5, y: 0 });
    stroke(g, { x: 2, y: 2 }, { x: 2, y: 4 }, { x: 5, y: 4 });
    const r = compile(g, [spawn('w', 0, 2)], [exit('ne', 5, 0), exit('se', 5, 4)]);
    expect(r.problems).toEqual([]);
    expect(r.routes.map((x) => [x.id, x.exit])).toEqual([
      ['w:N', 'ne'],
      ['w:S', 'se'],
    ]);
    expect(r.junctions).toEqual([{ x: 2, y: 2 }]);
  });

  it('allows merges', () => {
    const g = new PathGrid(5, 3);
    stroke(g, { x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 4, y: 1 });
    stroke(g, { x: 0, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 1 });
    const r = compile(g, [spawn('a', 0, 0), spawn('b', 0, 2)], [exit('e', 4, 1)]);
    expect(r.problems).toEqual([]);
    expect(r.routes.map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('reports dead ends, orphans and markers off the path', () => {
    const g = new PathGrid(6, 4);
    stroke(g, { x: 0, y: 1 }, { x: 3, y: 1 });
    stroke(g, { x: 1, y: 3 }, { x: 3, y: 3 });
    const r = compile(g, [spawn('s', 0, 1)], [exit('e', 5, 0)]);
    expect(codes(r)).toEqual(['dead-end', 'exit-off-path', 'orphan-path', 'spawn-no-route']);
    expect(r.problems.find((p) => p.code === 'dead-end')!.cells).toEqual([[3, 1]]);
    expect(r.problems.find((p) => p.code === 'orphan-path')!.cells).toHaveLength(3);
  });

  it('reports loops and exits in the middle of the path', () => {
    const g = new PathGrid(4, 4);
    stroke(g, { x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 1, y: 2 }, { x: 1, y: 0 });
    const r = compile(g, [spawn('s', 0, 0)], [exit('e', 2, 1)]);
    expect(codes(r)).toContain('loop');
    expect(codes(r)).toContain('exit-not-end');
  });

  it('flags a path running off the map and missing markers', () => {
    const g = new PathGrid(3, 1);
    g.cells.set([DIR_E, DIR_E, DIR_E]);
    expect(codes(compile(g, [], []))).toEqual(['leaves-map', 'no-exit', 'no-spawn']);
  });

  it('gives air spawns a straight route to every exit', () => {
    const g = new PathGrid(5, 5);
    const r = compile(g, [spawn('sky', 2, 0, 'air')], [exit('e', 4, 2)]);
    expect(r.routes.map((x) => x.id)).toEqual(['sky>e']);
    expect(r.routes[0]!.kind).toBe('air');
  });

  it('handles very long paths without recursion limits', () => {
    const w = 200;
    const h = 200;
    const g = new PathGrid(w, h);
    // serpentine through every row: ~40,000 cells
    let prev = { x: 0, y: 0 };
    g.add(prev);
    for (let y = 0; y < h; y++) {
      const cells = y % 2 === 0 ? [{ x: w - 1, y }] : [{ x: 0, y }];
      for (const target of cells) {
        for (const c of stepCells(prev, target)) {
          g.connect(prev, c);
          prev = c;
        }
      }
      if (y < h - 1) {
        g.connect(prev, { x: prev.x, y: y + 1 });
        prev = { x: prev.x, y: y + 1 };
      }
    }
    const r = compile(g, [spawn('s', 0, 0)], [exit('e', prev.x, prev.y)]);
    expect(r.problems.filter((p) => p.severity === 'error')).toEqual([]);
    expect(r.routes[0]!.cells.length).toBe(w * h);
  });
});
