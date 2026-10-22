// Swimlane chart of one round's wave groups: one lane per group, a bar from its first to its last
// spawn, draggable (pointer) or nudgeable (arrow keys) along the time axis. Plain SVG + React.
import { useId, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import type { Round, WaveGroup } from '@tdmm/map-format';
import './charts.css';

export interface WaveTimelineProps {
  round: Round;
  enemies: Record<string, { name: string; color: string }>;
  /** Called once when a drag (or keyboard nudge) ends, with the new start time (snapped to 0.5 s, min 0). */
  onMoveGroup: (groupIndex: number, startSec: number) => void;
  /** Optional: the no-tower clear time for this round, drawn as a marker. */
  clearSec?: number | undefined;
}

// ---------------------------------------------------------------------------------------------
// Shared chart helpers (BalancePanel imports these too).
// ---------------------------------------------------------------------------------------------

/** Chart surfaces, matching styles.css: the right panel (--panel) and a round card (--panel-2). */
export const SURFACE = { panel: '#1d232a', card: '#252c35' } as const;
export const FALLBACK_ENEMY_COLOR = '#888888';

type Vec3 = [number, number, number];

function hexToRgb(hex: string): Vec3 | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const h = m[1]!.length === 3 ? m[1]!.replace(/./g, (c) => c + c) : m[1]!;
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const rgbToHex = (c: Vec3) => `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
const toLinear = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const fromLinear = (v: number) => {
  const c = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.max(0, v) ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, c)) * 255);
};
function luminance([r, g, b]: Vec3) {
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}
function contrast(a: Vec3, b: Vec3) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
function toOklab([r8, g8, b8]: Vec3): Vec3 {
  const r = toLinear(r8), g = toLinear(g8), b = toLinear(b8);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
function fromOklab([L, a, b]: Vec3): Vec3 {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

const markColorCache = new Map<string, string>();
/**
 * The enemy's content colour as a chart mark on `surface`: unchanged when it already clears 3:1,
 * otherwise lifted in OKLab lightness (hue and chroma held) until it does, so a dark enemy colour
 * never disappears into the dark panel. Invalid colours fall back to grey.
 */
export function markColor(hex: string, surface: string = SURFACE.panel): string {
  const key = `${hex}|${surface}`;
  const cached = markColorCache.get(key);
  if (cached) return cached;
  const rgb = hexToRgb(hex) ?? hexToRgb(FALLBACK_ENEMY_COLOR)!;
  const bg = hexToRgb(surface) ?? [0, 0, 0];
  let out = rgbToHex(rgb);
  if (contrast(rgb, bg) < 3) {
    const [L, a, b] = toOklab(rgb);
    const dir = luminance(bg) < 0.18 ? 1 : -1;
    out = dir > 0 ? '#ffffff' : '#000000';
    for (let i = 1; i <= 80; i++) {
      const c = fromOklab([L + dir * i * 0.01, a, b]);
      if (contrast(c, bg) >= 3) {
        out = rgbToHex(c);
        break;
      }
    }
  }
  markColorCache.set(key, out);
  return out;
}

/** Perceptual distance between two colours (OKLab ΔE ×100); under ~15 they're hard to tell apart. */
export function colorDistance(a: string, b: string): number {
  const p = toOklab(hexToRgb(a) ?? [0, 0, 0]);
  const q = toOklab(hexToRgb(b) ?? [0, 0, 0]);
  return 100 * Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

/** "7s", "7.5s", "0.25s". */
export function fmtSec(sec: number): string {
  const r = Math.round(sec * 100) / 100;
  if (Number.isInteger(r)) return `${r}s`;
  return `${r.toFixed(Math.abs(r * 10 - Math.round(r * 10)) < 1e-9 ? 1 : 2)}s`;
}

/** Width of the element, kept current with a ResizeObserver. */
export function useWidth<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const w = Math.floor(el.clientWidth);
      if (w > 0) setWidth(w);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

let measureCtx: CanvasRenderingContext2D | null | undefined;
/** Rendered width of `text` at the chart label font. */
export function textWidth(text: string, px = 11): number {
  if (measureCtx === undefined) measureCtx = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
  if (!measureCtx) return text.length * px * 0.58;
  measureCtx.font = `${px}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  return measureCtx.measureText(text).width;
}

