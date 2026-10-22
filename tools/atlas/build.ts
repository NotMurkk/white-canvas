// Builds one extruded texture atlas per theme from the packs it references (after inheritance and
// fallbacks). Autotiles are expanded to all 48 patterns per frame (Essentials' AutotileExpander),
// 16 px packs are scaled x2 nearest-neighbour, and every tile and stamp is extruded by 1 px (margin 1,
// spacing 2) so Phaser never samples a neighbour at fractional camera positions. Packs are looked up
// in assets/packs/ (committed) and then assets/raw/ (git-ignored downloads).
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { PNG } from 'pngjs';
import { cropTile, expandAutotile, type RgbaImage } from '@tdmm/autotile';
import { AtlasManifest, KindRegistry, PackManifest, TerrainTypes, ThemeDoc, parseAssetKey, resolveTheme, themeChain, type ResolvedTheme } from '@tdmm/map-format';

const TILE = 32;
const MARGIN = 1;
const SPACING = 2;
const COLUMNS = 16;
const ATLAS_MAX = 4096;
/** Bump when the packing or the manifest layout changes, so every atlas counts as stale. */
const BUILDER_VERSION = 2;

export interface BuiltAtlas {
  themeId: string;
  manifest: AtlasManifest;
  png: PNG;
}

export function loadThemes(root: URL): Map<string, ThemeDoc> {
  const dir = new URL('themes/', root);
  const themes = new Map<string, ThemeDoc>();
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.theme.json')).sort()) {
    const t = ThemeDoc.parse(JSON.parse(readFileSync(new URL(f, dir), 'utf8')));
    if (`${t.id}.theme.json` !== f) throw new Error(`themes/${f} has id "${t.id}"; the file must be named ${t.id}.theme.json`);
    themes.set(t.id, t);
  }
  return themes;
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

const numbers = (s: string, n: number) => {
  const parts = s.split(',').map(Number);
  return parts.length === n && parts.every((v) => Number.isInteger(v) && v >= 0) ? parts : null;
};

/** Pack lookup with caching; knows which keys are usable without decoding images. */
class Packs {
  private readonly root: URL;
  private readonly cache = new Map<string, { dir: URL; manifest: PackManifest; images: Map<string, RgbaImage> } | null>();

  constructor(root: URL) {
    this.root = root;
  }

  get(packId: string) {
    if (!this.cache.has(packId)) {
      const dir = ['assets/packs/', 'assets/raw/'].map((b) => new URL(`${b}${packId}/`, this.root)).find((d) => existsSync(new URL('pack.json', d)));
      this.cache.set(packId, dir ? { dir, manifest: PackManifest.parse(JSON.parse(readFileSync(new URL('pack.json', dir), 'utf8'))), images: new Map() } : null);
    }
    return this.cache.get(packId) ?? null;
  }

  /** A key is available if its pack is present and the asset is the kind the key syntax asks for. */
  available = (key: string): boolean => {
    let k;
    try {
      k = parseAssetKey(key);
    } catch {
      return false;
    }
    const asset = this.get(k.packId)?.manifest.assets[k.assetName];
    if (!asset) return false;
    if (k.sep === '') return asset.kind === 'autotile';
    if (asset.kind !== 'tileset') return false;
    return k.sep === ':' ? !!(asset.tiles[k.part!] ?? numbers(k.part!, 2)) : !!(asset.regions[k.part!] ?? numbers(k.part!, 4));
  };

  image(packId: string, assetName: string) {
    const p = this.get(packId)!;
    const asset = p.manifest.assets[assetName]!;
    let img = p.images.get(assetName);
    const url = new URL(asset.file, p.dir);
    if (!img) {
      const png = PNG.sync.read(readFileSync(url));
      img = scaleNearest({ width: png.width, height: png.height, data: new Uint8Array(png.data.buffer, png.data.byteOffset, png.data.length) }, p.manifest.format.scale);
      p.images.set(assetName, img);
    }
    return { asset, img, file: url.href.slice(this.root.href.length), url };
  }
}

export function buildAll(root: URL): BuiltAtlas[] {
  const themes = loadThemes(root);
  const kindsText = readFileSync(new URL('content/kinds.json', root), 'utf8');
  const kinds = KindRegistry.parse(JSON.parse(kindsText));
  const terrainKinds = Object.keys(TerrainTypes.parse(JSON.parse(readFileSync(new URL('content/terrain-types.json', root), 'utf8')))).sort();
  const packs = new Packs(root);
  const atlasOwners = new Map<string, string>();
  const built: BuiltAtlas[] = [];
  for (const [themeId, theme] of themes) {
    const owner = atlasOwners.get(theme.atlas);
    if (owner) throw new Error(`themes "${owner}" and "${themeId}" both use atlas "${theme.atlas}"; each theme gets its own atlas`);
    atlasOwners.set(theme.atlas, themeId);
    const resolved = resolveTheme(themes, themeId, packs.available, terrainKinds, Object.keys(kinds).sort());
    built.push(buildOne(root, theme.atlas, resolved, themeChain(themes, themeId), kindsText, kinds, packs));
  }
  return built;
}

