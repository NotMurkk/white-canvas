// The repo gate: every committed map must be canonical, error-free, and carry a clear check that
// still matches its gameplay. The editor saves drafts freely; this is what stops an unplayable or
// un-cleared map being merged. Lives in rules' tests but drives the sim package's clear check.
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AtlasManifest, EnemyRegistry, KindRegistry, TerrainTypes, ThemeDoc, ZoneTypes, parseMap, parseWaves, printMap, printWaves } from '@tdmm/map-format';
import { runClearCheck } from '@tdmm/sim';
import { mapStateFromDoc, type Registries } from '../src/index.ts';

const root = new URL('../../../', import.meta.url);
const json = (path: string) => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
const reg: Registries = {
  terrainTypes: TerrainTypes.parse(json('content/terrain-types.json')),
  kinds: KindRegistry.parse(json('content/kinds.json')),
  enemies: EnemyRegistry.parse(json('content/enemies.json')),
  zones: ZoneTypes.parse(json('content/zones.json')),
};
const maps = readdirSync(new URL('maps/', root)).filter((f) => f.endsWith('.map.json'));

describe('committed maps', () => {
  it('there is at least one', () => expect(maps.length).toBeGreaterThan(0));

  for (const file of maps) {
    it(`${file} is canonical, error-free and passes a current clear check`, () => {
      const text = readFileSync(new URL(`maps/${file}`, root), 'utf8');
      const doc = parseMap(text);
      expect(printMap(doc), 'not canonical or an old schema version: run "npm run clearcheck"').toBe(text);
      expect(`${doc.id}.map.json`).toBe(file);
      const wavesText = readFileSync(new URL(`maps/${doc.id}.waves.json`, root), 'utf8');
      const waves = parseWaves(wavesText);
      expect(printWaves(waves)).toBe(wavesText);
      expect(waves.mapId).toBe(doc.id);

      const result = runClearCheck(mapStateFromDoc(doc), reg, waves);
      expect(result.problems.map((p) => `${p.code}: ${p.message}`)).toEqual([]);
      expect(waves.clearCheck, 'no clear check: save the map in the editor or run "npm run clearcheck"').toEqual(result.record);
    });

    it(`${file} ships only themes that have art for everything it uses`, () => {
      const doc = parseMap(readFileSync(new URL(`maps/${file}`, root), 'utf8'));
      const usedTerrain = [...new Set(Object.values(doc.terrain.legend))];
      const usedKinds = [...new Set(doc.objects.map((o) => o.kind))];
      expect(doc.themes.supported).toContain(doc.themes.default);
      for (const themeId of doc.themes.supported) {
        const theme = ThemeDoc.parse(json(`themes/${themeId}.theme.json`));
        const atlas = AtlasManifest.parse(json(`assets/atlases/${theme.atlas}.atlas.json`));
        expect(usedTerrain.filter((k) => !atlas.theme.terrain[k]), `${themeId}: terrain without art`).toEqual([]);
        expect(usedKinds.filter((k) => !atlas.theme.objects[k]), `${themeId}: objects without art`).toEqual([]);
      }
    });
  }
});
