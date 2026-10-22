// One validation pass for the whole map: path graph, terrain under the path, objects, waves.
// The editor shows the problem list live; the repo test fails on any error in a committed map.
import { DIRECTIONS, DIR_BITS, NO_PATH, parseRoundSpec, roundFilter, terrainAt, type Problem, type WavesDoc } from '@tdmm/map-format';
import { DIRS, compilePath, type CompiledPath } from '@tdmm/pathing';
import { computeBuildable, footprintCells, occupancy, type BuildableMap } from './placement.ts';
import type { MapState, Registries } from './state.ts';

export interface Validation {
  compiled: CompiledPath;
  buildable: BuildableMap;
  problems: Problem[];
  errors: number;
  warnings: number;
}

/** Fewer buildable cells than this gets a warning. */
const MIN_BUILDABLE = 12;

export function validateMap(s: MapState, reg: Registries, waves?: WavesDoc): Validation {
  const compiled = compilePath({ width: s.width, height: s.height, path: s.path, spawns: s.spawns, exits: s.exits, airRoutes: s.airRoutes });
  const problems: Problem[] = [...compiled.problems];
  const add = (severity: Problem['severity'], code: string, message: string, cells: [number, number][] = []) =>
    problems.push({ severity, code, message, cells });

  problems.push(...validateJunctions(s, waves));
  problems.push(...validateRemovals(s));
  const unknownZones = s.zones.kinds.filter((k) => !reg.zones[k] && s.zones.cells.some((v) => s.zones.kinds[v - 1] === k));
  for (const k of unknownZones) add('error', 'unknown-zone', `Zone type "${k}" isn't in content/zones.json.`);

  // Terrain under the path must still be walkable (e.g. water painted over the path later).
  const wet: [number, number][] = [];
  for (let i = 0; i < s.path.length; i++) {
    if (s.path[i] === NO_PATH) continue;
    const x = i % s.width;
    const y = Math.floor(i / s.width);
    const t = terrainAt(s.terrain, x, y);
    if (!t || !reg.terrainTypes[t]?.walkable) wet.push([x, y]);
  }
  if (wet.length) add('error', 'path-on-unwalkable', `The path crosses ${wet.length} cell${wet.length > 1 ? 's' : ''} enemies can't walk on (like water).`, wet);

  // Objects: unknown kinds, blocking the path, off the map, overlapping, canopies hiding the path.
  const occ = new Int32Array(s.width * s.height);
  s.objects.forEach((o, i) => {
    const kind = reg.kinds[o.kind];
    if (!kind) {
      add('error', 'unknown-kind', `Object "${o.id}" uses unknown kind "${o.kind}".`, [[o.x, o.y]]);
      return;
    }
    const hidden: [number, number][] = [];
    for (const c of footprintCells(kind, o.x, o.y)) {
      if (c.role === '.') continue;
      const inside = c.x >= 0 && c.y >= 0 && c.x < s.width && c.y < s.height;
      if (!inside) {
        if (c.role === 'B') add('error', 'object-off-map', `${kind.name} "${o.id}" stands partly off the map.`, [[o.x, o.y]]);
        continue;
      }
      const ci = c.y * s.width + c.x;
      if (c.role === 'B') {
        const t = terrainAt(s.terrain, c.x, c.y)!;
        const classes = reg.terrainTypes[t]?.placement ?? [];
        if (!classes.some((p) => kind.allowedOn.includes(p))) {
          add('error', 'object-bad-terrain', `${kind.name} "${o.id}" can't stand on ${reg.terrainTypes[t]?.name.toLowerCase() ?? t}.`, [[c.x, c.y]]);
        }
      }
      if (occ[ci]) add('error', 'object-overlap', `${kind.name} "${o.id}" overlaps ${reg.kinds[s.objects[occ[ci]! - 1]!.kind]?.name ?? 'another object'}.`, [[c.x, c.y]]);
      occ[ci] = i + 1;
      if (s.path[ci] !== NO_PATH) {
        if (c.role === 'B') add('error', 'object-blocks-path', `${kind.name} "${o.id}" stands on the enemy path.`, [[c.x, c.y]]);
        else hidden.push([c.x, c.y]);
      }
    }
    if (hidden.length) add('warning', 'canopy-hides-path', `${kind.name} "${o.id}" hides part of the path under its canopy.`, hidden);
  });

  const buildable = computeBuildable(s, reg, occupancy(s, reg));
  if (buildable.count < MIN_BUILDABLE) add('warning', 'few-buildable', `Only ${buildable.count} cells can take a tower.`);

  if (waves) problems.push(...validateWaves(s, reg, waves, compiled));

  // Errors first, then by code, so the list is stable while editing.
  problems.sort((a, b) => (a.severity === b.severity ? (a.code < b.code ? -1 : a.code > b.code ? 1 : 0) : a.severity === 'error' ? -1 : 1));
  const errors = problems.filter((p) => p.severity === 'error').length;
  return { compiled, buildable, problems, errors, warnings: problems.length - errors };
}

