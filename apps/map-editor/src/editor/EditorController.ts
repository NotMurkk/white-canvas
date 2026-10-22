import Phaser from 'phaser';
import { DIR_E, DIR_N, DIR_S, DIR_W, NO_PATH, emptyWaves, newId, parseMap, parseWaves, printMap, printWaves, type MapDoc, type Problem, type WavesDoc } from '@tdmm/map-format';
import { GameScene, GAME_SCENE_KEY, type GameSceneData } from '@tdmm/game/scene';
import { BUILD_BLOCK_REASON, coverageMap, rangeMultiplierAt, routeShares, towerCoverage } from '@tdmm/rules';
import { clearCheckIsCurrent, runClearCheck } from '@tdmm/sim';
import * as C from './clipboard.ts';
import type { Change } from './document.ts';
import * as P from './palette.ts';
import { summarizeRun, type RunSummary } from './trails.ts';
import { EditorScene, EDITOR_SCENE_KEY, type Ghost } from './EditorScene.ts';
import { play, setMuted } from './sound.ts';
import { SaveConflictError, clearAutosaves, latestAutosave, listMaps, listThemes, loadMapFiles, saveMapFiles, writeAutosave } from './storage.ts';
import { Store, type EditorUiState, type Inspect, type Selection } from './store.ts';
import * as T from './tools.ts';

const ZOOMS = [0.25, 0.5, 1, 2, 3, 4];
type Cell = { x: number; y: number };
type Gesture =
  | { kind: 'pan'; lastX: number; lastY: number }
  | { kind: 'cells'; last: Cell; apply: (c: Cell) => T.Outcome; cue: 'paint' | 'erase' | 'place' }
  | { kind: 'path'; last: Cell | null; style: string }
  | { kind: 'rect'; start: Cell; end: Cell }
  | { kind: 'stamp'; last: Cell }
  | { kind: 'moveObject'; id: string; offset: Cell; last: Cell }
  | { kind: 'waypoint'; routeId: string; index: number }
  | { kind: 'marquee'; start: Cell; end: Cell }
  | null;

/**
 * Owns the Phaser game and turns DOM input into document edits. Tools run on DOM pointer events
 * (not Phaser input), so they work the same under any UI and Phaser input stays free for playtest.
 */
export class EditorController {
  readonly store = new Store<EditorUiState>({
    status: 'loading',
    mapId: '',
    mapName: '',
    mapSize: '',
    tool: 'path',
    terrainMode: 'pencil',
    brush: { terrain: 'water', path: 'path_dirt', stamp: 'tree_round', spawn: 'ground', zone: 'no_build' },
    terrains: [],
    zoneTypes: [],
    selection: null,
    inspect: null,
    airDraft: null,
    clear: { status: 'idle', problems: [], savedCurrent: false },
    stats: null,
    theme: '',
    themes: [],
    mapThemes: { default: '', supported: [] },
    themeCoverage: [],
    stamps: [],
    enemies: [],
    hover: null,
    zoom: 1,
    mode: 'edit',
    startRound: 0,
    canUndo: false,
    canRedo: false,
    dirty: false,
    saveState: 'idle',
    showGrid: true,
    showArrows: true,
    showBuildable: false,
    buildableOpacity: 0.6,
    showCoverage: false,
    coverageMax: 0,
    testRange: 3,
    testTowers: [],
    layers: { terrain: true, path: true, objects: true, zones: true },
    paste: null,
    clipInfo: null,
    library: P.loadPrefs(),
    lastRun: null,
    showTrails: true,
    muted: false,
    problems: [],
    errors: 0,
    warnings: 0,
    buildableCount: 0,
    waves: null,
    routes: [],
    spawns: [],
    toast: null,
    rightTab: 'problems',
    mapList: [],
    restore: null,
    dialog: 'none',
  });

  private game: Phaser.Game | null = null;
  private scene: EditorScene | null = null;
  private gesture: Gesture = null;
  private spaceHeld = false;
  private host: HTMLElement | null = null;
  private readonly cleanups: (() => void)[] = [];
  /** Hash of the on-disk files the open document is based on (null = never saved). */
  private baseHash: string | null = null;
  private syncQueued = false;
  private autosaveTimer: ReturnType<typeof setTimeout> | undefined;
  private lastToast = { text: '', at: 0 };
  private toastId = 0;
  private lastHover: Cell | null = null;
  private lastWorld: [number, number] | null = null;
  /** Shift held: place exactly under the pointer, no forgiveness snapping. */
  private exact = false;
  private clip: C.Clip | null = null;
  /** The last playtest; cleared by the next edit. */
  private runTrails: RunSummary | null = null;
  private clearTimer: ReturnType<typeof setTimeout> | undefined;

  mount(host: HTMLElement, mapId: string) {
    this.host = host;
    this.game = new Phaser.Game({
      // Tile animation is implemented in Phaser 4's WebGL tilemap renderer only.
      type: Phaser.WEBGL,
      parent: host,
      pixelArt: true,
      backgroundColor: '#1b2026',
      scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
      scene: [],
    });
    this.game.scene.add(GAME_SCENE_KEY, GameScene, false);
    this.game.scene.add(EDITOR_SCENE_KEY, EditorScene, false);
    (window as unknown as { __tdm: unknown }).__tdm = { game: this.game, editor: this };

    const on = <K extends keyof HTMLElementEventMap>(el: HTMLElement | Window, type: K, fn: (e: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      el.addEventListener(type, fn as EventListener, opts);
      this.cleanups.push(() => el.removeEventListener(type, fn as EventListener, opts));
    };
    on(host, 'pointerdown', (e) => this.onPointerDown(e));
    on(host, 'pointermove', (e) => this.onPointerMove(e));
    on(host, 'pointerup', (e) => this.onPointerUp(e));
    on(host, 'pointercancel', (e) => this.onPointerUp(e));
    on(host, 'pointerleave', () => this.setHover(null));
    on(host, 'contextmenu', (e) => e.preventDefault());
    on(host, 'wheel', (e) => this.onWheel(e), { passive: false });
    on(window, 'keydown', (e) => this.onKey(e, true));
    on(window, 'keyup', (e) => this.onKey(e, false));
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (this.scene?.doc.dirty) e.preventDefault();
    };
    window.addEventListener('beforeunload', beforeUnload);
    this.cleanups.push(() => window.removeEventListener('beforeunload', beforeUnload));
    // The clipboard lives in localStorage: a copy in another tab shows up here too.
    const onStorage = (e: StorageEvent) => e.key === 'tdmm:clipboard' && this.setClip(C.loadClip());
    window.addEventListener('storage', onStorage);
    this.cleanups.push(() => window.removeEventListener('storage', onStorage));
    this.setClip(C.loadClip());
    void this.refreshMapList();
    void this.refreshThemes();
    void this.openMap(mapId);
  }

  destroy() {
    for (const c of this.cleanups.splice(0)) c();
    clearTimeout(this.autosaveTimer);
    this.game?.destroy(true);
    this.game = null;
    this.scene = null;
  }

  // ---- loading, new, open, restore --------------------------------------------------------------

  async openMap(id: string) {
    if (this.scene?.doc.dirty && !confirm('Discard unsaved changes to this map?')) return;
    this.store.set({ status: 'loading', dialog: 'none', restore: null, error: undefined });
    try {
      const files = await loadMapFiles(id).catch(async (e: Error) => {
        // A new map that was never saved (tab closed, crash, reload) still lives in the autosave.
        const saved = await latestAutosave(id);
        if (!saved || saved.baseHash !== null) throw e;
        return { recovered: saved };
      });
      if ('recovered' in files) {
        this.baseHash = null;
        await this.startEditor(parseMap(files.recovered.map), parseWaves(files.recovered.waves));
        this.scene?.doc.markDirty();
        this.syncStore();
        this.toast(`Recovered "${id}" from autosave. It hasn't been saved to maps/ yet.`, 'ok');
        return;
      }
      const map = parseMap(files.map);
      const waves = files.waves ? parseWaves(files.waves) : emptyWaves(map.id);
      this.baseHash = files.hash;
      await this.startEditor(map, waves);
      history.replaceState(null, '', `?map=${encodeURIComponent(id)}`);
      const saved = await latestAutosave(id);
      if (saved && saved.savedAt > files.mtimeMs && (saved.map !== files.map || saved.waves !== (files.waves ?? printWaves(waves)))) {
        this.store.set({ restore: saved });
      }
    } catch (e) {
      this.store.set({ status: 'error', error: (e as Error).message });
    }
  }

