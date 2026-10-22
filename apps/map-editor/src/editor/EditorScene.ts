import Phaser from 'phaser';
import { DIR_E, DIR_N, DIR_S, DIR_W, NO_PATH, type MapDoc, type WavesDoc } from '@tdmm/map-format';
import { DEPTH, MapView, atlasTextureKey, preloadTheme, themeAssets, ySortDepth, type ThemeAssets } from '@tdmm/map-runtime';
import { BuildBlock, checkPlacement, footprintBounds, occupancy, type PlacementCheck } from '@tdmm/rules';
import { EditorDocument } from './document.ts';
import type { Selection } from './store.ts';

export const EDITOR_SCENE_KEY = 'editor';

export interface EditorSceneData {
  map: MapDoc;
  waves: WavesDoc;
  onReady: (scene: EditorScene) => void;
  onError: (error: Error) => void;
}

export type Ghost =
  | { kind: 'cell'; x: number; y: number; color: number }
  | { kind: 'rect'; x0: number; y0: number; x1: number; y1: number; color: number }
  | { kind: 'stamp'; x: number; y: number; stamp: string }
  | null;

const OVERLAY_COLORS = { land: 0x40e060, water: 0x40a0ff, other: 0xc080ff, blocked: 0xff3040, removable: 0xffa030 };
const POLICY_COLORS = { alternate: 0xffd040, weighted: 0xff9030, random: 0xc070ff };
const hex = (c: string) => parseInt(c.slice(1), 16);

/** Renders the document through the shared MapView, plus editor-only overlays. */
export class EditorScene extends Phaser.Scene {
  private params!: EditorSceneData;
  doc!: EditorDocument;
  view!: MapView;
  assets!: ThemeAssets;
  private gridLines!: Phaser.GameObjects.Graphics;
  private buildable!: Phaser.GameObjects.Graphics;
  private arrows!: Phaser.GameObjects.Graphics;
  private problemMarks!: Phaser.GameObjects.Graphics;
  private cursor!: Phaser.GameObjects.Graphics;
  private ghostImage!: Phaser.GameObjects.Image;
  private focusMark!: Phaser.GameObjects.Graphics;
  private zonesGfx!: Phaser.GameObjects.Graphics;
  private airGfx!: Phaser.GameObjects.Graphics;
  private selGfx!: Phaser.GameObjects.Graphics;
  private badges = new Map<string, Phaser.GameObjects.Text>();
  private selection: Selection = null;
  private draft: { from: string; points: [number, number][] } | null = null;
  private draftCursor: [number, number] | null = null;
  private overlaysDirty = true;
  private focusCells: [number, number][] = [];
  private focusUntil = 0;
  options = { showGrid: true, showArrows: true, showBuildable: false, buildableOpacity: 0.45 };

  constructor() {
    super(EDITOR_SCENE_KEY);
  }

  init(data: EditorSceneData) {
    this.params = data;
    this.overlaysDirty = true;
  }

  preload() {
    preloadTheme(this, this.params.map.themes.default);
    this.load.once(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => this.params.onError(new Error(`could not load ${file.url}`)));
  }

