// Logical map -> Tiled-shaped JSON, built in memory so Phaser's own Tiled parser (and its native
// tile animation) does the rendering. Pure: no Phaser import, so it can be unit-tested and reused.
import { resolvePattern } from '@tdmm/autotile';
import {
  terrainAt,
  type AtlasManifest,
  type EnemyRegistry,
  type KindRegistry,
  type TerrainGrid,
  type TerrainTypes,
  type ThemeDoc,
  type ZoneTypes,
} from '@tdmm/map-format';

/** Tiled gids start at 1; the atlas is the only tileset, so gid = atlas index + 1. 0 = empty. */
export const FIRST_GID = 1;

/** A theme's art plus the content registries (structurally a @tdmm/rules Registries). */
export interface ThemeAssets {
  theme: ThemeDoc;
  atlas: AtlasManifest;
  terrainTypes: TerrainTypes;
  kinds: KindRegistry;
  enemies: EnemyRegistry;
  zones: ZoneTypes;
}

export interface OverlayLayer {
  name: string;
  terrain: string;
  autotile: AtlasManifest['autotiles'][string];
}

/** Base layer first, then one autotile overlay per non-base terrain, ordered by drawOrder. */
export function overlayLayers({ theme, atlas, terrainTypes }: ThemeAssets): OverlayLayer[] {
  const layers: OverlayLayer[] = [];
  for (const [terrain, visual] of Object.entries(theme.terrain)) {
    if (!('autotile' in visual)) continue;
    const autotile = atlas.autotiles[visual.autotile];
    if (!autotile) throw new Error(`theme "${theme.id}": autotile "${visual.autotile}" is not in atlas "${atlas.id}"; rebuild atlases`);
    layers.push({ name: `terrain:${terrain}`, terrain, autotile });
  }
  const order = (t: string) => terrainTypes[t]?.drawOrder ?? 0;
  return layers.sort((a, b) => order(a.terrain) - order(b.terrain) || (a.terrain < b.terrain ? -1 : 1));
}

export function baseFillGid({ theme, atlas }: ThemeAssets): number {
  const index = atlas.tiles[theme.baseFill];
  if (index === undefined) throw new Error(`theme "${theme.id}": base fill "${theme.baseFill}" is not in atlas "${atlas.id}"`);
  return index + FIRST_GID;
}

/** gid for one overlay cell, or 0 when the cell isn't that terrain. */
export function overlayGid(grid: TerrainGrid, layer: OverlayLayer, x: number, y: number): number {
  const pattern = resolvePattern(x, y, grid.width, grid.height, (nx, ny) => terrainAt(grid, nx, ny) === layer.terrain);
  return pattern < 0 ? 0 : layer.autotile.start + pattern + FIRST_GID;
}

export function buildTiledJson(grid: TerrainGrid, assets: ThemeAssets, textureName: string) {
  const { atlas } = assets;
  const { width, height } = grid;
  const base = baseFillGid(assets);
  const overlays = overlayLayers(assets);

  const layers = [
    tileLayer(1, 'base', width, height, new Array<number>(width * height).fill(base)),
    ...overlays.map((layer, i) => {
      const data = new Array<number>(width * height);
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data[y * width + x] = overlayGid(grid, layer, x, y);
      return tileLayer(i + 2, layer.name, width, height, data);
    }),
  ];

  // Frame f of pattern p sits at start + f * patterns + p; the layer stores frame 0 and Phaser cycles it.
  const tiles: { id: number; animation: { tileid: number; duration: number }[] }[] = [];
  for (const at of Object.values(atlas.autotiles)) {
    if (at.frames < 2) continue;
    for (let p = 0; p < at.patterns; p++) {
      tiles.push({
        id: at.start + p,
        animation: Array.from({ length: at.frames }, (_, f) => ({ tileid: at.start + f * at.patterns + p, duration: at.frameMs })),
      });
    }
  }

  return {
    type: 'map',
    version: '1.10',
    orientation: 'orthogonal',
    renderorder: 'right-down',
    infinite: false,
    width,
    height,
    tilewidth: atlas.tileSize,
    tileheight: atlas.tileSize,
    nextlayerid: layers.length + 1,
    nextobjectid: 1,
    layers,
    tilesets: [
      {
        firstgid: FIRST_GID,
        name: textureName,
        image: atlas.image,
        imagewidth: atlas.imageWidth,
        imageheight: atlas.imageHeight,
        tilewidth: atlas.tileSize,
        tileheight: atlas.tileSize,
        margin: atlas.margin,
        spacing: atlas.spacing,
        columns: atlas.columns,
        tilecount: atlas.tileCount,
        tiles,
      },
    ],
  };
}

function tileLayer(id: number, name: string, width: number, height: number, data: number[]) {
  return { id, name, type: 'tilelayer', width, height, x: 0, y: 0, opacity: 1, visible: true, data };
}
