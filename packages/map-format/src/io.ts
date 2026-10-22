import { DIRECTIONS, MAP_SCHEMA_VERSION, MapDocV2, type MapDoc } from './schema.ts';
import { WAVES_SCHEMA_VERSION, WavesDoc } from './waves.ts';

type Migration = (doc: Record<string, unknown>) => Record<string, unknown>;

/**
 * migrations[n] upgrades a schemaVersion n file to n + 1. Migrations are pure and kept forever;
 * fixtures/maps/vN holds real old files that the tests load through this chain.
 */
const mapMigrations: Record<number, Migration> = {
  // v2: the single no-build flag grid became a general zone grid with a legend.
  1: ({ noBuild, ...doc }) => {
    const rows = (noBuild as { rows?: string[] } | undefined)?.rows;
    return { ...doc, schemaVersion: 2, ...(rows ? { zones: { legend: { x: 'no_build' }, rows } } : {}) };
  },
};
const wavesMigrations: Record<number, Migration> = {};

export class MapFormatError extends Error {
  readonly issues: string[];

  constructor(message: string, issues: string[] = []) {
    super(issues.length ? `${message}\n- ${issues.join('\n- ')}` : message);
    this.issues = issues;
  }
}

function migrate(input: unknown, kind: string, current: number, migrations: Record<number, Migration>) {
  const raw = typeof input === 'string' ? (JSON.parse(input) as unknown) : input;
  if (typeof raw !== 'object' || raw === null) throw new MapFormatError(`${kind} file is not a JSON object`);
  let doc = raw as Record<string, unknown>;
  if (typeof doc.schemaVersion !== 'number') throw new MapFormatError(`${kind} file has no schemaVersion`);
  let version: number = doc.schemaVersion;
  if (version > current) {
    throw new MapFormatError(`${kind} is schemaVersion ${version}, but this code only understands up to ${current}; update the tool`);
  }
  while (version < current) {
    const step = migrations[version];
    if (!step) throw new MapFormatError(`no ${kind} migration from schemaVersion ${version}`);
    doc = step(doc);
    version = doc.schemaVersion as number;
  }
  return doc;
}

function issuesOf(error: { issues: { path: PropertyKey[]; message: string }[] }) {
  return error.issues.map((i) => `${i.path.map(String).join('.') || '(root)'}: ${i.message}`);
}

/** Parses and validates a committed map file (string or already-parsed JSON), migrating old versions. */
export function parseMap(input: unknown): MapDoc {
  const result = MapDocV2.safeParse(migrate(input, 'map', MAP_SCHEMA_VERSION, mapMigrations));
  if (!result.success) throw new MapFormatError('map file is invalid', issuesOf(result.error));
  return result.data;
}

export function parseWaves(input: unknown): WavesDoc {
  const result = WavesDoc.safeParse(migrate(input, 'waves', WAVES_SCHEMA_VERSION, wavesMigrations));
  if (!result.success) throw new MapFormatError('waves file is invalid', issuesOf(result.error));
  return result.data;
}

const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const sortedKeys = <T>(obj: Record<string, T>) => Object.fromEntries(Object.entries(obj).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
/** JSON.stringify, then keep [x, y] pairs on one line. */
const stringify = (value: unknown) =>
  `${JSON.stringify(value, null, 2).replace(/\[\n\s+(-?\d+(?:\.\d+)?),\n\s+(-?\d+(?:\.\d+)?)\n\s+\]/g, '[$1, $2]')}\n`;
const cellOrder = (a: { cell: [number, number] }, b: { cell: [number, number] }) => a.cell[1] - b.cell[1] || a.cell[0] - b.cell[0];

/**
 * Deterministic, git-friendly printing: fixed key order, one grid row per line, ids sorted,
 * LF endings, trailing newline. printMap(parseMap(printMap(doc))) === printMap(doc).
 */
export function printMap(doc: MapDoc): string {
  return stringify({
    format: doc.format,
    schemaVersion: doc.schemaVersion,
    id: doc.id,
    name: doc.name,
    seed: doc.seed,
    grid: { width: doc.grid.width, height: doc.grid.height, tileSize: doc.grid.tileSize },
    themes: { default: doc.themes.default, supported: [...doc.themes.supported] },
    terrain: { legend: sortedKeys(doc.terrain.legend), rows: doc.terrain.rows },
    ...(doc.path ? { path: { encoding: doc.path.encoding, rows: doc.path.rows } } : {}),
    ...(doc.zones ? { zones: { legend: sortedKeys(doc.zones.legend), rows: doc.zones.rows } } : {}),
    spawns: [...doc.spawns].sort(byId).map((s) => ({ id: s.id, cell: s.cell, kind: s.kind, ...(s.edge ? { edge: s.edge } : {}) })),
    exits: [...doc.exits].sort(byId).map((e) => ({ id: e.id, cell: e.cell, ...(e.edge ? { edge: e.edge } : {}) })),
    junctions: [...doc.junctions].sort(cellOrder).map((j) => ({
      cell: j.cell,
      policy: {
        type: j.policy.type,
        branches: Object.fromEntries(
          DIRECTIONS.filter((d) => j.policy.branches[d]).map((d) => [d, { weight: j.policy.branches[d]!.weight, rounds: j.policy.branches[d]!.rounds }]),
        ),
      },
    })),
    airRoutes: [...doc.airRoutes].sort(byId).map((r) => ({ id: r.id, from: r.from, to: r.to, points: r.points, smooth: r.smooth })),
    objects: [...doc.objects]
      .sort(byId)
      .map((o) => ({ id: o.id, kind: o.kind, x: o.x, y: o.y, ...(o.removal ? { removal: { cost: o.removal.cost, requires: [...o.removal.requires].sort() } } : {}) })),
  });
}

/** Rounds keep their order (it is meaningful); everything else is printed in a fixed order. */
export function printWaves(doc: WavesDoc): string {
  return stringify({
    format: doc.format,
    schemaVersion: doc.schemaVersion,
    mapId: doc.mapId,
    startCash: doc.startCash,
    lives: doc.lives,
    rounds: doc.rounds.map((r) => ({
      bonusCash: r.bonusCash,
      groups: r.groups.map((g) => ({
        id: g.id,
        enemy: g.enemy,
        count: g.count,
        startSec: g.startSec,
        intervalSec: g.intervalSec,
        spawn: g.spawn,
        route: g.route,
      })),
    })),
    ...(doc.clearCheck
      ? {
          clearCheck: {
            simVersion: doc.clearCheck.simVersion,
            gameplayHash: doc.clearCheck.gameplayHash,
            rounds: doc.clearCheck.rounds,
            enemies: doc.clearCheck.enemies,
            durationSec: doc.clearCheck.durationSec,
            leakedLives: doc.clearCheck.leakedLives,
          },
        }
      : {}),
  });
}
