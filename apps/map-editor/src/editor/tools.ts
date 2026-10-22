// Tool operations on the document. Each returns what happened so the controller can give
// Mario Maker-style feedback: a sound and pop on success, a refusal reason (toast + red ghost)
// when the rules say no. Nothing here touches Phaser.
import { DIRECTIONS, DIR_BITS, NO_PATH, newId, type Direction, type JunctionPolicy, type Spawn } from '@tdmm/map-format';
import { DIRS, stepCells, type Cell } from '@tdmm/pathing';
import { BUILD_BLOCK_REASON, checkPlacement, footprintCells, occupancy } from '@tdmm/rules';
import type { EditorDocument } from './document.ts';

export type ToolId = 'select' | 'terrain' | 'path' | 'spawn' | 'exit' | 'air' | 'stamp' | 'zone' | 'eraser' | 'tower';
export type TerrainMode = 'pencil' | 'rect' | 'fill';

export interface Outcome {
  changed: boolean;
  refused?: string;
  /** Id of an object that was just placed (for the pop animation). */
  placedId?: string;
}

const OK_NOCHANGE: Outcome = { changed: false };

/** The theme's base terrain (what erased path cells turn back into). */
export function baseTerrain(doc: EditorDocument, themeTerrain: Record<string, { base: true } | { autotile: string }>) {
  return Object.entries(themeTerrain).find(([, v]) => 'base' in v)?.[0] ?? doc.state.terrain.kinds[0]!;
}

function objectBlockingAt(doc: EditorDocument, x: number, y: number, roles: string[]) {
  for (const o of doc.state.objects) {
    const kind = doc.reg.kinds[o.kind];
    if (!kind) continue;
    if (footprintCells(kind, o.x, o.y).some((c) => c.x === x && c.y === y && roles.includes(c.role))) return { o, kind };
  }
  return null;
}

// ---- terrain ------------------------------------------------------------------------------------

/** Paints terrain on one cell. Path cells keep their style (the path tool owns them). */
export function paintTerrain(doc: EditorDocument, c: Cell, kind: string): Outcome {
  if (!doc.inside(c.x, c.y)) return OK_NOCHANGE;
  const i = c.y * doc.width + c.x;
  if (doc.state.path[i] !== NO_PATH) return { changed: false, refused: 'Path cells keep their style. Restyle them with the Path tool.' };
  const blocker = objectBlockingAt(doc, c.x, c.y, ['B']);
  if (blocker) {
    const classes = doc.reg.terrainTypes[kind]?.placement ?? [];
    if (!classes.some((p) => blocker.kind.allowedOn.includes(p))) return { changed: false, refused: `${blocker.kind.name} can't stand on ${doc.reg.terrainTypes[kind]?.name.toLowerCase() ?? kind}.` };
  }
  return { changed: doc.setTerrain(c.x, c.y, kind) };
}

export function paintTerrainCells(doc: EditorDocument, cells: Cell[], kind: string): Outcome {
  let changed = false;
  let refused: string | undefined;
  for (const c of cells) {
    const r = paintTerrain(doc, c, kind);
    changed ||= r.changed;
    refused ??= r.refused;
  }
  return { changed, refused };
}

export function rectCells(a: Cell, b: Cell): Cell[] {
  const cells: Cell[] = [];
  for (let y = Math.min(a.y, b.y); y <= Math.max(a.y, b.y); y++) for (let x = Math.min(a.x, b.x); x <= Math.max(a.x, b.x); x++) cells.push({ x, y });
  return cells;
}

/** 4-connected flood of the region with the same terrain as `start`. */
export function floodCells(doc: EditorDocument, start: Cell): Cell[] {
  const target = doc.terrainAt(start.x, start.y);
  if (target === undefined) return [];
  const seen = new Uint8Array(doc.width * doc.height);
  const out: Cell[] = [];
  const stack = [start];
  while (stack.length) {
    const c = stack.pop()!;
    if (!doc.inside(c.x, c.y)) continue;
    const i = c.y * doc.width + c.x;
    if (seen[i] || doc.terrainAt(c.x, c.y) !== target) continue;
    seen[i] = 1;
    out.push(c);
    stack.push({ x: c.x + 1, y: c.y }, { x: c.x - 1, y: c.y }, { x: c.x, y: c.y + 1 }, { x: c.x, y: c.y - 1 });
  }
  return out;
}

// ---- enemy path ---------------------------------------------------------------------------------

