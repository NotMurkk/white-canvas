// The clear check: Mario Maker won't upload a course you haven't beaten; this won't pass a map
// whose rounds don't all play out. Static validation must be clean, then a no-tower simulation of
// every round must spawn every enemy and get each one to an exit. The result is stamped with a
// hash of all gameplay data, so any later gameplay edit (but not a reskin) invalidates it.
import type { ClearCheck, Problem, WavesDoc } from '@tdmm/map-format';
import { validateMap, type MapState, type Registries } from '@tdmm/rules';
import { canonicalJson, hashString } from './hash.ts';
import { SIM_VERSION, simulateAll, type RoundStats } from './simulation.ts';

export interface ClearCheckResult {
  passed: boolean;
  /** Why it failed: validation errors and simulation errors. */
  problems: Problem[];
  stats: RoundStats[];
  gameplayHash: string;
  /** The record to store in the waves file when passed. */
  record: ClearCheck | null;
}

const byId = <T extends { id: string }>(a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const strip = <T extends Record<string, unknown>>(reg: Record<string, T>) =>
  Object.fromEntries(Object.entries(reg).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).filter(([f]) => f !== 'name' && f !== 'color'))]));

/**
 * Hash of everything that affects play: the map's gameplay layers, the waves (minus the check
 * itself), the content registries' numbers and the simulation version. Names, colours, themes
 * and art are excluded, so renaming a map or adding a winter skin keeps the check valid.
 */
export function gameplayHash(state: MapState, reg: Registries, waves: WavesDoc): string {
  const named = (kinds: string[], cells: Uint8Array, offset: number) => Array.from(cells, (c) => (offset && !c ? '' : kinds[c - offset] ?? '')).join(',');
  return hashString(
    canonicalJson({
      simVersion: SIM_VERSION,
      map: {
        size: [state.width, state.height],
        seed: state.seed,
        terrain: named(state.terrain.kinds, state.terrain.cells, 0),
        path: Array.from(state.path).join(','),
        zones: named(state.zones.kinds, state.zones.cells, 1),
        spawns: [...state.spawns].sort(byId),
        exits: [...state.exits].sort(byId),
        junctions: [...state.junctions].sort((a, b) => a.cell[1] - b.cell[1] || a.cell[0] - b.cell[0]),
        airRoutes: [...state.airRoutes].sort(byId),
        objects: [...state.objects].sort(byId).map((o) => ({ id: o.id, kind: o.kind, x: o.x, y: o.y, removal: o.removal })),
      },
      waves: { startCash: waves.startCash, lives: waves.lives, rounds: waves.rounds },
      content: { terrainTypes: strip(reg.terrainTypes), kinds: strip(reg.kinds), enemies: strip(reg.enemies), zones: strip(reg.zones) },
    }),
  );
}

export function runClearCheck(state: MapState, reg: Registries, waves: WavesDoc): ClearCheckResult {
  const hash = gameplayHash(state, reg, waves);
  const v = validateMap(state, reg, waves);
  const problems = v.problems.filter((p) => p.severity === 'error');
  if (waves.rounds.length === 0) problems.push({ severity: 'error', code: 'no-waves', message: 'Add at least one round of waves; the clear check plays them.', cells: [] });
  if (problems.length) return { passed: false, problems, stats: [], gameplayHash: hash, record: null };

  const { stats, errors } = simulateAll({ state, reg, waves, compiled: v.compiled });
  for (const message of errors) problems.push({ severity: 'error', code: 'sim', message, cells: [] });
  const expected = waves.rounds.reduce((n, r) => n + r.groups.reduce((m, g) => m + g.count, 0), 0);
  const spawned = stats.reduce((n, s) => n + s.enemies, 0);
  const left = stats.reduce((n, s) => n + s.leaked, 0);
  if (spawned !== expected) problems.push({ severity: 'error', code: 'sim-spawn', message: `Only ${spawned} of ${expected} enemies could spawn.`, cells: [] });
  if (left !== spawned) problems.push({ severity: 'error', code: 'sim-stuck', message: `${spawned - left} enemies never reached an exit.`, cells: [] });
  const passed = problems.length === 0;
  return {
    passed,
    problems,
    stats,
    gameplayHash: hash,
    record: passed
      ? {
          simVersion: SIM_VERSION,
          gameplayHash: hash,
          rounds: stats.length,
          enemies: spawned,
          durationSec: Math.round(stats.reduce((t, s) => t + s.clearSec, 0) * 10) / 10,
          leakedLives: stats.reduce((n, s) => n + s.leakedLives, 0),
        }
      : null,
  };
}

/** Whether a stored record still matches the current gameplay. */
export function clearCheckIsCurrent(state: MapState, reg: Registries, waves: WavesDoc): boolean {
  const c = waves.clearCheck;
  return !!c && c.simVersion === SIM_VERSION && c.gameplayHash === gameplayHash(state, reg, waves);
}
