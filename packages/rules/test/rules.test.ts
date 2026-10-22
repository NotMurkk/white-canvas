import { describe, expect, it } from 'vitest';
import { EnemyRegistry, KindRegistry, TerrainTypes, ZoneTypes, emptyWaves, kindIndex, parseMap, zoneValue, type WavesDoc } from '@tdmm/map-format';
import { PathGrid, stepCells } from '@tdmm/pathing';
import { BuildBlock, checkPlacement, computeBuildable, docFromMapState, mapStateFromDoc, rangeMultiplierAt, validateMap, type Registries } from '../src/index.ts';

const reg: Registries = {
  terrainTypes: TerrainTypes.parse({
    grass: { name: 'Grass', drawOrder: 0, placement: ['land'], walkable: true, color: '#70c058' },
    water: { name: 'Water', drawOrder: 10, placement: ['water'], walkable: false, color: '#5890e0' },
    path_dirt: { name: 'Dirt', drawOrder: 20, placement: ['land'], walkable: true, pathStyle: true, color: '#d8b878' },
  }),
  kinds: KindRegistry.parse({
    tree: { name: 'Tree', category: 'tree', footprint: ['CC', 'BB'], anchor: [0, 1], color: '#3c8a3c' },
    rock: { name: 'Rock', category: 'rock', footprint: ['B'], anchor: [0, 0], allowedOn: ['land', 'water'], color: '#888888' },
    flowers: { name: 'Flowers', category: 'decor', footprint: ['.'], anchor: [0, 0], color: '#f07080' },
  }),
  enemies: EnemyRegistry.parse({
    grunt: { name: 'Grunt', hp: 10, speed: 2, color: '#e07030' },
    bird: { name: 'Bird', hp: 10, speed: 2, flying: true, color: '#60c0f0' },
  }),
  zones: ZoneTypes.parse({
    no_build: { name: 'No-build', blocksBuild: true, color: '#c070ff' },
    high_ground: { name: 'High', rangeMult: 1.25, color: '#f0a030' },
  }),
};

/** 8x5 meadow, water pond top-right, a path from the west edge to the east edge on row 2. */
function meadow() {
  const doc = parseMap({
    format: 'ptd-map',
    schemaVersion: 2,
    id: 'test',
    name: 'Test',
    grid: { width: 8, height: 5, tileSize: 32 },
    themes: { default: 'summer', supported: ['summer'] },
    terrain: { legend: { '.': 'grass', '~': 'water' }, rows: ['......~~', '......~~', '........', '........', '........'] },
    spawns: [{ id: 'w', cell: [0, 2] }],
    exits: [{ id: 'e', cell: [7, 2] }],
  });
  const s = mapStateFromDoc(doc);
  const g = new PathGrid(s.width, s.height, s.path);
  let prev = { x: 0, y: 2 };
  g.add(prev);
  for (const c of stepCells(prev, { x: 7, y: 2 })) {
    g.connect(prev, c);
    prev = c;
  }
  for (let x = 0; x < 8; x++) s.terrain.cells[2 * 8 + x] = kindIndex(s.terrain, 'path_dirt');
  return { doc, s };
}

const waves = (rounds: WavesDoc['rounds']): WavesDoc => ({ ...emptyWaves('test'), rounds });

