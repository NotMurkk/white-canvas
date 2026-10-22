import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PackManifest } from '@tdmm/map-format';
import { sha256 } from './image.ts';
import { type ImportReport, formatReport, runImport } from './importer.ts';
import { JPEG_BYTES, REAL_CATALOG, daFileName, makePng, makeTempDir, removeTempDir, writeFile } from './test-fixtures.ts';

const TODAY = '2026-10-21';
const DIRT_FILE = daFileName('path_tiles_ex_dirt', 'j_treecko252', 884688469);
const DIRT_ID = 'da-j-treecko252-884688469';
const TREES_FILE = daFileName('outdoor_collection_big_trees', 'ekat99', 887616654);
const TREES_ID = 'da-ekat99-887616654';
const CONIFER_FILE = daFileName('outdoor_collection_conifer', 'ekat99', 887616775);
const EKAT_ZIP = 'Ekat Public Gen3 v2.zip';

let root = '';
let inbox = '';
let out = '';
const run = (extra: { dryRun?: boolean } = {}) => runImport({ root, catalog: REAL_CATALOG, today: TODAY, ...extra });
const readPack = (id: string) => JSON.parse(readFileSync(join(out, id, 'pack.json'), 'utf8')) as Record<string, any>;
const rowFor = (report: ImportReport, download: string) => {
  const r = report.rows.find((x) => x.download === download);
  if (!r) throw new Error(`no report row for ${download}: ${report.rows.map((x) => x.download).join(', ')}`);
  return r;
};

beforeEach(() => {
  root = makeTempDir();
  inbox = join(root, 'downloads');
  out = join(root, 'assets', 'raw');
});
afterEach(() => removeTempDir(root));

