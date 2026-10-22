// The deterministic wave simulation shared by the game (live, drawn by Phaser), the editor's clear
// check and balance charts, and the CI gate (headless). Fixed 1/60 s steps, so the same map and
// waves always play out identically regardless of frame rate.
import type { WavesDoc } from '@tdmm/map-format';
import { routeLength, type CompiledPath, type Route } from '@tdmm/pathing';
import { validateMap, type MapState, type Registries } from '@tdmm/rules';
import { BranchChooser } from './policy.ts';

/** Bump whenever simulation behaviour changes; every map then needs a fresh clear check. */
export const SIM_VERSION = 1;
export const SIM_STEP = 1 / 60;
/** A round that hasn't finished after this many simulated seconds fails the clear check. */
const ROUND_TIMEOUT_SEC = 900;

export interface SimInput {
  state: MapState;
  reg: Registries;
  waves: WavesDoc;
  /** Compiled routes; computed if omitted. */
  compiled?: CompiledPath;
}

export interface SimEnemy {
  uid: number;
  enemy: string;
  groupId: string;
  route: Route;
  length: number;
  dist: number;
  speed: number;
  hp: number;
  damage: number;
  reward: number;
  flying: boolean;
}

export interface RoundStats {
  /** 1-based. */
  round: number;
  enemies: number;
  totalHp: number;
  /** When the last enemy of the round appears. */
  spawnSec: number;
  /** When the round is over (last enemy left the map), with no towers. */
  clearSec: number;
  leaked: number;
  leakedLives: number;
  /** Highest enemy HP reaching an exit in any one-second window: how hard the round pushes. */
  peakLeakHpPerSec: number;
  byEnemy: Record<string, { count: number; hp: number }>;
  byRoute: Record<string, number>;
  cashAtStart: number;
  cashAtEnd: number;
}

export interface SimEvents {
  spawn?: (e: SimEnemy) => void;
  leak?: (e: SimEnemy) => void;
  roundStart?: (round: number) => void;
  roundEnd?: (stats: RoundStats) => void;
}

interface Pending {
  atSec: number;
  order: number;
  groupId: string;
  enemy: string;
  spawn: string;
  route: string | null;
}

export class Simulation {
  readonly compiled: CompiledPath;
  readonly input: SimInput;
  lives: number;
  cash: number;
  /** Index of the current (or last finished) round; -1 before the first. */
  round = -1;
  phase: 'idle' | 'running' | 'done' = 'idle';
  /** Seconds since the current round started. */
  time = 0;
  enemies: SimEnemy[] = [];
  readonly removed = new Set<string>();
  readonly errors: string[] = [];
  readonly history: RoundStats[] = [];
  private pending: Pending[] = [];
  private chooser: BranchChooser | null = null;
  private airCounters = new Map<string, number>();
  private uid = 0;
  private acc = 0;
  private stats: RoundStats | null = null;
  private leakBuckets = new Map<number, number>();
  private readonly events: SimEvents;

  constructor(input: SimInput, events: SimEvents = {}) {
    this.input = input;
    this.events = events;
    this.compiled = input.compiled ?? validateMap(input.state, input.reg).compiled;
    this.lives = input.waves.lives;
    this.cash = input.waves.startCash;
  }

  get roundCount() {
    return this.input.waves.rounds.length;
  }

  /** Starts round `index` (0-based). Returns false if it doesn't exist or a round is running. */
  startRound(index: number): boolean {
    const round = this.input.waves.rounds[index];
    if (!round || this.phase === 'running') return false;
    this.round = index;
    this.phase = 'running';
    this.time = 0;
    this.acc = 0;
    this.chooser = new BranchChooser(this.input.state, index + 1);
    this.airCounters = new Map();
    this.leakBuckets = new Map();
    let order = 0;
    this.pending = round.groups
      .flatMap((g) => Array.from({ length: g.count }, (_, k) => ({ atSec: g.startSec + k * g.intervalSec, order: order++, groupId: g.id, enemy: g.enemy, spawn: g.spawn, route: g.route })))
      .sort((a, b) => a.atSec - b.atSec || a.order - b.order);
    this.stats = {
      round: index + 1,
      enemies: 0,
      totalHp: 0,
      spawnSec: this.pending.length ? this.pending[this.pending.length - 1]!.atSec : 0,
      clearSec: 0,
      leaked: 0,
      leakedLives: 0,
      peakLeakHpPerSec: 0,
      byEnemy: {},
      byRoute: {},
      cashAtStart: this.cash,
      cashAtEnd: this.cash,
    };
    this.events.roundStart?.(index);
    return true;
  }

  /** Advances by real time; runs whole fixed steps only. */
  step(dtSec: number) {
    this.acc += Math.min(dtSec, 0.25);
    while (this.acc >= SIM_STEP) {
      this.acc -= SIM_STEP;
      this.tick();
    }
  }

