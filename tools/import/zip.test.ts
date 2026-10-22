import { join } from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { afterEach, describe, expect, it } from 'vitest';
import { BundleSafetyError, checkEntryPath, extractZip, readFolderBundle, stripCommonRoot } from './zip.ts';
import { JPEG_BYTES, makePng, makeTempDir, removeTempDir, writeFile } from './test-fixtures.ts';

describe('extractZip', () => {
  it('keeps only .png/.txt/.md, skips macOS clutter, and counts what it ignored', () => {
    const png = makePng(32, 32, { seed: 1 });
    const zip = zipSync({
      'Pack/Outdoor/a.png': png,
      'Pack/Credits.txt': strToU8('credit me'),
      'Pack/README.md': strToU8('# readme'),
      'Pack/preview.jpg': JPEG_BYTES,
      'Pack/source.psd': strToU8('psd'),
      '__MACOSX/Pack/._a.png': strToU8('fork'),
    });
    const bundle = extractZip(zip);
    expect(bundle.files.map((f) => f.path)).toEqual(['Pack/Credits.txt', 'Pack/Outdoor/a.png', 'Pack/README.md']);
    expect(bundle.files[1]!.data).toEqual(png);
    expect(bundle.ignored).toEqual({ '.jpg': 1, '.psd': 1 });
  });

  it.each(['../evil.png', 'ok/../../evil.png', '/etc/evil.png', 'C:/Windows/evil.png', '..\\evil.txt'])(
    'rejects the whole archive for the unsafe entry %s',
    (name) => {
      const zip = zipSync({ 'good.png': makePng(16, 16), [name]: strToU8('x') });
      expect(() => extractZip(zip)).toThrow(BundleSafetyError);
    },
  );

  it('rejects traversal even in entries it would not keep', () => {
    const zip = zipSync({ '../../outside.exe': strToU8('MZ') });
    expect(() => extractZip(zip)).toThrow(/path traversal/);
  });

  it('enforces the entry-count and uncompressed-size caps', () => {
    const many = zipSync({ 'a.txt': strToU8('a'), 'b.txt': strToU8('b'), 'c.txt': strToU8('c'), 'd.txt': strToU8('d') });
    expect(() => extractZip(many, { maxEntries: 3, maxTotalBytes: 1e9 })).toThrow(/more than 3 entries/);
    // highly compressible: 2 MB of zeros inflates past a 1 MB cap
    const bomb = zipSync({ 'zeros.txt': new Uint8Array(2 * 1024 * 1024) }, { level: 9 });
    expect(bomb.byteLength).toBeLessThan(64 * 1024);
    expect(() => extractZip(bomb, { maxEntries: 10, maxTotalBytes: 1024 * 1024 })).toThrow(/exceeds 1 MB/);
  });

  it('rejects files that are not zips', () => {
    expect(() => extractZip(strToU8('definitely not a zip file'))).toThrow(BundleSafetyError);
  });

  it('validates entry paths', () => {
    expect(checkEntryPath('a\\b/./c.png')).toBe('a/b/c.png');
    expect(() => checkEntryPath('a/\0.png')).toThrow(/NUL/);
  });

  it('strips a single shared top-level folder', () => {
    expect(['P/a.png', 'P/x/b.png'].map(stripCommonRoot(['P/a.png', 'P/x/b.png']))).toEqual(['a.png', 'x/b.png']);
    expect(['a.png', 'P/b.png'].map(stripCommonRoot(['a.png', 'P/b.png']))).toEqual(['a.png', 'P/b.png']);
  });
});

describe('readFolderBundle', () => {
  let dir = '';
  afterEach(() => removeTempDir(dir));

  it('reads an extracted folder with the same filters', () => {
    dir = makeTempDir();
    writeFile(join(dir, 'Pack', 'Trees.png'), makePng(16, 16));
    writeFile(join(dir, 'Pack', 'credits.txt'), 'thanks');
    writeFile(join(dir, 'Pack', 'preview.jpg'), JPEG_BYTES);
    const b = readFolderBundle(join(dir, 'Pack'));
    expect(b.files.map((f) => f.path)).toEqual(['Trees.png', 'credits.txt']);
    expect(b.ignored).toEqual({ '.jpg': 1 });
    expect(() => readFolderBundle(join(dir, 'Pack'), { maxEntries: 1, maxTotalBytes: 1e9 })).toThrow(BundleSafetyError);
  });
});
