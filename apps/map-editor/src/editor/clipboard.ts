// Marquee copy and paste. A clip is a rectangle of map layers (terrain, path, objects, zones) in
// plain ids, so it pastes into any map that shares the content files, and lives in localStorage so
// it survives reloads and crosses tabs. Pasting is planned first, without touching the document:
// the plan drives the green/red ghost, and only a clean plan is applied, as one undo step.
import { DIRS } from '@tdmm/pathing';
import { NO_PATH, kindIndex, newId, terrainAt, zoneAt, type ObjectInstance } from '@tdmm/map-format';
import { checkPlacement, footprintCells, type MapState, type Registries } from '@tdmm/rules';
import type { EditorDocument } from './document.ts';

export type ClipLayer = 'terrain' | 'path' | 'objects' | 'zones';
export const CLIP_LAYERS: ClipLayer[] = ['terrain', 'path', 'objects', 'zones'];
export type LayerFilter = Record<ClipLayer, boolean>;

type Cell = { x: number; y: number };

/** Inclusive cell rectangle, x0 <= x1 and y0 <= y1. */
export interface Region {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface Clip {
  format: 'tdmm-clip';
  version: 1;
  w: number;
  h: number;
  layers: ClipLayer[];
  /** Row-major terrain ids. */
  terrain?: string[];
  /** Row-major path out-masks (NO_PATH = none). Links leaving the clip are dropped. */
  path?: number[];
  /** Row-major zone ids (null = none). */
  zones?: (string | null)[];
  /** Objects whose anchor is inside the clip, anchored relative to its top-left. */
  objects?: { kind: string; dx: number; dy: number; removalCost?: number }[];
}

export function normRegion(a: Cell, b: Cell): Region {
  return { x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) };
}

/** The region cut down to the map; null if nothing is left. */
export function clampRegion(r: Region, width: number, height: number): Region | null {
  const c = { x0: Math.max(0, r.x0), y0: Math.max(0, r.y0), x1: Math.min(width - 1, r.x1), y1: Math.min(height - 1, r.y1) };
  return c.x0 > c.x1 || c.y0 > c.y1 ? null : c;
}

const inRegion = (r: Region, x: number, y: number) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;

/** Objects a region selects: those whose anchor (the cell they stand on) is inside it. */
export function objectsIn(s: MapState, r: Region) {
  return s.objects.filter((o) => inRegion(r, o.x, o.y));
}

export function regionCounts(s: MapState, r: Region) {
  let path = 0;
  let zones = 0;
  for (let y = r.y0; y <= r.y1; y++) {
    for (let x = r.x0; x <= r.x1; x++) {
      const i = y * s.width + x;
      if (s.path[i] !== NO_PATH) path++;
      if (s.zones.cells[i]) zones++;
    }
  }
  return { cells: (r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1), path, zones, objects: objectsIn(s, r).length };
}

export function copyRegion(s: MapState, region: Region, filter: LayerFilter): Clip | null {
  const r = clampRegion(region, s.width, s.height);
  if (!r) return null;
  const w = r.x1 - r.x0 + 1;
  const h = r.y1 - r.y0 + 1;
  const layers = CLIP_LAYERS.filter((l) => filter[l]);
  const clip: Clip = { format: 'tdmm-clip', version: 1, w, h, layers };
  const each = <T>(fn: (x: number, y: number, i: number) => T): T[] => {
    const out: T[] = [];
    for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) out.push(fn(x, y, y * s.width + x));
    return out;
  };
  if (filter.terrain) clip.terrain = each((x, y) => terrainAt(s.terrain, x, y)!);
  if (filter.path) {
    clip.path = each((x, y, i) => {
      const out = s.path[i]!;
      if (out === NO_PATH) return NO_PATH;
      // keep only links to cells inside the clip, so a pasted piece never points at whatever lands next to it
      return DIRS.reduce((m, d) => (out & d.bit && inRegion(r, x + d.dx, y + d.dy) ? m | d.bit : m), 0);
    });
  }
  if (filter.zones) clip.zones = each((_x, _y, i) => zoneAt(s.zones, i) ?? null);
  if (filter.objects) clip.objects = objectsIn(s, r).map((o) => ({ kind: o.kind, dx: o.x - r.x0, dy: o.y - r.y0, ...(o.removal ? { removalCost: o.removal.cost } : {}) }));
  return clip;
}