  create() {
    try {
      this.assets = themeAssets(this, this.params.map.themes.default);
      this.doc = new EditorDocument(this.params.map, this.params.waves, this.assets);
      this.view = new MapView(this, this.doc.state, this.assets);
    } catch (e) {
      this.params.onError(e as Error);
      return;
    }
    const ts = this.view.tileSize;
    const { width, height } = this.doc;

    this.buildable = this.add.graphics().setDepth(DEPTH.editorOverlay);
    this.arrows = this.add.graphics().setDepth(DEPTH.editorOverlay + 2);
    this.problemMarks = this.add.graphics().setDepth(DEPTH.editorOverlay + 3);
    this.gridLines = this.add.graphics().setDepth(DEPTH.editorOverlay + 1);
    this.gridLines.lineStyle(1, 0x000000, 0.16);
    for (let x = 0; x <= width; x++) this.gridLines.lineBetween(x * ts, 0, x * ts, height * ts);
    for (let y = 0; y <= height; y++) this.gridLines.lineBetween(0, y * ts, width * ts, y * ts);
    this.add.graphics().setDepth(DEPTH.editorOverlay + 1).lineStyle(2, 0xffffff, 0.5).strokeRect(0, 0, width * ts, height * ts);
    this.ghostImage = this.add.image(0, 0, atlasTextureKey(this.assets.atlas.id)).setOrigin(0.5, 1).setAlpha(0.65).setVisible(false).setDepth(DEPTH.editorCursor - 1);
    this.cursor = this.add.graphics().setDepth(DEPTH.editorCursor);
    this.focusMark = this.add.graphics().setDepth(DEPTH.editorCursor + 1);
    this.zonesGfx = this.add.graphics().setDepth(DEPTH.markers - 1);
    this.airGfx = this.add.graphics().setDepth(DEPTH.editorOverlay + 4);
    this.selGfx = this.add.graphics().setDepth(DEPTH.editorCursor - 2);
    this.badges = new Map();
    this.cameras.main.setBackgroundColor('#1b2026');

    this.doc.onChange((c) => {
      const terrainCells = c.cells.filter((x) => x.layer === 'terrain').map((x) => x.index);
      if (terrainCells.length) this.view.refreshCells(terrainCells);
      if (c.lists.has('objects')) this.view.syncObjects();
      if (c.lists.has('spawns') || c.lists.has('exits')) this.view.syncMarkers();
      this.overlaysDirty = true;
    });
    this.applyOptions();
    this.params.onReady(this);
  }

  update(time: number) {
    if (this.overlaysDirty) {
      this.overlaysDirty = false;
      this.redrawOverlays();
    }
    this.focusMark.clear();
    if (time < this.focusUntil) {
      const ts = this.view.tileSize;
      const a = 0.5 + 0.5 * Math.sin(time / 90);
      this.focusMark.lineStyle(3, 0xffffff, a);
      for (const [x, y] of this.focusCells) this.focusMark.strokeRect(x * ts - 2, y * ts - 2, ts + 4, ts + 4);
    }
  }

  applyOptions() {
    this.gridLines.setVisible(this.options.showGrid);
    this.arrows.setVisible(this.options.showArrows);
    this.buildable.setVisible(this.options.showBuildable).setAlpha(this.options.buildableOpacity);
    this.overlaysDirty = true;
  }

  /** Pulses cells for a few seconds (problem list click-to-focus). */
  focus(cells: [number, number][]) {
    this.focusCells = cells.slice(0, 200);
    this.focusUntil = this.time.now + 2500;
  }

  // ---- overlays ---------------------------------------------------------------------------------

  private redrawOverlays() {
    this.redrawGameplayOverlays();
    const v = this.doc.validate();
    const ts = this.view.tileSize;
    const { width, height } = this.doc;

    this.buildable.clear();
    if (this.options.showBuildable) {
      const { block, classMask, classes } = v.buildable;
      const landBit = 1 << classes.indexOf('land');
      const waterBit = 1 << classes.indexOf('water');
      for (let i = 0; i < width * height; i++) {
        const color = block[i] === BuildBlock.Removable ? OVERLAY_COLORS.removable : block[i] ? OVERLAY_COLORS.blocked : classMask[i]! & landBit ? OVERLAY_COLORS.land : classMask[i]! & waterBit ? OVERLAY_COLORS.water : OVERLAY_COLORS.other;
        this.buildable.fillStyle(color, block[i] ? 0.55 : 0.75).fillRect((i % width) * ts + 1, Math.floor(i / width) * ts + 1, ts - 2, ts - 2);
      }
    }

    this.arrows.clear();
    const path = this.doc.state.path;
    const reached = v.compiled.reached;
    for (let i = 0; i < width * height; i++) {
      const out = path[i]!;
      if (out === NO_PATH) continue;
      const cx = (i % width) * ts + ts / 2;
      const cy = Math.floor(i / width) * ts + ts / 2;
      const color = reached[i] ? 0xffffff : 0xff6060;
      const dirs = [DIR_N, DIR_E, DIR_S, DIR_W].filter((d) => out & d);
      if (dirs.length > 1) this.arrows.lineStyle(2, 0xffd040, 1).strokeCircle(cx, cy, ts * 0.36);
      if (dirs.length === 0) this.arrows.fillStyle(color, 0.9).fillCircle(cx, cy, 3);
      for (const d of dirs) this.chevron(cx, cy, d, ts, color);
    }

    this.problemMarks.clear();
    for (const p of v.problems) {
      this.problemMarks.lineStyle(2, p.severity === 'error' ? 0xff3030 : 0xffb020, 0.95);
      for (const [x, y] of p.cells.slice(0, 400)) this.problemMarks.strokeRect(x * ts + 2, y * ts + 2, ts - 4, ts - 4);
    }
  }