/** Branch policies: stale cells, unknown branches, bad round filters, rounds where nothing is open. */
export function validateJunctions(s: MapState, waves?: WavesDoc): Problem[] {
  const out: Problem[] = [];
  const add = (severity: Problem['severity'], code: string, message: string, cells: [number, number][]) => out.push({ severity, code, message, cells });
  for (const j of s.junctions) {
    const [x, y] = j.cell;
    const at = `junction (${x}, ${y})`;
    const mask = x < s.width && y < s.height ? s.path[y * s.width + x]! : NO_PATH;
    const outs = mask === NO_PATH ? [] : DIRECTIONS.filter((d) => mask & DIR_BITS[d]).filter((d) => {
      const k = DIRS.find((v) => v.name === d)!;
      const nx = x + k.dx;
      const ny = y + k.dy;
      return nx >= 0 && ny >= 0 && nx < s.width && ny < s.height && s.path[ny * s.width + nx] !== NO_PATH;
    });
    if (outs.length < 2) {
      add('warning', 'junction-stale', `There's a branch policy at (${x}, ${y}), but the path no longer splits there. It is ignored.`, [j.cell]);
      continue;
    }
    for (const [d, b] of Object.entries(j.policy.branches)) {
      if (!b) continue;
      if (!outs.includes(d as (typeof DIRECTIONS)[number])) add('warning', 'junction-branch-gone', `The ${at} policy mentions branch ${d}, which no longer exists.`, [j.cell]);
      const r = parseRoundSpec(b.rounds);
      if (!r.ok) add('error', 'junction-rounds', `${at}, branch ${d}: ${r.error}.`, [j.cell]);
    }
    if (j.policy.type !== 'alternate' && outs.every((d) => (j.policy.branches[d]?.weight ?? 1) <= 0)) {
      add('error', 'junction-weights', `Every branch at ${at} has weight 0. Give at least one branch a weight.`, [j.cell]);
    }
    const closed: number[] = [];
    for (let r = 1; r <= (waves?.rounds.length ?? 0); r++) {
      if (!outs.some((d) => roundFilter(j.policy.branches[d]?.rounds ?? 'all')(r))) closed.push(r);
    }
    if (closed.length) add('error', 'junction-closed', `No branch at ${at} is open in round${closed.length > 1 ? 's' : ''} ${closed.join(', ')}.`, [j.cell]);
  }
  return out;
}

/** Removable obstacles: costs, unknown or non-removable prerequisites, and cycles. */
export function validateRemovals(s: MapState): Problem[] {
  const out: Problem[] = [];
  const byId = new Map(s.objects.map((o) => [o.id, o]));
  for (const o of s.objects) {
    if (!o.removal) continue;
    for (const r of o.removal.requires) {
      const dep = byId.get(r);
      if (!dep) out.push({ severity: 'error', code: 'removal-requires', message: `"${o.id}" requires removing "${r}" first, but there is no such object.`, cells: [[o.x, o.y]] });
      else if (!dep.removal) out.push({ severity: 'error', code: 'removal-requires', message: `"${o.id}" requires removing "${r}" first, but "${r}" isn't removable.`, cells: [[o.x, o.y]] });
    }
  }
  // cycles: a requires b requires a
  const state = new Map<string, 1 | 2>();
  const visit = (id: string, trail: string[]): void => {
    if (state.get(id) === 2) return;
    if (state.get(id) === 1) {
      const o = byId.get(id)!;
      out.push({ severity: 'error', code: 'removal-cycle', message: `Removal order loops: ${[...trail.slice(trail.indexOf(id)), id].join(' → ')}.`, cells: [[o.x, o.y]] });
      return;
    }
    state.set(id, 1);
    for (const r of byId.get(id)?.removal?.requires ?? []) if (byId.get(r)?.removal) visit(r, [...trail, id]);
    state.set(id, 2);
  };
  for (const o of s.objects) if (o.removal) visit(o.id, []);
  return out;
}

export function validateWaves(s: MapState, reg: Registries, waves: WavesDoc, compiled: CompiledPath): Problem[] {
  const out: Problem[] = [];
  const add = (severity: Problem['severity'], code: string, message: string, cells: [number, number][] = []) => out.push({ severity, code, message, cells });
  if (waves.rounds.length === 0) add('warning', 'no-waves', 'No waves yet. Add rounds in the Waves panel.');
  const spawns = new Map(s.spawns.map((sp) => [sp.id, sp]));
  const routes = new Map(compiled.routes.map((r) => [r.id, r]));
  waves.rounds.forEach((round, ri) => {
    if (round.groups.length === 0) add('warning', 'empty-round', `Round ${ri + 1} has no enemy groups.`);
    for (const g of round.groups) {
      const where = `Round ${ri + 1}, group "${g.id}"`;
      const enemy = reg.enemies[g.enemy];
      const spawn = spawns.get(g.spawn);
      if (!enemy) add('error', 'unknown-enemy', `${where}: unknown enemy "${g.enemy}".`);
      if (!spawn) {
        add('error', 'unknown-spawn', `${where}: spawn "${g.spawn}" doesn't exist on this map.`);
        continue;
      }
      if (enemy && !enemy.flying && spawn.kind === 'air') add('error', 'ground-from-air', `${where}: ${enemy.name} can't fly, but spawn "${spawn.id}" is an air spawn.`, [spawn.cell]);
      if (enemy?.flying && spawn.kind === 'ground') add('warning', 'flyer-walks', `${where}: ${enemy.name} flies, but will follow the ground path from "${spawn.id}".`, [spawn.cell]);
      if (g.route !== null) {
        const r = routes.get(g.route);
        if (!r) add('error', 'unknown-route', `${where}: route "${g.route}" no longer exists (the path changed).`, [spawn.cell]);
        else if (r.spawn !== g.spawn) add('error', 'route-spawn-mismatch', `${where}: route "${g.route}" starts at "${r.spawn}", not "${g.spawn}".`, [spawn.cell]);
      } else if (!compiled.routes.some((r) => r.spawn === g.spawn)) {
        add('error', 'spawn-unroutable', `${where}: spawn "${g.spawn}" has no route to an exit.`, [spawn.cell]);
      }
    }
  });
  return out;
}