export interface PastePlan {
  ok: boolean;
  reason?: string;
  /** Cells that make the paste fail (drawn red). */
  bad: Cell[];
  terrain: { x: number; y: number; kind: string }[];
  path: { index: number; mask: number }[];
  zones: { x: number; y: number; kind: string }[];
  objects: { kind: string; x: number; y: number; removalCost?: number }[];
}

/**
 * Plans pasting `clip` with its top-left at `at`. Pasting merges: terrain is replaced, but existing
 * path cells keep their style unless the clip brings a path cell there; path, zones and objects are
 * added on top. Terrain and zones falling off the map are trimmed; path and objects can't be.
 */
export function planPaste(s: MapState, reg: Registries, clip: Clip, at: Cell): PastePlan {
  const plan: PastePlan = { ok: true, bad: [], terrain: [], path: [], zones: [], objects: [] };
  const fail = (c: Cell, reason: string) => {
    plan.bad.push(c);
    plan.reason ??= reason;
  };
  const terrain = { ...s.terrain, kinds: [...s.terrain.kinds], cells: Uint8Array.from(s.terrain.cells) };
  const path = Uint8Array.from(s.path);
  const changedTerrain: number[] = [];
  const newPath: number[] = [];

  for (let cy = 0; cy < clip.h; cy++) {
    for (let cx = 0; cx < clip.w; cx++) {
      const k = cy * clip.w + cx;
      const x = at.x + cx;
      const y = at.y + cy;
      const clipPath = clip.path?.[k] ?? NO_PATH;
      const inside = x >= 0 && y >= 0 && x < s.width && y < s.height;
      if (!inside) {
        if (clipPath !== NO_PATH) fail({ x, y }, 'Part of the path would be off the map.');
        continue;
      }
      const i = y * s.width + x;
      const kind = clip.terrain?.[k];
      if (kind && (clipPath !== NO_PATH || path[i] === NO_PATH) && terrainAt(terrain, x, y) !== kind) {
        if (!reg.terrainTypes[kind]) fail({ x, y }, `Terrain "${kind}" isn't in content/terrain-types.json.`);
        else {
          terrain.cells[i] = kindIndex(terrain, kind);
          plan.terrain.push({ x, y, kind });
          changedTerrain.push(i);
        }
      }
      if (clipPath !== NO_PATH) {
        if (path[i] !== clipPath) plan.path.push({ index: i, mask: clipPath });
        path[i] = clipPath;
        newPath.push(i);
      }
      const zone = clip.zones?.[k];
      if (zone && zoneAt(s.zones, i) !== zone) {
        if (!reg.zones[zone]) fail({ x, y }, `Zone "${zone}" isn't in content/zones.json.`);
        else plan.zones.push({ x, y, kind: zone });
      }
    }
  }

  // Base (B) cells of the objects already on the map, by cell.
  const baseOwner = new Map<number, ObjectInstance>();
  for (const o of s.objects) {
    const kind = reg.kinds[o.kind];
    if (!kind) continue;
    for (const c of footprintCells(kind, o.x, o.y)) if (c.role === 'B' && c.x >= 0 && c.y >= 0 && c.x < s.width && c.y < s.height) baseOwner.set(c.y * s.width + c.x, o);
  }
  for (const i of newPath) {
    const c = { x: i % s.width, y: Math.floor(i / s.width) };
    const t = terrainAt(terrain, c.x, c.y)!;
    const o = baseOwner.get(i);
    if (!reg.terrainTypes[t]?.walkable) fail(c, `Enemies can't walk on ${reg.terrainTypes[t]?.name.toLowerCase() ?? t}.`);
    else if (o) fail(c, `The path would run under ${reg.kinds[o.kind]?.name ?? 'an object'}.`);
  }
  for (const i of changedTerrain) {
    const o = baseOwner.get(i);
    const kind = o && reg.kinds[o.kind];
    if (!o || !kind) continue;
    const t = terrain.kinds[terrain.cells[i]!]!;
    if (!(reg.terrainTypes[t]?.placement ?? []).some((p) => kind.allowedOn.includes(p))) fail({ x: i % s.width, y: Math.floor(i / s.width) }, `${kind.name} can't stand on ${reg.terrainTypes[t]?.name.toLowerCase() ?? t}.`);
  }

  // Pasted objects go one by one onto the pasted ground, each checked against everything before it.
  const after: MapState = { ...s, terrain, path, objects: [...s.objects] };
  const taken = s.objects.map((o) => o.id);
  for (const p of clip.objects ?? []) {
    const x = at.x + p.dx;
    const y = at.y + p.dy;
    const check = checkPlacement(after, reg, p.kind, x, y);
    if (!check.ok) {
      for (const c of check.cells) if (!c.ok) fail(c, `${reg.kinds[p.kind]?.name ?? p.kind}: ${check.reason}.`);
      continue;
    }
    const id = newId('o', taken);
    taken.push(id);
    after.objects.push({ id, kind: p.kind, x, y });
    plan.objects.push({ kind: p.kind, x, y, ...(p.removalCost !== undefined ? { removalCost: p.removalCost } : {}) });
  }
  plan.ok = plan.bad.length === 0;
  return plan;
}