  private chevron(cx: number, cy: number, dir: number, ts: number, color: number) {
    const [dx, dy] = dir === DIR_N ? [0, -1] : dir === DIR_E ? [1, 0] : dir === DIR_S ? [0, 1] : [-1, 0];
    const tip = ts * 0.42;
    const back = ts * 0.18;
    const half = ts * 0.12;
    const tx = cx + dx * tip;
    const ty = cy + dy * tip;
    const bx = cx + dx * back;
    const by = cy + dy * back;
    const pts = [
      new Phaser.Math.Vector2(bx - dy * half, by + dx * half),
      new Phaser.Math.Vector2(tx, ty),
      new Phaser.Math.Vector2(bx + dy * half, by - dx * half),
    ];
    this.arrows.lineStyle(4, 0x202020, 0.7).strokePoints(pts);
    this.arrows.lineStyle(2, color, 1).strokePoints(pts);
  }

  // ---- Phase 2 overlays: zones, flight paths, branch policies, removable badges, selection --------

  setSelection(selection: Selection, draft: { from: string; points: [number, number][] } | null) {
    this.selection = selection;
    this.draft = draft;
    if (!draft) this.draftCursor = null;
    this.overlaysDirty = true;
  }

  setDraftCursor(world: [number, number]) {
    this.draftCursor = world;
    this.overlaysDirty = true;
  }

