import { describe, expect, it } from 'vitest';
import { DIR_E, EnemyRegistry, KindRegistry, NO_PATH, TerrainTypes, ZoneTypes, emptyWaves, parseMap, terrainAt, type MapDoc } from '@tdmm/map-format';
import { stepCells } from '@tdmm/pathing';
import type { Registries } from '@tdmm/rules';
import { applyPaste, copyRegion, eraseRegion, planPaste, regionCounts, type LayerFilter } from '../src/editor/clipboard.ts';
import { EditorDocument } from '../src/editor/document.ts';

const reg: Registries = {
  terrainTypes: TerrainTypes.parse({
    grass: { name: 'Grass', drawOrder: 0, placement: ['land'], walkable: true, color: '#70c058' },
    water: { name: 'Water', drawOrder: 10, placement: ['water'], walkable: false, color: '#5890e0' },
    path_dirt: { name: 'Dirt', drawOrder: 20, placement: ['land'], walkable: true, pathStyle: true, color: '#d8b878' },
  }),
  kinds: KindRegistry.parse({
    tree: { name: 'Tree', category: 'tree', footprint: ['CC', 'BB'], anchor: [0, 1], color: '#3c8a3c' },
    rock: { name: 'Rock', category: 'rock', footprint: ['B'], anchor: [0, 0], color: '#888888' },
  }),
  enemies: EnemyRegistry.parse({}),
  zones: ZoneTypes.parse({ no_build: { name: 'No-build', blocksBuild: true, color: '#c070ff' } }),
};

const ALL: LayerFilter = { terrain: true, path: true, objects: true, zones: true };

/** 12x7 meadow: pond top-right, path along row 2 from the west edge to the east edge, a tree and a rock. */
function meadow(): EditorDocument {
  const map: MapDoc = parseMap({
    format: 'ptd-map',
    schemaVersion: 2,
    id: 'clip',
    name: 'Clip',
    grid: { width: 12, height: 7, tileSize: 32 },
    themes: { default: 'summer', supported: ['summer'] },
    terrain: { legend: { '.': 'grass', '~': 'water' }, rows: ['..........~~', '..........~~', '............', '............', '............', '............', '............'] },
    spawns: [{ id: 'w', cell: [0, 2] }],
    exits: [{ id: 'e', cell: [11, 2] }],
    objects: [
      { id: 'o_tree', kind: 'tree', x: 2, y: 5 },
      { id: 'o_rock', kind: 'rock', x: 4, y: 4, removal: { cost: 50, requires: [] } },
    ],
  });
  const doc = new EditorDocument(map, emptyWaves('clip'), reg);
  doc.transact('path', () => {
    let prev = { x: 0, y: 2 };
    doc.editPath((g) => g.add(prev));
    doc.setTerrain(0, 2, 'path_dirt');
    for (const c of stepCells(prev, { x: 11, y: 2 })) {
      doc.editPath((g) => g.connect(prev, c));
      doc.setTerrain(c.x, c.y, 'path_dirt');
      prev = c;
    }
  });
  return doc;
}

describe('copy', () => {
  it('copies the filtered layers of a region and drops path links that leave it', () => {
    const doc = meadow();
    const clip = copyRegion(doc.state, { x0: 1, y0: 1, x1: 4, y1: 5 }, ALL)!;
    expect([clip.w, clip.h]).toEqual([4, 5]);
    expect(clip.layers).toEqual(['terrain', 'path', 'objects', 'zones']);
    // row 2 of the map is clip row 1: links east inside the clip, the last cell's link leaves it
    expect(clip.path!.slice(4, 8)).toEqual([DIR_E, DIR_E, DIR_E, 0]);
    expect(clip.path![0]).toBe(NO_PATH);
    expect(clip.terrain![4]).toBe('path_dirt');
    expect(clip.objects).toEqual([
      { kind: 'tree', dx: 1, dy: 4 },
      { kind: 'rock', dx: 3, dy: 3, removalCost: 50 },
    ]);
    expect(regionCounts(doc.state, { x0: 1, y0: 1, x1: 4, y1: 5 })).toEqual({ cells: 20, path: 4, zones: 0, objects: 2 });
    const terrainOnly = copyRegion(doc.state, { x0: -3, y0: 0, x1: 1, y1: 0 }, { terrain: true, path: false, objects: false, zones: false })!;
    expect([terrainOnly.w, terrainOnly.h, terrainOnly.path, terrainOnly.objects]).toEqual([2, 1, undefined, undefined]);
  });
});

