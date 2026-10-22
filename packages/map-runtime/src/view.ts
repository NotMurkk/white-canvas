import Phaser from 'phaser';
import { kindIndex, terrainAt, type Exit, type ObjectInstance, type Spawn, type TerrainGrid } from '@tdmm/map-format';
import { atlasTextureKey } from './load.ts';
import { drawMarkers } from './markers.ts';
import { DEPTH, ObjectLayer } from './objects.ts';
import { buildTiledJson, overlayGid, overlayLayers, type OverlayLayer, type ThemeAssets } from './tiled.ts';

/** What the view draws. The editor passes its live, mutable state; the game a decoded map. */
export interface RenderState {
  terrain: TerrainGrid;
  objects: ObjectInstance[];
  spawns: Spawn[];
  exits: Exit[];
}

let nextViewId = 0;

/**
 * A map rendered through Phaser's Tiled pipeline plus y-sorted stamps and markers. Used unchanged
 * by the game and the editor, so what the editor shows is what the game draws.
 */
export class MapView {
  readonly state: RenderState;
  readonly assets: ThemeAssets;
  readonly tilemap: Phaser.Tilemaps.Tilemap;
  readonly layers = new Map<string, Phaser.Tilemaps.TilemapLayer>();
  readonly objects: ObjectLayer;
  private readonly markers: Phaser.GameObjects.Graphics;
  private readonly overlays: OverlayLayer[];
  private readonly cacheKey: string;
  private readonly scene: Phaser.Scene;

  constructor(scene: Phaser.Scene, state: RenderState, assets: ThemeAssets) {
    this.scene = scene;
    this.state = state;
    this.assets = assets;
    this.overlays = overlayLayers(assets);
    this.cacheKey = `tdmm-map-${nextViewId++}`;

    const textureKey = atlasTextureKey(assets.atlas.id);
    const json = buildTiledJson(state.terrain, assets, textureKey);
    scene.cache.tilemap.add(this.cacheKey, { format: Phaser.Tilemaps.Formats.TILED_JSON, data: json });
    this.tilemap = scene.make.tilemap({ key: this.cacheKey });
    const { tileSize, margin, spacing } = assets.atlas;
    const tileset = this.tilemap.addTilesetImage(textureKey, textureKey, tileSize, tileSize, margin, spacing);
    if (!tileset) throw new Error(`could not attach atlas texture "${textureKey}"`);
    json.layers.forEach(({ name }, i) => {
      const layer = this.tilemap.createLayer(name, tileset, 0, 0) as Phaser.Tilemaps.TilemapLayer | null;
      if (!layer) throw new Error(`could not create layer "${name}"`);
      this.layers.set(name, layer.setDepth(i));
    });
    // The scene's display list destroys the layers on shutdown; only the cache entry is ours to drop.
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.cache.tilemap.remove(this.cacheKey));

    this.objects = new ObjectLayer(scene, assets);
    this.objects.sync(state.objects);
    this.markers = scene.add.graphics().setDepth(DEPTH.markers);
    this.syncMarkers();
  }

  get grid() {
    return this.state.terrain;
  }

  get tileSize() {
    return this.assets.atlas.tileSize;
  }

  get widthInPixels() {
    return this.tilemap.widthInPixels;
  }

  get heightInPixels() {
    return this.tilemap.heightInPixels;
  }

  terrainAt(x: number, y: number) {
    return terrainAt(this.grid, x, y);
  }

  /** Sets one cell's logical terrain and re-shapes it and its 8 neighbours. Returns false if nothing changed. */
  setTerrain(x: number, y: number, terrain: string): boolean {
    const before = this.terrainAt(x, y);
    if (before === undefined || before === terrain) return false;
    this.grid.cells[y * this.grid.width + x] = kindIndex(this.grid, terrain);
    this.refreshTerrain(x, y, [before, terrain]);
    return true;
  }

  /** Re-resolves autotiles around (x, y) for the given terrains (after an external grid change). */
  refreshTerrain(x: number, y: number, terrains: string[]) {
    for (const overlay of this.overlays) {
      if (!terrains.includes(overlay.terrain)) continue;
      const layer = this.layers.get(overlay.name)!;
      for (let ny = y - 1; ny <= y + 1; ny++) {
        for (let nx = x - 1; nx <= x + 1; nx++) {
          if (nx < 0 || ny < 0 || nx >= this.grid.width || ny >= this.grid.height) continue;
          const gid = overlayGid(this.grid, overlay, nx, ny);
          if (gid === 0) layer.removeTileAt(nx, ny);
          else layer.putTileAt(gid, nx, ny);
        }
      }
    }
  }

  /** Re-resolves every overlay around the given cell indices (after bulk edits such as undo). */
  refreshCells(indices: Iterable<number>) {
    const { width, height } = this.grid;
    const dirty = new Set<number>();
    for (const i of indices) {
      const x = i % width;
      const y = Math.floor(i / width);
      for (let ny = Math.max(0, y - 1); ny <= Math.min(height - 1, y + 1); ny++) {
        for (let nx = Math.max(0, x - 1); nx <= Math.min(width - 1, x + 1); nx++) dirty.add(ny * width + nx);
      }
    }
    for (const overlay of this.overlays) {
      const layer = this.layers.get(overlay.name)!;
      for (const i of dirty) {
        const x = i % width;
        const y = Math.floor(i / width);
        const gid = overlayGid(this.grid, overlay, x, y);
        if (gid === 0) {
          if (layer.getTileAt(x, y)) layer.removeTileAt(x, y);
        } else if (layer.getTileAt(x, y)?.index !== gid) layer.putTileAt(gid, x, y);
      }
    }
  }

  syncObjects() {
    this.objects.sync(this.state.objects);
  }

  syncMarkers() {
    drawMarkers(this.markers, this.state.spawns, this.state.exits, this.tileSize);
  }

  destroy() {
    this.objects.destroy();
    this.markers.destroy();
    this.tilemap.destroy();
    this.scene.cache.tilemap.remove(this.cacheKey);
  }
}
