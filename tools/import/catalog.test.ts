import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  cleanTitle,
  creditLine,
  eeveeExpoResourceId,
  licenseStatus,
  loadCatalog,
  packIdForRow,
  parseCatalog,
  parseDeviantArtUrl,
  rippedFromOfficial,
} from './catalog.ts';
import { parseCsv } from './csv.ts';
import { Matcher, loadMatchOverrides, matchJsonLine, overrideFor, parseDeviantArtFileName } from './match.ts';
import { REAL_CATALOG, daFileName, makeTempDir, removeTempDir } from './test-fixtures.ts';

const rows = loadCatalog(REAL_CATALOG);
const matcher = new Matcher(rows);
const byUrl = (url: string) => {
  const r = rows.find((x) => x.url === url);
  if (!r) throw new Error(`fixture row missing: ${url}`);
  return r;
};
const DIRT = 'https://www.deviantart.com/j-treecko252/art/Path-Tiles-EX-Dirt-884688469';
const BIG_TREES = 'https://www.deviantart.com/ekat99/art/Outdoor-Collection-Big-Trees-887616654';
const CONIFER = 'https://www.deviantart.com/ekat99/art/Outdoor-Collection-Conifer-887616775';

describe('parseCsv', () => {
  it('handles quoted fields, doubled quotes, embedded commas and newlines, CRLF and a BOM', () => {
    const text = String.fromCharCode(0xfeff) + 'a,b,c\r\n1,"x, y","say ""hi"""\r\n2,"multi\nline",\r\n';
    expect(parseCsv(text)).toEqual([
      ['a', 'b', 'c'],
      ['1', 'x, y', 'say "hi"'],
      ['2', 'multi\nline', ''],
    ]);
  });

  it('keeps the ☆ / ❉ credit marks intact', () => {
    const text = [
      'tab,artist,category1,category2,generation,source,title,url,credits,number',
      'Outdoor Tilesets,A,Trees,,Gen 3,DeviantArt,T by A on DeviantArt,https://www.deviantart.com/a/art/T-1,☆,1.0',
      'Outdoor Tilesets,B,Trees,,Gen 3,DeviantArt,"U, V",https://www.deviantart.com/b/art/U-V-2,"❉ (credit not needed, but appreciated)",2.0',
    ].join('\r\n');
    const [a, b] = parseCatalog(text);
    expect(a!.credits).toBe('☆');
    expect(b!.title).toBe('U, V');
    expect(b!.credits).toBe('❉ (credit not needed, but appreciated)');
    expect(b!.number).toBe(2);
    expect(licenseStatus(a!)).toBe('ok');
    expect(licenseStatus(b!)).toBe('ok');
  });
});

describe('the real catalog', () => {
  it('parses all 711 rows with every column', () => {
    expect(rows).toHaveLength(711);
    const dirt = byUrl(DIRT);
    expect(dirt).toMatchObject({ artist: 'J-Treecko252', title: 'Path Tiles EX Dirt', credits: '☆', number: 161, source: 'DeviantArt' });
    const quoted = rows.find((r) => r.url.includes('FRLG-styled-tiles-705658259'))!;
    expect(quoted.credits).toBe('❉ (credit not necessary, but appreciated)');
  });

  it('cleans titles for credit lines', () => {
    const peeky = rows.find((r) => r.url.endsWith('Public-Tileset-Dump-3-4-Beach-and-Sea-828233122'))!;
    expect(cleanTitle(peeky)).toBe('Public Tileset Dump 3/4 - Beach and Sea');
    expect(creditLine(peeky)).toBe('Public Tileset Dump 3/4 - Beach and Sea by PeekyChew');
    expect(cleanTitle(byUrl('https://eeveeexpo.com/resources/1631/'))).toBe('Gen 3 Snow Tileset - Update');
    expect(cleanTitle(byUrl('https://eeveeexpo.com/resources/602/'))).toBe('Big Tree Pack');
    expect(creditLine(byUrl(DIRT))).toBe('Path Tiles EX Dirt by J-Treecko252');
  });

  it('derives pack ids', () => {
    expect(packIdForRow(byUrl(DIRT))).toBe('da-j-treecko252-884688469');
    expect(packIdForRow(byUrl('https://eeveeexpo.com/resources/621/'))).toBe('ee-621');
    expect(packIdForRow(byUrl('https://www.spriters-resource.com/game_boy_advance/pokemonemerald/sheet/61816/'))).toBe('tsr-61816');
    for (const r of rows) expect(packIdForRow(r)).toMatch(/^[a-z0-9][a-z0-9_-]*$/);
    expect(parseDeviantArtUrl(DIRT)).toEqual({ artist: 'j-treecko252', slug: 'Path-Tiles-EX-Dirt', id: 884688469 });
    expect(eeveeExpoResourceId('https://eeveeexpo.com/resources/some-name.621/')).toBe(621);
  });

  it('maps credit marks to licence status and rip flags', () => {
    expect(licenseStatus(byUrl(DIRT))).toBe('ok');
    expect(rippedFromOfficial(byUrl(DIRT))).toBe('unknown');
    const ripped = rows.find((r) => r.credits.startsWith('Ripped'))!;
    expect(licenseStatus(ripped)).toBe('unknown');
    expect(rippedFromOfficial(ripped)).toBe('full');
    // a Spriters Resource rip marked ❉ is still a rip
    const tsr = byUrl('https://www.spriters-resource.com/game_boy_advance/pokemonemerald/sheet/83233/');
    expect(tsr.credits).toBe('❉');
    expect(rippedFromOfficial(tsr)).toBe('full');
    const unsure = rows.find((r) => r.credits === '❉(unsure)')!;
    expect(licenseStatus(unsure)).toBe('unknown');
    expect(licenseStatus(rows.find((r) => r.credits === '?')!)).toBe('unknown');
  });
});