  private redrawGameplayOverlays() {
    const ts = this.view.tileSize;
    const { width } = this.doc;
    const { zones } = this.doc.state;

    // Zones: tinted, hatched cells so they read as "rules", not art.
    this.zonesGfx.clear();
    for (let i = 0; i < zones.cells.length; i++) {
      const v = zones.cells[i]!;
      if (!v) continue;
      const color = hex(this.assets.zones[zones.kinds[v - 1]!]?.color ?? '#ff00ff');
      const x = (i % width) * ts;
      const y = Math.floor(i / width) * ts;
      this.zonesGfx.fillStyle(color, 0.3).fillRect(x, y, ts, ts);
      this.zonesGfx.lineStyle(1, color, 0.8);
      for (let k = 8; k < ts * 2; k += 10) this.zonesGfx.lineBetween(x + Math.max(0, k - ts), y + Math.min(ts, k), x + Math.min(ts, k), y + Math.max(0, k - ts));
    }

    // Flight paths: dashed lines with arrowheads and draggable waypoint handles.
    this.airGfx.clear();
    const routes = this.doc.validate().compiled.routes;
    for (const r of this.doc.state.airRoutes) {
      const compiled = routes.find((x) => x.id === r.id);
      const selected = this.selection?.kind === 'airRoute' && this.selection.id === r.id;
      if (compiled) this.dashed(compiled.points, ts, selected ? 0xffffff : 0x60c0f0, selected ? 3 : 2);
      for (const [px, py] of r.points) {
        this.airGfx.fillStyle(0x0b2030, 1).fillCircle(px * ts, py * ts, 6);
        this.airGfx.lineStyle(2, selected ? 0xffffff : 0x60c0f0, 1).strokeCircle(px * ts, py * ts, 6);
      }
    }
    // Default straight air routes (no drawn path yet) as faint guides.
    for (const r of routes) {
      if (r.kind === 'air' && !this.doc.state.airRoutes.some((a) => a.id === r.id)) this.dashed(r.points, ts, 0x60c0f0, 1, 0.35);
    }
    if (this.draft) {
      const spawn = this.doc.state.spawns.find((s2) => s2.id === this.draft!.from);
      if (spawn) {
        const pts: [number, number][] = [[spawn.cell[0] + 0.5, spawn.cell[1] + 0.5], ...this.draft.points];
        if (this.draftCursor) pts.push([Math.round(this.draftCursor[0] * 2) / 2, Math.round(this.draftCursor[1] * 2) / 2]);
        this.dashed(pts, ts, 0xffffff, 2);
        for (const [px, py] of this.draft.points) this.airGfx.fillStyle(0xffffff, 1).fillCircle(px * ts, py * ts, 5);
      }
    }

    // Branch-policy badges on junctions that have one.
    for (const j of this.doc.state.junctions) {
      const [x, y] = j.cell;
      this.airGfx.fillStyle(POLICY_COLORS[j.policy.type], 1).fillCircle(x * ts + ts - 6, y * ts + 6, 5);
      this.airGfx.lineStyle(1, 0x000000, 0.8).strokeCircle(x * ts + ts - 6, y * ts + 6, 5);
    }

    // "$cost" badges over removable obstacles.
    const keep = new Set<string>();
    for (const o of this.doc.state.objects) {
      const kind = this.assets.kinds[o.kind];
      if (!o.removal || !kind) continue;
      keep.add(o.id);
      const b = footprintBounds(kind, o.x, o.y);
      const label = `${o.removal.cost}${o.removal.requires.length ? ' ⛓' : ''}`;
      let t = this.badges.get(o.id);
      if (!t) {
        t = this.add
          .text(0, 0, '', { fontFamily: 'monospace', fontSize: '11px', color: '#1a1400', backgroundColor: '#f0c040', padding: { x: 3, y: 1 } })
          .setOrigin(0.5, 0)
          .setDepth(DEPTH.editorOverlay + 5);
        this.badges.set(o.id, t);
      }
      t.setText(label).setPosition((b.x + b.w / 2) * ts, b.y * ts + 2);
    }
    for (const [id, t] of this.badges) {
      if (keep.has(id)) continue;
      t.destroy();
      this.badges.delete(id);
    }

    // Selection outline.
    this.selGfx.clear();
    const sel = this.selection;
    if (!sel) return;
    this.selGfx.lineStyle(2, 0xffffff, 1);
    if (sel.kind === 'object') {
      const o = this.doc.state.objects.find((v) => v.id === sel.id);
      const kind = o && this.assets.kinds[o.kind];
      if (o && kind) {
        const b = footprintBounds(kind, o.x, o.y);
        this.selGfx.strokeRect(b.x * ts - 2, b.y * ts - 2, b.w * ts + 4, b.h * ts + 4);
      }
    } else if (sel.kind === 'spawn' || sel.kind === 'exit') {
      const m = (sel.kind === 'spawn' ? this.doc.state.spawns : this.doc.state.exits).find((v) => v.id === sel.id);
      if (m) this.selGfx.strokeRect(m.cell[0] * ts - 2, m.cell[1] * ts - 2, ts + 4, ts + 4);
    } else if (sel.kind === 'junction') {
      this.selGfx.strokeRect(sel.cell[0] * ts - 2, sel.cell[1] * ts - 2, ts + 4, ts + 4);
    }
  }

