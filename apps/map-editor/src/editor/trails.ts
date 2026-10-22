// Last-run trails: after a playtest the editor shows how far enemies got down each route, where
// they leaked and where the stragglers were when you stopped (Mario Maker's "last path"). They stay
// until the next edit, since any edit can change the routes they describe.
import type { RunTrail } from '@tdmm/game/scene';
import { pointAt } from '@tdmm/pathing';

export interface RunSummary {
  /** One line per route walked: the polyline (tile units) up to the furthest any enemy got. */
  routes: { id: string; points: [number, number][]; flying: boolean; enemies: number; leaked: number }[];
  /** Leaks per exit cell. */
  leaks: { exit: string; x: number; y: number; count: number }[];
  /** Enemies still on the map when the playtest stopped. */
  stops: { x: number; y: number; enemy: string; flying: boolean }[];
  enemies: number;
  leaked: number;
}

/** The route's polyline from its start to distance `d`. */
export function trimRoute(points: readonly [number, number][], lengths: readonly number[], d: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < points.length; i++) {
    if (lengths[i]! > d) break;
    out.push([points[i]![0], points[i]![1]]);
  }
  return out;
}

export function summarizeRun(log: readonly RunTrail[], exits: readonly { id: string; cell: [number, number] }[]): RunSummary | null {
  if (!log.length) return null;
  const routes = new Map<string, RunSummary['routes'][number] & { reach: number; route: RunTrail['route'] }>();
  const leaks = new Map<string, number>();
  const stops: RunSummary['stops'] = [];
  for (const t of log) {
    let r = routes.get(t.route.id);
    if (!r) routes.set(t.route.id, (r = { id: t.route.id, points: [], flying: t.flying, enemies: 0, leaked: 0, reach: 0, route: t.route }));
    r.enemies++;
    r.reach = Math.max(r.reach, t.dist);
    if (t.leaked) {
      r.leaked++;
      leaks.set(t.route.exit, (leaks.get(t.route.exit) ?? 0) + 1);
    } else if (t.dist > 0) {
      const [x, y] = pointAt(t.route, t.dist);
      stops.push({ x, y, enemy: t.enemy, flying: t.flying });
    }
  }
  const out: RunSummary = { routes: [], leaks: [], stops, enemies: log.length, leaked: 0 };
  for (const { reach, route, ...r } of routes.values()) {
    const pts = trimRoute(route.points, route.lengths, reach);
    if (reach < (route.lengths.at(-1) ?? 0)) pts.push(pointAt(route, reach));
    if (pts.length >= 2) out.routes.push({ ...r, points: pts });
    out.leaked += r.leaked;
  }
  for (const [exit, count] of leaks) {
    const e = exits.find((x) => x.id === exit);
    if (e) out.leaks.push({ exit, x: e.cell[0] + 0.5, y: e.cell[1] + 0.5, count });
  }
  return out;
}
