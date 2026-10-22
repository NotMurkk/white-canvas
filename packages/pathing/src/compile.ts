// Compiles directed path cells into routes (spawn -> exit cell lists) and reports problems.
// Pure and deterministic: the editor runs it on every edit, the game runs it on load.
import { NO_PATH, type AirRoute, type Exit, type Problem, type Spawn } from '@tdmm/map-format';
import { DIRS, type Cell } from './strokes.ts';

export interface CompileInput {
  width: number;
  height: number;
  path: Uint8Array;
  spawns: Spawn[];
  exits: Exit[];
  airRoutes?: AirRoute[];
}

export interface Route {
  /** "spawnId" for a single route, "spawnId:ES" when it turned E then S at junctions, "spawnId>exitId" for air. */
  id: string;
  spawn: string;
  exit: string;
  kind: 'ground' | 'air';
  cells: Cell[];
  /** Polyline in tile units (cell centre = x + 0.5), including the walk in from / out past the map edge. */
  points: [number, number][];
  /** Cumulative distance at each point; last entry = total length in tiles. */
  lengths: number[];
}

export interface CompiledPath {
  routes: Route[];
  problems: Problem[];
  /** Path cells with 2+ ways out. */
  junctions: Cell[];
  /** 1 for path cells some spawn reaches. */
  reached: Uint8Array;
}

const MAX_ROUTES = 256;

