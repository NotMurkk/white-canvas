import { describe, expect, it } from 'vitest';
import { EnemyRegistry, KindRegistry, TerrainTypes, ZoneTypes, emptyWaves, parseMap, type JunctionPolicy, type WavesDoc } from '@tdmm/map-format';
import { PathGrid, stepCells, type Cell } from '@tdmm/pathing';
import { docFromMapState, mapStateFromDoc, validateMap, type Registries } from '@tdmm/rules';
import { BranchChooser, Simulation, clearCheckIsCurrent, gameplayHash, runClearCheck, simulateAll } from '../src/index.ts';

const reg: Registries = {
  terrainTypes: TerrainTypes.parse({ grass: { name: 'Grass', drawOrder: 0, placement: ['land'], walkable: true, color: '#70c058' } }),
  kinds: KindRegistry.parse({ rock: { name: 'Rock', category: 'rock', footprint: ['B'], anchor: [0, 0], color: '#888888' } }),
  enemies: EnemyRegistry.parse({
    grunt: { name: 'Grunt', hp: 10, speed: 2, color: '#e07030' },
    bird: { name: 'Bird', hp: 5, speed: 4, flying: true, color: '#60c0f0' },
  }),
  zones: ZoneTypes.parse({}),
};

function stroke(g: PathGrid, ...pts: Cell[]) {
  let prev = pts[0]!;
  g.add(prev);
  for (const c of pts.slice(1)) for (const s of stepCells(prev, c)) (g.connect(prev, s), (prev = s));
}

/** 10x7: west spawn, splits at (4,3) into a north lane (exit N) and an east lane (exit E). */
function forked(policy?: JunctionPolicy) {
  const doc = parseMap({
    format: 'ptd-map',
    schemaVersion: 2,
    id: 'fork',
    name: 'Fork',
    seed: 42,
    grid: { width: 10, height: 7, tileSize: 32 },
    themes: { default: 'summer', supported: ['summer'] },
    terrain: { legend: { '.': 'grass' }, rows: Array.from({ length: 7 }, () => '.'.repeat(10)) },
    spawns: [{ id: 'w', cell: [0, 3] }],
    exits: [
      { id: 'n', cell: [4, 0] },
      { id: 'e', cell: [9, 3] },
    ],
    junctions: policy ? [{ cell: [4, 3], policy }] : [],
  });
  const s = mapStateFromDoc(doc);
  const g = new PathGrid(s.width, s.height, s.path);
  stroke(g, { x: 0, y: 3 }, { x: 4, y: 3 }, { x: 4, y: 0 });
  stroke(g, { x: 4, y: 3 }, { x: 9, y: 3 });
  return { doc, s };
}

const waves = (rounds: WavesDoc['rounds']): WavesDoc => ({ ...emptyWaves('fork'), rounds });
const grunts = (n: number, route: string | null = null) => ({ bonusCash: 50, groups: [{ id: `g${n}${route ?? ''}`, enemy: 'grunt', count: n, startSec: 0, intervalSec: 0.5, spawn: 'w', route }] });

function routesTaken(s: ReturnType<typeof forked>['s'], round: number, n: number) {
  const c = new BranchChooser(s, round);
  return Array.from({ length: n }, () => c.walk('w')!.id);
}

describe('branch policies', () => {
  it('alternates by default, the same way every round', () => {
    const { s } = forked();
    expect(routesTaken(s, 1, 4)).toEqual(['w:N', 'w:E', 'w:N', 'w:E']);
    expect(routesTaken(s, 2, 2)).toEqual(['w:N', 'w:E']);
  });

  it('weighted is a deterministic weighted round-robin', () => {
    const { s } = forked({ type: 'weighted', branches: { N: { weight: 1, rounds: 'all' }, E: { weight: 3, rounds: 'all' } } });
    const taken = routesTaken(s, 1, 8);
    expect(taken.filter((r) => r === 'w:E')).toHaveLength(6);
    expect(taken).toEqual(['w:E', 'w:N', 'w:E', 'w:E', 'w:E', 'w:N', 'w:E', 'w:E']);
  });

  it('random is seeded: same map seed and round give the same choices', () => {
    const { s } = forked({ type: 'random', branches: { N: { weight: 1, rounds: 'all' }, E: { weight: 1, rounds: 'all' } } });
    const a = routesTaken(s, 3, 20);
    expect(routesTaken(s, 3, 20)).toEqual(a);
    expect(new Set(a).size).toBe(2);
    expect(routesTaken(s, 4, 20)).not.toEqual(a);
  });

  it('opens branches by round (BTD6-style odd/even entrances)', () => {
    const { s } = forked({ type: 'alternate', branches: { N: { weight: 1, rounds: 'odd' }, E: { weight: 1, rounds: 'even, 5+' } } });
    expect(new Set(routesTaken(s, 1, 4))).toEqual(new Set(['w:N']));
    expect(new Set(routesTaken(s, 2, 4))).toEqual(new Set(['w:E']));
    expect(new Set(routesTaken(s, 5, 4))).toEqual(new Set(['w:N', 'w:E']));
  });

  it('flags rounds where nothing is open, and bad round filters', () => {
    const { s } = forked({ type: 'alternate', branches: { N: { weight: 1, rounds: '1' }, E: { weight: 1, rounds: '1' } } });
    const codes = (w: WavesDoc) => validateMap(s, reg, w).problems.map((p) => p.code);
    expect(codes(waves([grunts(1), grunts(1)]))).toContain('junction-closed');
    s.junctions[0]!.policy.branches.E!.rounds = 'sometimes';
    expect(codes(waves([grunts(1)]))).toContain('junction-rounds');
  });
});

