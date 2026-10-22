// Balance charts for the whole waves file, from the no-tower simulation: a stack of small charts that
// share one round axis (x = round number), a summary row and a table view. Plain SVG + React.
import { useId, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import type { RoundStats } from '@tdmm/sim';
import { FALLBACK_ENEMY_COLOR, SURFACE, colorDistance, fmtSec, markColor, textWidth, useWidth } from './WaveTimeline.tsx';
import './charts.css';

export interface BalancePanelProps {
  stats: RoundStats[] | null;
  errors: string[];
  enemies: Record<string, { name: string; color: string }>;
  startCash: number;
  /** Optional: clicking a round in any chart selects it (I'll use it to scroll the waves panel). */
  onPickRound?: (roundIndex: number) => void;
  /**
   * Optional: true while new stats are being computed. With `stats` null and this set, the last
   * charts stay up (dimmed) instead of the empty message, so the panel doesn't flash on every edit.
   */
  computing?: boolean;
}

type ChartId = 'hp' | 'time' | 'pressure' | 'cash';
type Hover = { i: number; chart: ChartId } | null;

const Y_GUTTER = 34;
const RIGHT_PAD = 6;
const TOP_PAD = 14;
const PLOT_H = 72;
const X_AXIS_H = 15;
const GAP = 2;
const MAX_SERIES = 7;
const OTHER_COLOR = '#7f8a97';
const LABEL_STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500];

// ---- formatting ----
const fmtInt = (v: number) => Math.round(v).toLocaleString('en-US');
function fmtCompact(v: number): string {
  const a = Math.abs(v);
  if (a < 1000) return Number.isInteger(v) ? String(v) : String(Math.round(v * 10) / 10);
  if (a < 10_000) return `${(v / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  if (a < 1_000_000) return `${Math.round(v / 1000)}K`;
  return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
}
const fmtCash = (v: number) => `$${fmtInt(v)}`;
function fmtDuration(sec: number): string {
  const s = Math.round(sec);
  if (s < 60) return `${s}s`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m ${String(s % 60).padStart(2, '0')}s`;
}

// ---- scales & shapes ----
interface Layout {
  width: number;
  n: number;
  left: number;
  band: number;
  barW: number;
  base: number;
  height: number;
  labelEvery: number;
  center: (i: number) => number;
}

function makeLayout(width: number, n: number): Layout {
  const left = Y_GUTTER;
  const plotW = Math.max(20, width - left - RIGHT_PAD);
  const band = plotW / Math.max(1, n);
  const barW = Math.min(24, Math.max(1, band - Math.max(1, Math.min(band * 0.32, 8))));
  const labelEvery = LABEL_STEPS.find((k) => k * band >= 22) ?? LABEL_STEPS[LABEL_STEPS.length - 1]!;
  return { width, n, left, band, barW, base: TOP_PAD + PLOT_H, height: TOP_PAD + PLOT_H + X_AXIS_H, labelEvery, center: (i) => left + band * (i + 0.5) };
}

function niceScale(max: number): { top: number; ticks: number[] } {
  if (!(max > 0)) return { top: 1, ticks: [0] };
  const raw = max / 3;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const top = Math.ceil(max / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let t = 0; t <= top + step / 2; t += step) ticks.push(Math.round(t * 1e6) / 1e6);
  return { top, ticks };
}

/** A bar with a rounded data end (top) and a square baseline. */
function columnPath(x: number, y: number, w: number, h: number, rounded: boolean): string {
  const r = rounded ? Math.max(0, Math.min(4, w / 2, h)) : 0;
  if (r === 0) return `M${x},${y}h${w}v${h}h${-w}Z`;
  return `M${x},${y + h}V${y + r}A${r},${r} 0 0 1 ${x + r},${y}H${x + w - r}A${r},${r} 0 0 1 ${x + w},${y + r}V${y + h}Z`;
}

interface Segment {
  value: number;
  fill?: string;
  className?: string;
  hatch?: boolean;
}

