// Lists the separate objects on a pack's tileset image, with a numbered preview sheet, so you can
// name them as stamp regions in pack.json ("regions": { "tree_round": [col, row, w, h] }).
//   npm run packs:objects -- <pack-id> <asset> [--out preview.png] [--all]
// Without --all only standalone objects (transparent around the edges) are listed.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { PackManifest } from '@tdmm/map-format';
import { trimAfterIend } from './import/image.ts';
import { findObjects } from './import/objects.ts';

const ROOT = new URL('../', import.meta.url);
const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args.splice(i, 2)[1] : undefined;
};
const out = flag('--out');
const all = args.includes('--all');
const [packId, assetName] = args.filter((a) => !a.startsWith('--'));
if (!packId || !assetName) {
  console.log('usage: npm run packs:objects -- <pack-id> <asset> [--out preview.png] [--all]');
  process.exit(1);
}
const dir = ['assets/packs/', 'assets/raw/'].map((b) => new URL(`${b}${packId}/`, ROOT)).find((d) => existsSync(new URL('pack.json', d)));
if (!dir) throw new Error(`no pack "${packId}"`);
const pack = PackManifest.parse(JSON.parse(readFileSync(new URL('pack.json', dir), 'utf8')));
const asset = pack.assets[assetName];
if (!asset || asset.kind !== 'tileset') throw new Error(`"${assetName}" is not a tileset asset of ${packId}`);
const png = PNG.sync.read(Buffer.from(trimAfterIend(readFileSync(new URL(asset.file, dir)))));
const tile = pack.format.native_tile_px;
const img = { width: png.width, height: png.height, data: new Uint8Array(png.data.buffer, png.data.byteOffset, png.data.length) };
const objects = findObjects(img, tile).filter((o) => all || o.standalone);

console.log(`${packId}/${assetName}: ${png.width}x${png.height}, ${tile} px tiles, ${objects.length} ${all ? '' : 'standalone '}objects`);
objects.forEach((o, i) => console.log(`${String(i).padStart(3)}  [${o.x}, ${o.y}, ${o.w}, ${o.h}]  ${o.w}x${o.h}  fill ${Math.round(o.fill * 100)}%`));

if (out) {
  // Preview: each object at 3x on a checkerboard, in a grid; order matches the list above.
  const S = 3;
  const cell = Math.max(...objects.map((o) => Math.max(o.w, o.h)), 1) * tile * S + 8;
  const cols = Math.max(1, Math.min(8, objects.length));
  const sheet = new PNG({ width: cols * cell, height: Math.ceil(objects.length / cols) * cell || cell });
  for (let i = 0; i < sheet.data.length; i += 4) sheet.data.set([36, 40, 48, 255], i);
  objects.forEach((o, n) => {
    const ox = (n % cols) * cell + 4;
    const oy = Math.floor(n / cols) * cell + 4;
    for (let y = 0; y < o.h * tile * S; y++) {
      for (let x = 0; x < o.w * tile * S; x++) {
        const si = ((o.y * tile + Math.floor(y / S)) * png.width + o.x * tile + Math.floor(x / S)) * 4;
        const a = png.data[si + 3]! / 255;
        const bg = ((x >> 3) + (y >> 3)) % 2 ? 100 : 80;
        const di = ((oy + y) * sheet.width + ox + x) * 4;
        sheet.data.set([0, 1, 2].map((k) => Math.round(png.data[si + k]! * a + bg * (1 - a))).concat(255), di);
      }
    }
    // a tick per object index along the top-left: n red dots in rows of 10
    for (let d = 0; d < n; d++) sheet.data.set([255, 70, 70, 255], ((oy + 1 + Math.floor(d / 10) * 3) * sheet.width + ox + 1 + (d % 10) * 3) * 4);
  });
  writeFileSync(out, PNG.sync.write(sheet));
  console.log(`preview: ${out} (objects in list order, ${cols} per row)`);
}
