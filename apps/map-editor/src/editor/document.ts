import { kindIndex, terrainAt, zoneAt, zoneValue, type MapDoc, type WavesDoc } from '@tdmm/map-format';
import { PathGrid, type CellEdit } from '@tdmm/pathing';
import { docFromMapState, mapStateFromDoc, validateMap, type MapState, type Registries, type Validation } from '@tdmm/rules';
import { History, type CellRecord, type Entry, type GridLayer, type ListName } from './history.ts';

/** What a change touched, so the scene and UI only redraw what they must. */
export interface Change {
  cells: { layer: GridLayer; index: number }[];
  lists: Set<ListName>;
  /** True when the change came from undo/redo (the camera may jump to it). */
  fromHistory: boolean;
}

interface Txn {
  label: string;
  cells: Map<string, CellRecord>;
  lists: Map<ListName, string>;
}

/**
 * The map being edited: its decoded state, its waves, and one undo history for both. Every
 * mutation goes through a transaction; listeners hear about each change as it happens.
 */
export class EditorDocument {
  readonly base: MapDoc;
  readonly state: MapState;
  waves: WavesDoc;
  readonly reg: Registries;
  readonly path: PathGrid;
  private readonly history = new History();
  private txn: Txn | null = null;
  private readonly listeners = new Set<(c: Change) => void>();
  private validation: Validation | null = null;
  /** History depth at the last save; dirty when it differs. */
  private savedDepth = 0;
  private savedDirtyOverride = false;

  /** The clear-check record the waves file had when loaded. It is never edited: saving recomputes it. */
  loadedClearCheck: WavesDoc['clearCheck'] | null;

  constructor(base: MapDoc, waves: WavesDoc, reg: Registries) {
    this.base = base;
    this.state = mapStateFromDoc(base);
    const { clearCheck, ...authored } = structuredClone(waves);
    this.waves = authored;
    this.loadedClearCheck = clearCheck ?? null;
    this.reg = reg;
    this.path = new PathGrid(this.state.width, this.state.height, this.state.path);
  }

  get width() {
    return this.state.width;
  }

  get height() {
    return this.state.height;
  }