/** One stacked column, bottom segment first, with 2px surface gaps between segments. */
function StackedColumn({ x, w, segs, y, hatchId }: { x: number; w: number; segs: Segment[]; y: (v: number) => number; hatchId?: string }) {
  const lastIdx = segs.reduce((last, s, j) => (s.value > 0 ? j : last), -1);
  let acc = 0;
  const out: ReactNode[] = [];
  segs.forEach((s, j) => {
    if (s.value <= 0) return;
    const yTop = y(acc + s.value);
    const yBottom = y(acc) - (acc > 0 ? GAP : 0);
    acc += s.value;
    const h = Math.max(1, yBottom - yTop);
    const d = columnPath(x, yTop, w, h, j === lastIdx);
    out.push(<path key={j} d={d} className={s.className} style={s.fill ? { fill: s.fill } : undefined} />);
    if (s.hatch && hatchId) out.push(<path key={`${j}h`} d={d} fill={`url(#${hatchId})`} />);
  });
  return <>{out}</>;
}

// ---- enemy series (chart 1) ----
interface Series {
  key: string;
  name: string;
  color: string;
  hatch: boolean;
  ids: string[];
}

function enemySeries(stats: RoundStats[], enemies: BalancePanelProps['enemies']): Series[] {
  const totals = new Map<string, number>();
  for (const s of stats) for (const [id, v] of Object.entries(s.byEnemy)) totals.set(id, (totals.get(id) ?? 0) + v.hp);
  // Content order first (stable colours and stacking across edits), then unknown ids as they appear.
  const order = [...Object.keys(enemies).filter((id) => totals.has(id)), ...[...totals.keys()].filter((id) => !(id in enemies))];
  let kept = order;
  let folded: string[] = [];
  if (order.length > MAX_SERIES) {
    const biggest = new Set([...order].sort((a, b) => totals.get(b)! - totals.get(a)!).slice(0, MAX_SERIES - 1));
    kept = order.filter((id) => biggest.has(id));
    folded = order.filter((id) => !biggest.has(id));
  }
  const series: Series[] = kept.map((id) => ({ key: id, name: enemies[id]?.name ?? id, color: markColor(enemies[id]?.color ?? FALLBACK_ENEMY_COLOR, SURFACE.panel), hatch: false, ids: [id] }));
  if (folded.length) series.push({ key: '__other__', name: `Other (${folded.length})`, color: OTHER_COLOR, hatch: false, ids: folded });
  // Neighbours in the stack that colour alone can't separate get the 45° hatch as a second channel.
  for (let j = 1; j < series.length; j++) {
    const prev = series[j - 1]!;
    const cur = series[j]!;
    if (!prev.hatch && colorDistance(prev.color, cur.color) < 15) cur.hatch = true;
  }
  return series;
}

const seriesValue = (s: RoundStats, se: Series) =>
  se.ids.reduce((acc, id) => {
    const v = s.byEnemy[id];
    return v ? { count: acc.count + v.count, hp: acc.hp + v.hp } : acc;
  }, { count: 0, hp: 0 });

// ---- one chart on the shared round axis ----
interface RoundChartProps {
  id: ChartId;
  title: string;
  note: ReactNode;
  legend?: ReactNode;
  L: Layout;
  max: number;
  yFormat: (v: number) => string;
  marks: (y: (v: number) => number) => ReactNode;
  defs?: ReactNode;
  /** The one direct label: the extreme (or the end) of the series. */
  peak?: { i: number; value: number; text: string };
  tooltip: (i: number) => ReactNode;
  hover: Hover;
  setHover: (h: Hover) => void;
  onPick?: (i: number) => void;
  describe: string;
}

