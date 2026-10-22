import { useSyncExternalStore } from 'react';
import type { Direction, JunctionPolicy, ObjectInstance, Problem, WavesDoc } from '@tdmm/map-format';
import type { RoundStats } from '@tdmm/sim';
import type { Autosave, MapListEntry } from './storage.ts';
import type { TerrainMode, ToolId } from './tools.ts';

/** UI state only. The map itself lives in the EditorDocument; this mirrors what panels show. */
export interface EditorUiState {
  status: 'loading' | 'ready' | 'error';
  error?: string;
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
    summary?: string;
  };
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
  saveMessage?: string;
  showGrid: boolean;
  showArrows: boolean;
  showBuildable: boolean;
  buildableOpacity: number;
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

export type Selection =
  | { kind: 'object'; id: string }
  | { kind: 'spawn'; id: string }
  | { kind: 'exit'; id: string }
  | { kind: 'airRoute'; id: string }
  | { kind: 'junction'; cell: [number, number] }
  | null;

export type Inspect =
  | { kind: 'object'; object: ObjectInstance; name: string; defaultCost: number; removableOthers: { id: string; name: string }[] }
  | { kind: 'spawn'; id: string; spawnKind: 'ground' | 'air'; cell: [number, number]; routes: string[]; usedBy: number }
  | { kind: 'exit'; id: string; cell: [number, number]; routes: string[] }
  | { kind: 'airRoute'; id: string; from: string; to: string; points: number; smooth: boolean; length: number; usedBy: number }
  | { kind: 'junction'; cell: [number, number]; policy: JunctionPolicy; hasPolicy: boolean; branches: { dir: Direction; exits: string[]; routes: string[] }[] }
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
