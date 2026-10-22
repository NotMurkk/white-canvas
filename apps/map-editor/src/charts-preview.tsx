// Dev-only preview for the chart components (http://localhost:5173/charts-preview.html). Sample
// waves and a rough stand-in for the no-tower simulation (straight walk to the exit, no towers), so
// dragging a group on a timeline updates the balance charts too. Not part of the editor bundle.
import { useMemo, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Round, WaveGroup } from '@tdmm/map-format';
import type { RoundStats } from '@tdmm/sim';
import { BalancePanel } from './components/BalancePanel.tsx';
import { WaveTimeline } from './components/WaveTimeline.tsx';
import './styles.css';

interface EnemyDef {
  name: string;
  color: string;
  hp: number;
  speed: number;
  damage: number;
}

/** Mirrors content/enemies.json. */
const ENEMIES: Record<string, EnemyDef> = {
  scout: { name: 'Scout', color: '#f0d040', hp: 30, speed: 3.2, damage: 1 },
  grunt: { name: 'Grunt', color: '#e07030', hp: 80, speed: 2.0, damage: 1 },
  tank: { name: 'Tank', color: '#7058c0', hp: 400, speed: 1.1, damage: 3 },
  flyer: { name: 'Flyer', color: '#60c0f0', hp: 50, speed: 2.6, damage: 1 },
};

/** A made-up modded roster: 9 types (folds into "Other"), a near-duplicate colour, a very dark one. */
const MANY_ENEMIES: Record<string, EnemyDef> = {
  ...ENEMIES,
  elite: { name: 'Elite Scout', color: '#f2d548', hp: 60, speed: 3.4, damage: 1 },
  brute: { name: 'Brute', color: '#c04040', hp: 220, speed: 1.4, damage: 2 },
  beetle: { name: 'Beetle', color: '#40a060', hp: 120, speed: 1.8, damage: 1 },
  wisp: { name: 'Wisp', color: '#e0a0e0', hp: 25, speed: 4, damage: 1 },
  shade: { name: 'Shade', color: '#302838', hp: 90, speed: 2.2, damage: 1 },
};

const START_CASH = 650;
/** Tiles from each spawn to the exit. */
const PATH_LEN: Record<string, number> = { west: 38, north: 31, sky: 24 };

let ids = 0;
function grp(enemy: string, count: number, startSec: number, intervalSec: number, spawn: string, route: string | null = null): WaveGroup {
  return { id: `pv_${++ids}`, enemy, count, startSec, intervalSec, spawn, route };
}

const SAMPLE_ROUNDS: Round[] = [
  { bonusCash: 100, groups: [grp('scout', 8, 0, 1, 'west'), grp('scout', 6, 4, 1.2, 'north')] },
  { bonusCash: 100, groups: [grp('grunt', 10, 0, 1.5, 'west'), grp('scout', 12, 3, 0.6, 'north')] },
  { bonusCash: 120, groups: [grp('grunt', 12, 0, 1, 'west'), grp('flyer', 6, 5, 2, 'sky'), grp('scout', 20, 8, 0.4, 'north')] },
  { bonusCash: 120, groups: [grp('tank', 3, 0, 4, 'west', 'west:S'), grp('grunt', 15, 2, 0.8, 'north'), grp('tank', 1, 20, 1, 'north')] },
  { bonusCash: 150, groups: [grp('flyer', 10, 0, 1, 'sky'), grp('grunt', 20, 4, 0.6, 'west'), grp('scout', 30, 10, 0.3, 'north')] },
  // The big tank round.
  { bonusCash: 150, groups: [grp('grunt', 20, 0, 0.75, 'north'), grp('tank', 14, 2, 1.5, 'west', 'west:S'), grp('flyer', 8, 12, 1.2, 'sky')] },
  { bonusCash: 180, groups: [grp('scout', 40, 0, 0.25, 'west'), grp('scout', 40, 0, 0.25, 'north'), grp('flyer', 12, 6, 0.8, 'sky'), grp('grunt', 25, 12, 0.5, 'west')] },
  { bonusCash: 200, groups: [grp('tank', 6, 0, 2.5, 'north'), grp('tank', 6, 1.3, 2.5, 'west'), grp('grunt', 30, 8, 0.5, 'west'), grp('flyer', 16, 15, 0.6, 'sky'), grp('scout', 50, 20, 0.2, 'north')] },
  { bonusCash: 0, groups: [] },
];