describe('placement', () => {
  it('accepts a tree on grass and explains every refusal', () => {
    const { s } = meadow();
    expect(checkPlacement(s, reg, 'tree', 1, 4).ok).toBe(true);
    expect(checkPlacement(s, reg, 'tree', 1, 2).reason).toBe('Blocks the enemy path');
    expect(checkPlacement(s, reg, 'tree', 7, 4).reason).toBe('Off the map');
    expect(checkPlacement(s, reg, 'tree', 6, 1).reason).toMatch(/Can't stand on water/);
    expect(checkPlacement(s, reg, 'rock', 6, 1).ok).toBe(true);
    // canopy row may overhang the path; only the base row blocks it
    expect(checkPlacement(s, reg, 'tree', 1, 3).ok).toBe(true);
    s.objects.push({ id: 'o_a', kind: 'tree', x: 1, y: 4 });
    expect(checkPlacement(s, reg, 'rock', 2, 4).reason).toBe('Overlaps Tree');
    expect(checkPlacement(s, reg, 'flowers', 2, 4).ok).toBe(true);
  });

  it('computes buildable cells from terrain, path, objects and zones', () => {
    const { s } = meadow();
    s.objects.push({ id: 'o_a', kind: 'tree', x: 1, y: 4 });
    s.zones.cells[0] = zoneValue(s.zones, 'no_build');
    s.zones.cells[1] = zoneValue(s.zones, 'high_ground');
    expect(rangeMultiplierAt(s, reg, 1, 0)).toBe(1.25);
    expect(rangeMultiplierAt(s, reg, 2, 0)).toBe(1);
    const b = computeBuildable(s, reg);
    const at = (x: number, y: number) => b.block[y * 8 + x];
    expect(at(3, 2)).toBe(BuildBlock.Path);
    expect(at(1, 3)).toBe(BuildBlock.Object); // canopy
    expect(at(0, 0)).toBe(BuildBlock.Zone);
    expect(at(6, 0)).toBe(BuildBlock.None); // water: buildable for water towers
    expect(b.classes).toEqual(['land', 'water']);
    expect(b.classMask[6]).toBe(0b10);
    expect(b.count).toBe(40 - 8 - 4 - 1);
  });
});

describe('validateMap', () => {
  it('passes a clean map with waves', () => {
    const { s } = meadow();
    const v = validateMap(s, reg, waves([{ bonusCash: 0, groups: [{ id: 'g1', enemy: 'grunt', count: 5, startSec: 0, intervalSec: 1, spawn: 'w', route: null }] }]));
    expect(v.problems).toEqual([]);
    expect(v.compiled.routes.map((r) => r.id)).toEqual(['w']);
  });

  it('catches water under the path, objects on the path and canopy over it', () => {
    const { s } = meadow();
    s.terrain.cells[2 * 8 + 4] = kindIndex(s.terrain, 'water');
    s.objects.push({ id: 'o_rock', kind: 'rock', x: 5, y: 2 }, { id: 'o_tree', kind: 'tree', x: 1, y: 3 });
    const codes = validateMap(s, reg).problems.map((p) => p.code);
    expect(codes).toEqual(['object-blocks-path', 'path-on-unwalkable', 'canopy-hides-path', 'few-buildable'].filter((c) => codes.includes(c)));
    expect(codes).toContain('object-blocks-path');
    expect(codes).toContain('path-on-unwalkable');
    expect(codes).toContain('canopy-hides-path');
  });

  it('checks waves against spawns, routes and enemies', () => {
    const { s } = meadow();
    s.spawns.push({ id: 'sky', cell: [3, 0], kind: 'air' });
    const v = validateMap(
      s,
      reg,
      waves([
        {
          bonusCash: 0,
          groups: [
            { id: 'a', enemy: 'ghost', count: 1, startSec: 0, intervalSec: 1, spawn: 'w', route: null },
            { id: 'b', enemy: 'grunt', count: 1, startSec: 0, intervalSec: 1, spawn: 'nowhere', route: null },
            { id: 'c', enemy: 'grunt', count: 1, startSec: 0, intervalSec: 1, spawn: 'sky', route: null },
            { id: 'd', enemy: 'grunt', count: 1, startSec: 0, intervalSec: 1, spawn: 'w', route: 'w:E' },
            { id: 'e', enemy: 'bird', count: 1, startSec: 0, intervalSec: 1, spawn: 'sky', route: 'sky>e' },
          ],
        },
        { bonusCash: 0, groups: [] },
      ]),
    );
    expect(v.problems.map((p) => p.code).sort()).toEqual(['empty-round', 'ground-from-air', 'unknown-enemy', 'unknown-route', 'unknown-spawn']);
  });

  it('checks removable obstacles: prerequisites, cycles, and the overlay state', () => {
    const { s } = meadow();
    s.objects.push(
      { id: 'o_a', kind: 'rock', x: 1, y: 0, removal: { cost: 100, requires: ['o_b'] } },
      { id: 'o_b', kind: 'rock', x: 2, y: 0, removal: { cost: 100, requires: ['o_a'] } },
      { id: 'o_c', kind: 'rock', x: 3, y: 0, removal: { cost: 100, requires: ['o_ghost', 'o_d'] } },
      { id: 'o_d', kind: 'rock', x: 4, y: 0 },
    );
    const codes = validateMap(s, reg).problems.map((p) => p.code);
    expect(codes.filter((c) => c === 'removal-cycle')).toHaveLength(1);
    expect(codes.filter((c) => c === 'removal-requires')).toHaveLength(2);
    const b = computeBuildable(s, reg);
    expect(b.block[1]).toBe(BuildBlock.Removable);
    expect(b.block[4]).toBe(BuildBlock.Object);
    expect(computeBuildable(s, reg, undefined, new Set(['o_a'])).block[1]).toBe(BuildBlock.None);
  });

  it('round-trips state back into a map document', () => {
    const { doc, s } = meadow();
    s.objects.push({ id: 'o_a', kind: 'tree', x: 1, y: 4 });
    const out = docFromMapState(doc, s);
    expect(out.path!.rows[2]).toBe('22222220');
    expect(out.zones).toBeUndefined();
    expect(parseMap(out).objects).toHaveLength(1);
    expect(mapStateFromDoc(parseMap(out)).path).toEqual(s.path);
  });
});
