// Builds one extruded texture atlas per theme from the packs it references:
//   themes/<id>.theme.json  ->  assets/atlases/<atlas>.png + <atlas>.atlas.json
// Autotiles are expanded to all 48 patterns per frame (Essentials' AutotileExpander), 16 px packs are
// scaled x2 nearest-neighbour, and every tile and stamp is extruded by 1 px (margin 1, spacing 2) so
// Phaser never samples a neighbour at fractional camera positions. Packs are looked up in
// assets/packs/ (committed) and then assets/raw/ (git-ignored downloads).
// Run: npm run art:atlas
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { cropTile, expandAutotile, type RgbaImage } from '@tdmm/autotile';
import { AtlasManifest, KindRegistry, PackManifest, ThemeDoc, parseAssetKey } from '@tdmm/map-format';

const ROOT = new URL('../', import.meta.url);
const TILE = 32;
const MARGIN = 1;
const SPACING = 2;
const COLUMNS = 16;
const ATLAS_MAX = 4096;

const readJson = (url: URL): unknown => JSON.parse(readFileSync(url, 'utf8'));

function loadPng(url: URL): RgbaImage {
  const png = PNG.sync.read(readFileSync(url));
  return { width: png.width, height: png.height, data: new Uint8Array(png.data.buffer, png.data.byteOffset, png.data.length) };
}

function scaleNearest(src: RgbaImage, factor: number): RgbaImage {
  if (factor === 1) return src;
  const width = src.width * factor;
  const height = src.height * factor;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const from = (Math.floor(y / factor) * src.width + Math.floor(x / factor)) * 4;
      data.set(src.data.subarray(from, from + 4), (y * width + x) * 4);
    }
  }
  return { width, height, data };
}

function crop(src: RgbaImage, x: number, y: number, w: number, h: number): RgbaImage {
  if (x + w > src.width || y + h > src.height) throw new Error(`region ${x},${y} ${w}x${h} is outside the ${src.width}x${src.height} image`);
  const data = new Uint8Array(w * h * 4);
  for (let row = 0; row < h; row++) {
    const from = ((y + row) * src.width + x) * 4;
    data.set(src.data.subarray(from, from + w * 4), row * w * 4);
  }
  return { width: w, height: h, data };
}

const packs = new Map<string, { dir: URL; manifest: PackManifest; images: Map<string, RgbaImage> }>();
function pack(packId: string) {
  let entry = packs.get(packId);
  if (!entry) {
    const dir = ['assets/packs/', 'assets/raw/']
      .map((base) => new URL(`${base}${packId}/`, ROOT))
      .find((d) => existsSync(new URL('pack.json', d)));
    if (!dir) throw new Error(`pack "${packId}" not found in assets/packs/ or assets/raw/`);
    entry = { dir, manifest: PackManifest.parse(readJson(new URL('pack.json', dir))), images: new Map() };
    packs.set(packId, entry);
  }
  return entry;
}

function packImage(packId: string, assetName: string) {
  const p = pack(packId);
  const asset = p.manifest.assets[assetName];
  if (!asset) throw new Error(`pack "${packId}" has no asset "${assetName}"`);
  let img = p.images.get(assetName);
  if (!img) {
    img = scaleNearest(loadPng(new URL(asset.file, p.dir)), p.manifest.format.scale);
    p.images.set(assetName, img);
  }
  const file = new URL(asset.file, p.dir).href.slice(ROOT.href.length);
  return { asset, img, file };
}

const numbers = (s: string, n: number) => {
  const parts = s.split(',').map(Number);
  return parts.length === n && parts.every((v) => Number.isInteger(v) && v >= 0) ? parts : null;
};

const kinds = KindRegistry.parse(readJson(new URL('content/kinds.json', ROOT)));