function buildOne(root: URL, atlasId: string, theme: ResolvedTheme, chain: ThemeDoc[], kindsText: string, kinds: KindRegistry, packs: Packs): BuiltAtlas {
  const tiles: Uint8Array[] = [];
  const stampImages: { key: string; img: RgbaImage }[] = [];
  const sources: AtlasManifest['sources'] = [];
  const tileIndex: Record<string, number> = {};
  const autotiles: AtlasManifest['autotiles'] = {};
  const stampKinds = new Map<string, string[]>();
  for (const [kind, key] of Object.entries(theme.objects)) stampKinds.set(key, [...(stampKinds.get(key) ?? []), kind]);
  const keys = new Set<string>([theme.baseFill, ...Object.values(theme.terrain).flatMap((t) => ('autotile' in t ? [t.autotile] : [])), ...Object.values(theme.objects)]);
  const hash = createHash('sha256').update(`builder:${BUILDER_VERSION}\n`).update(JSON.stringify(chain)).update(kindsText);

  for (const key of [...keys].sort()) {
    const { packId, assetName, sep, part } = parseAssetKey(key);
    const { asset, img, file, url } = packs.image(packId, assetName);
    if (!sources.some((s) => s.file === file)) {
      sources.push({ key: `${packId}/${assetName}`, file, pack: packId });
      hash.update(file).update(readFileSync(url)).update(JSON.stringify(packs.get(packId)!.manifest.assets[assetName]));
    }
    if (sep === '') {
      if (asset.kind !== 'autotile') throw new Error(`"${key}" is a tileset; use pack/asset:tile or pack/asset@region`);
      const expanded = expandAutotile(img, TILE);
      const frames = expanded.format.frames;
      autotiles[key] = { start: tiles.length, patterns: expanded.patterns, frames, frameMs: asset.frameMs };
      for (let f = 0; f < frames; f++) for (let p = 0; p < expanded.patterns; p++) tiles.push(expanded.tile(p, f));
      continue;
    }
    if (asset.kind !== 'tileset') throw new Error(`"${key}": ${sep}${part} only applies to tileset assets`);
    if (sep === ':') {
      const pos = asset.tiles[part!] ?? numbers(part!, 2)!;
      tileIndex[key] = tiles.length;
      tiles.push(cropTile(img, pos[0]! * TILE, pos[1]! * TILE, TILE));
    } else {
      const [c, row, w, h] = (asset.regions[part!] ?? numbers(part!, 4)!) as [number, number, number, number];
      for (const kindId of stampKinds.get(key) ?? []) {
        const k = kinds[kindId]!;
        if (k.footprint[0]!.length !== w || k.footprint.length !== h) {
          throw new Error(`"${key}" is ${w}x${h} tiles but kind "${kindId}" has a ${k.footprint[0]!.length}x${k.footprint.length} footprint; themes must keep footprints identical`);
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
  const stamps: AtlasManifest['stamps'] = {};
  const placed: { img: RgbaImage; x: number; y: number }[] = [];
  for (const s of [...stampImages].sort((a, b) => b.img.height - a.img.height || (a.key < b.key ? -1 : 1))) {
    if (shelfX + s.img.width + MARGIN > width) {
      shelfY += shelfH + SPACING;
      shelfX = MARGIN;
      shelfH = 0;
    }
    placed.push({ img: s.img, x: shelfX, y: shelfY });
    stamps[s.key] = { x: shelfX, y: shelfY, w: s.img.width / TILE, h: s.img.height / TILE };
    shelfX += s.img.width + SPACING;
    shelfH = Math.max(shelfH, s.img.height);
  }
  const height = Math.max(shelfY + shelfH, MARGIN + tileRows * (TILE + SPACING) - SPACING) + MARGIN;
  if (height > ATLAS_MAX) throw new Error(`atlas "${atlasId}" would be ${width}x${height}; split the theme (max ${ATLAS_MAX})`);

  const png = new PNG({ width, height });
  png.data.fill(0);
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
  tiles.forEach((tile, i) => blitExtruded({ width: TILE, height: TILE, data: tile }, MARGIN + (i % COLUMNS) * (TILE + SPACING), MARGIN + Math.floor(i / COLUMNS) * (TILE + SPACING)));
  for (const p of placed) blitExtruded(p.img, p.x, p.y);

  const manifest = AtlasManifest.parse({
    format: 'ptd-atlas',
    schemaVersion: 1,
    id: atlasId,
    image: `${atlasId}.png`,
    imageWidth: width,
    imageHeight: height,
    tileSize: TILE,
    margin: MARGIN,
    spacing: SPACING,
    columns: COLUMNS,
    tileCount: tiles.length,
    tiles: tileIndex,
    autotiles,
    stamps,
    sources,
    theme,
    sourceHash: hash.digest('hex').slice(0, 24),
  });
  return { themeId: theme.id, manifest, png };
}

export const printManifest = (m: AtlasManifest) => `${JSON.stringify(m, null, 2)}\n`;