function pathRefusal(doc: EditorDocument, c: Cell): string | undefined {
  if (!doc.inside(c.x, c.y)) return 'The path must stay on the map. End it with an exit at the edge.';
  const t = doc.terrainAt(c.x, c.y)!;
  if (!doc.reg.terrainTypes[t]?.walkable) return `Enemies can't walk on ${doc.reg.terrainTypes[t]?.name.toLowerCase() ?? t}.`;
  const blocker = objectBlockingAt(doc, c.x, c.y, ['B']);
  if (blocker) return `${blocker.kind.name} is in the way.`;
  return undefined;
}

/** Starts a path stroke at `c` (makes it a path cell). */
export function pathStart(doc: EditorDocument, c: Cell, style: string): Outcome {
  const refused = pathRefusal(doc, c);
  if (refused) return { changed: false, refused };
  const added = doc.editPath((g) => g.add(c));
  const styled = doc.setTerrain(c.x, c.y, style);
  return { changed: added || styled };
}

/**
 * Extends a path stroke from `from` to `to`, linking each step in drag direction (with elbows
 * on diagonals). Stops at the first refused cell and returns the last cell reached.
 */
export function pathExtend(doc: EditorDocument, from: Cell, to: Cell, style: string): Outcome & { last: Cell } {
  let last = from;
  let changed = false;
  for (const step of stepCells(from, to)) {
    const refused = pathRefusal(doc, step);
    if (refused) return { changed, refused, last };
    changed = doc.editPath((g) => g.connect(last, step)) || changed;
    changed = doc.setTerrain(step.x, step.y, style) || changed;
    last = step;
  }
  return { changed, last };
}

export function pathErase(doc: EditorDocument, c: Cell, base: string): Outcome {
  if (!doc.path.isPath(c)) return OK_NOCHANGE;
  doc.editPath((g) => g.erase(c));
  doc.setTerrain(c.x, c.y, base);
  return { changed: true };
}

// ---- markers ------------------------------------------------------------------------------------

const markerAt = (doc: EditorDocument, c: Cell) => ({
  spawn: doc.state.spawns.find((s) => s.cell[0] === c.x && s.cell[1] === c.y),
  exit: doc.state.exits.find((e) => e.cell[0] === c.x && e.cell[1] === c.y),
});

/** Readable, stable marker ids: "west", "west_2", "sky", "exit_east"... */
function markerId(doc: EditorDocument, c: Cell, prefix: string) {
  const side = c.x === 0 ? 'west' : c.x === doc.width - 1 ? 'east' : c.y === 0 ? 'north' : c.y === doc.height - 1 ? 'south' : 'inner';
  const stem = prefix ? `${prefix}_${side}` : side;
  const taken = new Set([...doc.state.spawns, ...doc.state.exits].map((m) => m.id));
  if (!taken.has(stem)) return stem;
  for (let n = 2; ; n++) if (!taken.has(`${stem}_${n}`)) return `${stem}_${n}`;
}

export function placeSpawn(doc: EditorDocument, c: Cell, kind: Spawn['kind']): Outcome {
  if (!doc.inside(c.x, c.y)) return { changed: false, refused: 'Spawns go on the map.' };
  const here = markerAt(doc, c);
  if (here.spawn?.kind === kind) return OK_NOCHANGE;
  if (here.exit) doc.editList('exits', (l) => l.splice(l.indexOf(here.exit!), 1));
  doc.editList('spawns', (l) => {
    if (here.spawn) here.spawn.kind = kind;
    else l.push({ id: markerId(doc, c, kind === 'air' ? 'sky' : ''), cell: [c.x, c.y], kind });
  });
  return { changed: true };
}

export function placeExit(doc: EditorDocument, c: Cell): Outcome {
  if (!doc.inside(c.x, c.y)) return { changed: false, refused: 'Exits go on the map.' };
  const here = markerAt(doc, c);
  if (here.exit) return OK_NOCHANGE;
  if (here.spawn) doc.editList('spawns', (l) => l.splice(l.indexOf(here.spawn!), 1));
  doc.editList('exits', (l) => l.push({ id: markerId(doc, c, 'exit'), cell: [c.x, c.y] }));
  return { changed: true };
}

export function removeMarkerAt(doc: EditorDocument, c: Cell): Outcome {
  const here = markerAt(doc, c);
  if (here.spawn) doc.editList('spawns', (l) => l.splice(l.indexOf(here.spawn!), 1));
  else if (here.exit) doc.editList('exits', (l) => l.splice(l.indexOf(here.exit!), 1));
  else return OK_NOCHANGE;
  return { changed: true };
}

// ---- stamps -------------------------------------------------------------------------------------

export function placeStamp(doc: EditorDocument, c: Cell, kind: string): Outcome {
  const check = checkPlacement(doc.state, doc.reg, kind, c.x, c.y, occupancy(doc.state, doc.reg));
  if (!check.ok) return { changed: false, refused: check.reason };
  const id = newId('o', doc.state.objects.map((o) => o.id));
  doc.editList('objects', (l) => l.push({ id, kind, x: c.x, y: c.y }));
  return { changed: true, placedId: id };
}