  async newMap(opts: { id: string; name: string; width: number; height: number }) {
    if (this.scene?.doc.dirty && !confirm('Discard unsaved changes to this map?')) return;
    if (this.store.get().mapList.some((m) => m.id === opts.id)) {
      this.toast(`A map called "${opts.id}" already exists.`, 'warn');
      return;
    }
    const map = parseMap({
      format: 'ptd-map',
      schemaVersion: 1,
      id: opts.id,
      name: opts.name,
      seed: Math.floor(Math.random() * 1e6),
      grid: { width: opts.width, height: opts.height, tileSize: 32 },
      themes: { default: 'summer', supported: ['summer'] },
      terrain: { legend: { '.': 'grass' }, rows: Array.from({ length: opts.height }, () => '.'.repeat(opts.width)) },
    });
    this.baseHash = null;
    this.store.set({ dialog: 'none', restore: null });
    await this.startEditor(map, emptyWaves(map.id));
    this.scene?.doc.markDirty();
    history.replaceState(null, '', `?map=${encodeURIComponent(map.id)}`);
    this.syncStore();
  }

  async restoreAutosave() {
    const saved = this.store.get().restore;
    if (!saved) return;
    this.store.set({ restore: null });
    await this.startEditor(parseMap(saved.map), parseWaves(saved.waves));
    this.scene?.doc.markDirty();
    this.syncStore();
    this.toast('Restored your unsaved changes. Save to keep them.', 'ok');
  }

  async discardAutosave() {
    const saved = this.store.get().restore;
    this.store.set({ restore: null });
    if (saved) await clearAutosaves(saved.mapId);
  }

  async refreshMapList() {
    try {
      this.store.set({ mapList: await listMaps() });
    } catch {
      // the list is a convenience
    }
  }

  private startEditor(map: MapDoc, waves: WavesDoc): Promise<void> {
    return new Promise((resolve) => {
      const data = {
        map,
        waves,
        theme: map.themes.default,
        onReady: (scene: EditorScene) => {
          this.onSceneReady(scene);
          resolve();
        },
        onError: (error: Error) => {
          this.store.set({ status: 'error', error: error.message });
          resolve();
        },
      };
      if (this.store.get().mode === 'play') this.stopPlay();
      this.scene = null;
      const sm = this.game!.scene;
      if (sm.isActive(EDITOR_SCENE_KEY) || sm.isSleeping(EDITOR_SCENE_KEY)) sm.stop(EDITOR_SCENE_KEY);
      sm.start(EDITOR_SCENE_KEY, data);
    });
  }

  private onSceneReady(scene: EditorScene) {
    this.scene = scene;
    const a = scene.assets;
    const terrains = Object.entries(a.terrainTypes)
      .filter(([id]) => id in a.theme.terrain)
      .map(([id, t]) => ({ id, name: t.name, color: t.color, pathStyle: t.pathStyle }));
    const stamps = Object.entries(a.kinds).map(([id, k]) => ({ id, name: k.name, color: k.color, category: k.category, w: k.footprint[0]!.length, h: k.footprint.length }));
    const enemies = Object.entries(a.enemies).map(([id, e]) => ({ id, name: e.name, color: e.color, flying: e.flying }));
    const zoneTypes = Object.entries(a.zones).map(([id, z]) => ({ id, name: z.name, color: z.color }));
    const s = this.store.get();
    const brush = {
      ...s.brush,
      terrain: terrains.some((t) => t.id === s.brush.terrain) ? s.brush.terrain : terrains[0]?.id ?? '',
      path: terrains.find((t) => t.id === s.brush.path && t.pathStyle)?.id ?? terrains.find((t) => t.pathStyle)?.id ?? '',
      stamp: stamps.some((k) => k.id === s.brush.stamp) ? s.brush.stamp : stamps[0]?.id ?? '',
      zone: zoneTypes.some((z) => z.id === s.brush.zone) ? s.brush.zone : zoneTypes[0]?.id ?? '',
    };
    Object.assign(scene.options, { showGrid: s.showGrid, showArrows: s.showArrows, showBuildable: s.showBuildable, buildableOpacity: s.buildableOpacity });
    scene.applyOptions();
    scene.doc.onChange((c) => this.onDocChange(c));
    this.fitView();
    const doc = scene.doc;
    this.store.set({
      status: 'ready',
      mapId: doc.base.id,
      mapName: doc.base.name,
      mapSize: `${doc.width}×${doc.height}`,
      terrains,
      stamps,
      enemies,
      zoneTypes,
      brush,
      saveState: 'idle',
      startRound: 0,
      selection: null,
      airDraft: null,
      stats: null,
      clear: { status: 'idle', problems: [], savedCurrent: false },
      theme: scene.themeId,
      testTowers: [],
      lastRun: null,
      paste: null,
    });
    this.runTrails = null;
    this.syncStore();
  }

  // ---- document sync ----------------------------------------------------------------------------

  private onDocChange(c: Change) {
    if (c.fromHistory && c.cells.length) this.revealCells(c.cells.map((x) => x.index));
    this.clearTrails(); // any edit can change the routes the trails describe
    if (!this.syncQueued) {
      this.syncQueued = true;
      requestAnimationFrame(() => {
        this.syncQueued = false;
        this.syncStore();
      });
    }
  }

  private syncStore() {
    const doc = this.scene?.doc;
    if (!doc) return;
    const v = doc.validate();
    const prev = this.store.get();
    this.store.set({
      problems: v.problems,
      errors: v.errors,
      warnings: v.warnings,
      buildableCount: v.buildable.count,
      routes: v.compiled.routes.map((r) => ({ id: r.id, spawn: r.spawn, exit: r.exit, kind: r.kind, length: Math.round(r.lengths.at(-1)! * 10) / 10 })),
      spawns: doc.state.spawns.map((s) => ({ id: s.id, kind: s.kind })),
      waves: prev.waves && JSON.stringify(prev.waves) === JSON.stringify(doc.waves) ? prev.waves : structuredClone(doc.waves),
      canUndo: doc.canUndo,
      canRedo: doc.canRedo,
      dirty: doc.dirty,
      mapName: doc.base.name,
      inspect: this.buildInspect(prev.selection),
      mapThemes: { default: doc.base.themes.default, supported: [...doc.base.themes.supported] },
      themeCoverage: this.themeCoverage(),
    });
    this.scheduleClearCheck();
    this.scene?.setSelection(prev.selection, prev.airDraft);
    this.refreshCoverage();
    if (this.lastHover) this.setHover(this.lastHover);
  }

  /**
   * Recomputes test-tower readouts and (when shown) the coverage heatmap. Routes are weighted by
   * the share of enemies the last clear check sent down each one.
   */
  private refreshCoverage() {
    const scene = this.scene;
    if (!scene) return;
    const doc = scene.doc;
    const s = this.store.get();
    const v = doc.validate();
    const routes = v.compiled.routes;
    const shares = routeShares(routes, s.stats?.map((r) => r.byRoute));
    const towers = s.testTowers.map((t) => {
      const c = towerCoverage(doc.state, doc.reg, routes, shares, t.x, t.y, s.testRange);
      return { x: t.x, y: t.y, range: c.range, expected: c.expected, ok: doc.inside(t.x, t.y) && !v.buildable.block[t.y * doc.width + t.x] };
    });
    const heat = s.showCoverage ? coverageMap(doc.state, doc.reg, routes, shares, s.testRange, v.buildable) : null;
    let max = 0;
    if (heat) for (const h of heat) max = Math.max(max, h);
    this.store.set({ testTowers: towers, coverageMax: max });
    scene.setCoverage(heat, max, towers);
  }

  setTestRange(testRange: number) {
    this.store.set({ testRange });
    this.refreshCoverage();
    if (this.lastHover) this.setHover(this.lastHover);
  }

  clearTestTowers() {
    this.store.set({ testTowers: [] });
    this.refreshCoverage();
  }

