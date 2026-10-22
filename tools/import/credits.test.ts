import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildCredits, serializeCredits } from './credits.ts';
import { REPO_ROOT, makeTempDir, removeTempDir, writeFile } from './test-fixtures.ts';

let root = '';
beforeEach(() => {
  root = makeTempDir('tdmm-credits-');
});
afterEach(() => removeTempDir(root));

function pack(id: string, over: { status?: string; credit?: string | null; artist?: string; ripped?: string; visibility?: string; upstream?: string[] } = {}) {
  return JSON.stringify({
    pack_id: id,
    name: `Pack ${id}`,
    source: { site: 'DeviantArt', url: `https://www.deviantart.com/x/art/${id}-1`, retrieved_at: '2026-10-21' },
    artist: { name: over.artist ?? 'Artist' },
    upstream_credits: over.upstream ?? [],
    license: { spdx: null, credit_line: over.credit === undefined ? `Pack ${id} by ${over.artist ?? 'Artist'}` : over.credit, status: over.status ?? 'ok', raw_redistribution: 'unspecified', terms_snapshot: null },
    ripped_from_official: over.ripped ?? 'none',
    visibility: over.visibility ?? 'private-only',
    format: { native_tile_px: 16, scale: 2 },
    assets: {},
  });
}

function atlas(id: string, packs: string[]) {
  writeFile(
    join(root, 'assets', 'atlases', `${id}.atlas.json`),
    JSON.stringify({ format: 'ptd-atlas', sources: packs.map((p) => ({ key: `${p}/a`, file: `assets/packs/${p}/a.png`, pack: p })) }),
  );
}

describe('buildCredits', () => {
  it('lists used packs with a credit line, sorted and deterministic, from assets/packs and assets/raw', () => {
    atlas('summer', ['zeta', 'alpha', 'gen']);
    atlas('winter', ['alpha', 'beta']);
    writeFile(join(root, 'assets', 'packs', 'alpha', 'pack.json'), pack('alpha', { artist: 'Zed', upstream: ['Vurtax'] }));
    writeFile(join(root, 'assets', 'raw', 'beta', 'pack.json'), pack('beta', { artist: 'ann' }));
    writeFile(join(root, 'assets', 'raw', 'zeta', 'pack.json'), pack('zeta', { artist: 'Bob' }));
    writeFile(join(root, 'assets', 'packs', 'gen', 'pack.json'), pack('gen', { credit: null }));
    writeFile(join(root, 'assets', 'raw', 'unused', 'pack.json'), pack('unused', { status: 'unknown' }));

    const r = buildCredits(root);
    expect(r.errors).toEqual([]);
    expect(r.doc.generated).toBe(true);
    expect(r.doc.note).toMatch(/Generated/);
    expect(r.doc.credits.map((c) => c.pack)).toEqual(['beta', 'zeta', 'alpha']);
    expect(r.doc.credits[2]).toEqual({
      pack: 'alpha',
      name: 'Pack alpha',
      artist: 'Zed',
      credit_line: 'Pack alpha by Zed',
      upstream_credits: ['Vurtax'],
      url: 'https://www.deviantart.com/x/art/alpha-1',
      license_spdx: null,
    });
    expect(r.usedBy.get('alpha')).toEqual(['summer.atlas.json', 'winter.atlas.json']);
    expect(serializeCredits(buildCredits(root).doc)).toBe(serializeCredits(r.doc));
  });

  it('fails when a used pack has licence status "unknown"', () => {
    atlas('summer', ['mystery']);
    writeFile(join(root, 'assets', 'raw', 'mystery', 'pack.json'), pack('mystery', { status: 'unknown' }));
    const r = buildCredits(root);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toMatch(/"mystery".*license\.status "unknown"/);
  });

  it('fails when a used pack is missing', () => {
    atlas('summer', ['ghost']);
    expect(buildCredits(root).errors.join(' ')).toMatch(/"ghost" is used by summer\.atlas\.json but has no manifest/);
  });

  it('fails when a private-only official rip is used', () => {
    atlas('summer', ['rip']);
    writeFile(join(root, 'assets', 'raw', 'rip', 'pack.json'), pack('rip', { ripped: 'full' }));
    expect(buildCredits(root).errors.join(' ')).toMatch(/ripped .* must not ship in public builds/);
  });

  it('fails on a manifest that does not validate', () => {
    atlas('summer', ['bad']);
    writeFile(join(root, 'assets', 'packs', 'bad', 'pack.json'), JSON.stringify({ pack_id: 'bad' }));
    expect(buildCredits(root).errors.join(' ')).toMatch(/does not validate/);
  });

  it('succeeds on the real repo (only the generated placeholder pack is used today)', () => {
    const r = buildCredits(REPO_ROOT);
    expect(r.errors).toEqual([]);
    expect(r.doc.credits.every((c) => c.credit_line.length > 0)).toBe(true);
  });
});