// ---- forgiveness snapping -------------------------------------------------------------------------
// Levelhead-style forgiveness: deliver what the designer meant from an imprecise click. A drop that
// doesn't fit but has a legal spot one cell away goes there instead (the ghost shows the jump).

/** The cell and its 8 neighbours, nearest to the exact pointer position first. */
export function nearbyCells(c: Cell, pointer?: Point): Cell[] {
  const [px, py] = pointer ?? [c.x + 0.5, c.y + 0.5];
  const cells: Cell[] = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) cells.push({ x: c.x + dx, y: c.y + dy });
  const d = (k: Cell) => (k.x === c.x && k.y === c.y ? -1 : Math.hypot(k.x + 0.5 - px, k.y + 0.5 - py));
  return cells.sort((a, b) => d(a) - d(b));
}

export interface Snap {
  cell: Cell;
  /** True when the result is not the cell under the pointer. */
  snapped: boolean;
  /** Why the cell under the pointer was refused (when snapped). */
  reason?: string;
}

/** Where a stamp of `kind` would go for a click at `c`: there if it fits, else the nearest spot one cell away. */
export function snapStamp(doc: EditorDocument, kind: string, c: Cell, pointer?: Point, ignoreId?: string): Snap | null {
  const occ = occupancy(doc.state, doc.reg, ignoreId);
  const here = checkPlacement(doc.state, doc.reg, kind, c.x, c.y, occ);
  if (here.ok) return { cell: c, snapped: false };
  for (const n of nearbyCells(c, pointer).slice(1)) {
    if (checkPlacement(doc.state, doc.reg, kind, n.x, n.y, occ).ok) return { cell: n, snapped: true, reason: here.reason };
  }
  return null;
}

/** Ground spawns and exits belong on path cells: a click next to one lands on it (dead ends first for exits). */
export function snapToPath(doc: EditorDocument, c: Cell, preferEnds: boolean, pointer?: Point): Snap | null {
  if (doc.path.isPath(c)) return { cell: c, snapped: false };
  const near = nearbyCells(c, pointer).slice(1).filter((n) => doc.path.isPath(n));
  const best = (preferEnds && near.find((n) => doc.path.out(n) === 0)) || near[0];
  return best ? { cell: best, snapped: true, reason: 'Not a path cell' } : null;
}

/** Test towers go on cells that take a tower: there, or the nearest such cell one away. */
export function snapTower(doc: EditorDocument, c: Cell, pointer?: Point): Snap | null {
  const block = doc.validate().buildable.block;
  const free = (k: Cell) => doc.inside(k.x, k.y) && !block[k.y * doc.width + k.x];
  if (free(c)) return { cell: c, snapped: false };
  const n = nearbyCells(c, pointer).slice(1).find(free);
  const why = doc.inside(c.x, c.y) ? BUILD_BLOCK_REASON[block[c.y * doc.width + c.x]!] : 'off the map';
  return n ? { cell: n, snapped: true, reason: why } : null;
}

/** The object drawn at a cell (any part of its art), front-most first. */
export function objectAt(doc: EditorDocument, c: Cell) {
  let best: { id: string; baseline: number } | null = null;
  for (const o of doc.state.objects) {
    const kind = doc.reg.kinds[o.kind];
    if (!kind || !footprintCells(kind, o.x, o.y).some((f) => f.x === c.x && f.y === c.y)) continue;
    const baseline = o.y - kind.anchor[1] + kind.footprint.length;
    if (!best || baseline >= best.baseline) best = { id: o.id, baseline };
  }
  return best ? doc.state.objects.find((o) => o.id === best!.id)! : null;
}

export function removeObjectAt(doc: EditorDocument, c: Cell): Outcome {
  const o = objectAt(doc, c);
  if (!o) return OK_NOCHANGE;
  doc.editList('objects', (l) => l.splice(l.indexOf(o), 1));
  return { changed: true };
}

// ---- zones and eraser ---------------------------------------------------------------------------

/** Paints a zone kind on a cell, or clears it with null. */
export function paintZone(doc: EditorDocument, c: Cell, kind: string | null): Outcome {
  return { changed: doc.setZone(c.x, c.y, kind) };
}

