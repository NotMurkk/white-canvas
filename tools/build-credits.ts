// Writes assets/atlases/credits.json from the packs the atlases use (see tools/import/credits.ts).
// Fails (exit 1) if a used pack is missing, has license.status "unknown", or is a private-only official rip.
// Run: npm run credits            (or: node tools/build-credits.ts --check   to validate without writing)
import { fileURLToPath } from 'node:url';
import { buildCredits, writeCredits } from './import/credits.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const check = process.argv.includes('--check');

try {
  const result = buildCredits(root);
  for (const w of result.warnings) console.warn(`warning: ${w}`);
  if (result.errors.length) {
    console.error(`credits: ${result.errors.length} problem(s), credits.json not written:`);
    for (const e of result.errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  const used = [...result.usedBy.keys()].sort();
  if (check) {
    console.log(`credits: OK (${used.length} pack(s) used, ${result.doc.credits.length} credited); --check, nothing written`);
  } else {
    writeCredits(root, result.doc);
    console.log(`credits: ${used.length} pack(s) used (${used.join(', ') || 'none'}), ${result.doc.credits.length} credit line(s) -> assets/atlases/credits.json`);
  }
} catch (e) {
  console.error(`credits: ${(e as Error).message}`);
  process.exit(1);
}