describe('simulation', () => {
  it('plays rounds deterministically and gives the bonus cash', () => {
    const { s } = forked({ type: 'weighted', branches: { N: { weight: 1, rounds: 'all' }, E: { weight: 3, rounds: 'all' } } });
    const w = waves([grunts(8), grunts(4)]);
    const a = simulateAll({ state: s, reg, waves: w });
    const b = simulateAll({ state: s, reg, waves: w });
    expect(a).toEqual(b);
    expect(a.errors).toEqual([]);
    expect(a.stats[0]!.byRoute).toEqual({ 'w:E': 6, 'w:N': 2 });
    expect(a.stats[0]!.leaked).toBe(8);
    expect(a.stats[1]!.cashAtStart).toBe(650 + 50);
    expect(a.stats[1]!.cashAtEnd).toBe(650 + 100);
    // the last grunt spawns at 3.5 s on the east route: 1 tile in + 9 cells + 1 tile out = 11 tiles at 2 tiles/s
    expect(a.stats[0]!.clearSec).toBeCloseTo(3.5 + 5.5, 1);
  });

  it('respects pinned routes and drawn flight paths', () => {
    const { s } = forked();
    s.spawns.push({ id: 'sky', cell: [9, 6], kind: 'air' });
    s.airRoutes.push({ id: 'loop', from: 'sky', to: 'n', points: [[2.5, 5.5], [1.5, 1.5]], smooth: true });
    const v = validateMap(s, reg);
    expect(v.compiled.routes.map((r) => r.id)).toEqual(['loop', 'w:E', 'w:N']);
    expect(v.compiled.routes[0]!.points.length).toBeGreaterThan(10); // smoothed
    const w = waves([
      {
        bonusCash: 0,
        groups: [
          { id: 'a', enemy: 'grunt', count: 3, startSec: 0, intervalSec: 1, spawn: 'w', route: 'w:E' },
          { id: 'b', enemy: 'bird', count: 2, startSec: 0, intervalSec: 1, spawn: 'sky', route: null },
        ],
      },
    ]);
    const r = simulateAll({ state: s, reg, waves: w });
    expect(r.errors).toEqual([]);
    expect(r.stats[0]!.byRoute).toEqual({ 'w:E': 3, loop: 2 });
  });

  it('removes obstacles for cash, in order', () => {
    const { s } = forked();
    s.objects.push({ id: 'o_a', kind: 'rock', x: 1, y: 1, removal: { cost: 300, requires: [] } }, { id: 'o_b', kind: 'rock', x: 2, y: 1, removal: { cost: 500, requires: ['o_a'] } });
    const sim = new Simulation({ state: s, reg, waves: waves([grunts(1)]) });
    expect(sim.removeObstacle('o_b')).toEqual({ ok: false, reason: 'Clear o_a first.' });
    expect(sim.removeObstacle('o_a').ok).toBe(true);
    expect(sim.cash).toBe(350);
    expect(sim.removeObstacle('o_b').reason).toMatch(/Needs \$500/);
  });
});

describe('clear check', () => {
  it('passes a clean map and stamps a hash that ignores names but not gameplay', () => {
    const { doc, s } = forked();
    const w = waves([grunts(4)]);
    const r = runClearCheck(s, reg, w);
    expect(r.problems).toEqual([]);
    expect(r.passed).toBe(true);
    expect(r.record).toMatchObject({ rounds: 1, enemies: 4, leakedLives: 4 });

    const stored = { ...w, clearCheck: r.record! };
    // a save/reload round trip (different array order, renamed map) keeps it valid
    const reloaded = mapStateFromDoc(parseMap({ ...docFromMapState(doc, s), name: 'Renamed' }));
    reloaded.exits.reverse();
    expect(clearCheckIsCurrent(reloaded, reg, stored)).toBe(true);
    // any gameplay change invalidates it
    reloaded.objects.push({ id: 'o_x', kind: 'rock', x: 7, y: 6 });
    expect(clearCheckIsCurrent(reloaded, reg, stored)).toBe(false);
    expect(gameplayHash(reloaded, reg, w)).not.toBe(r.gameplayHash);
  });

  it('fails without waves or with broken references', () => {
    const { s } = forked();
    expect(runClearCheck(s, reg, waves([])).problems.map((p) => p.code)).toEqual(['no-waves']);
    const bad = waves([{ bonusCash: 0, groups: [{ id: 'x', enemy: 'grunt', count: 1, startSec: 0, intervalSec: 1, spawn: 'nowhere', route: null }] }]);
    const r = runClearCheck(s, reg, bad);
    expect(r.passed).toBe(false);
    expect(r.record).toBeNull();
    expect(r.problems.map((p) => p.code)).toContain('unknown-spawn');
  });
});