  /** Test tower tool: click drops a probe tower (or removes the one there); right-click removes. */
  private testTowerDown(cell: Cell, right: boolean) {
    const doc = this.scene!.doc;
    const towers = this.store.get().testTowers;
    const at = (c: Cell) => towers.findIndex((t) => t.x === c.x && t.y === c.y);
    if (right || at(cell) >= 0) {
      const i = at(cell);
      if (i < 0) return;
      this.store.set({ testTowers: towers.filter((_, k) => k !== i) });
      play('erase');
    } else {
      const snap = T.snapTower(doc, cell, this.lastWorld ?? undefined);
      const target = snap && (!snap.snapped || !this.exact) ? snap.cell : null;
      if (!target) {
        const block = doc.inside(cell.x, cell.y) ? doc.validate().buildable.block[cell.y * doc.width + cell.x]! : 0;
        this.feedback({ changed: false, refused: `No towers here: ${block ? BUILD_BLOCK_REASON[block] : 'off the map'}.` }, cell, 'place');
        return;
      }
      if (at(target) >= 0) return;
      this.store.set({ testTowers: [...towers, { ...target, range: 0, expected: 0, ok: true }] });
      play('place');
    }
    this.refreshCoverage();
  }

  /**
   * Runs the clear check (validation + a no-tower simulation of every round) shortly after edits
   * settle. It feeds the Check tab, the balance charts and the Cleared/Draft badge.
   */
  private scheduleClearCheck() {
    clearTimeout(this.clearTimer);
    const s = this.store.get();
    if (s.clear.status !== 'running') this.store.set({ clear: { ...s.clear, status: 'running' } });
    this.clearTimer = setTimeout(() => {
      const doc = this.scene?.doc;
      if (!doc) return;
      const r = runClearCheck(doc.state, doc.reg, doc.waves);
      const savedCurrent = !doc.dirty && !!doc.loadedClearCheck && clearCheckIsCurrent(doc.state, doc.reg, { ...doc.waves, clearCheck: doc.loadedClearCheck });
      const summary = r.record ? `${r.record.rounds} rounds · ${r.record.enemies} enemies · ${r.record.durationSec}s with no towers` : undefined;
      this.store.set({ clear: { status: r.passed ? 'passed' : 'failed', problems: r.problems, savedCurrent, summary, fingerprint: r.gameplayHash }, stats: r.stats.length ? r.stats : null });
      this.refreshCoverage(); // route shares come from the simulated rounds
    }, 400);
  }