describe('runImport', () => {
  it('creates the inbox and reports nothing to import when it is empty', () => {
    const report = run();
    expect(report.nothingToImport).toBe(true);
    expect(existsSync(inbox)).toBe(true);
    expect(formatReport(report, root)).toMatch(/Nothing to import/);
  });

  it('imports PNGs and a zip bundle end to end', () => {
    const dirtPng = makePng(192, 64, { seed: 1 }); // 16 px autotile, 4 frames
    const treesPng = makePng(128, 256, { seed: 2 }); // 16 px RMXP-layout sheet
    const coniferPng = makePng(126, 77, { seed: 3 }); // resized preview
    writeFile(join(inbox, DIRT_FILE), dirtPng);
    writeFile(join(inbox, DIRT_FILE.replace('.png', '.txt')), 'Free to Edit/Use, just give credit');
    writeFile(join(inbox, TREES_FILE), treesPng);
    writeFile(join(inbox, CONIFER_FILE), coniferPng);
    writeFile(join(inbox, 'preview.jpg'), JPEG_BYTES);
    writeFile(join(inbox, 'IMG_0001.png'), makePng(32, 32, { seed: 4 }));
    writeFile(join(inbox, 'ekats_gen3.png'), makePng(32, 32, { seed: 8 }));
    writeFile(join(inbox, 'orphan.txt'), 'notes to self');
    writeFile(join(inbox, 'tiles.rar'), 'Rar!');
    const seaPng = makePng(144, 64, { seed: 5 });
    const big32 = makePng(96, 128, { seed: 6, doubled: true });
    writeFile(
      join(inbox, EKAT_ZIP),
      zipSync({
        'Ekat Public/Outdoor/Trees.png': makePng(128, 64, { seed: 7 }),
        'Ekat Public/Outdoor/Sea[3].png': seaPng,
        'Ekat Public/Water/Big Water.png': big32,
        'Ekat Public/Credits.txt': strToU8('Credit Ekat99, Vurtax, Heartlessdragoon'),
        'Ekat Public/preview.jpg': JPEG_BYTES,
      }),
    );
    writeFile(join(inbox, 'match.json'), JSON.stringify({ [EKAT_ZIP]: 'https://eeveeexpo.com/resources/621/' }));

    const report = run();
    const text = formatReport(report, root);

    // --- statuses
    expect(rowFor(report, DIRT_FILE)).toMatchObject({ status: 'imported', packs: [DIRT_ID] });
    expect(rowFor(report, TREES_FILE)).toMatchObject({ status: 'imported', packs: [TREES_ID] });
    expect(rowFor(report, CONIFER_FILE).status).toBe('imported');
    expect(rowFor(report, CONIFER_FILE).warnings.join(' ')).toMatch(/looks like a resized preview/);
    expect(rowFor(report, EKAT_ZIP)).toMatchObject({ status: 'imported', packs: ['ee-621', 'ee-621-32px'] });
    expect(rowFor(report, 'preview.jpg')).toMatchObject({ status: 'rejected', details: 'JPEG previews are resized/compressed; download the original PNG' });
    expect(rowFor(report, 'tiles.rar').status).toBe('rejected');
    expect(rowFor(report, 'orphan.txt').status).toBe('skipped');
    const noIdea = rowFor(report, 'IMG_0001.png');
    expect(noIdea.status).toBe('unmatched');
    expect(noIdea.candidates).toEqual([]);
    expect(noIdea.matchJsonLine).toBe('"IMG_0001.png": "<catalog url>"');
    const partial = rowFor(report, 'ekats_gen3.png');
    expect(partial.status).toBe('unmatched');
    expect(partial.candidates).toHaveLength(3);
    expect(partial.candidates![0]!.row.url).toBe('https://eeveeexpo.com/resources/621/');
    expect(partial.matchJsonLine).toBe('"ekats_gen3.png": "https://eeveeexpo.com/resources/621/"');
    expect(text).toContain(partial.matchJsonLine!);
    expect(text).toMatch(/Totals: 4 imported, 1 skipped, 2 rejected, 2 unmatched/);

    // --- the DeviantArt pack
    const dirt = readPack(DIRT_ID);
    expect(PackManifest.safeParse(dirt).success).toBe(true);
    expect(dirt).toMatchObject({
      pack_id: DIRT_ID,
      name: 'Path Tiles EX Dirt',
      artist: { name: 'J-Treecko252' },
      upstream_credits: [],
      license: {
        spdx: null,
        credit_line: 'Path Tiles EX Dirt by J-Treecko252',
        status: 'ok',
        raw_redistribution: 'unspecified',
        terms_snapshot: `terms_${TODAY}.txt`,
      },
      ripped_from_official: 'unknown',
      visibility: 'private-only',
      format: { native_tile_px: 16, scale: 2 },
      assets: { path_tiles_ex_dirt: { kind: 'autotile', file: DIRT_FILE, frameMs: 250 } },
    });
    expect(dirt.source).toMatchObject({
      site: 'DeviantArt',
      url: 'https://www.deviantart.com/j-treecko252/art/Path-Tiles-EX-Dirt-884688469',
      retrieved_at: TODAY,
      catalog_number: 161,
      catalog_title: 'Path Tiles EX Dirt',
      files: [{ file: DIRT_FILE, sha256: sha256(dirtPng), w: 192, h: 64 }],
    });
    expect(readFileSync(join(out, DIRT_ID, DIRT_FILE))).toEqual(Buffer.from(dirtPng));
    expect(readFileSync(join(out, DIRT_ID, `terms_${TODAY}.txt`), 'utf8')).toBe('Free to Edit/Use, just give credit');

    // no terms pasted: snapshot is null and the user is told
    const trees = readPack(TREES_ID);
    expect(trees.license.terms_snapshot).toBeNull();
    expect(trees.assets.outdoor_collection_big_trees).toEqual({ kind: 'tileset', file: TREES_FILE, tiles: {}, regions: {} });
    expect(rowFor(report, TREES_FILE).warnings.join(' ')).toMatch(/no terms snapshot/);

    // --- the zip bundle, split by tile size
    const ekat = readPack('ee-621');
    expect(PackManifest.safeParse(ekat).success).toBe(true);
    expect(ekat.name).toBe("Ekat's Public Gen 3 Tilesets");
    expect(ekat.format).toEqual({ native_tile_px: 16, scale: 2 });
    expect(ekat.assets).toEqual({
      trees: { kind: 'tileset', file: 'Outdoor__Trees.png', tiles: {}, regions: {} },
      sea: { kind: 'autotile', file: 'Outdoor__Sea[3].png', frameMs: 150 },
    });
    expect(ekat.source.files.map((f: { from: string }) => f.from)).toContain(`${EKAT_ZIP}!/Ekat Public/Outdoor/Sea[3].png`);
    expect(readFileSync(join(out, 'ee-621', ekat.license.terms_snapshot), 'utf8')).toContain('Credit Ekat99, Vurtax, Heartlessdragoon');
    const ekat32 = readPack('ee-621-32px');
    expect(PackManifest.safeParse(ekat32).success).toBe(true);
    expect(ekat32).toMatchObject({ format: { native_tile_px: 32, scale: 1 }, source: { split_of: 'ee-621' } });
    expect(ekat32.assets.big_water).toEqual({ kind: 'autotile', file: 'Water__Big Water.png', frameMs: 250 });
    expect(rowFor(report, EKAT_ZIP).warnings.join(' ')).toMatch(/\.jpg x1/);

    // --- bookkeeping: index, processed/, what stays in the inbox
    const index = JSON.parse(readFileSync(join(out, '_index.json'), 'utf8'));
    expect(index.sha256[sha256(dirtPng)]).toBe(DIRT_ID);
    expect(index.sha256[sha256(big32)]).toBe('ee-621-32px');
    expect(readdirSync(join(inbox, 'processed')).sort()).toEqual(
      [CONIFER_FILE, DIRT_FILE, DIRT_FILE.replace('.png', '.txt'), EKAT_ZIP, TREES_FILE].sort(),
    );
    expect(readdirSync(inbox).sort()).toEqual(['IMG_0001.png', 'ekats_gen3.png', 'match.json', 'orphan.txt', 'preview.jpg', 'processed', 'tiles.rar'].sort());
  });

  it('is idempotent: re-downloads are skipped and pack.json is left alone', () => {
    const png = makePng(192, 64, { seed: 11 });
    writeFile(join(inbox, DIRT_FILE), png);
    run();
    const before = readFileSync(join(out, DIRT_ID, 'pack.json'), 'utf8');

    writeFile(join(inbox, DIRT_FILE), png); // downloaded again
    const again = run();
    expect(rowFor(again, DIRT_FILE)).toMatchObject({ status: 'skipped', packs: [DIRT_ID] });
    expect(rowFor(again, DIRT_FILE).details).toMatch(/already imported/);
    expect(readFileSync(join(out, DIRT_ID, 'pack.json'), 'utf8')).toBe(before);
    expect(readdirSync(join(out, DIRT_ID)).sort()).toEqual([DIRT_FILE, 'pack.json'].sort());
    expect(readdirSync(join(inbox, 'processed')).sort()).toEqual([DIRT_FILE.replace('.png', ' (2).png'), DIRT_FILE].sort());

    // a third run with nothing new is a no-op
    expect(run().nothingToImport).toBe(true);

    // even without _index.json, the pack's own file hashes stop a duplicate
    removeTempDir(join(out, '_index.json'));
    writeFile(join(inbox, DIRT_FILE), png);
    const noIndex = run();
    expect(rowFor(noIndex, DIRT_FILE).status).toBe('skipped');
    expect(readFileSync(join(out, DIRT_ID, 'pack.json'), 'utf8')).toBe(before);
    expect(existsSync(join(out, '_index.json'))).toBe(true);
  });

  it('merges new files into a human-edited pack.json without losing the edits', () => {
    writeFile(join(inbox, DIRT_FILE), makePng(192, 64, { seed: 21 }));
    run();
    const path = join(out, DIRT_ID, 'pack.json');
    const edited = readPack(DIRT_ID);
    edited.ripped_from_official = 'none';
    edited.upstream_credits = ['Someone Upstream'];
    edited.license.status = 'ok';
    edited.reviewed_by = 'mike';
    writeFileSync(path, JSON.stringify(edited, null, 2));

    // the artist updated the sheet: same name (Windows adds " (1)"), different bytes
    const updated = makePng(192, 64, { seed: 22 });
    const second = DIRT_FILE.replace('.png', ' (1).png');
    writeFile(join(inbox, second), updated);
    writeFile(join(inbox, second.replace('.png', '.txt')), 'Free to use with credit (updated)');
    const report = run();
    expect(rowFor(report, second)).toMatchObject({ status: 'imported', packs: [DIRT_ID] });
    expect(rowFor(report, second).details).toMatch(/merged into existing pack/);

    const merged = readPack(DIRT_ID);
    expect(PackManifest.safeParse(merged).success).toBe(true);
    expect(merged.ripped_from_official).toBe('none');
    expect(merged.upstream_credits).toEqual(['Someone Upstream']);
    expect(merged.reviewed_by).toBe('mike');
    expect(Object.keys(merged.assets)).toEqual(['path_tiles_ex_dirt', 'path_tiles_ex_dirt_2']);
    expect(merged.assets.path_tiles_ex_dirt_2.file).toBe(second);
    expect(merged.source.files).toHaveLength(2);
    expect(merged.license.terms_snapshot).toBe(`terms_${TODAY}.txt`); // was null, now filled
  });

  it('dry run writes and moves nothing', () => {
    writeFile(join(inbox, DIRT_FILE), makePng(192, 64, { seed: 31 }));
    const report = run({ dryRun: true });
    expect(rowFor(report, DIRT_FILE)).toMatchObject({ status: 'imported', packs: [DIRT_ID] });
    expect(formatReport(report, root)).toMatch(/would import/);
    expect(existsSync(out)).toBe(false);
    expect(existsSync(join(inbox, DIRT_FILE))).toBe(true);
  });

  it('imports an unmatched file once match.json maps it', () => {
    writeFile(join(inbox, 'IMG_0001.png'), makePng(256, 512, { seed: 41, doubled: true }));
    const first = run();
    expect(rowFor(first, 'IMG_0001.png').status).toBe('unmatched');
    writeFile(join(inbox, 'match.json'), JSON.stringify({ 'IMG_0001.png': 'https://www.deviantart.com/ekat99/art/Outdoor-Collection-Big-Trees-887616654' }));
    const second = run();
    expect(rowFor(second, 'IMG_0001.png')).toMatchObject({ status: 'imported', packs: [TREES_ID] });
    expect(readPack(TREES_ID)).toMatchObject({ format: { native_tile_px: 32, scale: 1 }, assets: { img_0001: { kind: 'tileset' } } });
  });

  it('treats an extracted folder as a bundle and matches it by name', () => {
    writeFile(join(inbox, 'Big Tree Pack', 'Big Tree Pack', 'BigTree1.png'), makePng(64, 96, { seed: 61, doubled: true }));
    writeFile(join(inbox, 'Big Tree Pack', 'Big Tree Pack', 'readme.txt'), 'Credit Anon Alpaca');
    const report = run();
    expect(rowFor(report, 'Big Tree Pack')).toMatchObject({ status: 'imported', packs: ['ee-602'] });
    const p = readPack('ee-602');
    expect(PackManifest.safeParse(p).success).toBe(true);
    expect(p).toMatchObject({
      name: 'Big Tree Pack',
      artist: { name: 'Anon Alpaca' },
      license: { credit_line: 'Big Tree Pack by Anon Alpaca', terms_snapshot: `terms_${TODAY}.txt` },
      format: { native_tile_px: 32, scale: 1 },
      assets: { bigtree1: { kind: 'tileset', file: 'BigTree1.png' } },
    });
    expect(readFileSync(join(out, 'ee-602', `terms_${TODAY}.txt`), 'utf8')).toBe('Credit Anon Alpaca');
    expect(existsSync(join(inbox, 'processed', 'Big Tree Pack', 'Big Tree Pack', 'BigTree1.png'))).toBe(true);
  });

  it('rejects unsafe zips and leaves them in place', () => {
    writeFile(join(inbox, 'evil.zip'), zipSync({ 'ok.png': makePng(16, 16), '../../escape.png': makePng(16, 16, { seed: 2 }) }));
    writeFile(join(inbox, 'match.json'), JSON.stringify({ 'evil.zip': 'https://eeveeexpo.com/resources/621/' }));
    const report = run();
    expect(rowFor(report, 'evil.zip').status).toBe('rejected');
    expect(rowFor(report, 'evil.zip').details).toMatch(/path traversal/);
    expect(existsSync(join(inbox, 'evil.zip'))).toBe(true);
    expect(existsSync(join(root, 'escape.png'))).toBe(false);
    expect(existsSync(out)).toBe(false);
  });

  it('refuses to touch a pack.json that does not validate', () => {
    writeFile(join(out, DIRT_ID, 'pack.json'), '{ "pack_id": "broken" ');
    writeFile(join(inbox, DIRT_FILE), makePng(192, 64, { seed: 51 }));
    const report = run();
    expect(rowFor(report, DIRT_FILE).status).toBe('rejected');
    expect(rowFor(report, DIRT_FILE).warnings.join(' ')).toMatch(/not valid JSON/);
    expect(readFileSync(join(out, DIRT_ID, 'pack.json'), 'utf8')).toBe('{ "pack_id": "broken" ');
    expect(existsSync(join(inbox, DIRT_FILE))).toBe(true);
  });
});
