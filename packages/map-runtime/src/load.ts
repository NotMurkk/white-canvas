import type Phaser from 'phaser';
import { AtlasManifest, EnemyRegistry, KindRegistry, TerrainTypes, ThemeDoc, ZoneTypes } from '@tdmm/map-format';
import type { ThemeAssets } from './tiled.ts';

export const atlasTextureKey = (atlasId: string) => `atlas:${atlasId}`;
const themeKey = (themeId: string) => `theme:${themeId}`;
const atlasJsonKey = (atlasId: string) => `atlas-json:${atlasId}`;
const CONTENT = {
  terrainTypes: 'content:terrain-types',
  kinds: 'content:kinds',
  enemies: 'content:enemies',
  zones: 'content:zones',
} as const;

/** Where the repo's content folders are served from (the dev servers mount them at the root). */
export interface ContentUrls {
  base: string;
}

/**
 * Queues everything a theme needs: the content registries, the theme file, then (once the theme
 * says which atlas it uses) the atlas manifest and image. Call from preload(). Safe to call twice.
 */
export function preloadTheme(scene: Phaser.Scene, themeId: string, urls: ContentUrls = { base: '' }) {
  const { load, cache, textures } = scene;
  if (!cache.json.exists(CONTENT.terrainTypes)) load.json(CONTENT.terrainTypes, `${urls.base}/content/terrain-types.json`);
  if (!cache.json.exists(CONTENT.kinds)) load.json(CONTENT.kinds, `${urls.base}/content/kinds.json`);
  if (!cache.json.exists(CONTENT.enemies)) load.json(CONTENT.enemies, `${urls.base}/content/enemies.json`);
  if (!cache.json.exists(CONTENT.zones)) load.json(CONTENT.zones, `${urls.base}/content/zones.json`);
  const queueAtlas = () => {
    const theme = ThemeDoc.parse(cache.json.get(themeKey(themeId)));
    if (!cache.json.exists(atlasJsonKey(theme.atlas))) load.json(atlasJsonKey(theme.atlas), `${urls.base}/assets/atlases/${theme.atlas}.atlas.json`);
    if (!textures.exists(atlasTextureKey(theme.atlas))) load.image(atlasTextureKey(theme.atlas), `${urls.base}/assets/atlases/${theme.atlas}.png`);
  };
  if (cache.json.exists(themeKey(themeId))) queueAtlas();
  else {
    load.json(themeKey(themeId), `${urls.base}/themes/${themeId}.theme.json`);
    load.once(`filecomplete-json-${themeKey(themeId)}`, queueAtlas);
  }
}

/** Reads and validates what preloadTheme() loaded. Call from create(). */
export function themeAssets(scene: Phaser.Scene, themeId: string): ThemeAssets {
  const theme = ThemeDoc.parse(scene.cache.json.get(themeKey(themeId)));
  const atlas = AtlasManifest.parse(scene.cache.json.get(atlasJsonKey(theme.atlas)));
  if (!scene.textures.exists(atlasTextureKey(theme.atlas))) throw new Error(`atlas image for "${theme.atlas}" did not load`);
  return {
    theme,
    atlas,
    terrainTypes: TerrainTypes.parse(scene.cache.json.get(CONTENT.terrainTypes)),
    kinds: KindRegistry.parse(scene.cache.json.get(CONTENT.kinds)),
    enemies: EnemyRegistry.parse(scene.cache.json.get(CONTENT.enemies)),
    zones: ZoneTypes.parse(scene.cache.json.get(CONTENT.zones)),
  };
}
