import Phaser from 'phaser';
import type { ObjectInstance } from '@tdmm/map-format';
import { atlasTextureKey } from './load.ts';
import type { ThemeAssets } from './tiled.ts';

/**
 * Depth bands shared by game and editor. Objects and units are y-sorted by their baseline pixel,
 * so an enemy above a tree's trunk row walks behind its canopy and one below walks in front.
 */
export const DEPTH = {
  /** Tile layers use 0..(layers - 1). */
  markers: 50,
  ySortBase: 100,
  editorOverlay: 20_000,
  editorCursor: 21_000,
  hud: 30_000,
} as const;

export const ySortDepth = (baselinePx: number) => DEPTH.ySortBase + baselinePx;
const stampFrame = (key: string) => `stamp:${key}`;

/** Draws placed stamps from the theme's atlas; kinds without art fall back to a coloured block. */
export class ObjectLayer {
  private readonly scene: Phaser.Scene;
  private readonly assets: ThemeAssets;
  private readonly sprites = new Map<string, { kind: string; x: number; y: number; go: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle }>();
  private readonly ts: number;
  private readonly textureKey: string;

  constructor(scene: Phaser.Scene, assets: ThemeAssets) {
    this.scene = scene;
    this.assets = assets;
    this.ts = assets.atlas.tileSize;
    this.textureKey = atlasTextureKey(assets.atlas.id);
    const texture = scene.textures.get(this.textureKey);
    for (const [key, r] of Object.entries(assets.atlas.stamps)) {
      if (!texture.has(stampFrame(key))) texture.add(stampFrame(key), 0, r.x, r.y, r.w * this.ts, r.h * this.ts);
    }
  }

  /** Creates, moves and destroys sprites so they match `objects` (diffed by id). */
  sync(objects: readonly ObjectInstance[]) {
    const keep = new Set<string>();
    for (const o of objects) {
      keep.add(o.id);
      const existing = this.sprites.get(o.id);
      if (existing && existing.kind === o.kind && existing.x === o.x && existing.y === o.y) continue;
      existing?.go.destroy();
      const go = this.create(o);
      if (go) this.sprites.set(o.id, { kind: o.kind, x: o.x, y: o.y, go });
      else this.sprites.delete(o.id);
    }
    for (const [id, s] of this.sprites) {
      if (!keep.has(id)) {
        s.go.destroy();
        this.sprites.delete(id);
      }
    }
  }

  /** Brief squash-and-settle on a newly placed object (editor feedback). */
  pop(id: string) {
    const s = this.sprites.get(id);
    if (!s) return;
    const go = s.go;
    go.setScale(1.15, 0.8);
    this.scene.tweens.add({ targets: go, scaleX: 1, scaleY: 1, duration: 220, ease: 'Back.Out' });
  }

  destroy() {
    for (const s of this.sprites.values()) s.go.destroy();
    this.sprites.clear();
  }

  private create(o: ObjectInstance) {
    const kind = this.assets.kinds[o.kind];
    if (!kind) return null;
    const ts = this.ts;
    const w = kind.footprint[0]!.length;
    const h = kind.footprint.length;
    // Positioned by the bottom-centre so the squash animation pivots on the ground.
    const left = (o.x - kind.anchor[0]) * ts;
    const bottom = (o.y - kind.anchor[1] + h) * ts;
    const key = this.assets.theme.objects[o.kind];
    const go =
      key && this.assets.atlas.stamps[key]
        ? this.scene.add.image(left + (w * ts) / 2, bottom, this.textureKey, stampFrame(key)).setOrigin(0.5, 1)
        : this.scene.add
            .rectangle(left + (w * ts) / 2, bottom, w * ts - 4, h * ts - 4, Phaser.Display.Color.HexStringToColor(kind.color).color, 0.85)
            .setOrigin(0.5, 1)
            .setStrokeStyle(2, 0x000000, 0.6);
    return go.setDepth(ySortDepth(bottom));
  }
}