/** Applies a clean plan to the document (call inside a transaction). */
export function applyPaste(doc: EditorDocument, plan: PastePlan) {
  for (const t of plan.terrain) doc.setTerrain(t.x, t.y, t.kind);
  if (plan.path.length) {
    doc.editPath((g) =>
      plan.path.map(({ index, mask }) => {
        const before = g.cells[index]!;
        g.cells[index] = mask;
        return { index, before, after: mask };
      }),
    );
  }
  for (const z of plan.zones) doc.setZone(z.x, z.y, z.kind);
  if (plan.objects.length) {
    doc.editList('objects', (l) => {
      for (const p of plan.objects) {
        const o: ObjectInstance = { id: newId('o', l.map((v) => v.id)), kind: p.kind, x: p.x, y: p.y };
        if (p.removalCost !== undefined) o.removal = { cost: p.removalCost, requires: [] };
        l.push(o);
      }
    });
  }
}

/** Clears the filtered layers inside a region: objects, path (back to base terrain), zones, terrain. */
export function eraseRegion(doc: EditorDocument, region: Region, filter: LayerFilter, base: string): boolean {
  const r = clampRegion(region, doc.width, doc.height);
  if (!r) return false;
  let changed = false;
  if (filter.objects) {
    const ids = new Set(objectsIn(doc.state, r).map((o) => o.id));
    if (ids.size) {
      doc.editList('objects', (l) => {
        for (let i = l.length - 1; i >= 0; i--) if (ids.has(l[i]!.id)) l.splice(i, 1);
        // nothing may require an object that is gone
        for (const o of l) if (o.removal) o.removal.requires = o.removal.requires.filter((id) => !ids.has(id));
      });
      changed = true;
    }
  }
  for (let y = r.y0; y <= r.y1; y++) {
    for (let x = r.x0; x <= r.x1; x++) {
      if (filter.path && doc.path.isPath({ x, y })) {
        changed = doc.editPath((g) => g.erase({ x, y })) || changed;
        changed = doc.setTerrain(x, y, base) || changed;
      }
      if (filter.zones) changed = doc.setZone(x, y, null) || changed;
      if (filter.terrain && !doc.path.isPath({ x, y })) changed = doc.setTerrain(x, y, base) || changed;
    }
  }
  return changed;
}

const STORAGE_KEY = 'tdmm:clipboard';

export function saveClip(clip: Clip) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clip));
  } catch {
    // the in-memory copy still works in this tab
  }
}

/** The clip another tab (or an earlier session) copied, if any. */
export function loadClip(): Clip | null {
  try {
    const v = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Clip | null;
    return v && v.format === 'tdmm-clip' && v.version === 1 && v.w > 0 && v.h > 0 ? v : null;
  } catch {
    return null;
  }
}
