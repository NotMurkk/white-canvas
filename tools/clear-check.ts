// Runs the clear check (validation + no-tower simulation) on every committed map and stamps the
// result into its waves file, the same way the editor does on save. Also upgrades old map files
// to the current schema. Use after changing content/*.json or the simulation.
//   npm run clearcheck            re-check and rewrite maps/*.map.json + *.waves.json
//   npm run clearcheck -- --check verify only; exit 1 if any map isn't cleared (CI)
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { EnemyRegistry, KindRegistry, TerrainTypes, ZoneTypes, emptyWaves, parseMap, parseWaves, printMap, printWaves } from '@tdmm/map-format';
import { mapStateFromDoc, type Registries } from '@tdmm/rules';
import { runClearCheck } from '@tdmm/sim';

const ROOT = new URL('../', import.meta.url);
const checkOnly = process.argv.includes('--check');
const json = (path: string) => JSON.parse(readFileSync(new URL(path, ROOT), 'utf8'));
const reg: Registries = {
  terrainTypes: TerrainTypes.parse(json('content/terrain-types.json')),
  kinds: KindRegistry.parse(json('content/kinds.json')),
  enemies: EnemyRegistry.parse(json('content/enemies.json')),
  zones: ZoneTypes.parse(json('content/zones.json')),
};

let failed = 0;
const files = readdirSync(new URL('maps/', ROOT)).filter((f) => f.endsWith('.map.json')).sort();
for (const file of files) {
  const mapUrl = new URL(`maps/${file}`, ROOT);
  const mapText = readFileSync(mapUrl, 'utf8');
  const map = parseMap(mapText);
  const wavesUrl = new URL(`maps/${map.id}.waves.json`, ROOT);
  const wavesText = existsSync(wavesUrl) ? readFileSync(wavesUrl, 'utf8') : null;
  const waves = wavesText ? parseWaves(wavesText) : emptyWaves(map.id);
  const result = runClearCheck(mapStateFromDoc(map), reg, waves);
  const { clearCheck: _old, ...rest } = waves;
  const stamped = result.record ? { ...rest, clearCheck: result.record } : rest;
  const newMap = printMap(map);
  const newWaves = printWaves(stamped);
  const changed = newMap !== mapText || newWaves !== wavesText;

  if (result.passed) {
    const r = result.record!;
    console.log(`✓ ${map.id}: ${r.rounds} rounds, ${r.enemies} enemies, ${r.durationSec}s with no towers${changed ? (checkOnly ? '  (record out of date)' : '  (updated)') : ''}`);
  } else {
    console.log(`✗ ${map.id}: fails the clear check`);
    for (const p of result.problems.slice(0, 10)) console.log(`    - ${p.message}`);
  }
  if (!result.passed || (checkOnly && changed)) failed++;
  if (!checkOnly && changed) {
    writeFileSync(mapUrl, newMap);
    writeFileSync(wavesUrl, newWaves);
  }
}
if (failed) {
  console.log(`\n${failed} map(s) not cleared.${checkOnly ? ' Run "npm run clearcheck" (or save in the editor) and commit the result.' : ''}`);
  process.exit(1);
}
