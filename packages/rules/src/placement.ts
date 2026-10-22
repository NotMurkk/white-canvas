// Stamp footprints, object placement checks and the computed buildable-cell map.
import { NO_PATH, terrainAt, type FootprintRole, type Kind } from '@tdmm/map-format';
import type { MapState, Registries } from './state.ts';

export interface FootprintCell {
  x: number;
  y: number;
  role: FootprintRole;
}

/** Map cells covered by a kind placed with its anchor at (x, y). */
export function footprintCells(kind: Kind, x: number, y: number): FootprintCell[] {
  const cells: FootprintCell[] = [];
  const [ax, ay] = kind.anchor;
  kind.footprint.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) cells.push({ x: x + c - ax, y: y + r - ay, role: row[c] as FootprintRole });
  });
  return cells;
}

/** The object drawn at a cell (any part of its art), front-most (lowest baseline) first. */
export function objectAtCell(s: MapState, reg: Registries, x: number, y: number, skip: ReadonlySet<string> = new Set()) {
  let best: { o: MapState['objects'][number]; baseline: number } | null = null;
  for (const o of s.objects) {
    const kind = reg.kinds[o.kind];
    if (!kind || skip.has(o.id) || !footprintCells(kind, o.x, o.y).some((f) => f.x === x && f.y === y)) continue;
    const baseline = o.y - kind.anchor[1] + kind.footprint.length;
    if (!best || baseline >= best.baseline) best = { o, baseline };
  }
  return best?.o ?? null;
}

/** Top-left cell and size (in tiles) of a kind placed at (x, y). */
export function footprintBounds(kind: Kind, x: number, y: number) {
  return { x: x - kind.anchor[0], y: y - kind.anchor[1], w: kind.footprint[0]!.length, h: kind.footprint.length };
}

/** For each cell, the index (+1) of the object whose C/B footprint covers it; 0 = free. */
export function occupancy(s: MapState, reg: Registries, ignoreId?: string): Int32Array {
  const occ = new Int32Array(s.width * s.height);
  s.objects.forEach((o, i) => {
    if (o.id === ignoreId) return;
    const kind = reg.kinds[o.kind];
    if (!kind) return;
    for (const c of footprintCells(kind, o.x, o.y)) {
      if (c.role === '.' || c.x < 0 || c.y < 0 || c.x >= s.width || c.y >= s.height) continue;
      occ[c.y * s.width + c.x] = i + 1;
    }
  });
  return occ;
}

export interface PlacementCheck {
  ok: boolean;
  cells: (FootprintCell & { ok: boolean; reason?: string | undefined })[];
  /** First refusal reason, for the status bar / toast. */
  reason?: string | undefined;
}

/** Can `kindId` go at (x, y)? Per-cell results drive the green/red ghost. */
export function checkPlacement(s: MapState, reg: Registries, kindId: string, x: number, y: number, occ = occupancy(s, reg)): PlacementCheck {
  const kind = reg.kinds[kindId];
  if (!kind) return { ok: false, cells: [], reason: `Unknown kind "${kindId}"` };
  let reason: string | undefined;
  const cells = footprintCells(kind, x, y).map((c) => {
    const inside = c.x >= 0 && c.y >= 0 && c.x < s.width && c.y < s.height;
    let why: string | undefined;
    if (c.role === '.') {
      // visual-only cells never block
    } else if (!inside) {
      if (c.role === 'B') why = 'Off the map';
    } else {
      const i = c.y * s.width + c.x;
      const other = occ[i]!;
      if (other) why = `Overlaps ${reg.kinds[s.objects[other - 1]!.kind]?.name ?? 'an object'}`;
      else if (c.role === 'B' && s.path[i] !== NO_PATH) why = 'Blocks the enemy path';
      else if (c.role === 'B' && [...s.spawns, ...s.exits].some((m) => m.cell[0] === c.x && m.cell[1] === c.y)) why = 'On a spawn or exit';
      else if (c.role === 'B') {
        const t = terrainAt(s.terrain, c.x, c.y);
        const classes = (t && reg.terrainTypes[t]?.placement) || [];
        if (!classes.some((p) => kind.allowedOn.includes(p))) why = `Can't stand on ${reg.terrainTypes[t ?? '']?.name.toLowerCase() ?? 'that'}`;
      }
    }
    reason ??= why;
    return { ...c, ok: !why, reason: why };
  });
  return { ok: !reason, cells, reason };
}

/** Why a cell can't take a tower (0 = it can). */
export const BuildBlock = { None: 0, Path: 1, Object: 2, Zone: 3, Terrain: 4, Removable: 5 } as const;

export const BUILD_BLOCK_REASON: Record<number, string> = {
  [BuildBlock.Path]: 'enemy path',
  [BuildBlock.Object]: 'blocked by an object',
  [BuildBlock.Zone]: 'no-build zone',
  [BuildBlock.Terrain]: 'terrain allows no towers',
  [BuildBlock.Removable]: 'obstacle (buildable once removed in-game)',
};

export interface BuildableMap {
  /** BuildBlock code per cell. */
  block: Uint8Array;
  /** Placement classes allowed per cell (index into `classes`), as a bitmask. */
  classMask: Uint8Array;
  classes: string[];
  /** Count of cells that take at least one tower class. */
  count: number;
}

/**
 * Buildability is computed, never painted: terrain placement classes, minus the enemy path,
 * object footprints (B and C cells) and blocking zones. Cells under removable obstacles are
 * reported separately: blocked now, buildable once the player pays to clear them.
 * `removed` lists obstacle ids already cleared (the game passes these; the editor passes none).
 */
export function computeBuildable(s: MapState, reg: Registries, occ = occupancy(s, reg), removed: ReadonlySet<string> = new Set()): BuildableMap {
  const classes = [...new Set(Object.values(reg.terrainTypes).flatMap((t) => t.placement))].sort();
  const n = s.width * s.height;
  const block = new Uint8Array(n);
  const classMask = new Uint8Array(n);
  const maskForKind = s.terrain.kinds.map((k) =>
    (reg.terrainTypes[k]?.placement ?? []).reduce((m, p) => m | (1 << classes.indexOf(p)), 0),
  );
  const zoneBlocks = s.zones.kinds.map((k) => reg.zones[k]?.blocksBuild ?? false);
  let count = 0;
  for (let i = 0; i < n; i++) {
    const mask = maskForKind[s.terrain.cells[i]!] ?? 0;
    const zone = s.zones.cells[i]!;
    const o = occ[i] ? s.objects[occ[i]! - 1] : undefined;
    let b: number = BuildBlock.None;
    if (s.path[i] !== NO_PATH) b = BuildBlock.Path;
    else if (o && !removed.has(o.id)) b = o.removal ? BuildBlock.Removable : BuildBlock.Object;
    else if (zone && zoneBlocks[zone - 1]) b = BuildBlock.Zone;
    else if (!mask) b = BuildBlock.Terrain;
    block[i] = b;
    classMask[i] = b ? 0 : mask;
    if (!b) count++;
  }
  return { block, classMask, classes, count };
}

/** Tower range multiplier at a cell: terrain × zone (1 = normal). */
export function rangeMultiplierAt(s: MapState, reg: Registries, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= s.width || y >= s.height) return 1;
  const i = y * s.width + x;
  const terrain = s.terrain.kinds[s.terrain.cells[i]!];
  const zone = s.zones.cells[i]! ? s.zones.kinds[s.zones.cells[i]! - 1] : undefined;
  return (reg.terrainTypes[terrain ?? '']?.rangeMult ?? 1) * (zone ? (reg.zones[zone]?.rangeMult ?? 1) : 1);
}