/** Shortens `text` with an ellipsis until it fits `max` px. */
export function fitText(text: string, max: number, px = 11): string {
  if (textWidth(text, px) <= max) return text;
  let s = text;
  while (s.length > 1 && textWidth(`${s}…`, px) > max) s = s.slice(0, -1);
  return `${s.trimEnd()}…`;
}

// ---------------------------------------------------------------------------------------------
// WaveTimeline
// ---------------------------------------------------------------------------------------------

const LANE = 16;
const BAR_H = 10;
const AXIS_H = 16;
const MARKER_H = 13;
const RIGHT_PAD = 8;
const TIME_STEPS = [1, 2, 5, 10, 30, 60, 120, 300];
const DRAG_DEADZONE_PX = 3;

const snapHalf = (sec: number) => Math.max(0, Math.round(sec * 2) / 2);
const lastSpawn = (g: WaveGroup, start = g.startSec) => start + Math.max(0, g.count - 1) * g.intervalSec;

export function groupLabel(g: WaveGroup, name: string): string {
  return `${g.count}× ${name}, every ${fmtSec(g.intervalSec)}, from ${g.spawn}${g.route ? ` via ${g.route}` : ''}`;
}

interface DragState {
  gi: number;
  pointerId: number;
  originX: number;
  originSec: number;
  pxPerSec: number;
  sec: number;
}