  inside(x: number, y: number) {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  terrainAt(x: number, y: number) {
    return terrainAt(this.state.terrain, x, y);
  }

  onChange(fn: (c: Change) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  // ---- transactions -----------------------------------------------------------------------------

  begin(label: string) {
    if (!this.txn) this.txn = { label, cells: new Map(), lists: new Map() };
  }

  get inTransaction() {
    return this.txn !== null;
  }

  /** Ends the gesture. Returns true if it changed anything (and became an undo step). */
  commit(): boolean {
    const t = this.txn;
    this.txn = null;
    if (!t) return false;
    const cells = [...t.cells.values()].filter((c) => c.before !== c.after);
    const lists = [...t.lists.entries()]
      .map(([name, before]) => ({ name, before, after: JSON.stringify(this.listValue(name)) }))
      .filter((l) => l.before !== l.after);
    if (!cells.length && !lists.length) return false;
    this.history.push({ label: t.label, cells, lists });
    return true;
  }

  /** Runs `fn` as one transaction (for single clicks and form edits). */
  transact(label: string, fn: () => void): boolean {
    const outer = this.inTransaction;
    this.begin(label);
    fn();
    return outer ? false : this.commit();
  }

  // ---- mutations --------------------------------------------------------------------------------

  setTerrain(x: number, y: number, kind: string): boolean {
    if (!this.inside(x, y)) return false;
    const i = y * this.width + x;
    const value = kindIndex(this.state.terrain, kind);
    return this.setCell('terrain', i, value);
  }

  /** Paints a zone kind (or clears with null). */
  setZone(x: number, y: number, kind: string | null): boolean {
    if (!this.inside(x, y)) return false;
    return this.setCell('zones', y * this.width + x, zoneValue(this.state.zones, kind));
  }

  zoneAt(x: number, y: number) {
    return this.inside(x, y) ? zoneAt(this.state.zones, y * this.width + x) : undefined;
  }

  /** Runs a PathGrid edit and records the cells it changed. */
  editPath(fn: (g: PathGrid) => CellEdit[]): boolean {
    this.requireTxn();
    const edits = fn(this.path);
    for (const e of edits) this.record('path', e.index, e.before, e.after);
    if (edits.length) this.emit(edits.map((e) => ({ layer: 'path' as const, index: e.index })), [], false);
    return edits.length > 0;
  }

  /** Mutates a record list (objects, spawns, exits) or the waves document. */
  editList<N extends ListName>(name: N, fn: (value: N extends 'waves' ? WavesDoc : MapState[Exclude<N, 'waves'>]) => void) {
    this.requireTxn();
    if (!this.txn!.lists.has(name)) this.txn!.lists.set(name, JSON.stringify(this.listValue(name)));
    fn(this.listValue(name) as never);
    this.emit([], [name], false);
  }

  private setCell(layer: GridLayer, index: number, value: number) {
    this.requireTxn();
    const grid = this.gridOf(layer);
    const before = grid[index]!;
    if (before === value) return false;
    grid[index] = value;
    this.record(layer, index, before, value);
    this.emit([{ layer, index }], [], false);
    return true;
  }

  private record(layer: GridLayer, index: number, before: number, after: number) {
    const key = `${layer}:${index}`;
    const existing = this.txn!.cells.get(key);
    if (existing) existing.after = after;
    else this.txn!.cells.set(key, { layer, index, before, after });
  }

  private requireTxn() {
    if (!this.txn) throw new Error('document edits must happen inside begin()/commit()');
  }

  private gridOf(layer: GridLayer): Uint8Array {
    return layer === 'terrain' ? this.state.terrain.cells : layer === 'path' ? this.state.path : this.state.zones.cells;
  }

  private listValue(name: ListName): unknown {
    return name === 'waves' ? this.waves : this.state[name];
  }

  private setListValue(name: ListName, json: string) {
    const value = JSON.parse(json);
    if (name === 'waves') this.waves = value;
    else this.state[name].splice(0, this.state[name].length, ...value);
  }

  // ---- history ----------------------------------------------------------------------------------

  undo(): Entry | null {
    if (this.txn) return null;
    const e = this.history.popUndo();
    if (e) this.apply(e, 'before');
    return e ?? null;
  }

  redo(): Entry | null {
    if (this.txn) return null;
    const e = this.history.popRedo();
    if (e) this.apply(e, 'after');
    return e ?? null;
  }

  private apply(e: Entry, side: 'before' | 'after') {
    const cells = side === 'before' ? [...e.cells].reverse() : e.cells;
    for (const c of cells) this.gridOf(c.layer)[c.index] = c[side];
    for (const l of e.lists) this.setListValue(l.name, l[side]);
    this.emit(
      e.cells.map((c) => ({ layer: c.layer, index: c.index })),
      e.lists.map((l) => l.name),
      true,
    );
  }

  get canUndo() {
    return this.history.canUndo;
  }

  get canRedo() {
    return this.history.canRedo;
  }

  get dirty() {
    return this.savedDirtyOverride || this.history.depth !== this.savedDepth;
  }

  markSaved() {
    this.savedDepth = this.history.depth;
    this.savedDirtyOverride = false;
  }

  /** For documents that were never saved (new maps, restored autosaves). */
  markDirty() {
    this.savedDirtyOverride = true;
  }

  // ---- derived ----------------------------------------------------------------------------------

  validate(): Validation {
    this.validation ??= validateMap(this.state, this.reg, this.waves);
    return this.validation;
  }

  toDocs(): { map: MapDoc; waves: WavesDoc } {
    return { map: docFromMapState(this.base, this.state), waves: structuredClone(this.waves) };
  }

  private emit(cells: Change['cells'], lists: ListName[], fromHistory: boolean) {
    this.validation = null;
    const change: Change = { cells, lists: new Set(lists), fromHistory };
    for (const l of this.listeners) l(change);
  }
}
