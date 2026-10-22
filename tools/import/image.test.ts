import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { detectAsset, detectDoubling, frameMsFromName, inspectPng, rejectionForExtension, sniffImageType } from './image.ts';
import { JPEG_BYTES, makePng } from './test-fixtures.ts';

const decode = (bytes: Uint8Array) => {
  const png = PNG.sync.read(Buffer.from(bytes));
  return { width: png.width, height: png.height, data: new Uint8Array(png.data) };
};

describe('detectAsset: autotiles and animated strips', () => {
  it.each([
    [96, 128, 32, 1],
    [384, 128, 32, 4],
    [48, 64, 16, 1],
    [192, 64, 16, 4],
  ])('%ix%i is an RMXP autotile at %i px with %i frame(s)', (w, h, px, frames) => {
    expect(detectAsset(w, h, 'water.png')).toMatchObject({ kind: 'autotile', layout: 'rmxp-autotile', tilePx: px, frames, frameMs: 250 });
  });

  it.each([
    [128, 32, 32, 4],
    [32, 32, 32, 1],
    [64, 16, 16, 4],
    [16, 16, 16, 1],
  ])('%ix%i is an animated single tile at %i px with %i frame(s)', (w, h, px, frames) => {
    expect(detectAsset(w, h, 'flower.png')).toMatchObject({ kind: 'autotile', layout: 'single-animated', tilePx: px, frames });
  });

  it('reads the Essentials [x] speed suffix (x/20 s per frame)', () => {
    expect(frameMsFromName('Sea[3].png')).toBe(150);
    expect(frameMsFromName('Sea.png')).toBe(250);
    expect(detectAsset(384, 128, 'Water[5].png').frameMs).toBe(250);
    expect(detectAsset(144, 64, 'Sea[2].png')).toMatchObject({ kind: 'autotile', tilePx: 16, frames: 3, frameMs: 100 });
  });
});

describe('detectAsset: tilesets', () => {
  it('width 256 is a 32 px RMXP sheet; width 128 the same layout at 16 px', () => {
    expect(detectAsset(256, 4096, 'Outside.png')).toMatchObject({ kind: 'tileset', layout: 'rmxp-sheet', tilePx: 32, notes: [] });
    expect(detectAsset(128, 3600, 'Mega.png')).toMatchObject({ kind: 'tileset', layout: 'rmxp-sheet', tilePx: 16, notes: [] });
    // irregular height gets a note
    expect(detectAsset(256, 1000, 'odd.png').notes.join(' ')).toMatch(/not a multiple of 32/);
  });

  it('guesses other sizes from pixel doubling and marks the guess', () => {
    const doubled = detectAsset(512, 512, 'sheet.png', 'doubled');
    expect(doubled).toMatchObject({ kind: 'tileset', layout: 'grid', tilePx: 32 });
    expect(doubled.notes.join(' ')).toMatch(/guess/);
    expect(detectAsset(512, 512, 'sheet.png', 'native')).toMatchObject({ tilePx: 16, layout: 'grid' });
    expect(detectAsset(480, 272, 'sheet.png')).toMatchObject({ tilePx: 16, layout: 'grid' }); // fits 16 only
    expect(detectAsset(1728, 1776, 'master.png', 'doubled')).toMatchObject({ tilePx: 32, layout: 'loose' });
  });

  it('warns when a dimension is not a multiple of 16 (a resized preview)', () => {
    const d = detectAsset(126, 3577, 'preview.png');
    expect(d.kind).toBe('tileset');
    expect(d.layout).toBe('loose');
    expect(d.warnings.join(' ')).toMatch(/not a multiple of 16: looks like a resized preview/);
    expect(d.notes.join(' ')).toMatch(/loose\/irregular/);
  });

  it('flags Essentials expanded autotiles', () => {
    expect(detectAsset(96, 192, 'x.png').warnings.join(' ')).toMatch(/expanded/);
  });
});

describe('detectDoubling', () => {
  it('tells 2x upscaled art from native art, and is unsure about flat fills', () => {
    expect(detectDoubling(decode(makePng(64, 64, { doubled: true, seed: 3 })))).toBe('doubled');
    expect(detectDoubling(decode(makePng(64, 64, { seed: 3 })))).toBe('native');
    expect(detectDoubling(decode(makePng(64, 64, { flat: true })))).toBe('unknown');
  });
});

describe('inspectPng and rejections', () => {
  it('decodes a PNG and hashes it', () => {
    const bytes = makePng(48, 64, { seed: 9 });
    const info = inspectPng(bytes);
    expect(info).toMatchObject({ width: 48, height: 64, bytes: bytes.byteLength });
    expect(info.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejects JPEGs by extension and by content', () => {
    expect(rejectionForExtension('.jpg')).toBe('JPEG previews are resized/compressed; download the original PNG');
    expect(rejectionForExtension('.JPEG')).toBe('JPEG previews are resized/compressed; download the original PNG');
    expect(rejectionForExtension('.webp')).toMatch(/download the original PNG/);
    expect(rejectionForExtension('.gif')).toMatch(/download the original PNG/);
    expect(rejectionForExtension('.png')).toBeNull();
    expect(sniffImageType(JPEG_BYTES)).toBe('jpeg');
    expect(() => inspectPng(JPEG_BYTES)).toThrow(/JPEG previews are resized\/compressed; download the original PNG/);
  });

  it('rejects truncated downloads and HTML error pages saved as .png', () => {
    const bytes = makePng(64, 64, { seed: 2 });
    expect(() => inspectPng(bytes.subarray(0, bytes.byteLength - 40))).toThrow(/truncated or corrupt/);
    expect(() => inspectPng(new TextEncoder().encode('<!DOCTYPE html><html>'))).toThrow(/not a PNG/);
  });
});

describe('trailing bytes after IEND', () => {
  it('decodes PNGs that have junk appended after the IEND chunk', async () => {
    const { PNG } = await import('pngjs');
    const { inspectPng, trimAfterIend } = await import('./image.ts');
    const png = new PNG({ width: 16, height: 16 });
    png.data.fill(255);
    const clean = new Uint8Array(PNG.sync.write(png));
    const dirty = new Uint8Array([...clean, 0x0a, 0x00, 0x13, 0x37]);
    expect(trimAfterIend(dirty).length).toBe(clean.length);
    expect(inspectPng(dirty).width).toBe(16);
  });
});