export function compilePath(input: CompileInput): CompiledPath {
  const { width, height, path, spawns, exits } = input;
  const problems: Problem[] = [];
  const seen = new Set<string>();
  const problem = (severity: Problem['severity'], code: string, message: string, cells: [number, number][] = []) => {
    const key = `${code}|${cells.map((c) => c.join(',')).join(';')}`;
    if (seen.has(key)) return;
    seen.add(key);
    problems.push({ severity, code, message, cells });
  };
  const idx = (c: Cell) => c.y * width + c.x;
  const inside = (c: Cell) => c.x >= 0 && c.y >= 0 && c.x < width && c.y < height;
  const isPath = (c: Cell) => inside(c) && path[idx(c)] !== NO_PATH;
  const exitAt = new Map<number, Exit>();
  for (const e of exits) exitAt.set(idx({ x: e.cell[0], y: e.cell[1] }), e);

  const ground = spawns.filter((s) => s.kind === 'ground');
  const air = spawns.filter((s) => s.kind === 'air');
  if (spawns.length === 0) problem('error', 'no-spawn', 'Place at least one spawn, where enemies enter the map.');
  if (exits.length === 0) problem('error', 'no-exit', 'Place at least one exit, where enemies leave and cost you lives.');

  for (const s of ground) {
    const c = { x: s.cell[0], y: s.cell[1] };
    if (!isPath(c)) problem('error', 'spawn-off-path', `Spawn "${s.id}" isn't on the path. Paint the path through it.`, [s.cell]);
    else if (!onEdge(c, width, height)) problem('warning', 'spawn-inside', `Spawn "${s.id}" isn't on the map edge, so enemies appear out of nowhere.`, [s.cell]);
  }
  for (const e of exits) {
    const c = { x: e.cell[0], y: e.cell[1] };
    if (!isPath(c)) problem('error', 'exit-off-path', `Exit "${e.id}" isn't on the path. Paint the path up to it.`, [e.cell]);
    else if (path[idx(c)] !== 0) problem('error', 'exit-not-end', `Exit "${e.id}" is in the middle of the path. The path must end at an exit.`, [e.cell]);
  }

  // Links that leave the map or point at a non-path cell.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const out = path[y * width + x]!;
      if (out === NO_PATH) continue;
      for (const d of DIRS) {
        if (!(out & d.bit)) continue;
        const n = { x: x + d.dx, y: y + d.dy };
        if (!inside(n)) problem('error', 'leaves-map', `The path runs off the map at (${x}, ${y}). End it with an exit instead.`, [[x, y]]);
        else if (!isPath(n)) problem('error', 'broken-link', `The path at (${x}, ${y}) points at a cell with no path.`, [[x, y]]);
      }
    }
  }

  const routes: Route[] = [];
  const reached = new Uint8Array(width * height);
  const reachedExits = new Set<string>();
  let truncated = false;

  for (const s of ground) {
    const start = { x: s.cell[0], y: s.cell[1] };
    if (!isPath(start)) continue;
    const before = routes.length;
    // Depth-first over every branch, with an explicit stack: a snaking path on a big map is
    // thousands of cells long, too deep for recursion.
    const onRoute = new Set<number>();
    const cells: Cell[] = [];
    const choices: string[] = [];
    type Frame = { i: number; outs: { d: (typeof DIRS)[number]; n: Cell }[]; k: number };
    const frames: Frame[] = [];
    const enter = (c: Cell) => {
      const i = idx(c);
      if (onRoute.has(i)) {
        problem('error', 'loop', `The path loops back on itself at (${c.x}, ${c.y}). Enemies would walk forever.`, [[c.x, c.y]]);
        return;
      }
      reached[i] = 1;
      const outs = DIRS.filter((d) => path[i]! & d.bit)
        .map((d) => ({ d, n: { x: c.x + d.dx, y: c.y + d.dy } }))
        .filter(({ n }) => isPath(n));
      if (outs.length === 0) {
        const exit = exitAt.get(i);
        if (exit) {
          reachedExits.add(exit.id);
          const id = choices.length ? `${s.id}:${choices.join('')}` : s.id;
          routes.push(buildRoute(id, s, exit, 'ground', [...cells, c], width, height));
        } else {
          problem('error', 'dead-end', `The path dead-ends at (${c.x}, ${c.y}). Continue it to an exit, or place an exit here.`, [[c.x, c.y]]);
        }
        return;
      }
      onRoute.add(i);
      cells.push(c);
      frames.push({ i, outs, k: 0 });
    };
    enter(start);
    while (frames.length) {
      if (routes.length >= MAX_ROUTES) {
        truncated = true;
        break;
      }
      const f = frames[frames.length - 1]!;
      const branching = f.outs.length > 1;
      if (f.k > 0 && branching) choices.pop();
      if (f.k >= f.outs.length) {
        frames.pop();
        cells.pop();
        onRoute.delete(f.i);
        continue;
      }
      const { d, n } = f.outs[f.k++]!;
      if (branching) choices.push(d.name);
      enter(n);
    }
    if (routes.length === before && !truncated) {
      problem('error', 'spawn-no-route', `Enemies from spawn "${s.id}" can't reach any exit.`, [s.cell]);
    }
  }
  if (truncated) problem('error', 'too-many-routes', `The path has more than ${MAX_ROUTES} distinct routes. Simplify the branches.`);

  // Air: drawn flight paths where they exist, otherwise a straight line to every exit.
  const exitById = new Map(exits.map((e) => [e.id, e]));
  for (const r of input.airRoutes ?? []) {
    const from = spawns.find((s) => s.id === r.from);
    const to = exitById.get(r.to);
    if (!from || from.kind !== 'air') problem('error', 'air-route-from', `Flight path "${r.id}" must start at an air spawn ("${r.from}" isn't one).`, from ? [from.cell] : []);
    if (!to) problem('error', 'air-route-to', `Flight path "${r.id}" ends at "${r.to}", which isn't an exit.`, from ? [from.cell] : []);
    const outside = r.points.filter(([x, y]) => x < -1 || y < -1 || x > width + 1 || y > height + 1);
    if (outside.length) problem('warning', 'air-route-outside', `Flight path "${r.id}" has ${outside.length} point(s) far off the map.`);
  }
  for (const s of air) {
    const drawn = (input.airRoutes ?? []).filter((r) => r.from === s.id && exitById.has(r.to));
    if (drawn.length) {
      for (const r of drawn) {
        reachedExits.add(r.to);
        routes.push(buildRoute(r.id, s, exitById.get(r.to)!, 'air', [], width, height, { points: r.points, smooth: r.smooth }));
      }
      continue;
    }
    for (const e of exits) {
      reachedExits.add(e.id);
      routes.push(buildRoute(`${s.id}>${e.id}`, s, e, 'air', [], width, height));
    }
  }

  const orphans: [number, number][] = [];
  const junctions: Cell[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const out = path[y * width + x]!;
      if (out === NO_PATH) continue;
      if (!reached[y * width + x]) orphans.push([x, y]);
      if (DIRS.filter((d) => out & d.bit).length > 1) junctions.push({ x, y });
    }
  }
  if (orphans.length && ground.length) {
    problem('warning', 'orphan-path', `${orphans.length} path cell${orphans.length === 1 ? " isn't" : "s aren't"} reachable from any spawn.`, orphans);
  }
  for (const e of exits) {
    if (!reachedExits.has(e.id) && isPath({ x: e.cell[0], y: e.cell[1] })) {
      problem('warning', 'exit-unreached', `No route reaches exit "${e.id}".`, [e.cell]);
    }
  }

  routes.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { routes, problems, junctions, reached };
}