function RoundChart({ id, title, note, legend, L, max, yFormat, marks, defs, peak, tooltip, hover, setHover, onPick, describe }: RoundChartProps) {
  const { top, ticks } = niceScale(max);
  const y = (v: number) => L.base - (v / top) * PLOT_H;
  const hi = hover && hover.i < L.n ? hover.i : null;
  const mine = hover?.chart === id && hi !== null;
  const indexAt = (e: { clientX: number; currentTarget: Element }) => {
    const x = e.clientX - e.currentTarget.getBoundingClientRect().left;
    return Math.min(L.n - 1, Math.max(0, Math.floor((x - L.left) / L.band)));
  };
  const onKeyDown = (e: ReactKeyboardEvent<SVGSVGElement>) => {
    const cur = hi ?? -1;
    let next: number | null = null;
    if (e.key === 'ArrowRight') next = Math.min(L.n - 1, cur + 1);
    else if (e.key === 'ArrowLeft') next = Math.max(0, cur - 1);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = L.n - 1;
    else if ((e.key === 'Enter' || e.key === ' ') && hi !== null && onPick) {
      e.preventDefault();
      onPick(hi);
      return;
    }
    if (next === null) return;
    e.preventDefault();
    setHover({ i: next, chart: id });
  };

  let peakLabel: ReactNode = null;
  if (peak && L.n > 0) {
    const cx = L.center(peak.i);
    const half = textWidth(peak.text, 10) / 2;
    const anchor = cx + half > L.width - 1 ? 'end' : cx - half < L.left ? 'start' : 'middle';
    const tx = anchor === 'end' ? L.width - 1 : anchor === 'start' ? Math.max(L.left, cx - 2) : cx;
    peakLabel = (
      <text className="tdc-peak" x={tx} y={Math.max(9, y(peak.value) - 4)} textAnchor={anchor}>
        {peak.text}
      </text>
    );
  }

  let tip: ReactNode = null;
  if (mine && hi !== null) {
    const cx = L.center(hi);
    const off = Math.max(L.barW / 2, 4) + 8;
    const leftSide = cx > L.width / 2;
    tip = (
      <div className="tdc-tip" style={leftSide ? { right: L.width - cx + off, top: TOP_PAD - 6 } : { left: cx + off, top: TOP_PAD - 6 }} aria-live="polite">
        {tooltip(hi)}
      </div>
    );
  }

  return (
    <section className="tdc-card" aria-label={title}>
      <h4 className="tdc-title">{title}</h4>
      <p className="tdc-note">{note}</p>
      {legend}
      <div style={{ position: 'relative' }}>
        <svg
          className={`tdc-svg tdc-plot${onPick ? ' is-pickable' : ''}`}
          width={L.width}
          height={L.height}
          viewBox={`0 0 ${L.width} ${L.height}`}
          tabIndex={0}
          role="group"
          aria-roledescription="chart"
          aria-label={`${title}. ${describe} Use the arrow keys to read each round${onPick ? ', Enter to select it' : ''}.`}
          onPointerMove={(e) => {
            const i = indexAt(e);
            if (hover?.i !== i || hover.chart !== id) setHover({ i, chart: id });
          }}
          onPointerLeave={() => hover?.chart === id && setHover(null)}
          onClick={(e) => onPick?.(indexAt(e))}
          onFocus={() => hover?.chart !== id && setHover({ i: hi ?? 0, chart: id })}
          onBlur={() => hover?.chart === id && setHover(null)}
          onKeyDown={onKeyDown}
        >
          {defs && <defs>{defs}</defs>}
          {ticks.map((t) => (
            <g key={t}>
              {t > 0 && <line className="tdc-grid" x1={L.left} x2={L.width - RIGHT_PAD} y1={Math.round(y(t)) + 0.5} y2={Math.round(y(t)) + 0.5} />}
              <text className="tdc-tick" x={L.left - 5} y={y(t)} textAnchor="end" dominantBaseline="central">
                {yFormat(t)}
              </text>
            </g>
          ))}
          {hi !== null && <rect className="tdc-hoverband" x={L.left + hi * L.band} y={TOP_PAD - 4} width={L.band} height={PLOT_H + 4} />}
          {marks(y)}
          <line className="tdc-axis" x1={L.left} x2={L.width - RIGHT_PAD} y1={L.base + 0.5} y2={L.base + 0.5} />
          {Array.from({ length: L.n }, (_, i) => i)
            .filter((i) => i === 0 || (i + 1) % L.labelEvery === 0)
            .filter((i) => !(i === 0 && L.labelEvery > 1 && L.band * (L.labelEvery - 1) < 14))
            .map((i) => (
              <text key={i} className="tdc-tick" x={L.center(i)} y={L.base + 11} textAnchor="middle">
                {i + 1}
              </text>
            ))}
          {peakLabel}
        </svg>
        {tip}
      </div>
    </section>
  );
}

