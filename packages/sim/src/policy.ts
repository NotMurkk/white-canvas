// Branch choice at junctions. Enemies choose when they spawn (walking the whole path once), so a
// round's routes depend only on spawn order, never on frame timing: the editor's check, the CI
// gate and the game all see the same choices.
import { DIRECTIONS, NO_PATH, roundFilter, type Direction, type Junction } from '@tdmm/map-format';
import { DIRS, buildRoute, type Route } from '@tdmm/pathing';
import type { MapState } from '@tdmm/rules';
import { rng } from './hash.ts';

const BIT: Record<Direction, number> = { N: 1, E: 2, S: 4, W: 8 };

export interface BranchOption {
  dir: Direction;
  weight: number;
  open: boolean;
}

/** The out-branches of a junction cell in round `round` (1-based), with their weights. */
export function branchOptions(state: MapState, junction: Junction | undefined, cellIndex: number, round: number): BranchOption[] {
  const out = state.path[cellIndex]!;
  const x = cellIndex % state.width;
  const y = Math.floor(cellIndex / state.width);
  return DIRECTIONS.filter((d) => out & BIT[d])
    .filter((d) => {
      const s = DIRS.find((k) => k.name === d)!;
      const nx = x + s.dx;
      const ny = y + s.dy;
      return nx >= 0 && ny >= 0 && nx < state.width && ny < state.height && state.path[ny * state.width + nx] !== NO_PATH;
    })
    .map((dir) => {
      const b = junction?.policy.branches[dir];
      return { dir, weight: b?.weight ?? 1, open: b ? roundFilter(b.rounds)(round) : true };
    });
}

/** Per-round chooser state: alternate counters, smooth-weighted accumulators, seeded random. */
export class BranchChooser {
  private readonly state: MapState;
  private readonly round: number;
  private readonly junctions = new Map<number, Junction>();
  private readonly counters = new Map<number, number>();
  private readonly weightAcc = new Map<number, Map<Direction, number>>();
  private readonly random: () => number;
  private readonly routeCache = new Map<string, Route>();

  constructor(state: MapState, round: number) {
    this.state = state;
    this.round = round;
    for (const j of state.junctions) this.junctions.set(j.cell[1] * state.width + j.cell[0], j);
    this.random = rng((state.seed * 1000003 + round * 7919) >>> 0);
  }

  /**
   * Walks from a ground spawn to an exit, choosing at each junction by its policy.
   * Returns null if the walk hits a dead end or loop (validation reports those first).
   */
  walk(spawnId: string): Route | null {
    const { state } = this;
    const spawn = state.spawns.find((s) => s.id === spawnId);
    if (!spawn) return null;
    let i = spawn.cell[1] * state.width + spawn.cell[0];
    const cells: { x: number; y: number }[] = [];
    const letters: string[] = [];
    const seen = new Set<number>();
    for (;;) {
      if (state.path[i] === NO_PATH || seen.has(i)) return null;
      seen.add(i);
      const x = i % state.width;
      const y = Math.floor(i / state.width);
      cells.push({ x, y });
      const options = branchOptions(state, this.junctions.get(i), i, this.round);
      if (options.length === 0) {
        const exit = state.exits.find((e) => e.cell[0] === x && e.cell[1] === y);
        if (!exit) return null;
        const id = letters.length ? `${spawn.id}:${letters.join('')}` : spawn.id;
        let route = this.routeCache.get(id);
        if (!route) {
          route = buildRoute(id, spawn, exit, 'ground', cells, state.width, state.height);
          this.routeCache.set(id, route);
        }
        return route;
      }
      const dir = options.length === 1 ? options[0]!.dir : this.choose(i, options);
      if (options.length > 1) letters.push(dir);
      const s = DIRS.find((k) => k.name === dir)!;
      i = (y + s.dy) * state.width + (x + s.dx);
    }
  }

  private choose(cell: number, options: BranchOption[]): Direction {
    const policy = this.junctions.get(cell)?.policy;
    let open = options.filter((o) => o.open);
    if (open.length === 0) open = options; // validation flags rounds with nothing open
    if (!policy || policy.type === 'alternate' || open.every((o) => o.weight <= 0)) {
      const n = this.counters.get(cell) ?? 0;
      this.counters.set(cell, n + 1);
      return open[n % open.length]!.dir;
    }
    const total = open.reduce((s, o) => s + Math.max(0, o.weight), 0);
    if (policy.type === 'random') {
      let r = this.random() * total;
      for (const o of open) {
        r -= Math.max(0, o.weight);
        if (r < 0) return o.dir;
      }
      return open[open.length - 1]!.dir;
    }
    // Smooth weighted round-robin (deterministic): weights 3:1 give E E S E E E S E...
    let acc = this.weightAcc.get(cell);
    if (!acc) this.weightAcc.set(cell, (acc = new Map()));
    let best: BranchOption | null = null;
    for (const o of open) {
      const v = (acc.get(o.dir) ?? 0) + Math.max(0, o.weight);
      acc.set(o.dir, v);
      if (!best || v > acc.get(best.dir)!) best = o;
    }
    acc.set(best!.dir, acc.get(best!.dir)! - total);
    return best!.dir;
  }
}

