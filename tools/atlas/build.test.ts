// The committed atlases must be exactly what the current themes, content and packs produce, so a
// theme edit, a new pack or a content change can't ship with a stale atlas.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AtlasManifest } from '@tdmm/map-format';
import { buildAll, loadThemes, printManifest } from './build.ts';

const root = new URL('../../', import.meta.url);

describe('theme atlases', () => {
  const built = buildAll(root);

  it('builds one atlas per theme', () => {
    expect(built.map((b) => b.themeId).sort()).toEqual([...loadThemes(root).keys()].sort());
    expect(new Set(built.map((b) => b.manifest.id)).size).toBe(built.length);
  });

  for (const b of built) {
    const file = new URL(`assets/atlases/${b.manifest.id}.atlas.json`, root);
    // Atlases built from downloaded packs (assets/raw/, git-ignored) can only be re-checked on a
    // machine that has those downloads; elsewhere the build would fall back to placeholders.
    const committed = existsSync(file) ? AtlasManifest.parse(JSON.parse(readFileSync(file, 'utf8'))) : undefined;
    const missing = [...new Set((committed?.sources ?? []).filter((s) => !existsSync(new URL(s.file, root))).map((s) => s.pack))];
    it.skipIf(missing.length > 0)(`assets/atlases/${b.manifest.id}.atlas.json is up to date${missing.length ? ` (skipped: packs not downloaded here: ${missing.join(', ')})` : ''}`, () => {
      expect(committed, 'atlas missing: run "npm run art"').toBeDefined();
      expect(readFileSync(file, 'utf8'), 'atlas is stale: run "npm run art" and commit the result').toBe(printManifest(b.manifest));
    });
  }

  it('every theme has art for every terrain and stamp kind', () => {
    for (const b of built) expect(b.manifest.theme.missing, b.themeId).toEqual([]);
  });
});
