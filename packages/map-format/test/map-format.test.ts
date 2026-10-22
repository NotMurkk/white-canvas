import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MapFormatError, decodeTerrain, encodeTerrain, kindIndex, parseMap, parseRoundSpec, printMap, terrainAt } from '../src/index.ts';

const sample = {
  format: 'ptd-map',
  schemaVersion: 1,
  id: 'tiny',
  name: 'Tiny',
  grid: { width: 5, height: 4, tileSize: 32 },
  themes: { default: 'summer', supported: ['summer'] },
  terrain: { legend: { '.': 'grass', '~': 'water', '=': 'path_dirt' }, rows: ['.....', '==~==', '.~~~.', '.....'] },
  spawns: [{ id: 'spawn_w', cell: [0, 1], edge: 'W' }],
  exits: [{ id: 'exit_e', cell: [4, 1], edge: 'E' }],
};

describe('parseMap', () => {
  it('fills defaults and round-trips byte for byte', () => {
    const doc = parseMap(sample);
    expect(doc.seed).toBe(0);
    expect(doc.spawns[0]!.kind).toBe('ground');
    const printed = printMap(doc);
    expect(printMap(parseMap(printed))).toBe(printed);
    expect(printed.endsWith('\n')).toBe(true);
    expect(printed).toContain('"cell": [0, 1]');
  });

  it('reports every structural problem with a path', () => {
    const bad = { ...sample, terrain: { legend: { '.': 'grass' }, rows: ['.....', '..x..', '...'] } };
    try {
      parseMap(bad);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(MapFormatError);
      const issues = (e as MapFormatError).issues.join('\n');
      expect(issues).toMatch(/expected 4 rows/);
      expect(issues).toMatch(/uses "x"/);
      expect(issues).toMatch(/row 2 is 3 wide/);
    }
  });

  it('refuses files newer than the code', () => {
    expect(() => parseMap({ ...sample, schemaVersion: 99 })).toThrow(/update the tool/);
  });
});

describe('terrain grid', () => {
  it('decodes, edits and re-encodes keeping existing symbols', () => {
    const doc = parseMap(sample);
    const grid = decodeTerrain(doc);
    expect(terrainAt(grid, 2, 1)).toBe('water');
    expect(terrainAt(grid, -1, 0)).toBeUndefined();
    grid.cells[0] = kindIndex(grid, 'cliff');
    const encoded = encodeTerrain(grid, doc.terrain.legend);
    expect(encoded.legend['.']).toBe('grass');
    expect(encoded.legend['=']).toBe('path_dirt');
    const cliffSymbol = Object.entries(encoded.legend).find(([, k]) => k === 'cliff')![0];
    expect(encoded.rows[0]).toBe(`${cliffSymbol}....`);
  });
});

describe('migrations', () => {
  const dir = new URL('../../../fixtures/maps/v1/', import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith('.map.json'));

  it('has a v1 corpus', () => expect(files.length).toBeGreaterThan(0));

  for (const file of files) {
    it(`upgrades fixtures/maps/v1/${file} to the current version`, () => {
      const doc = parseMap(readFileSync(new URL(file, dir), 'utf8'));
      expect(doc.schemaVersion).toBe(2);
      expect(printMap(parseMap(printMap(doc)))).toBe(printMap(doc));
    });
  }

  it('turns the v1 no-build grid into a no_build zone', () => {
    const doc = parseMap(readFileSync(new URL('phase0-meadow.map.json', dir), 'utf8'));
    expect(doc.zones?.legend).toEqual({ x: 'no_build' });
    expect(doc.zones?.rows[0]!.startsWith('xx.')).toBe(true);
    expect('noBuild' in doc).toBe(false);
  });
});

describe('round filters', () => {
  const test = (spec: string) => {
    const r = parseRoundSpec(spec);
    if (!r.ok) throw new Error(r.error);
    return [1, 2, 3, 4, 5, 6, 10, 11].filter(r.test);
  };
  it('parses all, odd, even, single rounds, ranges and open ranges', () => {
    expect(test('all')).toEqual([1, 2, 3, 4, 5, 6, 10, 11]);
    expect(test('odd')).toEqual([1, 3, 5, 11]);
    expect(test('even')).toEqual([2, 4, 6, 10]);
    expect(test('1-3, 10+')).toEqual([1, 2, 3, 10, 11]);
    expect(test('5')).toEqual([5]);
  });
  it('rejects nonsense with a hint', () => {
    expect(parseRoundSpec('sometimes')).toMatchObject({ ok: false });
    expect(parseRoundSpec('5-2')).toMatchObject({ ok: false });
    expect(parseRoundSpec('')).toMatchObject({ ok: false });
  });
});
