// The committed atlases must be exactly what the current themes, content and packs produce, so a
// theme edit, a new pack or a content change can't ship with a stale atlas.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildAll, loadThemes, printManifest } from './build.ts';

const root = new URL('../../', import.meta.url);

describe('theme atlases', () => {
  const built = buildAll(root);

  it('builds one atlas per theme', () => {
    expect(built.map((b) => b.themeId).sort()).toEqual([...loadThemes(root).keys()].sort());
    expect(new Set(built.map((b) => b.manifest.id)).size).toBe(built.length);
  });

  for (const b of built) {
    it(`assets/atlases/${b.manifest.id}.atlas.json is up to date`, () => {
      const file = new URL(`assets/atlases/${b.manifest.id}.atlas.json`, root);
      expect(existsSync(file), 'atlas missing: run "npm run art"').toBe(true);
      expect(readFileSync(file, 'utf8'), 'atlas is stale: run "npm run art" and commit the result').toBe(printManifest(b.manifest));
    });
  }

  it('every theme has art for every terrain and stamp kind', () => {
    for (const b of built) expect(b.manifest.theme.missing, b.themeId).toEqual([]);
  });
});