describe('paste', () => {
  it('plans a clean paste on open ground and applies it as one undo step', () => {
    const doc = meadow();
    const clip = copyRegion(doc.state, { x0: 1, y0: 4, x1: 4, y1: 5 }, ALL)!; // the tree's base row and the rock
    const plan = planPaste(doc.state, reg, clip, { x: 6, y: 4 });
    expect(plan.ok).toBe(true);
    expect(plan.objects.map((o) => [o.kind, o.x, o.y])).toEqual([
      ['tree', 7, 5],
      ['rock', 9, 4],
    ]);
    expect(doc.transact('paste', () => applyPaste(doc, plan))).toBe(true);
    expect(doc.state.objects).toHaveLength(4);
    expect(doc.state.objects.find((o) => o.x === 9 && o.y === 4)?.removal).toEqual({ cost: 50, requires: [] });
    doc.undo();
    expect(doc.state.objects).toHaveLength(2);
  });

  it('refuses overlaps, path over water or under objects, and objects on bad ground, with a reason', () => {
    const doc = meadow();
    const objects = copyRegion(doc.state, { x0: 2, y0: 4, x1: 4, y1: 5 }, ALL)!;
    const overlap = planPaste(doc.state, reg, objects, { x: 2, y: 4 });
    expect(overlap.ok).toBe(false);
    expect(overlap.reason).toMatch(/^Tree: Overlaps Tree/);

    const pathPiece = copyRegion(doc.state, { x0: 3, y0: 2, x1: 5, y1: 2 }, { terrain: false, path: true, objects: false, zones: false })!;
    expect(planPaste(doc.state, reg, pathPiece, { x: 9, y: 0 }).reason).toBe("Enemies can't walk on water.");
    expect(planPaste(doc.state, reg, pathPiece, { x: 1, y: 5 }).reason).toBe('The path would run under Tree.');
    expect(planPaste(doc.state, reg, pathPiece, { x: 10, y: 5 }).reason).toBe('Part of the path would be off the map.');

    const water = copyRegion(doc.state, { x0: 10, y0: 0, x1: 11, y1: 1 }, { terrain: true, path: false, objects: false, zones: false })!;
    expect(planPaste(doc.state, reg, water, { x: 2, y: 4 }).reason).toBe("Tree can't stand on water.");
  });

  it('keeps existing path cells and their style when the clip has no path there', () => {
    const doc = meadow();
    const water = copyRegion(doc.state, { x0: 10, y0: 0, x1: 11, y1: 1 }, ALL)!;
    const plan = planPaste(doc.state, reg, water, { x: 6, y: 1 });
    expect(plan.ok).toBe(true);
    expect(plan.terrain.map((t) => `${t.x},${t.y}`)).toEqual(['6,1', '7,1']); // row 2 is path: untouched
    doc.transact('paste', () => applyPaste(doc, plan));
    expect(terrainAt(doc.state.terrain, 6, 2)).toBe('path_dirt');
    expect(terrainAt(doc.state.terrain, 6, 1)).toBe('water');
  });
});

describe('erase region', () => {
  it('removes objects, path and zones in the region and returns path cells to base terrain', () => {
    const doc = meadow();
    doc.transact('zone', () => doc.setZone(3, 3, 'no_build'));
    doc.transact('erase', () => eraseRegion(doc, { x0: 2, y0: 2, x1: 4, y1: 5 }, ALL, 'grass'));
    expect(doc.state.objects).toEqual([]);
    expect(doc.path.isPath({ x: 3, y: 2 })).toBe(false);
    expect(doc.path.out({ x: 1, y: 2 })).toBe(0); // the link into the erased cell is cut
    expect(terrainAt(doc.state.terrain, 3, 2)).toBe('grass');
    expect(doc.zoneAt(3, 3)).toBeUndefined();
  });
});