  /** Pays for and clears a removable obstacle (for the player, between or during rounds). */
  removeObstacle(id: string): { ok: boolean; reason?: string } {
    const o = this.input.state.objects.find((x) => x.id === id);
    if (!o?.removal) return { ok: false, reason: 'That can\'t be removed.' };
    if (this.removed.has(id)) return { ok: false, reason: 'Already removed.' };
    const missing = o.removal.requires.filter((r) => !this.removed.has(r));
    if (missing.length) return { ok: false, reason: `Clear ${missing.join(', ')} first.` };
    if (this.cash < o.removal.cost) return { ok: false, reason: `Needs $${o.removal.cost} (you have $${this.cash}).` };
    this.cash -= o.removal.cost;
    this.removed.add(id);
    return { ok: true };
  }

  private tick() {
    if (this.phase !== 'running' || !this.stats) return;
    const dt = SIM_STEP;
    this.time += dt;
    while (this.pending.length && this.pending[0]!.atSec <= this.time + 1e-9) this.spawn(this.pending.shift()!);
    for (const e of this.enemies) e.dist += e.speed * dt;
    const out = this.enemies.filter((e) => e.dist >= e.length);
    if (out.length) {
      this.enemies = this.enemies.filter((e) => e.dist < e.length);
      for (const e of out) {
        this.lives = Math.max(0, this.lives - e.damage);
        this.stats.leaked++;
        this.stats.leakedLives += e.damage;
        const bucket = Math.floor(this.time);
        this.leakBuckets.set(bucket, (this.leakBuckets.get(bucket) ?? 0) + e.hp);
        this.events.leak?.(e);
      }
    }
    if (this.pending.length === 0 && this.enemies.length === 0) this.finishRound();
    else if (this.time > ROUND_TIMEOUT_SEC) {
      this.errors.push(`Round ${this.round + 1} is still running after ${ROUND_TIMEOUT_SEC}s.`);
      this.enemies = [];
      this.pending = [];
      this.finishRound();
    }
  }

  private finishRound() {
    const s = this.stats!;
    s.clearSec = Math.round(this.time * 100) / 100;
    s.peakLeakHpPerSec = Math.max(0, ...this.leakBuckets.values());
    this.cash += this.input.waves.rounds[this.round]!.bonusCash;
    s.cashAtEnd = this.cash;
    this.history.push(s);
    this.stats = null;
    this.phase = this.round + 1 >= this.roundCount ? 'done' : 'idle';
    this.events.roundEnd?.(s);
  }

  private spawn(p: Pending) {
    const def = this.input.reg.enemies[p.enemy];
    const route = this.resolveRoute(p);
    if (!def || !route) {
      this.errors.push(`Round ${this.round + 1}, group "${p.groupId}": ${!def ? `unknown enemy "${p.enemy}"` : `no way from "${p.spawn}" to an exit`}.`);
      return;
    }
    const e: SimEnemy = {
      uid: ++this.uid,
      enemy: p.enemy,
      groupId: p.groupId,
      route,
      length: routeLength(route),
      dist: 0,
      speed: def.speed,
      hp: def.hp,
      damage: def.damage,
      reward: def.reward,
      flying: def.flying,
    };
    this.enemies.push(e);
    const s = this.stats!;
    s.enemies++;
    s.totalHp += def.hp;
    const be = (s.byEnemy[p.enemy] ??= { count: 0, hp: 0 });
    be.count++;
    be.hp += def.hp;
    s.byRoute[route.id] = (s.byRoute[route.id] ?? 0) + 1;
    this.events.spawn?.(e);
  }

  private resolveRoute(p: Pending): Route | null {
    if (p.route !== null) return this.compiled.routes.find((r) => r.id === p.route && r.spawn === p.spawn) ?? null;
    const spawn = this.input.state.spawns.find((s) => s.id === p.spawn);
    if (!spawn) return null;
    if (spawn.kind === 'air') {
      const options = this.compiled.routes.filter((r) => r.spawn === spawn.id);
      if (!options.length) return null;
      const n = this.airCounters.get(spawn.id) ?? 0;
      this.airCounters.set(spawn.id, n + 1);
      return options[n % options.length]!;
    }
    return this.chooser!.walk(spawn.id);
  }
}

/** Plays every round back to back with no towers. */
export function simulateAll(input: SimInput): { stats: RoundStats[]; errors: string[] } {
  const sim = new Simulation(input);
  for (let i = 0; i < sim.roundCount; i++) {
    sim.startRound(i);
    while (sim.phase === 'running') sim.step(SIM_STEP);
  }
  return { stats: sim.history, errors: sim.errors };
}