function onEdge(c: Cell, width: number, height: number) {
  return c.x === 0 || c.y === 0 || c.x === width - 1 || c.y === height - 1;
}

/** Off-map direction for a marker on the edge, preferring the explicit edge, then the side facing away from `toward`. */
function edgeVector(cell: [number, number], explicit: string | undefined, width: number, height: number, toward?: Cell): [number, number] | null {
  const [x, y] = cell;
  const candidates: [string, [number, number]][] = [];
  if (x === 0) candidates.push(['W', [-1, 0]]);
  if (x === width - 1) candidates.push(['E', [1, 0]]);
  if (y === 0) candidates.push(['N', [0, -1]]);
  if (y === height - 1) candidates.push(['S', [0, 1]]);
  if (explicit) return candidates.find(([e]) => e === explicit)?.[1] ?? null;
  if (candidates.length === 0) return null;
  if (toward && candidates.length > 1) {
    const away = candidates.find(([, v]) => v[0] === x - toward.x && v[1] === y - toward.y);
    if (away) return away[1];
  }
  return candidates[0]![1];
}

/**
 * Builds a route's polyline: in from past the map edge, through the cells (ground) or the
 * waypoints (air), and out past the edge. Exported so the simulation can build the route an
 * enemy actually takes after its junction choices.
 */
export function buildRoute(
  id: string,
  spawn: Spawn,
  exit: Exit,
  kind: Route['kind'],
  cells: Cell[],
  width: number,
  height: number,
  air?: { points: [number, number][]; smooth: boolean },
): Route {
  let points: [number, number][] = [];
  const centre = (c: [number, number]): [number, number] => [c[0] + 0.5, c[1] + 0.5];
  const inDir = edgeVector(spawn.cell, spawn.edge, width, height, cells[1]);
  const outDir = edgeVector(exit.cell, exit.edge, width, height, cells.length > 1 ? cells[cells.length - 2] : undefined);
  const start = centre(spawn.cell);
  const end = centre(exit.cell);
  if (inDir) points.push([start[0] + inDir[0], start[1] + inDir[1]]);
  if (kind === 'ground') for (const c of cells) points.push([c.x + 0.5, c.y + 0.5]);
  else points.push(start, ...(air?.points ?? []), end);
  if (outDir) points.push([end[0] + outDir[0], end[1] + outDir[1]]);
  if (kind === 'air' && air?.smooth) points = catmullRom(points, 8);
  const lengths = [0];
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1]!;
    const [bx, by] = points[i]!;
    lengths.push(lengths[i - 1]! + Math.hypot(bx - ax, by - ay));
  }
  return { id, spawn: spawn.id, exit: exit.id, kind, cells, points, lengths };
}

/** Centripetal-ish Catmull-Rom through every point, `steps` samples per segment; keeps the ends. */
export function catmullRom(pts: [number, number][], steps: number): [number, number][] {
  if (pts.length < 3) return pts;
  const out: [number, number][] = [pts[0]!];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[Math.min(pts.length - 1, i + 2)]!;
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  return out;
}

/** Position (tile units) at `distance` along a route, clamped to its ends. */
export function pointAt(route: Route, distance: number): [number, number] {
  const { points, lengths } = route;
  if (distance <= 0) return points[0]!;
  const total = lengths[lengths.length - 1]!;
  if (distance >= total) return points[points.length - 1]!;
  let lo = 0;
  let hi = lengths.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (lengths[mid]! <= distance) lo = mid;
    else hi = mid;
  }
  const t = (distance - lengths[lo]!) / (lengths[hi]! - lengths[lo]!);
  const [ax, ay] = points[lo]!;
  const [bx, by] = points[hi]!;
  return [ax + (bx - ax) * t, ay + (by - ay) * t];
}

export const routeLength = (route: Route) => route.lengths[route.lengths.length - 1]!;
