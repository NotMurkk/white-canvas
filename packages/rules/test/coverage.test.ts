import { describe, expect, it } from 'vitest';
import { EnemyRegistry, KindRegistry, TerrainTypes, ZoneTypes, kindIndex, parseMap, zoneValue } from '@tdmm/map-format';
import { PathGrid, stepCells } from '@tdmm/pathing';
import { computeBuildable, coverageMap, lengthInCircle, mapStateFromDoc, routeShares, towerCoverage, validateMap, type Registries } from '../src/index.ts';

const reg: Registries = {
  terrainTypes: TerrainTypes.parse({
    grass: { name: 'Grass', drawOrder: 0, placement: ['land'], walkable: true, color: '#70c058' },
    path_dirt: { name: 'Dirt', drawOrder: 20, placement: ['land'], walkable: true, pathStyle: true, color: '#d8b878' },
  }),
  kinds: KindRegistry.parse({}),
  enemies: EnemyRegistry.parse({}),
  zones: ZoneTypes.parse({ high_ground: { name: 'High', rangeMult: 1.25, color: '#f0a030' } }),
};

/** 12x5 meadow with a straight path along row 2, west edge to east edge. */
function straight() {
  const doc = parseMap({
    format: 'ptd-map',
    schemaVersion: 2,
    id: 'cov',
    name: 'Coverage',
    grid: { width: 12, height: 5, tileSize: 32 },
    themes: { default: 'summer', supported: ['summer'] },
    terrain: { legend: { '.': 'grass' }, rows: Array.from({ length: 5 }, () => '.'.repeat(12)) },
    spawns: [{ id: 'w', cell: [0, 2] }],
    exits: [{ id: 'e', cell: [11, 2] }],
  });
  const s = mapStateFromDoc(doc);
  const g = new PathGrid(s.width, s.height, s.path);
  let prev = { x: 0, y: 2 };
  g.add(prev);
  for (const c of stepCells(prev, { x: 11, y: 2 })) {
    g.connect(prev, c);
    prev = c;
  }
  for (let x = 0; x < 12; x++) s.terrain.cells[2 * 12 + x] = kindIndex(s.terrain, 'path_dirt');
  const routes = validateMap(s, reg).compiled.routes;
  return { s, routes };
}

describe('lengthInCircle', () => {
  it('measures the chord of a line through, beside and ending in a circle', () => {
    expect(lengthInCircle([[0, 0], [10, 0]], 5, 0, 2)).toBeCloseTo(4);
    expect(lengthInCircle([[0, 0], [10, 0]], 5, 2, 2)).toBe(0); // tangent
    expect(lengthInCircle([[0, 0], [10, 0]], 0, 0, 2)).toBeCloseTo(2); // starts inside
    expect(lengthInCircle([[0, 0], [3, 0], [3, 3]], 3, 0, 1)).toBeCloseTo(2); // around a corner
    expect(lengthInCircle([[1, 1], [1, 1]], 1, 1, 5)).toBe(0);
  });
});

describe('routeShares', () => {
  it('weights routes by simulated enemy counts, or equally before any', () => {
    const routes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }] as unknown as Parameters<typeof routeShares>[0];
    expect(routeShares(routes, [{ a: 3, b: 1 }, { a: 1 }])).toEqual({ a: 0.8, b: 0.2, c: 0 });
    expect(routeShares(routes, null)).toEqual({ a: 1 / 3, b: 1 / 3, c: 1 / 3 });
  });
});

describe('tower coverage', () => {
  it('measures path in range from the cell centre, with the cell range multiplier', () => {
    const { s, routes } = straight();
    const shares = routeShares(routes);
    // tower centre (5.5, 0.5), path along y = 2.5: distance 2
    expect(towerCoverage(s, reg, routes, shares, 5, 0, 2).expected).toBeCloseTo(0);
    expect(towerCoverage(s, reg, routes, shares, 5, 0, 3).expected).toBeCloseTo(2 * Math.sqrt(5));
    s.zones.cells[5] = zoneValue(s.zones, 'high_ground');
    const high = towerCoverage(s, reg, routes, shares, 5, 0, 3);
    expect(high.range).toBeCloseTo(3.75);
    expect(high.expected).toBeCloseTo(2 * Math.sqrt(3.75 ** 2 - 4));
    expect(high.byRoute.map((r) => r.id)).toEqual(['w']);
  });

  it('maps coverage on buildable cells only, highest beside the path', () => {
    const { s, routes } = straight();
    const map = coverageMap(s, reg, routes, routeShares(routes), 2, computeBuildable(s, reg));
    const at = (x: number, y: number) => map[y * 12 + x]!;
    expect(at(5, 2)).toBe(0); // the path itself takes no tower
    expect(at(5, 1)).toBeGreaterThan(at(5, 0));
    expect(at(5, 1)).toBeCloseTo(2 * Math.sqrt(3));
    expect(at(5, 1)).toBeCloseTo(at(5, 3));
  });
});