  private dashed(points: [number, number][], ts: number, color: number, width: number, alpha = 1) {
    const g = this.airGfx;
    g.lineStyle(width, color, alpha);
    const dash = 8;
    const gap = 6;
    let carry = 0;
    let on = true;
    for (let i = 1; i < points.length; i++) {
      const [ax, ay] = points[i - 1]!;
      const [bx, by] = points[i]!;
      const len = Math.hypot(bx - ax, by - ay) * ts;
      const ux = ((bx - ax) * ts) / (len || 1);
      const uy = ((by - ay) * ts) / (len || 1);
      let d = 0;
      while (d < len) {
        const step = Math.min((on ? dash : gap) - carry, len - d);
        if (on) g.lineBetween(ax * ts + ux * d, ay * ts + uy * d, ax * ts + ux * (d + step), ay * ts + uy * (d + step));
        d += step;
        carry += step;
        if (carry >= (on ? dash : gap)) {
          carry = 0;
          on = !on;
        }
      }
    }
    if (points.length >= 2) {
      const [ax, ay] = points[points.length - 2]!;
      const [bx, by] = points[points.length - 1]!;
      const ang = Math.atan2(by - ay, bx - ax);
      const tx = bx * ts;
      const ty = by * ts;
      g.fillStyle(color, alpha).fillTriangle(tx, ty, tx - Math.cos(ang - 0.5) * 9, ty - Math.sin(ang - 0.5) * 9, tx - Math.cos(ang + 0.5) * 9, ty - Math.sin(ang + 0.5) * 9);
    }
  }

  // ---- cursor and ghosts ------------------------------------------------------------------------

  /** Draws the tool's preview; returns the placement check for stamp ghosts. */
  showGhost(ghost: Ghost): PlacementCheck | null {
    const ts = this.view.tileSize;
    this.cursor.clear();
    this.ghostImage.setVisible(false);
    if (!ghost) return null;
    if (ghost.kind === 'cell') {
      const inside = this.doc.inside(ghost.x, ghost.y);
      this.cursor.lineStyle(2, inside ? ghost.color : 0xff4040, 1).strokeRect(ghost.x * ts + 1, ghost.y * ts + 1, ts - 2, ts - 2);
      return null;
    }
    if (ghost.kind === 'rect') {
      const x = Math.min(ghost.x0, ghost.x1);
      const y = Math.min(ghost.y0, ghost.y1);
      const w = Math.abs(ghost.x1 - ghost.x0) + 1;
      const h = Math.abs(ghost.y1 - ghost.y0) + 1;
      this.cursor.fillStyle(ghost.color, 0.25).fillRect(x * ts, y * ts, w * ts, h * ts);
      this.cursor.lineStyle(2, ghost.color, 1).strokeRect(x * ts + 1, y * ts + 1, w * ts - 2, h * ts - 2);
      return null;
    }
    const kind = this.assets.kinds[ghost.stamp];
    if (!kind) return null;
    const check = checkPlacement(this.doc.state, this.assets, ghost.stamp, ghost.x, ghost.y, occupancy(this.doc.state, this.assets));
    const b = footprintBounds(kind, ghost.x, ghost.y);
    const key = this.assets.theme.objects[ghost.stamp];
    if (key && this.assets.atlas.stamps[key]) {
      this.ghostImage
        .setFrame(`stamp:${key}`)
        .setPosition((b.x + b.w / 2) * ts, (b.y + b.h) * ts)
        .setTint(check.ok ? 0xffffff : 0xff8080)
        .setVisible(true)
        .setDepth(Math.max(ySortDepth((b.y + b.h) * ts), DEPTH.editorCursor - 1));
    }
    for (const c of check.cells) {
      if (c.role === '.') continue;
      this.cursor.fillStyle(c.ok ? 0x40e060 : 0xff3040, c.role === 'B' ? 0.4 : 0.22).fillRect(c.x * ts + 1, c.y * ts + 1, ts - 2, ts - 2);
    }
    this.cursor.lineStyle(2, check.ok ? 0x40e060 : 0xff3040, 1).strokeRect(b.x * ts + 1, b.y * ts + 1, b.w * ts - 2, b.h * ts - 2);
    return check;
  }

  /** Short red flash on refusal. */
  flashRefusal(x: number, y: number) {
    const ts = this.view.tileSize;
    const flash = this.add.rectangle((x + 0.5) * ts, (y + 0.5) * ts, ts, ts, 0xff3030, 0.6).setDepth(DEPTH.editorCursor + 2);
    this.tweens.add({ targets: flash, alpha: 0, scale: 1.4, duration: 260, onComplete: () => flash.destroy() });
    this.cameras.main.shake(90, 0.002);
  }
}
