import { useSyncExternalStore } from 'react';
import type { Direction, JunctionPolicy, ObjectInstance, Problem, WavesDoc } from '@tdmm/map-format';
import type { RoundStats } from '@tdmm/sim';
import type { ClipLayer, LayerFilter, Region } from './clipboard.ts';
import type { LibraryPrefs } from './palette.ts';
import type { Autosave, MapListEntry, ThemeListEntry } from './storage.ts';
import type { TerrainMode, ToolId } from './tools.ts';

/** UI state only. The map itself lives in the EditorDocument; this mirrors what panels show. */
export interface EditorUiState {
  status: 'loading' | 'ready' | 'error';
  error?: string | undefined;
  mapId: string;
  mapName: string;
  mapSize: string;
  tool: ToolId;
  terrainMode: TerrainMode;
  brush: { terrain: string; path: string; stamp: string; spawn: 'ground' | 'air'; zone: string };
  terrains: { id: string; name: string; color: string; pathStyle: boolean }[];
  zoneTypes: { id: string; name: string; color: string }[];
  selection: Selection;
  /** Snapshot of the selected thing for the inspector (rebuilt on every change). */
  inspect: Inspect | null;
  /** A flight path being drawn with the Flight path tool. */
  airDraft: { from: string; points: [number, number][] } | null;
  /** Live clear check: validation + no-tower simulation of every round. */
  clear: {
    status: 'idle' | 'running' | 'passed' | 'failed';
    problems: Problem[];
    /** True when the file on disk carries a record matching the current gameplay. */
    savedCurrent: boolean;
    summary?: string | undefined;
    /** Hash of all gameplay data; identical in every theme by construction. */
    fingerprint?: string | undefined;
  };
  /** Theme being previewed (rendering only; the map's default is in themes.default). */
  theme: string;
  themes: ThemeListEntry[];
  mapThemes: { default: string; supported: string[] };
  /** Per supported theme: art this map needs that the theme lacks (or why it can't be used). */
  themeCoverage: { id: string; ok: boolean; notes: string[] }[];
  stats: RoundStats[] | null;
  stamps: { id: string; name: string; color: string; category: string; w: number; h: number }[];
  enemies: { id: string; name: string; color: string; flying: boolean }[];
  hover: { x: number; y: number; lines: string[] } | null;
  zoom: number;
  mode: 'edit' | 'play';
  startRound: number;
  canUndo: boolean;
  canRedo: boolean;
  dirty: boolean;
  saveState: 'idle' | 'saving' | 'saved' | 'error' | 'conflict';
  saveMessage?: string | undefined;
  /** Where the last save can be seen (a pull request), if anywhere. */
  saveUrl?: string | undefined;
  showGrid: boolean;
  showArrows: boolean;
  showBuildable: boolean;
  buildableOpacity: number;
  /** Heatmap of how much path a tower on each cell would reach (uses testRange). */
  showCoverage: boolean;
  /** Highest heatmap value, in tiles of path in range per enemy (for the legend). */
  coverageMax: number;
  /** Base range of test towers and the heatmap, in tiles. */
  testRange: number;
  /** Editor-only probe towers: never saved, not in undo history. */
  testTowers: TestTower[];
  /** Which layers a marquee selects, copies and deletes. */
  layers: LayerFilter;
  /** Paste mode: a clip follows the pointer until it's placed or cancelled. */
  paste: { w: number; h: number } | null;
  /** What's on the clipboard (shared with other tabs through localStorage). */
  clipInfo: { w: number; h: number; layers: ClipLayer[] } | null;
  /** The last playtest, drawn as trails and leak markers until the next edit. */
  lastRun: { enemies: number; leaked: number } | null;
  showTrails: boolean;
  /** Palette search, pins and recents (pins and recents persist in localStorage). */
  library: LibraryPrefs;
  muted: boolean;
  problems: Problem[];
  errors: number;
  warnings: number;
  buildableCount: number;
  waves: WavesDoc | null;
  routes: { id: string; spawn: string; exit: string; kind: string; length: number }[];
  spawns: { id: string; kind: 'ground' | 'air' }[];
  toast: { id: number; text: string; tone: 'info' | 'warn' | 'ok' } | null;
  rightTab: 'problems' | 'waves' | 'balance' | 'inspect';
  mapList: MapListEntry[];
  restore: Autosave | null;
  dialog: 'none' | 'new' | 'open';
}

export interface TestTower {
  x: number;
  y: number;
  /** Range after the cell's multipliers. */
  range: number;
  /** Expected tiles of path in range per enemy. */
  expected: number;
  /** False once an edit made the cell unable to take a tower. */
  ok: boolean;
}

export type Selection =
  | { kind: 'object'; id: string }
  | { kind: 'spawn'; id: string }
  | { kind: 'exit'; id: string }
  | { kind: 'airRoute'; id: string }
  | { kind: 'junction'; cell: [number, number] }
  | ({ kind: 'region' } & Region)
  | null;

export type Inspect =
  | { kind: 'object'; object: ObjectInstance; name: string; defaultCost: number; removableOthers: { id: string; name: string }[] }
  | { kind: 'spawn'; id: string; spawnKind: 'ground' | 'air'; cell: [number, number]; routes: string[]; usedBy: number }
  | { kind: 'exit'; id: string; cell: [number, number]; routes: string[] }
  | { kind: 'airRoute'; id: string; from: string; to: string; points: number; smooth: boolean; length: number; usedBy: number }
  | { kind: 'junction'; cell: [number, number]; policy: JunctionPolicy; hasPolicy: boolean; branches: { dir: Direction; exits: string[]; routes: string[] }[] }
  | { kind: 'region'; region: Region; w: number; h: number; counts: { cells: number; path: number; zones: number; objects: number } }
  | { kind: 'missing' };

type Listener = () => void;

export class Store<T> {
  private state: T;
  private readonly listeners = new Set<Listener>();

  constructor(initial: T) {
    this.state = initial;
  }

  get = () => this.state;

  set(patch: Partial<T>) {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
}

/** Subscribes to one slice; the component re-renders only when that slice changes identity. */
export function useStore<T, S>(store: Store<T>, select: (s: T) => S): S {
  return useSyncExternalStore(store.subscribe, () => select(store.get()));
}