function buildAtlas(atlasId: string, themes: ThemeDoc[]) {
  const tiles: Uint8Array[] = [];
  const stampImages: { key: string; img: RgbaImage }[] = [];
  const manifest: AtlasManifest = {
    format: 'ptd-atlas',
    schemaVersion: 1,
    id: atlasId,
    image: `${atlasId}.png`,
    imageWidth: 0,
    imageHeight: 0,
    tileSize: TILE,
    margin: MARGIN,
    spacing: SPACING,
    columns: COLUMNS,
    tileCount: 0,
    tiles: {},
    autotiles: {},
    stamps: {},
    sources: [],
  };
  const keys = new Set<string>();
  const stampKinds = new Map<string, string[]>();
  for (const theme of themes) {
    keys.add(theme.baseFill);
    for (const t of Object.values(theme.terrain)) if ('autotile' in t) keys.add(t.autotile);
    for (const [kind, key] of Object.entries(theme.objects)) {
      keys.add(key);
      stampKinds.set(key, [...(stampKinds.get(key) ?? []), kind]);
      if (!kinds[kind]) throw new Error(`theme "${theme.id}" maps unknown kind "${kind}" (not in content/kinds.json)`);
    }
  }

  for (const key of [...keys].sort()) {
    const { packId, assetName, sep, part } = parseAssetKey(key);
    const { asset, img, file } = packImage(packId, assetName);
    if (!manifest.sources.some((s) => s.file === file)) manifest.sources.push({ key: `${packId}/${assetName}`, file, pack: packId });
    if (sep === '') {
      if (asset.kind !== 'autotile') throw new Error(`"${key}" is a tileset; use pack/asset:tile or pack/asset@region`);
      const expanded = expandAutotile(img, TILE);
      const frames = expanded.format.frames;
      manifest.autotiles[key] = { start: tiles.length, patterns: expanded.patterns, frames, frameMs: asset.frameMs };
      for (let f = 0; f < frames; f++) for (let p = 0; p < expanded.patterns; p++) tiles.push(expanded.tile(p, f));
      continue;
    }
    if (asset.kind !== 'tileset') throw new Error(`"${key}": ${sep}${part} only applies to tileset assets`);
    if (sep === ':') {
      const pos = asset.tiles[part!] ?? numbers(part!, 2);
      if (!pos) throw new Error(`"${key}": no tile "${part}" in ${file} (name it in pack.json or use col,row)`);
      manifest.tiles[key] = tiles.length;
      tiles.push(cropTile(img, pos[0]! * TILE, pos[1]! * TILE, TILE));
    } else {
      const r = asset.regions[part!] ?? numbers(part!, 4);
      if (!r) throw new Error(`"${key}": no region "${part}" in ${file} (name it in pack.json or use col,row,w,h)`);
      const [c, row, w, h] = r as [number, number, number, number];
      for (const kindId of stampKinds.get(key) ?? []) {
        const k = kinds[kindId]!;
        if (k.footprint[0]!.length !== w || k.footprint.length !== h) {
          throw new Error(`"${key}" is ${w}x${h} tiles but kind "${kindId}" has a ${k.footprint[0]!.length}x${k.footprint.length} footprint`);
        }
      }
      stampImages.push({ key, img: crop(img, c * TILE, row * TILE, w * TILE, h * TILE) });
    }
  }

  // Tiles fill a 16-column grid; stamps are shelf-packed below it with the same extrusion.
  const width = MARGIN * 2 + COLUMNS * TILE + (COLUMNS - 1) * SPACING;
  const tileRows = Math.ceil(tiles.length / COLUMNS);
  let shelfY = MARGIN + tileRows * (TILE + SPACING);
  let shelfX = MARGIN;
  let shelfH = 0;
  const placed: { key: string; img: RgbaImage; x: number; y: number }[] = [];
  for (const s of [...stampImages].sort((a, b) => b.img.height - a.img.height || (a.key < b.key ? -1 : 1))) {
    if (shelfX + s.img.width + MARGIN > width) {
      shelfY += shelfH + SPACING;
      shelfX = MARGIN;
      shelfH = 0;
    }
    placed.push({ ...s, x: shelfX, y: shelfY });
    manifest.stamps[s.key] = { x: shelfX, y: shelfY, w: s.img.width / TILE, h: s.img.height / TILE };
    shelfX += s.img.width + SPACING;
    shelfH = Math.max(shelfH, s.img.height);
  }
  const height = Math.max(shelfY + shelfH, MARGIN + tileRows * (TILE + SPACING) - SPACING) + MARGIN;
  if (height > ATLAS_MAX) throw new Error(`atlas "${atlasId}" would be ${width}x${height}; split the theme (max ${ATLAS_MAX})`);

  const png = new PNG({ width, height });
  png.data.fill(0);
  /** Draws an image with a 1 px copy of its own edge pixels all around. */
  const blitExtruded = (src: RgbaImage, ox: number, oy: number) => {
    for (let y = -1; y <= src.height; y++) {
      for (let x = -1; x <= src.width; x++) {
        const sx = Math.min(Math.max(x, 0), src.width - 1);
        const sy = Math.min(Math.max(y, 0), src.height - 1);
        const si = (sy * src.width + sx) * 4;
        png.data.set(src.data.subarray(si, si + 4), ((oy + y) * width + ox + x) * 4);
      }
    }
  };
  tiles.forEach((tile, i) =>
    blitExtruded({ width: TILE, height: TILE, data: tile }, MARGIN + (i % COLUMNS) * (TILE + SPACING), MARGIN + Math.floor(i / COLUMNS) * (TILE + SPACING)),
  );
  for (const p of placed) blitExtruded(p.img, p.x, p.y);
  manifest.imageWidth = width;
  manifest.imageHeight = height;
  manifest.tileCount = tiles.length;

  const outDir = new URL('assets/atlases/', ROOT);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(new URL(`${atlasId}.png`, outDir), PNG.sync.write(png));
  writeFileSync(new URL(`${atlasId}.atlas.json`, outDir), `${JSON.stringify(AtlasManifest.parse(manifest), null, 2)}\n`);
  console.log(`atlas "${atlasId}": ${tiles.length} tiles + ${placed.length} stamps, ${width}x${height} -> assets/atlases/${atlasId}.png`);
}

const themeDir = new URL('themes/', ROOT);
const themes = readdirSync(themeDir)
  .filter((f) => f.endsWith('.theme.json'))
  .sort()
  .map((f) => ThemeDoc.parse(readJson(new URL(f, themeDir))));
for (const [atlasId, group] of Map.groupBy(themes, (t) => t.atlas)) buildAtlas(atlasId, group);
