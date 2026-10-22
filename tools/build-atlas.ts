// Builds one atlas per theme: themes/<id>.theme.json -> assets/atlases/<atlas>.png + <atlas>.atlas.json
// Reports which slots fell back (a theme's first choice wasn't available) and which have no art.
// Run: npm run art:atlas
import { mkdirSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { buildAll, printManifest } from './atlas/build.ts';

const ROOT = new URL('../', import.meta.url);
const outDir = new URL('assets/atlases/', ROOT);
mkdirSync(outDir, { recursive: true });

for (const { themeId, manifest, png } of buildAll(ROOT)) {
  writeFileSync(new URL(`${manifest.id}.png`, outDir), PNG.sync.write(png));
  writeFileSync(new URL(`${manifest.id}.atlas.json`, outDir), printManifest(manifest));
  const { theme } = manifest;
  console.log(
    `theme "${themeId}" (${theme.chain.join(' → ')}): ${manifest.tileCount} tiles + ${Object.keys(manifest.stamps).length} stamps, ` +
      `${manifest.imageWidth}x${manifest.imageHeight} -> assets/atlases/${manifest.id}.png`,
  );
  for (const f of theme.fallbacks) console.log(`  fallback  ${f.slot}: wanted ${f.wanted}, using ${f.used}`);
  for (const m of theme.missing) console.log(`  no art    ${m} (drawn as a plain colour)`);
}