function longCampaign(): Round[] {
  return Array.from({ length: 45 }, (_, i) => {
    const groups = [grp('scout', 6 + i, 0, Math.max(0.2, 1 - i * 0.02), 'west')];
    if (i >= 2) groups.push(grp('grunt', 4 + Math.floor(i * 0.8), 3, 0.8, 'north'));
    if (i >= 5 && i % 3 !== 0) groups.push(grp('flyer', 3 + Math.floor(i / 3), 6, 1, 'sky'));
    if (i >= 8 && i % 4 === 0) groups.push(grp('tank', 1 + Math.floor(i / 6), 8, 2.5, 'west'));
    return { bonusCash: 100 + i * 5, groups };
  });
}

function moddedCampaign(): Round[] {
  const kinds = Object.keys(MANY_ENEMIES);
  return Array.from({ length: 12 }, (_, i) => ({
    bonusCash: 120,
    groups: kinds.filter((_, k) => (i + k) % 3 !== 0).map((enemy, k) => grp(enemy, 3 + ((i * 7 + k * 3) % 9), k * 2, 0.8, k % 2 ? 'north' : 'west')),
  }));
}

/** Rough no-tower stand-in for simulateAll: every enemy walks straight to the exit and leaks. */
function simulate(rounds: Round[], defs: Record<string, EnemyDef>, startCash = START_CASH): RoundStats[] {
  let cash = startCash;
  return rounds.map((r, ri) => {
    const byEnemy: RoundStats['byEnemy'] = {};
    const byRoute: RoundStats['byRoute'] = {};
    const buckets = new Map<number, number>();
    let spawnSec = 0;
    let clearSec = 0;
    let enemies = 0;
    let totalHp = 0;
    let leakedLives = 0;
    for (const g of r.groups) {
      const def = defs[g.enemy];
      if (!def) continue;
      const len = PATH_LEN[g.spawn] ?? 35;
      const route = g.route ?? `${g.spawn}:A`;
      for (let k = 0; k < g.count; k++) {
        const t = g.startSec + k * g.intervalSec;
        const out = t + len / def.speed;
        spawnSec = Math.max(spawnSec, t);
        clearSec = Math.max(clearSec, out);
        enemies++;
        totalHp += def.hp;
        leakedLives += def.damage;
        const be = (byEnemy[g.enemy] ??= { count: 0, hp: 0 });
        be.count++;
        be.hp += def.hp;
        byRoute[route] = (byRoute[route] ?? 0) + 1;
        buckets.set(Math.floor(out), (buckets.get(Math.floor(out)) ?? 0) + def.hp);
      }
    }
    const cashAtStart = cash;
    cash += r.bonusCash;
    return {
      round: ri + 1,
      enemies,
      totalHp,
      spawnSec,
      clearSec: Math.round(clearSec * 100) / 100,
      leaked: enemies,
      leakedLives,
      peakLeakHpPerSec: Math.max(0, ...buckets.values()),
      byEnemy,
      byRoute,
      cashAtStart,
      cashAtEnd: cash,
    };
  });
}

const ERRORS = ['Round 3, group "r3_k2": no way from "north" to an exit.', 'Round 5, group "r5_x9": unknown enemy "golem".'];

