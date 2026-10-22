import Phaser from 'phaser';
import { parseMap, parseWaves, type MapDoc, type WavesDoc } from '@tdmm/map-format';
import { DEPTH, MapView, preloadTheme, themeAssets, ySortDepth, type ThemeAssets } from '@tdmm/map-runtime';
import { pointAt, type Route } from '@tdmm/pathing';
import { footprintBounds, mapStateFromDoc, objectAtCell, validateMap, type MapState } from '@tdmm/rules';
import { Simulation, type SimEnemy } from '@tdmm/sim';

/**
 * Start with either a map URL (how the shipped game loads committed maps) or in-memory documents
 * (how the editor playtests unsaved work). Both go through the same parsing and validation, and
 * enemies are moved by the shared deterministic Simulation (the same one the clear check runs).
 */
export interface GameSceneData {
  map?: MapDoc | unknown;
  waves?: WavesDoc | unknown | null;
  /** maps/<id>.map.json; the waves file next to it is loaded too, if present. */
  mapUrl?: string;
  theme?: string | undefined;
  /** 0-based round to start from ("play from wave N"). */
  startRound?: number;
  /** Called when the player presses Esc; the editor uses it to return from playtest. */
  onExit?: () => void;
}

export const GAME_SCENE_KEY = 'game';
const MAP_FILE_KEY = 'game:map-file';
const WAVES_FILE_KEY = 'game:waves-file';
const ROUND_GAP_SEC = 2;

interface EnemySprite {
  body: Phaser.GameObjects.Arc;
  shadow: Phaser.GameObjects.Ellipse;
}

/** What one enemy did in a playtest: its route, how far it got, and whether it leaked. */
export interface RunTrail {
  enemy: string;
  route: Route;
  dist: number;
  leaked: boolean;
  flying: boolean;
}

export class GameScene extends Phaser.Scene {
  private params: GameSceneData = {};
  view?: MapView;
  map?: MapDoc;
  waves?: WavesDoc | undefined;
  sim?: Simulation;
  private state!: MapState;
  private assets!: ThemeAssets;
  private sprites = new Map<number, EnemySprite>();
  private trails = new Map<number, RunTrail>();
  private badges = new Map<string, Phaser.GameObjects.Text>();
  private gap = 0;
  private speed = 1;
  private paused = false;
  private playable = false;
  private leaked = 0;
  private hud?: HudScene;

  constructor() {
    super(GAME_SCENE_KEY);
  }

  init(data: GameSceneData) {
    this.params = data ?? {};
    if (!this.params.map && !this.params.mapUrl) throw new Error('GameScene needs a map or a mapUrl');
    this.sprites = new Map();
    this.trails = new Map();
    this.badges = new Map();
    this.speed = 1;
    this.paused = false;
    this.leaked = 0;
  }

  preload() {
    const theme = (map: MapDoc) => preloadTheme(this, this.params.theme ?? map.themes.default);
    if (this.params.mapUrl) {
      this.cache.json.remove(MAP_FILE_KEY);
      this.cache.json.remove(WAVES_FILE_KEY);
      this.load.json(MAP_FILE_KEY, this.params.mapUrl);
      this.load.json(WAVES_FILE_KEY, this.params.mapUrl.replace(/\.map\.json$/, '.waves.json'));
      this.load.once(`filecomplete-json-${MAP_FILE_KEY}`, () => theme(parseMap(this.cache.json.get(MAP_FILE_KEY))));
    } else {
      theme(parseMap(this.params.map));
    }
  }

  create() {
    const map = parseMap(this.params.mapUrl ? this.cache.json.get(MAP_FILE_KEY) : this.params.map);
    const rawWaves = this.params.mapUrl ? this.cache.json.get(WAVES_FILE_KEY) : this.params.waves;
    this.map = map;
    this.waves = rawWaves ? parseWaves(rawWaves) : undefined;
    this.assets = themeAssets(this, this.params.theme ?? map.themes.default);
    this.state = mapStateFromDoc(map);

    const view = new MapView(this, this.state, this.assets);
    this.view = view;
    const validation = validateMap(this.state, this.assets, this.waves);

    const cam = this.cameras.main;
    cam.setBackgroundColor('#101820');
    // Whole-number zoom keeps pixel art crisp; halves and quarters only when the screen is too small.
    const fit = Math.min(this.scale.width / view.widthInPixels, this.scale.height / view.heightInPixels);
    cam.setZoom(fit >= 1 ? Math.floor(fit) : fit >= 0.5 ? 0.5 : 0.25);
    cam.centerOn(view.widthInPixels / 2, view.heightInPixels / 2);

    // The HUD lives in its own scene so the map camera's zoom never scales it.
    if (!this.scene.get(HUD_SCENE_KEY)) this.scene.add(HUD_SCENE_KEY, HudScene, false);
    this.scene.launch(HUD_SCENE_KEY);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scene.stop(HUD_SCENE_KEY));
    this.hud = this.scene.get(HUD_SCENE_KEY) as HudScene;