  private buildInspect(sel: Selection): Inspect | null {
    const doc = this.scene?.doc;
    if (!doc || !sel) return null;
    if (sel.kind === 'region') {
      const region = { x0: sel.x0, y0: sel.y0, x1: sel.x1, y1: sel.y1 };
      return { kind: 'region', region, w: sel.x1 - sel.x0 + 1, h: sel.y1 - sel.y0 + 1, counts: C.regionCounts(doc.state, region) };
    }
    const v = doc.validate();
    const usedBy = (pred: (g: { spawn: string; route: string | null }) => boolean) => doc.waves.rounds.reduce((n, r) => n + r.groups.filter(pred).length, 0);
    if (sel.kind === 'object') {
      const o = doc.state.objects.find((x) => x.id === sel.id);
      if (!o) return { kind: 'missing' };
      const k = doc.reg.kinds[o.kind];
      const removableOthers = doc.state.objects.filter((x) => x.id !== o.id && x.removal).map((x) => ({ id: x.id, name: doc.reg.kinds[x.kind]?.name ?? x.kind }));
      return { kind: 'object', object: structuredClone(o), name: k?.name ?? o.kind, defaultCost: k?.removalCost ?? 250, removableOthers };
    }
    if (sel.kind === 'spawn') {
      const sp = doc.state.spawns.find((x) => x.id === sel.id);
      if (!sp) return { kind: 'missing' };
      return { kind: 'spawn', id: sp.id, spawnKind: sp.kind, cell: sp.cell, routes: v.compiled.routes.filter((r) => r.spawn === sp.id).map((r) => r.id), usedBy: usedBy((g) => g.spawn === sp.id) };
    }
    if (sel.kind === 'exit') {
      const e = doc.state.exits.find((x) => x.id === sel.id);
      if (!e) return { kind: 'missing' };
      return { kind: 'exit', id: e.id, cell: e.cell, routes: v.compiled.routes.filter((r) => r.exit === e.id).map((r) => r.id) };
    }
    if (sel.kind === 'airRoute') {
      const r = doc.state.airRoutes.find((x) => x.id === sel.id);
      if (!r) return { kind: 'missing' };
      const compiled = v.compiled.routes.find((x) => x.id === r.id);
      return { kind: 'airRoute', id: r.id, from: r.from, to: r.to, points: r.points.length, smooth: r.smooth, length: compiled ? Math.round(compiled.lengths.at(-1)! * 10) / 10 : 0, usedBy: usedBy((g) => g.route === r.id) };
    }
    const [x, y] = sel.cell;
    const outs = T.junctionOuts(doc, { x, y });
    if (outs.length < 2) return { kind: 'missing' };
    const j = doc.state.junctions.find((v2) => v2.cell[0] === x && v2.cell[1] === y);
    // Which exits each branch can lead to: routes through this junction, by the turn taken here.
    const branches = outs.map((dir) => {
      const s2 = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] }[dir];
      const next = { x: x + s2[0]!, y: y + s2[1]! };
      const through = v.compiled.routes.filter((r) => r.cells.some((c, i) => c.x === x && c.y === y && r.cells[i + 1]?.x === next.x && r.cells[i + 1]?.y === next.y));
      return { dir, exits: [...new Set(through.map((r) => r.exit))], routes: through.map((r) => r.id) };
    });
    return { kind: 'junction', cell: [x, y], policy: structuredClone(j?.policy ?? { type: 'alternate', branches: {} }), hasPolicy: !!j, branches };
  }

  private afterCommit() {
    this.syncStore();
    clearTimeout(this.autosaveTimer);
    this.autosaveTimer = setTimeout(() => {
      const doc = this.scene?.doc;
      if (!doc) return;
      // Undoing back to the saved state leaves nothing to recover; don't offer a stale copy later.
      if (!doc.dirty) return void clearAutosaves(doc.base.id);
      const { map, waves } = doc.toDocs();
      void writeAutosave({ mapId: map.id, baseHash: this.baseHash, map: printMap(map), waves: printWaves(waves) });
    }, 1200);
  }

  // ---- commands ---------------------------------------------------------------------------------

  setTool(tool: T.ToolId) {
    this.store.set({ tool, paste: null });
    if (this.lastHover) this.setHover(this.lastHover);
  }

  // ---- marquee, copy and paste ------------------------------------------------------------------

  setLayers(patch: Partial<C.LayerFilter>) {
    this.store.set({ layers: { ...this.store.get().layers, ...patch } });
    this.scene?.setSelection(this.store.get().selection, this.store.get().airDraft);
  }

  private setClip(clip: C.Clip | null) {
    if (clip) this.clip = clip;
    this.store.set({ clipInfo: this.clip ? { w: this.clip.w, h: this.clip.h, layers: this.clip.layers } : null });
  }

  selectAll() {
    const doc = this.scene?.doc;
    if (!doc) return;
    this.store.set({ tool: 'select', paste: null });
    this.select({ kind: 'region', x0: 0, y0: 0, x1: doc.width - 1, y1: doc.height - 1 });
  }

  /** Copies the marquee selection (its checked layers); `cut` also clears them. */
  copySelection(cut = false) {
    const doc = this.scene?.doc;
    const s = this.store.get();
    const sel = s.selection;
    if (!doc) return;
    if (sel?.kind !== 'region') {
      this.toast('Drag a box with the Select tool (V) first, then copy.', 'info');
      return;
    }
    const clip = C.copyRegion(doc.state, sel, s.layers);
    if (!clip || !clip.layers.length) {
      this.toast('Tick at least one layer to copy.', 'warn');
      return;
    }
    this.clip = clip;
    C.saveClip(clip);
    this.setClip(clip);
    if (cut) {
      const base = T.baseTerrain(doc, this.scene!.assets.theme.terrain);
      this.edit('Cut', (d) => ({ changed: C.eraseRegion(d, sel, s.layers, base) }));
      play('erase');
    }
    this.toast(`${cut ? 'Cut' : 'Copied'} ${clip.w}×${clip.h}: ${clip.layers.join(', ')}. Ctrl+V to paste.`, 'ok');
  }

  /** Paste mode: the clip follows the pointer, green where it fits; click places it (again and again). */
  startPaste() {
    this.setClip(C.loadClip());
    const clip = this.clip;
    if (!clip) {
      this.toast('Nothing copied yet. Drag a box with the Select tool (V) and press Ctrl+C.', 'info');
      return;
    }
    this.store.set({ paste: { w: clip.w, h: clip.h } });
    if (this.lastHover) this.setHover(this.lastHover);
  }

  stopPaste() {
    if (!this.store.get().paste) return;
    this.store.set({ paste: null });
    this.scene?.showPaste(null);
    if (this.lastHover) this.setHover(this.lastHover);
  }

  /** Top-left cell of the clip when the pointer is at `cell` (the pointer holds its middle). */
  private pasteOrigin(cell: Cell, clip: C.Clip): Cell {
    return { x: cell.x - Math.floor((clip.w - 1) / 2), y: cell.y - Math.floor((clip.h - 1) / 2) };
  }

  private commitPaste(cell: Cell) {
    const doc = this.scene?.doc;
    const clip = this.clip;
    if (!doc || !clip) return;
    const plan = C.planPaste(doc.state, doc.reg, clip, this.pasteOrigin(cell, clip));
    if (!plan.ok) {
      this.feedback({ changed: false, refused: plan.reason }, plan.bad[0] ?? cell, 'place');
      return;
    }
    this.edit('Paste', (d) => {
      C.applyPaste(d, plan);
      return { changed: true };
    });
    play('place');
  }

  setBrush(patch: Partial<EditorUiState['brush']>) {
    let library = this.store.get().library;
    for (const list of ['stamp', 'terrain', 'path', 'zone'] as const) {
      const id = patch[list];
      if (id) library = P.noteRecent(library, list, id);
    }
    P.savePrefs(library);
    this.store.set({ brush: { ...this.store.get().brush, ...patch }, library });
    if (this.lastHover) this.setHover(this.lastHover);
  }

  // ---- palette library: search, pins, recents ---------------------------------------------------

  /** The items a palette list offers, in content order. */
  libraryItems(list: P.LibraryList): P.LibraryItem[] {
    const s = this.store.get();
    if (list === 'stamp') return s.stamps.map((k) => ({ id: k.id, name: k.name, color: k.color, category: k.category, note: `${k.w}×${k.h}` }));
    if (list === 'zone') return s.zoneTypes;
    return s.terrains.filter((t) => list === 'terrain' || t.pathStyle);
  }

  setLibraryQuery(query: string) {
    this.store.set({ library: { ...this.store.get().library, query } });
  }

  togglePin(list: P.LibraryList, id: string) {
    const library = P.togglePin(this.store.get().library, list, id);
    P.savePrefs(library);
    this.store.set({ library });
  }

  setTerrainMode(terrainMode: T.TerrainMode) {
    this.store.set({ terrainMode, tool: 'terrain' });
  }

  setOverlay(patch: Partial<Pick<EditorUiState, 'showGrid' | 'showArrows' | 'showBuildable' | 'buildableOpacity' | 'showCoverage' | 'showTrails' | 'muted'>>) {
    this.store.set(patch);
    if (patch.muted !== undefined) setMuted(patch.muted);
    if (patch.showCoverage !== undefined) this.refreshCoverage();
    if (patch.showTrails !== undefined) this.scene?.setTrails(patch.showTrails ? this.runTrails : null);
    const s = this.store.get();
    if (this.scene) {
      Object.assign(this.scene.options, { showGrid: s.showGrid, showArrows: s.showArrows, showBuildable: s.showBuildable, buildableOpacity: s.buildableOpacity });
      this.scene.applyOptions();
    }
  }

  undo() {
    if (this.store.get().mode !== 'edit' || this.gesture) return;
    if (this.scene?.doc.undo()) {
      play('undo');
      this.afterCommit();
    }
  }

  redo() {
    if (this.store.get().mode !== 'edit' || this.gesture) return;
    if (this.scene?.doc.redo()) {
      play('undo');
      this.afterCommit();
    }
  }

  rename(name: string) {
    const doc = this.scene?.doc;
    if (!doc || !name.trim() || name === doc.base.name) return;
    doc.base.name = name.trim();
    doc.markDirty();
    this.afterCommit();
  }

  /** Edits the waves document as one undo step. */
  editWaves(label: string, fn: (w: WavesDoc) => void) {
    const doc = this.scene?.doc;
    if (!doc) return;
    if (doc.transact(label, () => doc.editList('waves', fn))) this.afterCommit();
  }

  newGroupId(prefix: string) {
    const taken = this.scene?.doc.waves.rounds.flatMap((r) => r.groups.map((g) => g.id)) ?? [];
    return newId(prefix, taken);
  }

  // ---- themes -----------------------------------------------------------------------------------

  async refreshThemes() {
    try {
      this.store.set({ themes: await listThemes() });
      this.store.set({ themeCoverage: this.themeCoverage() });
    } catch {
      // the theme list is a convenience
    }
  }

  /** Previews the map in another theme. Only the art changes; the document and undo history stay. */
  async switchTheme(id: string) {
    const scene = this.scene;
    if (!scene || id === this.store.get().theme) return;
    try {
      await scene.switchTheme(id);
      this.store.set({ theme: id });
      this.setOverlay({});
      const fp = this.store.get().clear.fingerprint;
      this.toast(`Showing the ${this.store.get().themes.find((t) => t.id === id)?.name ?? id} theme. Gameplay fingerprint unchanged${fp ? ` (${fp.slice(0, 8)})` : ''}.`, 'ok');
    } catch (e) {
      this.toast((e as Error).message, 'warn');
    }
  }

  /** Map metadata: which themes ship for this map. Not gameplay, so the clear check stays valid. */
  setThemeSupported(id: string, on: boolean) {
    const doc = this.scene?.doc;
    if (!doc) return;
    const t = doc.base.themes;
    if (!on && id === t.default) {
      this.toast('That is the default theme. Pick another default first.', 'warn');
      return;
    }
    t.supported = on ? [...new Set([...t.supported, id])].sort() : t.supported.filter((s) => s !== id);
    doc.markDirty();
    this.afterCommit();
  }

  setDefaultTheme(id: string) {
    const doc = this.scene?.doc;
    if (!doc) return;
    doc.base.themes.default = id;
    if (!doc.base.themes.supported.includes(id)) doc.base.themes.supported = [...doc.base.themes.supported, id].sort();
    doc.markDirty();
    this.afterCommit();
  }

  /** For each supported theme: does it have art for every terrain and stamp this map uses? */
  private themeCoverage(): EditorUiState['themeCoverage'] {
    const doc = this.scene?.doc;
    const themes = this.store.get().themes;
    if (!doc || !themes.length) return [];
    const usedTerrain = [...new Set(doc.state.terrain.cells)].map((i) => doc.state.terrain.kinds[i]!);
    const usedKinds = [...new Set(doc.state.objects.map((o) => o.kind))];
    return doc.base.themes.supported.map((id) => {
      const t = themes.find((x) => x.id === id);
      if (!t) return { id, ok: false, notes: [`No themes/${id}.theme.json.`] };
      if (!t.built) return { id, ok: false, notes: ['Atlas not built yet. Run "npm run art".'] };
      const notes = [
        ...usedTerrain.filter((k) => !t.terrain.includes(k)).map((k) => `No art for terrain "${k}" (plain colour).`),
        ...usedKinds.filter((k) => !t.objects.includes(k)).map((k) => `No art for "${doc.reg.kinds[k]?.name ?? k}" (plain block).`),
      ];
      if (t.fallbacks) notes.push(`${t.fallbacks} slot${t.fallbacks > 1 ? 's use' : ' uses'} fallback art.`);
      return { id, ok: notes.length === 0 || (notes.length === 1 && !!t.fallbacks), notes };
    });
  }

  // ---- selection and inspector ------------------------------------------------------------------

  select(selection: Selection, showInspector = true) {
    this.store.set({ selection, inspect: this.buildInspect(selection), ...(selection && showInspector ? { rightTab: 'inspect' as const } : {}) });
    this.scene?.setSelection(selection, this.store.get().airDraft);
  }

  /** Runs an edit as one undo step and refreshes everything that depends on it. */
  private edit(label: string, fn: (doc: NonNullable<EditorController['scene']>['doc']) => T.Outcome | void) {
    const doc = this.scene?.doc;
    if (!doc) return;
    let outcome: T.Outcome | void = undefined;
    const changed = doc.transact(label, () => (outcome = fn(doc)));
    const o = outcome as T.Outcome | undefined;
    if (o?.refused) this.feedback(o, this.lastHover ?? { x: 0, y: 0 }, 'place');
    if (changed) this.afterCommit();
  }

  deleteSelection() {
    const sel = this.store.get().selection;
    if (!sel || sel.kind === 'junction') return;
    if (sel.kind === 'region') {
      const scene = this.scene;
      if (!scene) return;
      const base = T.baseTerrain(scene.doc, scene.assets.theme.terrain);
      this.edit('Delete selection', (doc) => ({ changed: C.eraseRegion(doc, sel, this.store.get().layers, base) }));
      play('erase');
      return;
    }
    const list = sel.kind === 'object' ? 'objects' : sel.kind === 'spawn' ? 'spawns' : sel.kind === 'exit' ? 'exits' : 'airRoutes';
    this.edit(`Delete ${sel.kind}`, (doc) => T.deleteById(doc, list, sel.id));
    play('erase');
    this.select(null, false);
  }

  setRemoval(id: string, removal: { cost: number; requires: string[] } | null) {
    this.edit('Removal', (doc) =>
      doc.editList('objects', (l) => {
        const o = l.find((x) => x.id === id);
        if (!o) return;
        if (removal) o.removal = removal;
        else delete o.removal;
        // nothing may require an object that is no longer removable
        if (!removal) for (const other of l) if (other.removal) other.removal.requires = other.removal.requires.filter((r) => r !== id);
      }),
    );
  }

  editJunction(cell: [number, number], label: string, fn: (p: import('@tdmm/map-format').JunctionPolicy) => void) {
    this.edit(label, (doc) => T.editJunctionPolicy(doc, { x: cell[0], y: cell[1] }, fn));
  }

  resetJunction(cell: [number, number]) {
    this.edit('Reset branch policy', (doc) =>
      doc.editList('junctions', (l) => {
        const i = l.findIndex((j) => j.cell[0] === cell[0] && j.cell[1] === cell[1]);
        if (i >= 0) l.splice(i, 1);
      }),
    );
  }

  setAirSmooth(id: string, smooth: boolean) {
    this.edit('Smooth flight path', (doc) =>
      doc.editList('airRoutes', (l) => {
        const r = l.find((x) => x.id === id);
        if (r) r.smooth = smooth;
      }),
    );
  }

  async save(force = false) {
    const doc = this.scene?.doc;
    if (!doc || this.store.get().saveState === 'saving') return;
    const { map, waves } = doc.toDocs();
    // The clear check gates "publishing": a passing map is stamped with a record the repo test
    // verifies; a failing one is saved as a draft (no record), which the repo test rejects.
    const check = runClearCheck(doc.state, doc.reg, waves);
    const stamped: WavesDoc = check.record ? { ...waves, clearCheck: check.record } : waves;
    this.store.set({ saveState: 'saving', saveMessage: undefined });
    try {
      const res = await saveMapFiles(map.id, printMap(map), printWaves(stamped), this.baseHash, force);
      this.baseHash = res.hash;
      doc.markSaved();
      doc.loadedClearCheck = check.record;
      await clearAutosaves(map.id);
      play('save');
      if (res.downloaded) {
        // Hosted build: no dev server to write maps/, so the files were downloaded instead.
        this.store.set({ saveState: 'saved', saveMessage: `Downloaded ${map.id}.map.json and ${map.id}.waves.json` });
        this.toast(`Downloaded ${map.id}.map.json and .waves.json${check.passed ? ' (cleared ✓)' : ' (draft: fails the clear check)'}. Put them in maps/ in the repo to publish the map.`, check.passed ? 'ok' : 'warn');
      } else {
        this.store.set({ saveState: 'saved', saveMessage: `Saved maps/${map.id}.map.json` });
        if (check.passed) this.toast(`Saved and cleared ✓ ${check.record!.rounds} rounds play out with no towers. Ready to commit.`, 'ok');
        else this.toast(`Saved as a draft: ${check.problems[0]?.message ?? 'the clear check failed'} The repo test will refuse it until it clears.`, 'warn');
      }
      this.syncStore();
      void this.refreshMapList();
    } catch (e) {
      if (e instanceof SaveConflictError) {
        this.store.set({ saveState: 'conflict', saveMessage: `${e.message}. Overwrite it, or reopen the map to see the other version.` });
      } else {
        this.store.set({ saveState: 'error', saveMessage: (e as Error).message });
      }
      play('refuse');
    }
  }

  /** Playtest: start the game's real scene with the unsaved in-memory map and waves; Esc comes back. */
  play() {
    if (!this.game || !this.scene || this.store.get().mode === 'play') return;
    const { map, waves } = this.scene.doc.toDocs();
    const data: GameSceneData = { map, waves, theme: this.store.get().theme || undefined, startRound: this.store.get().startRound, onExit: () => this.stopPlay() };
    this.cancelGesture();
    this.scene.scene.sleep();
    this.game.scene.start(GAME_SCENE_KEY, data);
    this.setHover(null);
    this.store.set({ mode: 'play' });
  }

  stopPlay() {
    if (!this.game || !this.scene || this.store.get().mode !== 'play') return;
    const log = (this.game.scene.getScene(GAME_SCENE_KEY) as GameScene | null)?.runLog() ?? [];
    this.game.scene.stop(GAME_SCENE_KEY);
    this.scene.scene.wake();
    this.store.set({ mode: 'edit' });
    this.runTrails = summarizeRun(log, this.scene.doc.state.exits);
    this.store.set({ lastRun: this.runTrails ? { enemies: this.runTrails.enemies, leaked: this.runTrails.leaked } : null });
    this.scene.setTrails(this.store.get().showTrails ? this.runTrails : null);
    if (this.runTrails) this.toast(`Last run: ${this.runTrails.enemies} enemies, ${this.runTrails.leaked} leaked. Trails stay until your next edit (L hides them).`, 'info');
  }

  private clearTrails() {
    if (!this.runTrails) return;
    this.runTrails = null;
    this.store.set({ lastRun: null });
    this.scene?.setTrails(null);
  }

  focusProblem(p: Problem) {
    const scene = this.scene;
    if (!scene || !p.cells.length) return;
    const ts = scene.view.tileSize;
    const [x, y] = p.cells[0]!;
    scene.cameras.main.pan((x + 0.5) * ts, (y + 0.5) * ts, 250, 'Sine.easeInOut');
    scene.focus(p.cells);
  }

  fitView() {
    const scene = this.scene;
    if (!scene) return;
    const cam = scene.cameras.main;
    const fit = Math.min(cam.width / scene.view.widthInPixels, cam.height / scene.view.heightInPixels);
    const zoom = [...ZOOMS].reverse().find((z) => z <= fit) ?? ZOOMS[0]!;
    cam.setZoom(zoom);
    cam.centerOn(scene.view.widthInPixels / 2, scene.view.heightInPixels / 2);
    this.store.set({ zoom });
  }

  toast(text: string, tone: 'info' | 'warn' | 'ok' = 'info') {
    const now = performance.now();
    if (text === this.lastToast.text && now - this.lastToast.at < 1500) return;
    this.lastToast = { text, at: now };
    const id = ++this.toastId;
    this.store.set({ toast: { id, text, tone } });
    setTimeout(() => this.store.get().toast?.id === id && this.store.set({ toast: null }), 3200);
  }

  // ---- pointer input ----------------------------------------------------------------------------

  private onPointerDown(e: PointerEvent) {
    const scene = this.scene;
    if (!scene || this.store.get().mode !== 'edit' || this.gesture) return;
    this.host?.setPointerCapture(e.pointerId);
    if (e.button === 1 || (e.button === 0 && this.spaceHeld)) {
      this.gesture = { kind: 'pan', lastX: e.clientX, lastY: e.clientY };
      e.preventDefault();
      return;
    }
    if (e.button !== 0 && e.button !== 2) return;
    const cell = this.cellAt(e);
    this.lastWorld = this.worldAt(e);
    this.exact = e.shiftKey;
    if (e.button === 0 && e.altKey) {
      this.eyedropper(cell);
      return;
    }
    const right = e.button === 2;
    const s = this.store.get();
    if (s.paste) {
      if (right) this.stopPaste();
      else this.commitPaste(cell);
      return;
    }
    const doc = scene.doc;
    const base = T.baseTerrain(doc, scene.assets.theme.terrain);
    doc.begin(`${s.tool}`);
    switch (s.tool) {
      case 'terrain':
        if (right) {
          doc.commit();
          this.eyedropper(cell);
          return;
        }
        if (s.terrainMode === 'rect') this.gesture = { kind: 'rect', start: cell, end: cell };
        else if (s.terrainMode === 'fill') this.feedback(T.paintTerrainCells(doc, T.floodCells(doc, cell), s.brush.terrain), cell, 'paint');
        else this.startCells(cell, (c) => T.paintTerrain(doc, c, s.brush.terrain), 'paint');
        break;
      case 'path':
        if (right) this.startCells(cell, (c) => T.pathErase(doc, c, base), 'erase');
        else {
          const r = T.pathStart(doc, cell, s.brush.path);
          this.feedback(r, cell, 'paint');
          this.gesture = { kind: 'path', last: r.refused ? null : cell, style: s.brush.path };
        }
        break;
      case 'spawn':
      case 'exit': {
        if (right) this.feedback(T.removeMarkerAt(doc, cell), cell, 'erase');
        else {
          const at = this.markerSnap(cell)?.cell ?? cell;
          this.feedback(s.tool === 'exit' ? T.placeExit(doc, at) : T.placeSpawn(doc, at, s.brush.spawn), at, 'place');
        }
        break;
      }
      case 'stamp':
        if (right) this.feedback(T.removeObjectAt(doc, cell), cell, 'erase');
        else {
          const at = this.stampSnap(s.brush.stamp, cell)?.cell ?? cell;
          this.feedback(T.placeStamp(doc, at, s.brush.stamp), at, 'place');
          this.gesture = { kind: 'stamp', last: cell };
        }
        break;
      case 'zone':
        this.startCells(cell, (c) => T.paintZone(doc, c, right ? null : s.brush.zone), right ? 'erase' : 'paint');
        break;
      case 'eraser':
        this.startCells(cell, (c) => T.eraseAt(doc, c, base), 'erase');
        break;
      case 'tower':
        this.testTowerDown(cell, right);
        break;
      case 'select':
        this.selectDown(cell, this.worldAt(e), right);
        break;
      case 'air':
        this.airDown(cell, this.worldAt(e), right);
        break;
    }
    if (!this.gesture) this.endTransaction();
  }

  /**
   * Select tool: pick the top-most thing; drag objects and flight-path waypoints to move them.
   * Dragging from empty ground (or Shift+drag anywhere) draws a marquee for copy and paste.
   */
  private selectDown(cell: Cell, world: [number, number], right: boolean) {
    const doc = this.scene!.doc;
    if (this.exact && !right) {
      this.select(null, false);
      this.gesture = { kind: 'marquee', start: cell, end: cell };
      return;
    }
    const wp = T.nearestWaypoint(doc, world);
    if (wp && !right) {
      this.select({ kind: 'airRoute', id: wp.routeId });
      this.gesture = { kind: 'waypoint', ...wp };
      return;
    }
    const o = T.objectAt(doc, cell);
    const spawn = doc.state.spawns.find((m) => m.cell[0] === cell.x && m.cell[1] === cell.y);
    const exit = doc.state.exits.find((m) => m.cell[0] === cell.x && m.cell[1] === cell.y);
    const isJunction = T.junctionOuts(doc, cell).length > 1;
    const sel: Selection = spawn ? { kind: 'spawn', id: spawn.id } : exit ? { kind: 'exit', id: exit.id } : isJunction ? { kind: 'junction', cell: [cell.x, cell.y] } : o ? { kind: 'object', id: o.id } : null;
    this.select(sel, !!sel);
    if (sel?.kind === 'object' && o && !right) this.gesture = { kind: 'moveObject', id: o.id, offset: { x: cell.x - o.x, y: cell.y - o.y }, last: cell };
    else if (!sel && !right) this.gesture = { kind: 'marquee', start: cell, end: cell };
  }

  /** Flight path tool: click an air spawn, click waypoints, click an exit. Drag/right-click handles. */
  private airDown(cell: Cell, world: [number, number], right: boolean) {
    const doc = this.scene!.doc;
    const draft = this.store.get().airDraft;
    const snap = (v: number) => Math.round(v * 2) / 2;
    if (!draft) {
      const wp = T.nearestWaypoint(doc, world);
      if (wp && right) {
        this.feedback(T.deleteWaypoint(doc, wp.routeId, wp.index), cell, 'erase');
        return;
      }
      if (wp) {
        this.select({ kind: 'airRoute', id: wp.routeId }, false);
        this.gesture = { kind: 'waypoint', ...wp };
        return;
      }
      if (right) return;
      const spawn = T.airSpawnAt(doc, cell);
      if (!spawn) {
        this.feedback({ changed: false, refused: 'Start a flight path on an air spawn (Spawn tool → Air).' }, cell, 'place');
        return;
      }
      this.store.set({ airDraft: { from: spawn.id, points: [] } });
      play('paint');
    } else if (right) {
      this.store.set({ airDraft: null });
      play('erase');
    } else {
      const exit = T.exitAt(doc, cell);
      if (exit) {
        const r = T.createAirRoute(doc, draft.from, exit.id, draft.points);
        this.store.set({ airDraft: null });
        this.feedback(r, cell, 'place');
        this.select({ kind: 'airRoute', id: r.id }, false);
      } else {
        this.store.set({ airDraft: { ...draft, points: [...draft.points, [snap(world[0]), snap(world[1])]] } });
        play('paint');
      }
    }
    this.scene?.setSelection(this.store.get().selection, this.store.get().airDraft);
  }

  private onPointerMove(e: PointerEvent) {
    const scene = this.scene;
    if (!scene || this.store.get().mode !== 'edit') return;
    const g = this.gesture;
    if (g?.kind === 'pan') {
      const cam = scene.cameras.main;
      cam.scrollX -= (e.clientX - g.lastX) / cam.zoom;
      cam.scrollY -= (e.clientY - g.lastY) / cam.zoom;
      g.lastX = e.clientX;
      g.lastY = e.clientY;
      return;
    }
    const doc = scene.doc;
    // Coalesced events: fast strokes leave no gaps.
    const events = e.getCoalescedEvents?.() ?? [];
    for (const ev of events.length ? events : [e]) {
      const cell = this.cellAt(ev);
      if (g?.kind === 'cells' && (cell.x !== g.last.x || cell.y !== g.last.y)) {
        for (const c of lineCells(g.last, cell)) this.feedback(g.apply(c), c, g.cue, true);
        g.last = cell;
      } else if (g?.kind === 'path' && g.last && (cell.x !== g.last.x || cell.y !== g.last.y)) {
        const r = T.pathExtend(doc, g.last, cell, g.style);
        this.feedback(r, cell, 'paint', true);
        g.last = r.last;
      } else if (g?.kind === 'rect' || g?.kind === 'marquee') {
        g.end = cell;
      } else if (g?.kind === 'stamp' && (cell.x !== g.last.x || cell.y !== g.last.y)) {
        g.last = cell;
        const r = T.placeStamp(doc, cell, this.store.get().brush.stamp);
        if (r.changed) this.feedback(r, cell, 'place', true); // dragging only places where it fits
      } else if (g?.kind === 'moveObject' && (cell.x !== g.last.x || cell.y !== g.last.y)) {
        g.last = cell;
        // Only moves to spots where it fits, or the nearest one a cell away; otherwise it stays put.
        const o = doc.state.objects.find((v) => v.id === g.id);
        const want = { x: cell.x - g.offset.x, y: cell.y - g.offset.y };
        const to = (o && !this.exact && T.snapStamp(doc, o.kind, want, undefined, o.id)?.cell) || want;
        T.moveObject(doc, g.id, to.x, to.y);
      } else if (g?.kind === 'waypoint') {
        const [wx, wy] = this.worldAt(ev);
        T.moveWaypoint(doc, g.routeId, g.index, [Math.round(wx * 2) / 2, Math.round(wy * 2) / 2]);
      }
    }
    this.lastWorld = this.worldAt(e);
    this.exact = e.shiftKey;
    this.setHover(this.cellAt(e));
    if (this.store.get().airDraft) this.scene?.setDraftCursor(this.lastWorld);
  }

  private onPointerUp(e: PointerEvent) {
    if (this.host?.hasPointerCapture(e.pointerId)) this.host.releasePointerCapture(e.pointerId);
    const g = this.gesture;
    this.gesture = null;
    if (!g || g.kind === 'pan') return;
    if (g.kind === 'rect' && this.scene) {
      const s = this.store.get();
      this.feedback(T.paintTerrainCells(this.scene.doc, T.rectCells(g.start, g.end), s.brush.terrain), g.end, 'paint');
    }
    if (g.kind === 'marquee' && this.scene && (g.start.x !== g.end.x || g.start.y !== g.end.y)) {
      const r = C.clampRegion(C.normRegion(g.start, g.end), this.scene.doc.width, this.scene.doc.height);
      if (r) this.select({ kind: 'region', ...r });
    }
    this.endTransaction();
    if (this.lastHover) this.setHover(this.lastHover); // drop the rectangle preview
  }

  private startCells(cell: Cell, apply: (c: Cell) => T.Outcome, cue: 'paint' | 'erase' | 'place') {
    this.feedback(apply(cell), cell, cue);
    this.gesture = { kind: 'cells', last: cell, apply, cue };
  }

  private endTransaction() {
    if (this.scene?.doc.commit()) this.afterCommit();
  }

  private cancelGesture() {
    if (!this.gesture) return;
    this.gesture = null;
    this.endTransaction();
  }

  private feedback(r: T.Outcome, cell: Cell, cue: 'paint' | 'erase' | 'place', quiet = false) {
    if (r.refused) {
      if (!quiet || this.lastToast.text !== r.refused) {
        play('refuse');
        this.scene?.flashRefusal(cell.x, cell.y);
      }
      this.toast(r.refused, 'warn');
      return;
    }
    if (!r.changed) return;
    play(cue);
    if (r.placedId) this.scene?.view.objects.pop(r.placedId);
  }

  private eyedropper(cell: Cell) {
    const doc = this.scene?.doc;
    if (!doc || !doc.inside(cell.x, cell.y)) return;
    const o = T.objectAt(doc, cell);
    if (o) {
      this.store.set({ tool: 'stamp', brush: { ...this.store.get().brush, stamp: o.kind } });
      return;
    }
    const t = doc.terrainAt(cell.x, cell.y)!;
    if (doc.state.path[cell.y * doc.width + cell.x] !== NO_PATH) this.store.set({ tool: 'path', brush: { ...this.store.get().brush, path: t } });
    else this.store.set({ tool: 'terrain', brush: { ...this.store.get().brush, terrain: t } });
  }

  private onWheel(e: WheelEvent) {
    e.preventDefault(); // also blocks Ctrl+wheel page zoom over the canvas
    const scene = this.scene;
    if (!scene || this.store.get().mode !== 'edit') return;
    const cam = scene.cameras.main;
    const i = ZOOMS.indexOf(cam.zoom);
    const next = ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, (i < 0 ? 2 : i) + (e.deltaY < 0 ? 1 : -1)))]!;
    if (next === cam.zoom) return;
    // Keep the world point under the cursor fixed (screen = origin + zoom * (world - scroll - origin)).
    const { sx, sy } = this.screenPoint(e);
    const ox = cam.width * cam.originX;
    const oy = cam.height * cam.originY;
    const wx = (sx - ox) / cam.zoom + cam.scrollX + ox;
    const wy = (sy - oy) / cam.zoom + cam.scrollY + oy;
    cam.setZoom(next);
    cam.scrollX = wx - ox - (sx - ox) / next;
    cam.scrollY = wy - oy - (sy - oy) / next;
    this.store.set({ zoom: next });
  }

  private onKey(e: KeyboardEvent, down: boolean) {
    const target = e.target as HTMLElement | null;
    // Shortcuts stand down only while typing; a focused checkbox or button shouldn't swallow them.
    const typing =
      target &&
      ((target.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'range'].includes((target as HTMLInputElement).type)) ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable);
    if (typing) return;
    // Some synthetic and IME events leave `code` empty; fall back to the key's letter or digit.
    const code = e.code || (/^[a-z]$/i.test(e.key) ? `Key${e.key.toUpperCase()}` : /^[0-9]$/.test(e.key) ? `Digit${e.key}` : e.key === ' ' ? 'Space' : e.key);
    if (code === 'Space') {
      this.spaceHeld = down;
      if (this.store.get().mode === 'edit') e.preventDefault();
      return;
    }
    if (!down || this.store.get().mode !== 'edit') return;
    const mod = e.ctrlKey || e.metaKey;
    const s = this.store.get();
    if (mod) {
      if (code === 'KeyZ') this.run(e, () => (e.shiftKey ? this.redo() : this.undo()));
      else if (code === 'KeyY') this.run(e, () => this.redo());
      else if (code === 'KeyS') this.run(e, () => void this.save());
      else if (code === 'KeyC') this.run(e, () => this.copySelection());
      else if (code === 'KeyX') this.run(e, () => this.copySelection(true));
      else if (code === 'KeyV') this.run(e, () => this.startPaste());
      else if (code === 'KeyA') this.run(e, () => this.selectAll());
      return;
    }
    const tools: Record<string, T.ToolId> = { KeyV: 'select', KeyT: 'terrain', KeyR: 'path', KeyS: 'spawn', KeyE: 'exit', KeyQ: 'air', KeyO: 'stamp', KeyZ: 'zone', KeyX: 'eraser', KeyC: 'tower' };
    if ((code === 'Delete' || code === 'Backspace') && s.selection) return this.run(e, () => this.deleteSelection());
    if (tools[code]) return this.setTool(tools[code]!);
    if (code === 'KeyG') return this.setOverlay({ showGrid: !s.showGrid });
    if (code === 'KeyB') return this.setOverlay({ showBuildable: !s.showBuildable });
    if (code === 'KeyA') return this.setOverlay({ showArrows: !s.showArrows });
    if (code === 'KeyH') return this.setOverlay({ showCoverage: !s.showCoverage });
    if (code === 'KeyL') return this.setOverlay({ showTrails: !s.showTrails });
    if (code === 'KeyM') return this.setOverlay({ muted: !s.muted });
    if (code === 'KeyF') return this.fitView();
    if (code === 'KeyP') return this.play();
    if (code === 'Escape') {
      if (s.paste) return this.stopPaste();
      if (s.airDraft) {
        this.store.set({ airDraft: null });
        this.scene?.setSelection(s.selection, null);
      } else if (s.selection) this.select(null, false);
      return this.cancelGesture();
    }
    const digit = /^Digit([1-9])$/.exec(code);
    if (digit) {
      const n = Number(digit[1]) - 1;
      // 1-9 follow the palette as shown: pinned first, then the rest, filtered by the search
      const list = ({ terrain: 'terrain', path: 'path', stamp: 'stamp', zone: 'zone' } as const)[s.tool as 'terrain' | 'path' | 'stamp' | 'zone'];
      const item = list && P.libraryView(this.libraryItems(list), list, s.library).ordered[n];
      if (list && item) this.setBrush({ [list]: item.id });
      if (s.tool === 'spawn' && n < 2) this.setBrush({ spawn: n === 0 ? 'ground' : 'air' });
    }
  }

  private run(e: KeyboardEvent, fn: () => void) {
    e.preventDefault();
    fn();
  }

  // ---- hover, ghosts, camera helpers ------------------------------------------------------------

  private setHover(cell: Cell | null) {
    const scene = this.scene;
    this.lastHover = cell;
    if (!scene) return;
    if (!cell || this.store.get().mode !== 'edit') {
      scene.showGhost(null);
      this.store.set({ hover: null });
      return;
    }
    const s = this.store.get();
    const doc = scene.doc;
    const color = (id: string) => parseInt((s.terrains.find((t) => t.id === id)?.color ?? '#ffffff').slice(1), 16);
    const g = this.gesture;
    let ghost: Ghost;
    let snapNote: string | undefined;
    if (s.paste && this.clip) {
      scene.showGhost(null);
      const at = this.pasteOrigin(cell, this.clip);
      const plan = C.planPaste(doc.state, doc.reg, this.clip, at);
      scene.showPaste({ clip: this.clip, at, plan });
      const where = `paste ${this.clip.w}×${this.clip.h} at (${at.x}, ${at.y})`;
      this.store.set({ hover: { x: cell.x, y: cell.y, lines: [plan.ok ? `${where} · click to place · right-click or Esc to stop` : `✗ ${plan.reason}`, ...(plan.ok ? [] : [where])] } });
      return;
    }
    if (g?.kind === 'rect') ghost = { kind: 'rect', x0: g.start.x, y0: g.start.y, x1: g.end.x, y1: g.end.y, color: color(s.brush.terrain) };
    else if (g?.kind === 'marquee') ghost = { kind: 'rect', x0: g.start.x, y0: g.start.y, x1: g.end.x, y1: g.end.y, color: 0x80d0ff };
    else if (s.tool === 'stamp') {
      const snap = g ? null : this.stampSnap(s.brush.stamp, cell);
      const at = snap?.cell ?? cell;
      ghost = { kind: 'stamp', x: at.x, y: at.y, stamp: s.brush.stamp, from: snap?.snapped ? cell : undefined };
      if (snap?.snapped) snapNote = `↪ snaps one cell over (${snap.reason?.toLowerCase()} here) · hold Shift for exact`;
    } else if (s.tool === 'tower') {
      const snap = T.snapTower(doc, cell, this.lastWorld ?? undefined);
      const at = snap && (!snap.snapped || !this.exact) ? snap.cell : null;
      if (at) {
        const v = doc.validate();
        const c = towerCoverage(doc.state, doc.reg, v.compiled.routes, routeShares(v.compiled.routes, s.stats?.map((r) => r.byRoute)), at.x, at.y, s.testRange);
        ghost = { kind: 'tower', x: at.x, y: at.y, range: c.range, ok: true, from: snap?.snapped ? cell : undefined };
        snapNote = `test tower: ${c.expected.toFixed(1)} tiles of path in range (range ${Math.round(c.range * 100) / 100})${snap?.snapped ? ' · snapped one cell, Shift for exact' : ''}`;
      } else ghost = { kind: 'tower', x: cell.x, y: cell.y, range: 0, ok: false };
    } else {
      const zoneColor = parseInt((s.zoneTypes.find((z) => z.id === s.brush.zone)?.color ?? '#c070ff').slice(1), 16);
      const c = { terrain: color(s.brush.terrain), path: color(s.brush.path), spawn: 0xe83030, exit: 0xf8d030, zone: zoneColor, eraser: 0xffffff, stamp: 0, select: 0x80d0ff, air: 0x60c0f0 }[s.tool];
      const snap = s.tool === 'spawn' || s.tool === 'exit' ? this.markerSnap(cell) : null;
      const at = snap?.cell ?? cell;
      ghost = { kind: 'cell', x: at.x, y: at.y, color: c, from: snap?.snapped ? cell : undefined };
      if (snap?.snapped) snapNote = '↪ snaps to the path next to the pointer · hold Shift for exact';
    }
    const check = scene.showGhost(ghost);

    const lines: string[] = [];
    if (doc.inside(cell.x, cell.y)) {
      const i = cell.y * doc.width + cell.x;
      const v = doc.validate();
      const t = doc.terrainAt(cell.x, cell.y)!;
      lines.push(scene.assets.terrainTypes[t]?.name ?? t);
      const out = doc.state.path[i]!;
      if (out !== NO_PATH) {
        const dirs = [
          [DIR_N, 'N'],
          [DIR_E, 'E'],
          [DIR_S, 'S'],
          [DIR_W, 'W'],
        ].filter(([b]) => out & (b as number)).map(([, n]) => n);
        lines.push(dirs.length ? `path → ${dirs.join(' ')}` : 'path end');
      }
      const block = v.buildable.block[i]!;
      const zone = doc.zoneAt(cell.x, cell.y);
      if (zone) lines.push(scene.assets.zones[zone]?.name ?? zone);
      const range = rangeMultiplierAt(doc.state, doc.reg, cell.x, cell.y);
      if (range !== 1) lines.push(`range ×${Math.round(range * 100) / 100}`);
      if (block) lines.push(`no towers: ${BUILD_BLOCK_REASON[block]}`);
      else {
        const classes = v.buildable.classes.filter((_, k) => v.buildable.classMask[i]! & (1 << k));
        lines.push(`towers: ${classes.join(', ')}`);
        if (s.showCoverage && s.tool !== 'tower') {
          const c = towerCoverage(doc.state, doc.reg, v.compiled.routes, routeShares(v.compiled.routes, s.stats?.map((r) => r.byRoute)), cell.x, cell.y, s.testRange);
          lines.push(`coverage ${c.expected.toFixed(1)} tiles${s.coverageMax ? ` (${Math.round((c.expected / s.coverageMax) * 100)}% of best)` : ''}`);
        }
      }
      const o = T.objectAt(doc, cell);
      if (o) lines.push(`${scene.assets.kinds[o.kind]?.name ?? o.kind} (${o.id})${o.removal ? ` · removable ${o.removal.cost}` : ''}`);
      const marker = [...doc.state.spawns, ...doc.state.exits].find((m) => m.cell[0] === cell.x && m.cell[1] === cell.y);
      if (marker) lines.push(`marker "${marker.id}"`);
    } else lines.push('outside the map');
    if (check && !check.ok && check.reason) lines.push(`✗ ${check.reason}`);
    if (snapNote) lines.push(snapNote);
    this.store.set({ hover: { x: cell.x, y: cell.y, lines } });
  }

  /** Where a stamp click at `cell` lands: forgiveness snapping unless Shift is held. */
  private stampSnap(kind: string, cell: Cell): T.Snap | null {
    const doc = this.scene?.doc;
    if (!doc) return null;
    if (this.exact) return { cell, snapped: false };
    return T.snapStamp(doc, kind, cell, this.lastWorld ?? undefined);
  }

  /** Ground spawns and exits snap onto a path cell next to the pointer (air spawns go anywhere). */
  private markerSnap(cell: Cell): T.Snap | null {
    const doc = this.scene?.doc;
    const s = this.store.get();
    if (!doc || this.exact || (s.tool === 'spawn' && s.brush.spawn === 'air')) return null;
    return T.snapToPath(doc, cell, s.tool === 'exit', this.lastWorld ?? undefined);
  }

  private revealCells(indices: number[]) {
    const scene = this.scene;
    if (!scene) return;
    const w = scene.doc.width;
    const ts = scene.view.tileSize;
    const xs = indices.map((i) => i % w);
    const ys = indices.map((i) => Math.floor(i / w));
    const cx = ((Math.min(...xs) + Math.max(...xs) + 1) / 2) * ts;
    const cy = ((Math.min(...ys) + Math.max(...ys) + 1) / 2) * ts;
    const view = scene.cameras.main.worldView;
    if (!view.contains(cx, cy)) scene.cameras.main.pan(cx, cy, 200, 'Sine.easeInOut');
  }

  private screenPoint(e: { clientX: number; clientY: number }) {
    const canvas = this.game!.canvas;
    const rect = canvas.getBoundingClientRect();
    return { sx: ((e.clientX - rect.left) * canvas.width) / rect.width, sy: ((e.clientY - rect.top) * canvas.height) / rect.height };
  }

  /** Pointer position in tile units (cell centre = x + 0.5). */
  private worldAt(e: { clientX: number; clientY: number }): [number, number] {
    const scene = this.scene!;
    const cam = scene.cameras.main;
    const { sx, sy } = this.screenPoint(e);
    const ox = cam.width * cam.originX;
    const oy = cam.height * cam.originY;
    const ts = scene.view.tileSize;
    return [((sx - ox) / cam.zoom + cam.scrollX + ox) / ts, ((sy - oy) / cam.zoom + cam.scrollY + oy) / ts];
  }

  private cellAt(e: { clientX: number; clientY: number }): Cell {
    const scene = this.scene!;
    const cam = scene.cameras.main;
    const { sx, sy } = this.screenPoint(e);
    const ox = cam.width * cam.originX;
    const oy = cam.height * cam.originY;
    const wx = (sx - ox) / cam.zoom + cam.scrollX + ox;
    const wy = (sy - oy) / cam.zoom + cam.scrollY + oy;
    const ts = scene.view.tileSize;
    return { x: Math.floor(wx / ts), y: Math.floor(wy / ts) };
  }
}

/** Grid cells on the line from a to b (Bresenham), excluding a. */
export function lineCells(a: Cell, b: Cell): Cell[] {
  const cells: Cell[] = [];
  let { x, y } = a;
  const dx = Math.abs(b.x - x);
  const dy = -Math.abs(b.y - y);
  const sx = x < b.x ? 1 : -1;
  const sy = y < b.y ? 1 : -1;
  let err = dx + dy;
  while (x !== b.x || y !== b.y) {
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
    cells.push({ x, y });
  }
  return cells;
}
