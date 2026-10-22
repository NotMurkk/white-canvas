import Phaser from 'phaser';
import { GameScene, GAME_SCENE_KEY } from './GameScene.ts';

const params = new URLSearchParams(location.search);
const mapUrl = params.get('map') ?? '/maps/phase0-meadow.map.json';
const theme = params.get('theme') ?? undefined;

const game = new Phaser.Game({
  // Tile animation is implemented in Phaser 4's WebGL tilemap renderer only.
  type: Phaser.WEBGL,
  parent: 'game',
  pixelArt: true,
  backgroundColor: '#101820',
  scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
  scene: [],
});
game.scene.add(GAME_SCENE_KEY, GameScene, true, { mapUrl, theme });

// Exposed for debugging and browser tests: assert on game state, not pixels.
(window as unknown as { __tdm: unknown }).__tdm = { game };
