import Phaser from 'phaser';
import { GameScene, GAME_SCENE_KEY } from './GameScene.ts';

export interface StartOptions {
  /** maps/<id>.map.json URL; the waves file next to it is loaded too. */
  mapUrl: string;
  theme?: string | undefined;
}

/**
 * Starts the reference game in `parent`, loading a saved map the way the shipped game will.
 * Returns a function that tears it down (the /play page calls it on unmount).
 */
export function startGame(parent: HTMLElement, { mapUrl, theme }: StartOptions): () => void {
  const game = new Phaser.Game({
    // Tile animation is implemented in Phaser 4's WebGL tilemap renderer only.
    type: Phaser.WEBGL,
    parent,
    pixelArt: true,
    backgroundColor: '#101820',
    scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
    scene: [],
  });
  game.scene.add(GAME_SCENE_KEY, GameScene, true, { mapUrl, theme });
  // Exposed for debugging and browser tests: assert on game state, not pixels.
  (window as unknown as { __tdm: unknown }).__tdm = { game };
  return () => game.destroy(true);
}