/** Removes the top-most thing at a cell: object, then marker, then path, then no-build flag. */
export function eraseAt(doc: EditorDocument, c: Cell, base: string): Outcome {
  if (!doc.inside(c.x, c.y)) return OK_NOCHANGE;
  const removed = removeObjectAt(doc, c);
  if (removed.changed) return removed;
  const here = markerAt(doc, c);
  if (here.spawn) {
    doc.editList('spawns', (l) => l.splice(l.indexOf(here.spawn!), 1));
    return { changed: true };
  }
  if (here.exit) {
    doc.editList('exits', (l) => l.splice(l.indexOf(here.exit!), 1));
    return { changed: true };
  }
  const p = pathErase(doc, c, base);
  if (p.changed) return p;
  return paintZone(doc, c, null);
}

// ---- flight paths -------------------------------------------------------------------------------

export type Point = [number, number];

export const airSpawnAt = (doc: EditorDocument, c: Cell) => doc.state.spawns.find((s) => s.kind === 'air' && s.cell[0] === c.x && s.cell[1] === c.y);
export const exitAt = (doc: EditorDocument, c: Cell) => doc.state.exits.find((e) => e.cell[0] === c.x && e.cell[1] === c.y);

export function createAirRoute(doc: EditorDocument, from: string, to: string, points: Point[]): Outcome & { id: string } {
  const id = newId('air', [...doc.state.airRoutes.map((r) => r.id), ...doc.state.spawns.map((s) => s.id)]);
  doc.editList('airRoutes', (l) => l.push({ id, from, to, points, smooth: points.length > 1 }));
  return { changed: true, id };
}

/** The waypoint handle nearest to p (tile units), within `max` tiles. */
export function nearestWaypoint(doc: EditorDocument, p: Point, max = 0.45): { routeId: string; index: number } | null {
  let best: { routeId: string; index: number } | null = null;
  let bestD = max;
  for (const r of doc.state.airRoutes) {
    for (let index = 0; index < r.points.length; index++) {
      const [x, y] = r.points[index]!;
      const d = Math.hypot(x - p[0], y - p[1]);
      if (d <= bestD) {
        bestD = d;
        best = { routeId: r.id, index };
      }
    }
  }
  return best;
}

export function moveWaypoint(doc: EditorDocument, routeId: string, index: number, p: Point): Outcome {
  const r = doc.state.airRoutes.find((x) => x.id === routeId);
  const old = r?.points[index];
  if (!r || !old || (old[0] === p[0] && old[1] === p[1])) return OK_NOCHANGE;
  doc.editList('airRoutes', () => void (r.points[index] = p));
  return { changed: true };
}

export function deleteWaypoint(doc: EditorDocument, routeId: string, index: number): Outcome {
  const r = doc.state.airRoutes.find((x) => x.id === routeId);
  if (!r?.points[index]) return OK_NOCHANGE;
  doc.editList('airRoutes', () => void r.points.splice(index, 1));
  return { changed: true };
}

// ---- selection edits ----------------------------------------------------------------------------

/** Moves an object if it fits at the new anchor (ignoring itself). */
export function moveObject(doc: EditorDocument, id: string, x: number, y: number): Outcome {
  const o = doc.state.objects.find((v) => v.id === id);
  if (!o || (o.x === x && o.y === y)) return OK_NOCHANGE;
  const check = checkPlacement(doc.state, doc.reg, o.kind, x, y, occupancy(doc.state, doc.reg, id));
  if (!check.ok) return { changed: false, refused: check.reason };
  doc.editList('objects', () => {
    o.x = x;
    o.y = y;
  });
  return { changed: true };
}

export function deleteById(doc: EditorDocument, list: 'objects' | 'spawns' | 'exits' | 'airRoutes', id: string): Outcome {
  const i = (doc.state[list] as { id: string }[]).findIndex((v) => v.id === id);
  if (i < 0) return OK_NOCHANGE;
  doc.editList(list, (l) => void (l as unknown[]).splice(i, 1));
  return { changed: true };
}

/** Out-directions of a path cell that lead to another path cell. */
export function junctionOuts(doc: EditorDocument, c: Cell): Direction[] {
  const out = doc.path.out(c);
  if (out === NO_PATH) return [];
  return DIRECTIONS.filter((d) => out & DIR_BITS[d]).filter((d) => {
    const s = DIRS.find((k) => k.name === d)!;
    return doc.path.isPath({ x: c.x + s.dx, y: c.y + s.dy });
  });
}

/** Edits (creating if needed) the branch policy of the junction at `c`. */
export function editJunctionPolicy(doc: EditorDocument, c: Cell, fn: (p: JunctionPolicy) => void) {
  doc.editList('junctions', (l) => {
    let j = l.find((v) => v.cell[0] === c.x && v.cell[1] === c.y);
    if (!j) {
      j = { cell: [c.x, c.y], policy: { type: 'alternate', branches: {} } };
      l.push(j);
    }
    fn(j.policy);
  });
}