function TipHead({ round, children }: { round: number; children?: ReactNode }) {
  return (
    <div className="tdc-tip-head">
      Round {round}
      {children}
    </div>
  );
}

function argMax(values: number[]): number {
  let best = 0;
  values.forEach((v, i) => {
    if (v > (values[best] ?? -Infinity)) best = i;
  });
  return best;
}

// ---- panel ----
export function BalancePanel({ stats, errors, enemies, startCash, onPickRound, computing }: BalancePanelProps) {
  const [wrapRef, width] = useWidth<HTMLDivElement>(350);
  const [hover, setHover] = useState<Hover>(null);
  const [table, setTable] = useState(false);
  const hatchId = `tdc-hatch-${useId().replace(/[^\w-]/g, '')}`;
  const lastStats = useRef<RoundStats[] | null>(null);
  if (stats) lastStats.current = stats;
  const shown = stats ?? (computing ? lastStats.current : null);

  if (!shown) {
    return (
      <div ref={wrapRef} className="tdc-balance">
        {errors.length > 0 ? (
          <div>
            <p className="tdc-errors-title">The waves can't be simulated yet</p>
            <ul className="tdc-errors">
              {errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="tdc-empty">Fix the problems in the Check tab to see balance charts.</p>
        )}
      </div>
    );
  }

  const n = shown.length;
  const L = makeLayout(width, n);
  const pick = onPickRound ? (i: number) => onPickRound((shown[i]?.round ?? i + 1) - 1) : undefined;
  const totals = shown.reduce((t, s) => ({ enemies: t.enemies + s.enemies, hp: t.hp + s.totalHp, time: t.time + s.clearSec }), { enemies: 0, hp: 0, time: 0 });
  const common = { L, hover, setHover, onPick: pick };

  const summary = (
    <div className="tdc-summary">
      <div className="tdc-stat">
        <div className="tdc-stat-label">Enemies</div>
        <div className="tdc-stat-value">{fmtInt(totals.enemies)}</div>
      </div>
      <div className="tdc-stat" title={`${fmtInt(totals.hp)} HP`}>
        <div className="tdc-stat-label">Total HP</div>
        <div className="tdc-stat-value">{fmtCompact(totals.hp)}</div>
      </div>
      <div className="tdc-stat" title={`${fmtSec(Math.round(totals.time * 10) / 10)} over ${n} round${n === 1 ? '' : 's'}, no towers`}>
        <div className="tdc-stat-label">Time, no towers</div>
        <div className="tdc-stat-value">{fmtDuration(totals.time)}</div>
      </div>
      {n > 0 && (
        <button className="tdc-toggle" aria-pressed={table} title="Show the numbers as a table" onClick={() => setTable((t) => !t)}>
          Table
        </button>
      )}
    </div>
  );

  if (n === 0) {
    return (
      <div ref={wrapRef} className="tdc-balance">
        {summary}
        <p className="tdc-empty">No rounds yet. Add a round in the Waves tab to see balance charts.</p>
      </div>
    );
  }

  const series = enemySeries(shown, enemies);
  const dimmed = !stats && computing;

  if (table) {
    return (
      <div ref={wrapRef} className="tdc-balance" style={dimmed ? { opacity: 0.5 } : undefined}>
        {summary}
        <div className="tdc-table-wrap">
          <table className="tdc-table">
            <thead>
              <tr>
                <th scope="col">Round</th>
                <th scope="col">Enemies</th>
                <th scope="col">HP</th>
                <th scope="col">Spawn</th>
                <th scope="col">Clear</th>
                <th scope="col" title="Peak HP reaching the exit per second">HP/s</th>
                <th scope="col">Cash</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((s, i) => (
                <tr
                  key={s.round}
                  className={pick ? 'is-pickable' : undefined}
                  tabIndex={pick ? 0 : undefined}
                  onClick={pick && (() => pick(i))}
                  onKeyDown={pick && ((e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), pick(i)))}
                  title={series.map((se) => `${se.name} ×${seriesValue(s, se).count}`).filter((t) => !t.endsWith('×0')).join(', ')}
                >
                  <td>{s.round}</td>
                  <td>{fmtInt(s.enemies)}</td>
                  <td>{fmtInt(s.totalHp)}</td>
                  <td>{fmtSec(s.spawnSec)}</td>
                  <td>{fmtSec(s.clearSec)}</td>
                  <td>{fmtInt(s.peakLeakHpPerSec)}</td>
                  <td>{fmtCash(s.cashAtStart)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  const hpPeak = argMax(shown.map((s) => s.totalHp));
  const timePeak = argMax(shown.map((s) => s.clearSec));
  const pressurePeak = argMax(shown.map((s) => s.peakLeakHpPerSec));
  const showDots = n <= 24;
  const cashPts = shown.map((s, i) => [L.center(i), s.cashAtStart] as const);

  return (
    <div ref={wrapRef} className="tdc-balance" style={dimmed ? { opacity: 0.5 } : undefined} aria-busy={dimmed || undefined}>
      {summary}

      <RoundChart
        {...common}
        id="hp"
        title="Enemy HP per round"
        note="Total hit points sent each round, stacked by enemy type."
        describe={`Peak ${fmtInt(shown[hpPeak]!.totalHp)} HP in round ${shown[hpPeak]!.round}.`}
        legend={
          <ul className="tdc-legend" aria-label="Enemy types">
            {series.map((se) => (
              <li key={se.key}>
                <i className={`tdc-swatch${se.hatch ? ' is-hatched' : ''}`} style={{ background: se.color }} />
                {se.name}
              </li>
            ))}
          </ul>
        }
        max={Math.max(0, ...shown.map((s) => s.totalHp))}
        yFormat={fmtCompact}
        defs={
          <pattern id={hatchId} width={4} height={4} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width={1.4} height={4} fill="rgba(0,0,0,0.55)" />
          </pattern>
        }
        marks={(y) =>
          shown.map((s, i) => (
            <StackedColumn
              key={i}
              x={L.center(i) - L.barW / 2}
              w={L.barW}
              y={y}
              hatchId={hatchId}
              segs={series.map((se) => ({ value: seriesValue(s, se).hp, fill: se.color, hatch: se.hatch }))}
            />
          ))
        }
        peak={{ i: hpPeak, value: shown[hpPeak]!.totalHp, text: fmtCompact(shown[hpPeak]!.totalHp) }}
        tooltip={(i) => {
          const s = shown[i]!;
          return (
            <>
              <TipHead round={s.round} />
              <div className="tdc-tip-row">
                <b>{fmtInt(s.totalHp)} HP</b>
                <span>{fmtInt(s.enemies)} enemies</span>
              </div>
              {series
                .map((se) => ({ se, v: seriesValue(s, se) }))
                .filter(({ v }) => v.count > 0)
                .reverse()
                .map(({ se, v }) => (
                  <div key={se.key} className="tdc-tip-row">
                    <i className="tdc-key" style={{ background: se.color }} />
                    <b>{fmtInt(v.hp)}</b>
                    <span>
                      {se.name} ×{v.count}
                    </span>
                  </div>
                ))}
            </>
          );
        }}
      />

      <RoundChart
        {...common}
        id="time"
        title="Round length"
        note="Bar = time until the round is over with no towers; lower part = enemies still spawning."
        describe={`Longest: round ${shown[timePeak]!.round}, ${fmtSec(shown[timePeak]!.clearSec)}.`}
        legend={
          <ul className="tdc-legend">
            <li>
              <i className="tdc-swatch" style={{ background: 'var(--tdc-metric-soft)' }} />
              Spawning
            </li>
            <li>
              <i className="tdc-swatch" style={{ background: 'var(--tdc-metric)' }} />
              Last enemies walking out
            </li>
          </ul>
        }
        max={Math.max(0, ...shown.map((s) => s.clearSec))}
        yFormat={fmtSec}
        marks={(y) =>
          shown.map((s, i) => (
            <StackedColumn
              key={i}
              x={L.center(i) - L.barW / 2}
              w={L.barW}
              y={y}
              segs={[
                { value: s.spawnSec, className: 'tdc-metric-soft' },
                { value: Math.max(0, s.clearSec - s.spawnSec), className: 'tdc-metric' },
              ]}
            />
          ))
        }
        peak={{ i: timePeak, value: shown[timePeak]!.clearSec, text: fmtSec(Math.round(shown[timePeak]!.clearSec)) }}
        tooltip={(i) => {
          const s = shown[i]!;
          return (
            <>
              <TipHead round={s.round} />
              <div className="tdc-tip-row">
                <i className="tdc-key" style={{ background: 'var(--tdc-metric)' }} />
                <b>{fmtSec(s.clearSec)}</b>
                <span>until clear (no towers)</span>
              </div>
              <div className="tdc-tip-row">
                <i className="tdc-key" style={{ background: 'var(--tdc-metric-soft)' }} />
                <b>{fmtSec(s.spawnSec)}</b>
                <span>spawning</span>
              </div>
            </>
          );
        }}
      />

      <RoundChart
        {...common}
        id="pressure"
        title="Pressure at the exit"
        note="Most enemy HP reaching the exit in any one second, with no towers: what defences must absorb."
        describe={`Highest: round ${shown[pressurePeak]!.round}, ${fmtInt(shown[pressurePeak]!.peakLeakHpPerSec)} HP per second.`}
        max={Math.max(0, ...shown.map((s) => s.peakLeakHpPerSec))}
        yFormat={fmtCompact}
        marks={(y) =>
          shown.map((s, i) => <StackedColumn key={i} x={L.center(i) - L.barW / 2} w={L.barW} y={y} segs={[{ value: s.peakLeakHpPerSec, className: 'tdc-metric' }]} />)
        }
        peak={{ i: pressurePeak, value: shown[pressurePeak]!.peakLeakHpPerSec, text: `${fmtCompact(shown[pressurePeak]!.peakLeakHpPerSec)}/s` }}
        tooltip={(i) => {
          const s = shown[i]!;
          return (
            <>
              <TipHead round={s.round} />
              <div className="tdc-tip-row">
                <b>{fmtInt(s.peakLeakHpPerSec)} HP/s</b>
                <span>peak at the exit</span>
              </div>
              <div className="tdc-tip-sub">
                {fmtInt(s.leaked)} leaked, −{fmtInt(s.leakedLives)} lives
              </div>
            </>
          );
        }}
      />

      <RoundChart
        {...common}
        id="cash"
        title="Cash at round start"
        note={`Start cash ${fmtCash(startCash)} plus each round's bonus. Kill rewards come on top in play.`}
        describe={`From ${fmtCash(shown[0]!.cashAtStart)} to ${fmtCash(shown[n - 1]!.cashAtStart)}.`}
        max={Math.max(0, ...shown.map((s) => s.cashAtStart))}
        yFormat={(v) => `$${fmtCompact(v)}`}
        marks={(y) => {
          const pts = cashPts.map(([x, v]) => [x, y(v)] as const);
          const line = pts.map(([x, py], k) => `${k ? 'L' : 'M'}${x},${py}`).join('');
          const first = pts[0]!;
          const last = pts[pts.length - 1]!;
          const hi = hover && hover.i < n ? hover.i : null;
          return (
            <>
              {n > 1 && <path className="tdc-area" d={`${line}L${last[0]},${L.base}L${first[0]},${L.base}Z`} />}
              {n > 1 && <path className="tdc-line" d={line} />}
              {pts.map(([x, py], k) => (showDots || n === 1 || k === hi || k === n - 1 ? <circle key={k} className="tdc-dot" cx={x} cy={py} r={4} /> : null))}
            </>
          );
        }}
        peak={{ i: n - 1, value: shown[n - 1]!.cashAtStart, text: `$${fmtCompact(shown[n - 1]!.cashAtStart)}` }}
        tooltip={(i) => {
          const s = shown[i]!;
          const bonus = s.cashAtEnd - s.cashAtStart;
          return (
            <>
              <TipHead round={s.round} />
              <div className="tdc-tip-row">
                <i className="tdc-key" style={{ background: 'var(--tdc-metric)' }} />
                <b>{fmtCash(s.cashAtStart)}</b>
                <span>at the start</span>
              </div>
              <div className="tdc-tip-sub">
                {bonus > 0 ? `+${fmtCash(bonus)} bonus when it ends` : 'No bonus for this round'}
              </div>
            </>
          );
        }}
      />
    </div>
  );
}
