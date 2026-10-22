import Phaser from 'phaser';
import { DIR_E, DIR_N, DIR_S, DIR_W, NO_PATH, emptyWaves, newId, parseMap, parseWaves, printMap, printWaves, type MapDoc, type Problem, type WavesDoc } from '@tdmm/map-format';
import { GameScene, GAME_SCENE_KEY, type GameSceneData } from '@tdmm/game/scene';
import { BUILD_BLOCK_REASON, footprintBounds, rangeMultiplierAt } from '@tdmm/rules';
import { clearCheckIsCurrent, runClearCheck } from '@tdmm/sim';
import type { Change } from './document.ts';
import { EditorScene, EDITOR_SCENE_KEY, type Ghost } from './EditorScene.ts';
import { play, setMuted } from './sound.ts';
import { SaveConflictError, clearAutosaves, latestAutosave, listMaps, loadMapFiles, saveMapFiles, writeAutosave } from './storage.ts';
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
    void this.refreshMapList();
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
    });
    this.syncStore();
  }

  // ---- document sync ----------------------------------------------------------------------------

  private onDocChange(c: Change) {
    if (c.fromHistory && c.cells.length) this.revealCells(c.cells.map((x) => x.index));
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
    });
    this.scheduleClearCheck();
    this.scene?.setSelection(prev.selection, prev.airDraft);
    if (this.lastHover) this.setHover(this.lastHover);
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
      this.store.set({ clear: { status: r.passed ? 'passed' : 'failed', problems: r.problems, savedCurrent, summary }, stats: r.stats.length ? r.stats : null });
    }, 400);
  }

  private buildInspect(sel: Selection): Inspect | null {
    const doc = this.scene?.doc;
    if (!doc || !sel) return null;
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
      if (!doc?.dirty) return;
      const { map, waves } = doc.toDocs();
      void writeAutosave({ mapId: map.id, baseHash: this.baseHash, map: printMap(map), waves: printWaves(waves) });
    }, 1200);
  }

  // ---- commands ---------------------------------------------------------------------------------

  setTool(tool: T.ToolId) {
    this.store.set({ tool });
    if (this.lastHover) this.setHover(this.lastHover);
  }

  setBrush(patch: Partial<EditorUiState['brush']>) {
    this.store.set({ brush: { ...this.store.get().brush, ...patch } });
    if (this.lastHover) this.setHover(this.lastHover);
  }

  setTerrainMode(terrainMode: T.TerrainMode) {
    this.store.set({ terrainMode, tool: 'terrain' });
  }

  setOverlay(patch: Partial<Pick<EditorUiState, 'showGrid' | 'showArrows' | 'showBuildable' | 'buildableOpacity' | 'muted'>>) {
    this.store.set(patch);
    if (patch.muted !== undefined) setMuted(patch.muted);
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
      this.store.set({ saveState: 'saved', saveMessage: `Saved maps/${map.id}.map.json` });
      if (check.passed) this.toast(`Saved and cleared ✓ ${check.record!.rounds} rounds play out with no towers. Ready to commit.`, 'ok');
      else this.toast(`Saved as a draft: ${check.problems[0]?.message ?? 'the clear check failed'} The repo test will refuse it until it clears.`, 'warn');
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
    const data: GameSceneData = { map, waves, startRound: this.store.get().startRound, onExit: () => this.stopPlay() };
    this.cancelGesture();
    this.scene.scene.sleep();
    this.game.scene.start(GAME_SCENE_KEY, data);
    this.setHover(null);
    this.store.set({ mode: 'play' });
  }

  stopPlay() {
    if (!this.game || !this.scene || this.store.get().mode !== 'play') return;
    this.game.scene.stop(GAME_SCENE_KEY);
    this.scene.scene.wake();
    this.store.set({ mode: 'edit' });
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
    if (e.button === 0 && e.altKey) {
      this.eyedropper(cell);
      return;
    }
    const right = e.button === 2;
    const s = this.store.get();
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
        this.feedback(right ? T.removeMarkerAt(doc, cell) : T.placeSpawn(doc, cell, s.brush.spawn), cell, right ? 'erase' : 'place');
        break;
      case 'exit':
        this.feedback(right ? T.removeMarkerAt(doc, cell) : T.placeExit(doc, cell), cell, right ? 'erase' : 'place');
        break;
      case 'stamp':
        if (right) this.feedback(T.removeObjectAt(doc, cell), cell, 'erase');
        else {
          this.feedback(T.placeStamp(doc, cell, s.brush.stamp), cell, 'place');
          this.gesture = { kind: 'stamp', last: cell };
        }
        break;
      case 'zone':
        this.startCells(cell, (c) => T.paintZone(doc, c, right ? null : s.brush.zone), right ? 'erase' : 'paint');
        break;
      case 'eraser':
        this.startCells(cell, (c) => T.eraseAt(doc, c, base), 'erase');
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

  /** Select tool: pick the top-most thing; drag objects and flight-path waypoints to move them. */
  private selectDown(cell: Cell, world: [number, number], right: boolean) {
    const doc = this.scene!.doc;
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
      } else if (g?.kind === 'rect') {
        g.end = cell;
      } else if (g?.kind === 'stamp' && (cell.x !== g.last.x || cell.y !== g.last.y)) {
        g.last = cell;
        const r = T.placeStamp(doc, cell, this.store.get().brush.stamp);
        if (r.changed) this.feedback(r, cell, 'place', true); // dragging only places where it fits
      } else if (g?.kind === 'moveObject' && (cell.x !== g.last.x || cell.y !== g.last.y)) {
        g.last = cell;
        // Only moves to spots where it fits; the object stays put (and the ghost shows why) otherwise.
        T.moveObject(doc, g.id, cell.x - g.offset.x, cell.y - g.offset.y);
      } else if (g?.kind === 'waypoint') {
        const [wx, wy] = this.worldAt(ev);
        T.moveWaypoint(doc, g.routeId, g.index, [Math.round(wx * 2) / 2, Math.round(wy * 2) / 2]);
      }
    }
    this.lastWorld = this.worldAt(e);
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
    if (e.code === 'Space') {
      this.spaceHeld = down;
      if (this.store.get().mode === 'edit') e.preventDefault();
      return;
    }
    if (!down || this.store.get().mode !== 'edit') return;
    const mod = e.ctrlKey || e.metaKey;
    const s = this.store.get();
    if (mod) {
      if (e.code === 'KeyZ') this.run(e, () => (e.shiftKey ? this.redo() : this.undo()));
      else if (e.code === 'KeyY') this.run(e, () => this.redo());
      else if (e.code === 'KeyS') this.run(e, () => void this.save());
      return;
    }
    const tools: Record<string, T.ToolId> = { KeyV: 'select', KeyT: 'terrain', KeyR: 'path', KeyS: 'spawn', KeyE: 'exit', KeyQ: 'air', KeyO: 'stamp', KeyZ: 'zone', KeyX: 'eraser' };
    if ((e.code === 'Delete' || e.code === 'Backspace') && s.selection) return this.run(e, () => this.deleteSelection());
    if (tools[e.code]) return this.setTool(tools[e.code]!);
    if (e.code === 'KeyG') return this.setOverlay({ showGrid: !s.showGrid });
    if (e.code === 'KeyB') return this.setOverlay({ showBuildable: !s.showBuildable });
    if (e.code === 'KeyA') return this.setOverlay({ showArrows: !s.showArrows });
    if (e.code === 'KeyM') return this.setOverlay({ muted: !s.muted });
    if (e.code === 'KeyF') return this.fitView();
    if (e.code === 'KeyP') return this.play();
    if (e.code === 'Escape') {
      if (s.airDraft) {
        this.store.set({ airDraft: null });
        this.scene?.setSelection(s.selection, null);
      } else if (s.selection) this.select(null, false);
      return this.cancelGesture();
    }
    const digit = /^Digit([1-9])$/.exec(e.code);
    if (digit) {
      const n = Number(digit[1]) - 1;
      if (s.tool === 'terrain' && s.terrains[n]) this.setBrush({ terrain: s.terrains[n]!.id });
      if (s.tool === 'path') {
        const styles = s.terrains.filter((t) => t.pathStyle);
        if (styles[n]) this.setBrush({ path: styles[n]!.id });
      }
      if (s.tool === 'stamp' && s.stamps[n]) this.setBrush({ stamp: s.stamps[n]!.id });
      if (s.tool === 'spawn' && n < 2) this.setBrush({ spawn: n === 0 ? 'ground' : 'air' });
      if (s.tool === 'zone' && s.zoneTypes[n]) this.setBrush({ zone: s.zoneTypes[n]!.id });
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
    if (g?.kind === 'rect') ghost = { kind: 'rect', x0: g.start.x, y0: g.start.y, x1: g.end.x, y1: g.end.y, color: color(s.brush.terrain) };
    else if (s.tool === 'stamp') ghost = { kind: 'stamp', x: cell.x, y: cell.y, stamp: s.brush.stamp };
    else {
      const zoneColor = parseInt((s.zoneTypes.find((z) => z.id === s.brush.zone)?.color ?? '#c070ff').slice(1), 16);
      const c = { terrain: color(s.brush.terrain), path: color(s.brush.path), spawn: 0xe83030, exit: 0xf8d030, zone: zoneColor, eraser: 0xffffff, stamp: 0, select: 0x80d0ff, air: 0x60c0f0 }[s.tool];
      ghost = { kind: 'cell', x: cell.x, y: cell.y, color: c };
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
      }
      const o = T.objectAt(doc, cell);
      if (o) lines.push(`${scene.assets.kinds[o.kind]?.name ?? o.kind} (${o.id})${o.removal ? ` · removable ${o.removal.cost}` : ''}`);
      const marker = [...doc.state.spawns, ...doc.state.exits].find((m) => m.cell[0] === cell.x && m.cell[1] === cell.y);
      if (marker) lines.push(`marker "${marker.id}"`);
    } else lines.push('outside the map');
    if (check && !check.ok && check.reason) lines.push(`✗ ${check.reason}`);
    this.store.set({ hover: { x: cell.x, y: cell.y, lines } });
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