    const errors = validation.problems.filter((p) => p.severity === 'error');
    this.playable = errors.length === 0 && !!this.waves;
    if (errors.length) {
      // The game refuses broken maps instead of guessing; the editor's problem list explains each one.
      this.hud.showError([`This map has ${errors.length} error(s) and can't be played:`, '', ...errors.slice(0, 8).map((e) => `• ${e.message}`)].join('\n'));
    } else if (this.waves) {
      this.sim = new Simulation(
        { state: this.state, reg: this.assets, waves: this.waves, compiled: validation.compiled },
        { spawn: (e) => this.addEnemy(e), leak: (e) => this.removeEnemy(e, true) },
      );
      // "Play from round N": skip ahead, keeping the cash those rounds would have paid out.
      const start = Math.min(this.params.startRound ?? 0, this.waves.rounds.length - 1);
      for (let r = 0; r < start; r++) this.sim.cash += this.waves.rounds[r]!.bonusCash;
      this.sim.round = start - 1;
      this.gap = 1;
    }
    this.drawRemovalBadges();

    const kb = this.input.keyboard;
    kb?.on('keydown-SPACE', () => (this.paused = !this.paused));
    kb?.on('keydown-F', () => (this.speed = this.speed >= 4 ? 1 : this.speed * 2));
    kb?.on('keydown-N', () => this.sim?.phase === 'idle' && (this.gap = 0));
    if (this.params.onExit) {
      const onExit = this.params.onExit;
      kb?.once('keydown-ESC', () => onExit());
    }
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => this.tryRemoveObstacle(p));
    this.updateHud();
  }

  override update(_time: number, deltaMs: number) {
    const sim = this.sim;
    if (!sim || !this.view || this.paused || sim.phase === 'done') {
      this.updateHud();
      return;
    }
    const dt = Math.min(deltaMs / 1000, 0.1) * this.speed;
    if (sim.phase === 'idle') {
      this.gap -= dt;
      if (this.gap <= 0) {
        sim.startRound(sim.round + 1);
        this.gap = ROUND_GAP_SEC;
      }
    }
    sim.step(dt);

    const ts = this.view.tileSize;
    for (const e of sim.enemies) {
      const s = this.sprites.get(e.uid);
      if (!s) continue;
      const [x, y] = pointAt(e.route, e.dist);
      const lift = e.flying ? ts * 0.45 : 0;
      s.body.setPosition(x * ts, y * ts - lift);
      s.shadow.setPosition(x * ts, y * ts + ts * 0.18);
      s.body.setDepth(e.flying ? DEPTH.editorOverlay - 1 : ySortDepth(y * ts + ts * 0.2));
    }
    this.updateHud();
  }

  private addEnemy(e: SimEnemy) {
    const def = this.assets.enemies[e.enemy]!;
    const ts = this.view!.tileSize;
    const color = Phaser.Display.Color.HexStringToColor(def.color).color;
    const shadow = this.add.ellipse(-100, -100, ts * def.radius * 1.8, ts * def.radius * 0.7, 0x000000, 0.25).setDepth(DEPTH.markers + 1);
    const body = this.add.circle(-100, -100, ts * def.radius, color).setStrokeStyle(2, 0x202020);
    this.sprites.set(e.uid, { body, shadow });
    this.trails.set(e.uid, { enemy: e.enemy, route: e.route, dist: 0, leaked: false, flying: e.flying });
  }

  /**
   * Every enemy of this run so far, with how far along its route it got. The editor reads this
   * when a playtest ends and draws it as trails and leak markers (Mario Maker's "last path").
   */
  runLog(): RunTrail[] {
    for (const e of this.sim?.enemies ?? []) {
      const t = this.trails.get(e.uid);
      if (t) t.dist = Math.min(e.dist, e.length);
    }
    return [...this.trails.values()];
  }

  private removeEnemy(e: SimEnemy, leaked: boolean) {
    const s = this.sprites.get(e.uid);
    const t = this.trails.get(e.uid);
    if (t) {
      t.dist = e.length;
      t.leaked = leaked;
    }
    if (leaked) this.leaked++;
    s?.body.destroy();
    s?.shadow.destroy();
    this.sprites.delete(e.uid);
  }

  /** "$" badges over removable obstacles; click one to pay and clear it. */
  private drawRemovalBadges() {
    const ts = this.view!.tileSize;
    for (const o of this.state.objects) {
      const kind = this.assets.kinds[o.kind];
      if (!o.removal || !kind) continue;
      const b = footprintBounds(kind, o.x, o.y);
      const badge = this.add
        .text((b.x + b.w / 2) * ts, b.y * ts + 2, `$${o.removal.cost}`, { fontFamily: 'monospace', fontSize: '11px', color: '#1a1400', backgroundColor: '#f0c040', padding: { x: 3, y: 1 } })
        .setOrigin(0.5, 0)
        .setDepth(DEPTH.editorOverlay);
      this.badges.set(o.id, badge);
    }
  }

  private tryRemoveObstacle(p: Phaser.Input.Pointer) {
    if (!this.sim || !this.view) return;
    const ts = this.view.tileSize;
    const o = objectAtCell(this.state, this.assets, Math.floor(p.worldX / ts), Math.floor(p.worldY / ts), this.sim.removed);
    if (!o?.removal) return;
    const r = this.sim.removeObstacle(o.id);
    this.floatText(p.worldX, p.worldY, r.ok ? `-$${o.removal.cost}` : r.reason!, r.ok ? '#f0c040' : '#ff8080');
    if (!r.ok) return;
    this.view.objects.sync(this.state.objects.filter((x) => !this.sim!.removed.has(x.id)));
    this.badges.get(o.id)?.destroy();
    this.badges.delete(o.id);
  }

  private floatText(x: number, y: number, text: string, color: string) {
    const t = this.add.text(x, y, text, { fontFamily: 'monospace', fontSize: '13px', color, stroke: '#000000', strokeThickness: 3 }).setOrigin(0.5).setDepth(DEPTH.hud);
    this.tweens.add({ targets: t, y: y - 24, alpha: 0, duration: 1200, onComplete: () => t.destroy() });
  }

  private updateHud() {
    if (!this.map || !this.hud) return;
    const sim = this.sim;
    const rounds = this.waves?.rounds.length ?? 0;
    const status = !this.playable ? 'not playable' : sim?.phase === 'done' ? 'all rounds done' : this.paused ? 'paused' : `${this.speed}×`;
    const removable = this.state.objects.some((o) => o.removal);
    this.hud.setStatus(
      [
        `${this.map.name}  ·  ${this.params.mapUrl ? 'saved file' : 'unsaved map from the editor'}`,
        rounds && sim
          ? `Round ${Math.max(0, sim.round + 1)}/${rounds}  ·  Lives ${sim.lives}  ·  Cash $${sim.cash}  ·  Enemies ${sim.enemies.length}  ·  Leaked ${this.leaked}  ·  ${status}`
          : rounds ? status : 'No waves on this map',
        'Space pause · F speed · N next round' + (removable ? ' · click $ obstacles to clear' : '') + (this.params.onExit ? ' · Esc back to editor' : ''),
      ].join('\n'),
    );
  }
}

const HUD_SCENE_KEY = 'game-hud';

/** Screen-space overlay above the game scene; its camera never zooms. */
class HudScene extends Phaser.Scene {
  private text?: Phaser.GameObjects.Text | undefined;
  private error?: Phaser.GameObjects.Text | undefined;
  private pendingError?: string | undefined;

  constructor() {
    super(HUD_SCENE_KEY);
  }

  create() {
    this.text = this.add.text(8, 8, '', { fontFamily: 'monospace', fontSize: '14px', color: '#ffffff', backgroundColor: '#000000b0', padding: { x: 8, y: 6 } });
    this.error = undefined;
    if (this.pendingError) this.showError(this.pendingError);
  }

  setStatus(text: string) {
    if (this.text?.active) this.text.setText(text);
  }

  showError(message: string) {
    if (!this.text) {
      this.pendingError = message;
      return;
    }
    this.pendingError = undefined;
    this.error?.destroy();
    this.error = this.add
      .text(this.scale.width / 2, this.scale.height / 2, message, {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#ffd0d0',
        backgroundColor: '#300000e0',
        padding: { x: 14, y: 12 },
        wordWrap: { width: Math.min(640, this.scale.width - 40) },
      })
      .setOrigin(0.5);
  }
}