describe('DeviantArt file name matching', () => {
  it('decodes the deviation id from the d<base36> code', () => {
    expect(parseDeviantArtFileName('apartment_building_tiles_01_by_j_treecko252_dexy3pk.png')).toEqual({
      title: 'apartment_building_tiles_01',
      artist: 'j_treecko252',
      deviationId: 903544904,
      preview: false,
    });
    expect(parseDeviantArtFileName('Ekat Public Tilesets.zip')).toBeNull();
  });

  it('matches J-Treecko252 Path Tiles EX Dirt and Ekat99 Outdoor Collection Big Trees by deviation id', () => {
    const dirt = matcher.match(daFileName('path_tiles_ex_dirt', 'j_treecko252', 884688469));
    expect(dirt).toMatchObject({ kind: 'matched', how: 'deviation-id', row: byUrl(DIRT) });
    const trees = matcher.match(daFileName('outdoor_collection_big_trees', 'ekat99', 887616654));
    expect(trees).toMatchObject({ kind: 'matched', how: 'deviation-id', row: byUrl(BIG_TREES) });
  });

  it('falls back to artist + title tokens when the code is missing or unknown', () => {
    expect(matcher.match('path_tiles_ex_dirt_by_j_treecko252.png')).toMatchObject({ kind: 'matched', how: 'name', row: byUrl(DIRT) });
    expect(matcher.match('path_tiles_ex_dirt_by_j_treecko252_dzzzzz.png')).toMatchObject({ kind: 'matched', how: 'name', row: byUrl(DIRT) });
    expect(matcher.match('outdoor_collection_big_trees_by_ekat99 (1).png')).toMatchObject({ kind: 'matched', row: byUrl(BIG_TREES) });
    expect(matcher.match('outdoor_collection_conifer_by_ekat99.png')).toMatchObject({ kind: 'matched', row: byUrl(CONIFER) });
    // no artist in the name, but an exact title
    expect(matcher.match('Path Tiles EX Compacted Snow.png')).toMatchObject({ kind: 'matched', row: byUrl('https://www.deviantart.com/j-treecko252/art/Path-Tiles-EX-Compacted-Snow-884688441') });
  });

  it('ranks the right row first among many similar J-Treecko252 path sheets', () => {
    const ranked = matcher.rank('path_tiles_ex_dirt_by_j_treecko252.png');
    expect(ranked[0]!.row.url).toBe(DIRT);
    expect(ranked[0]!.score - ranked[1]!.score).toBeGreaterThan(0.08);
  });

  it('warns about preview suffixes', () => {
    const m = matcher.match('path_tiles_ex_dirt_by_j_treecko252_dempxzp-fullview.png');
    expect(m.kind).toBe('matched');
    expect(m.kind === 'matched' && m.warnings.join(' ')).toMatch(/preview/);
  });

  it('leaves unknown and ambiguous names unmatched, with candidates', () => {
    const none = matcher.match('IMG_0001.png');
    expect(none.kind).toBe('unmatched');
    expect(none.kind === 'unmatched' && none.candidates).toHaveLength(3);
    // two catalog rows share this exact title and artist
    const dup = matcher.match('pokecenter_by_aveontrainer.png');
    expect(dup.kind === 'unmatched' && dup.reason).toMatch(/ambiguous/);
    // right title, wrong artist
    expect(matcher.match('path_tiles_ex_dirt_by_somebody_else.png').kind).toBe('unmatched');
    expect(matchJsonLine('IMG_0001.png', byUrl(DIRT))).toBe(`"IMG_0001.png": "${DIRT}"`);
  });
});

describe('match.json overrides', () => {
  let dir = '';
  afterEach(() => removeTempDir(dir));

  it('resolves URLs, "<tab>#<number>" and unique numbers; explains duplicate numbers', () => {
    expect(matcher.resolveRef('https://eeveeexpo.com/resources/621').row?.url).toBe('https://eeveeexpo.com/resources/621/');
    expect(matcher.resolveRef('http://deviantart.com/j-treecko252/art/Path-Tiles-EX-Dirt-884688469/').row?.url).toBe(DIRT);
    expect(matcher.resolveRef('Auto Tilesets#2').row?.url).toBe('https://eeveeexpo.com/resources/1604/');
    expect(matcher.resolveRef(161).row?.url).toBe(DIRT);
    expect(matcher.resolveRef(2).error).toMatch(/used in \d+ tabs/);
    expect(matcher.resolveRef('https://example.com/nope').error).toMatch(/no catalog row/);
  });

  it('overrides name matching from downloads/match.json', () => {
    dir = makeTempDir();
    const path = join(dir, 'match.json');
    writeFileSync(path, JSON.stringify({ $comment: 'ignored', 'Gen3_Pack_v2.zip': 'https://eeveeexpo.com/resources/621/' }));
    const overrides = loadMatchOverrides(path);
    expect(overrides.size).toBe(1);
    const m = matcher.match('gen3_pack_v2.zip', overrideFor(overrides, 'gen3_pack_v2.zip'));
    expect(m).toMatchObject({ kind: 'matched', how: 'match.json' });
    expect(m.kind === 'matched' && m.row.artist).toBe('Ekat99');
    writeFileSync(path, '{ not json');
    expect(() => loadMatchOverrides(path)).toThrow(/not valid JSON/);
  });
});
