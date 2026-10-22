// Imports hand-downloaded tilesets from downloads/ into assets/raw/<pack_id>/ (both git-ignored).
// Never fetches anything: download by hand (DeviantArt's quota applies), keep the original file
// names, and paste each page's terms into "<file name>.txt" next to the download.
// Run: npm run packs:import [-- --dry-run] [-- --inbox <dir>] [-- --out <dir>]
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { formatReport, runImport } from './import/importer.ts';

const root = fileURLToPath(new URL('../', import.meta.url));

const USAGE = `Usage: npm run packs:import [-- options]

Processes every .png, .zip and folder in downloads/ (not downloads/processed/):
matches it to asset-catalog/tilesets.csv, writes assets/raw/<pack_id>/ with pack.json,
records sha256/size/date and a dated terms snapshot, then moves the download to
downloads/processed/. Unmatched files stay put; map them in downloads/match.json:
  { "<download file name>": "<catalog url or \\"<tab>#<number>\\">" }

Options:
  --dry-run       show what would happen; write and move nothing
  --inbox <dir>   inbox folder (default: downloads)
  --out <dir>     raw pack folder (default: assets/raw)
  -h, --help      this help`;

let args;
try {
  args = parseArgs({
    options: {
      'dry-run': { type: 'boolean', default: false },
      inbox: { type: 'string' },
      out: { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
    },
    allowPositionals: false,
  }).values;
} catch (e) {
  console.error(`${(e as Error).message}\n\n${USAGE}`);
  process.exit(2);
}

if (args.help) {
  console.log(USAGE);
} else {
  try {
    const report = runImport({
      root,
      inbox: args.inbox ? resolve(args.inbox) : undefined,
      out: args.out ? resolve(args.out) : undefined,
      dryRun: args['dry-run'],
    });
    console.log(formatReport(report, root));
  } catch (e) {
    console.error(`packs:import: ${(e as Error).message}`);
    process.exit(1);
  }
}