function Preview() {
  const [rounds, setRounds] = useState(SAMPLE_ROUNDS);
  const [log, setLog] = useState<string[]>([]);
  const [picked, setPicked] = useState<number | null>(null);
  const roundEls = useRef<(HTMLElement | null)[]>([]);
  const stats = useMemo(() => simulate(rounds, ENEMIES), [rounds]);
  const edge = useMemo(
    () => ({ one: simulate(SAMPLE_ROUNDS.slice(5, 6), ENEMIES), long: simulate(longCampaign(), ENEMIES), modded: simulate(moddedCampaign(), MANY_ENEMIES) }),
    [],
  );

  const move = (ri: number) => (groupIndex: number, startSec: number) => {
    console.log('[charts-preview] onMoveGroup', JSON.stringify({ round: ri + 1, groupIndex, startSec }));
    setLog((l) => [`round ${ri + 1} · group ${groupIndex} → ${startSec}s`, ...l].slice(0, 6));
    setRounds((rs) => rs.map((r, i) => (i !== ri ? r : { ...r, groups: r.groups.map((g, gi) => (gi === groupIndex ? { ...g, startSec } : g)) })));
  };
  const pickRound = (ri: number) => {
    console.log('[charts-preview] onPickRound', ri);
    setPicked(ri);
    roundEls.current[ri]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };

  return (
    <div className="pv">
      <section className="pv-col">
        <h2>Waves panel (timelines, draggable)</h2>
        <div className="pv-panel panel-body waves">
          {rounds.map((r, ri) => (
            <section key={ri} ref={(el) => void (roundEls.current[ri] = el)} className={picked === ri ? 'round is-picked' : 'round'}>
              <header>
                <strong>Round {ri + 1}</strong>
                <span className="muted">
                  {r.groups.reduce((n, g) => n + g.count, 0)} enemies{stats[ri] ? ` · clear ${stats[ri].clearSec}s` : ''}
                </span>
              </header>
              <WaveTimeline round={r} enemies={ENEMIES} clearSec={r.groups.length ? stats[ri]?.clearSec : undefined} onMoveGroup={move(ri)} />
            </section>
          ))}
          <section className="round">
            <header>
              <strong>Same as round 1, no clear marker</strong>
            </header>
            <WaveTimeline round={rounds[0]!} enemies={ENEMIES} onMoveGroup={move(0)} />
          </section>
        </div>
        <pre className="pv-log" data-testid="move-log">
          {log.length ? log.join('\n') : 'onMoveGroup calls appear here'}
        </pre>
      </section>

      <section className="pv-col">
        <h2>Balance panel (live from the waves)</h2>
        <div className="pv-panel panel-body">
          <BalancePanel stats={stats} errors={[]} enemies={ENEMIES} startCash={START_CASH} onPickRound={pickRound} />
        </div>
      </section>

      <section className="pv-col">
        <h2>Edge cases</h2>
        <h3>45 rounds</h3>
        <div className="pv-panel panel-body">
          <BalancePanel stats={edge.long} errors={[]} enemies={ENEMIES} startCash={START_CASH} />
        </div>
        <h3>1 round</h3>
        <div className="pv-panel panel-body">
          <BalancePanel stats={edge.one} errors={[]} enemies={ENEMIES} startCash={START_CASH} />
        </div>
        <h3>9 enemy types (folds to Other, hatch, dark colour lifted)</h3>
        <div className="pv-panel panel-body">
          <BalancePanel stats={edge.modded} errors={[]} enemies={MANY_ENEMIES} startCash={START_CASH} />
        </div>
        <h3>0 rounds</h3>
        <div className="pv-panel panel-body">
          <BalancePanel stats={[]} errors={[]} enemies={ENEMIES} startCash={START_CASH} />
        </div>
        <h3>Can't simulate (errors)</h3>
        <div className="pv-panel panel-body">
          <BalancePanel stats={null} errors={ERRORS} enemies={ENEMIES} startCash={START_CASH} />
        </div>
        <h3>Can't simulate (no errors given)</h3>
        <div className="pv-panel panel-body">
          <BalancePanel stats={null} errors={[]} enemies={ENEMIES} startCash={START_CASH} />
        </div>
      </section>
    </div>
  );
}

// Hot updates re-run this module; reuse the root instead of creating a second one.
const host = window as typeof window & { __chartsPreviewRoot?: Root };
host.__chartsPreviewRoot ??= createRoot(document.getElementById('root')!);
host.__chartsPreviewRoot.render(<Preview />);