export function WaveTimeline({ round, enemies, onMoveGroup, clearSec }: WaveTimelineProps) {
  const [wrapRef, width] = useWidth<HTMLDivElement>(350);
  const [preview, setPreview] = useState<{ gi: number; sec: number } | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [focus, setFocus] = useState<number | null>(null);
  const drag = useRef<DragState | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const clipId = `tdc-tl-clip-${useId().replace(/[^\w-]/g, '')}`;

  const groups = round.groups;
  const info = (g: WaveGroup) => {
    const e = enemies[g.enemy];
    return { name: e?.name ?? g.enemy, color: markColor(e?.color ?? FALLBACK_ENEMY_COLOR, SURFACE.card) };
  };

  // Gutter fits the longest "8× Scout" label, within limits.
  const shortLabels = groups.map((g) => `${g.count}× ${info(g).name}`);
  const gutter = Math.round(Math.min(96, Math.max(44, ...shortLabels.map((s) => textWidth(s) + 10))));
  const plotW = Math.max(40, width - gutter - RIGHT_PAD);

  // The domain only follows committed values, so it stays still while a bar is being dragged.
  const maxEnd = Math.max(0, ...groups.map((g) => lastSpawn(g)), clearSec ?? 0);
  const rawMax = Math.max(5, maxEnd * 1.12 + 0.5);
  const step = TIME_STEPS.find((s) => (s / rawMax) * plotW >= 34) ?? TIME_STEPS[TIME_STEPS.length - 1]!;
  const domainMax = Math.ceil(rawMax / step) * step;
  const pxPerSec = plotW / domainMax;
  const xs = (sec: number) => gutter + sec * pxPerSec;

  const top = clearSec !== undefined ? MARKER_H : 2;
  const lanesH = groups.length * LANE;
  const height = top + lanesH + AXIS_H;
  const shown = drag.current ? drag.current.gi : (focus ?? hover);
  const startOf = (gi: number) => (preview && preview.gi === gi ? preview.sec : groups[gi]!.startSec);

  // Keep the tooltip inside the chart horizontally.
  useLayoutEffect(() => {
    const tip = tipRef.current;
    if (!tip || shown === null) return;
    const g = groups[shown];
    if (!g) return;
    const s = startOf(shown);
    const mid = (xs(s) + xs(lastSpawn(g, s))) / 2;
    const w = tip.offsetWidth;
    tip.style.left = `${Math.min(Math.max(0, mid - w / 2), Math.max(0, width - w))}px`;
  });

  const ticks: number[] = [];
  for (let t = 0; t <= domainMax + 1e-9; t += step) ticks.push(t);

  const endDrag = (commit: boolean) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    setPreview(null);
    if (commit && d.sec !== d.originSec) onMoveGroup(d.gi, d.sec);
  };

  const onPointerDown = (gi: number) => (e: ReactPointerEvent<SVGGElement>) => {
    if (e.button !== 0 || drag.current) return;
    const g = groups[gi];
    if (!g) return;
    e.preventDefault();
    e.currentTarget.focus({ preventScroll: true });
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { gi, pointerId: e.pointerId, originX: e.clientX, originSec: g.startSec, pxPerSec, sec: g.startSec };
    setPreview({ gi, sec: g.startSec });
  };
  const onPointerMove = (e: ReactPointerEvent<SVGGElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dx = e.clientX - d.originX;
    const sec = Math.abs(dx) < DRAG_DEADZONE_PX ? d.originSec : snapHalf(d.originSec + dx / d.pxPerSec);
    if (sec !== d.sec) {
      d.sec = sec;
      setPreview({ gi: d.gi, sec });
    }
  };
  const onPointerUp = (e: ReactPointerEvent<SVGGElement>) => {
    // Capture is released implicitly after pointerup; drag.current is cleared first so the
    // lostpointercapture that follows is a no-op.
    if (drag.current?.pointerId === e.pointerId) endDrag(true);
  };
  // Cancelled or capture stolen without a pointerup: put the bar back.
  const onPointerCancel = (e: ReactPointerEvent<SVGGElement>) => {
    if (drag.current?.pointerId === e.pointerId) endDrag(false);
  };

  const onKeyDown = (gi: number) => (e: ReactKeyboardEvent<SVGGElement>) => {
    const g = groups[gi];
    if (!g) return;
    if (e.key === 'Escape' && drag.current) {
      e.preventDefault();
      endDrag(false);
      return;
    }
    if (drag.current) return;
    setFocus(gi);
    const v = g.startSec;
    const by = e.shiftKey ? 5 : 0.5;
    let next: number | null = null;
    if (e.key === 'ArrowRight') next = Math.floor(v * 2 + 1e-6) / 2 + by;
    else if (e.key === 'ArrowLeft') next = Math.ceil(v * 2 - 1e-6) / 2 - by;
    else if (e.key === 'Home') next = 0;
    if (next === null) return;
    e.preventDefault();
    next = Math.max(0, Math.round(next * 2) / 2);
    if (next !== v) onMoveGroup(gi, next);
  };

  const dragging = preview !== null;
  const tipGroup = shown !== null ? groups[shown] : undefined;

  return (
    <div ref={wrapRef} className={`tdc-tl${dragging ? ' is-dragging' : ''}`}>
      {groups.length === 0 ? (
        <div className="tdc-tl-empty">No groups</div>
      ) : (
        <>
          <svg className="tdc-svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="group" aria-label="Round timeline: drag a group, or focus it and use the arrow keys, to change when it starts">
            <defs>
              <clipPath id={clipId}>
                <rect x={gutter - 6} y={0} width={plotW + RIGHT_PAD + 6} height={height} />
              </clipPath>
            </defs>
            {/* lane stripes and labels */}
            {groups.map((g, gi) => (
              <g key={`lane-${g.id}`}>
                {(gi % 2 === 1 || gi === shown) && <rect className={gi === shown ? 'tdc-lane is-on' : 'tdc-lane'} x={0} y={top + gi * LANE} width={width} height={LANE} />}
                <text className="tdc-lane-label" x={gutter - 6} y={top + gi * LANE + LANE / 2} textAnchor="end" dominantBaseline="central">
                  {fitText(shortLabels[gi]!, gutter - 10)}
                </text>
              </g>
            ))}
            {/* time grid + axis */}
            {ticks.map((t) => (
              <line key={`grid-${t}`} className="tdc-grid" x1={xs(t)} x2={xs(t)} y1={top} y2={top + lanesH} />
            ))}
            <line className="tdc-axis" x1={gutter} x2={gutter + plotW} y1={top + lanesH + 0.5} y2={top + lanesH + 0.5} />
            {ticks.map((t, i) => (
              <text key={`tick-${t}`} className="tdc-tick" x={xs(t)} y={top + lanesH + 11} textAnchor={i === ticks.length - 1 && i > 0 ? 'end' : 'middle'}>
                {fmtSec(t)}
              </text>
            ))}
            {/* no-tower clear marker */}
            {clearSec !== undefined && (
              <g className="tdc-clear" aria-label={`No-tower clear at ${fmtSec(clearSec)}`}>
                <line x1={xs(clearSec)} x2={xs(clearSec)} y1={top - 3} y2={top + lanesH} />
                <text x={xs(clearSec)} y={top - 4} textAnchor={xs(clearSec) > width - 60 ? 'end' : xs(clearSec) < gutter + 40 ? 'start' : 'middle'}>
                  clear {fmtSec(clearSec)}
                </text>
              </g>
            )}
            {/* group bars */}
            <g clipPath={`url(#${clipId})`}>
              {groups.map((g, gi) => {
                const { name, color } = info(g);
                const s = startOf(gi);
                const x0 = xs(s);
                const x1 = xs(lastSpawn(g, s));
                const y = top + gi * LANE + (LANE - BAR_H) / 2;
                const spacing = g.intervalSec * pxPerSec;
                const single = g.count === 1;
                const ticksFit = !single && spacing >= 4 && g.count <= 400;
                const hitX = Math.min(x0 - 6, (x0 + x1) / 2 - 9);
                const hitW = Math.max(x1 - x0 + 12, 18);
                return (
                  <g
                    key={g.id}
                    className={`tdc-bar${preview?.gi === gi ? ' is-dragging' : ''}`}
                    tabIndex={0}
                    role="slider"
                    aria-label={groupLabel(g, name)}
                    aria-valuemin={0}
                    aria-valuenow={s}
                    aria-valuetext={`starts at ${fmtSec(s)}`}
                    onPointerDown={onPointerDown(gi)}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={onPointerCancel}
                    onLostPointerCapture={onPointerCancel}
                    onPointerEnter={() => setHover(gi)}
                    onPointerLeave={() => setHover((h) => (h === gi ? null : h))}
                    onFocus={(e) => setFocus(e.currentTarget.matches(':focus-visible') ? gi : null)}
                    onBlur={() => setFocus((f) => (f === gi ? null : f))}
                    onKeyDown={onKeyDown(gi)}
                  >
                    <rect className="tdc-hit" x={hitX} y={top + gi * LANE} width={hitW} height={LANE} />
                    <rect className="tdc-ring" x={x0 - 4} y={y - 2.5} width={Math.max(8, x1 - x0 + 8)} height={BAR_H + 5} rx={4} />
                    {single ? (
                      <rect x={x0 - 2} y={y} width={4} height={BAR_H} rx={1.5} style={{ fill: color }} />
                    ) : (
                      <>
                        <rect x={x0 - 1} y={y} width={Math.max(2, x1 - x0 + 2)} height={BAR_H} rx={2} style={{ fill: color }} opacity={ticksFit ? 0.3 : 1} />
                        {ticksFit && Array.from({ length: g.count }, (_, k) => <rect key={k} x={x0 + k * spacing - 1} y={y} width={2} height={BAR_H} rx={0.5} style={{ fill: color }} />)}
                      </>
                    )}
                  </g>
                );
              })}
            </g>
          </svg>
          {tipGroup && shown !== null && (
            <div
              ref={tipRef}
              className="tdc-tip tdc-tl-tip"
              style={top + shown * LANE > 40 ? { top: top + shown * LANE - 4, transform: 'translateY(-100%)' } : { top: top + (shown + 1) * LANE + 4 }}
              aria-live="polite"
            >
              <TimelineTip g={tipGroup} name={info(tipGroup).name} color={info(tipGroup).color} start={startOf(shown)} dragging={preview?.gi === shown} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function TimelineTip({ g, name, color, start, dragging }: { g: WaveGroup; name: string; color: string; start: number; dragging: boolean }) {
  const end = lastSpawn(g, start);
  return (
    <>
      <div className="tdc-tip-row">
        <i className="tdc-key" style={{ background: color }} />
        <b>{g.count > 1 ? `${fmtSec(start)} → ${fmtSec(end)}` : `at ${fmtSec(start)}`}</b>
        {dragging && start !== g.startSec && <span className="tdc-tip-dim">was {fmtSec(g.startSec)}</span>}
      </div>
      <div className="tdc-tip-sub">{groupLabel(g, name)}</div>
    </>
  );
}
