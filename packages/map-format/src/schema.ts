import { z } from 'zod';
import { parseRoundSpec } from './rounds.ts';

/** Bump when the committed map file changes shape, and add a migration in io.ts. */
export const MAP_SCHEMA_VERSION = 2;

export const id = z.string().regex(/^[a-z0-9][a-z0-9_-]*$/, 'ids are lowercase letters, digits, "_" and "-"');
const cell = z.tuple([z.number().int().min(0), z.number().int().min(0)]);
const point = z.tuple([z.number(), z.number()]);
export const DIRECTIONS = ['N', 'E', 'S', 'W'] as const;
const dir = z.enum(DIRECTIONS);
export type Direction = z.infer<typeof dir>;

export const Spawn = z.object({
  id,
  cell,
  kind: z.enum(['ground', 'air']).default('ground'),
  edge: dir.optional(),
});
export type Spawn = z.infer<typeof Spawn>;

export const Exit = z.object({
  id,
  cell,
  edge: dir.optional(),
});
export type Exit = z.infer<typeof Exit>;

/** In-game removal of an obstacle for cash (BTD6-style). `requires` lists objects that must go first. */
export const Removal = z.object({
  cost: z.number().int().min(0),
  requires: z.array(id).default([]),
});
export type Removal = z.infer<typeof Removal>;

/** A placed stamp (tree, rock, building). (x, y) is the cell of the kind's anchor. */
export const ObjectInstance = z.object({
  id,
  kind: id,
  x: z.number().int(),
  y: z.number().int(),
  removal: Removal.optional(),
});
export type ObjectInstance = z.infer<typeof ObjectInstance>;

const roundSpec = z.string().superRefine((s, ctx) => {
  const r = parseRoundSpec(s);
  if (!r.ok) ctx.addIssue({ code: 'custom', message: r.error });
});

/**
 * How enemies choose a branch at a junction. Per out-direction: a weight (for weighted/random)
 * and the rounds that branch is open ("all", "odd", "even", "3", "2-5", "10+", comma-separated).
 */
export const JunctionPolicy = z.object({
  type: z.enum(['alternate', 'weighted', 'random']).default('alternate'),
  branches: z.partialRecord(dir, z.object({ weight: z.number().min(0).default(1), rounds: roundSpec.default('all') })).default({}),
});
export type JunctionPolicy = z.infer<typeof JunctionPolicy>;

export const Junction = z.object({ cell, policy: JunctionPolicy });
export type Junction = z.infer<typeof Junction>;

/** A hand-drawn flight path from an air spawn to an exit; points in tile units (cell centre = x + 0.5). */
export const AirRoute = z.object({
  id,
  from: id,
  to: id,
  points: z.array(point).default([]),
  smooth: z.boolean().default(false),
});
export type AirRoute = z.infer<typeof AirRoute>;

/** Path cells: '.' = no path, '0'-'f' = path cell whose hex digit is its out-mask (N=1, E=2, S=4, W=8). */
export const PATH_ENCODING = 'outmask-hex:N=1,E=2,S=4,W=8;.=none';

export const MapDocV2 = z
  .object({
    format: z.literal('ptd-map'),
    schemaVersion: z.literal(2),
    id,
    name: z.string().min(1),
    seed: z.number().int().default(0),
    grid: z.object({
      width: z.number().int().min(4).max(256),
      height: z.number().int().min(4).max(256),
      tileSize: z.literal(32),
    }),
    themes: z.object({
      default: id,
      supported: z.array(id).min(1),
    }),
    /** One logical terrain kind per cell. Visuals are derived from this; tiles are never stored. */
    terrain: z.object({
      legend: z.record(z.string().length(1), id),
      rows: z.array(z.string()),
    }),
    /** The enemy path: directed cells written by the path tool's strokes. Omitted when empty. */
    path: z.object({ encoding: z.literal(PATH_ENCODING), rows: z.array(z.string()) }).optional(),
    /** Gameplay zones (no-build, high ground...): '.' = none, other symbols via the legend. Omitted when empty. */
    zones: z.object({ legend: z.record(z.string().length(1), id), rows: z.array(z.string()) }).optional(),
    spawns: z.array(Spawn).default([]),
    exits: z.array(Exit).default([]),
    junctions: z.array(Junction).default([]),
    airRoutes: z.array(AirRoute).default([]),
    objects: z.array(ObjectInstance).default([]),
  })
  .superRefine((doc, ctx) => {
    const { width, height } = doc.grid;
    const checkRows = (rows: string[], name: string, valid: (ch: string) => boolean, what: string) => {
      if (rows.length !== height) ctx.addIssue({ code: 'custom', path: [name, 'rows'], message: `expected ${height} rows, got ${rows.length}` });
      rows.forEach((row, y) => {
        if (row.length !== width) ctx.addIssue({ code: 'custom', path: [name, 'rows', y], message: `row ${y} is ${row.length} wide, expected ${width}` });
        for (const ch of row) {
          if (!valid(ch)) {
            ctx.addIssue({ code: 'custom', path: [name, 'rows', y], message: `row ${y} uses "${ch}", which is not ${what}` });
            break;
          }
        }
      });
    };
    checkRows(doc.terrain.rows, 'terrain', (ch) => ch in doc.terrain.legend, 'in the legend');
    if (doc.path) checkRows(doc.path.rows, 'path', (ch) => ch === '.' || /^[0-9a-f]$/.test(ch), 'a path code');
    if (doc.zones) {
      if ('.' in doc.zones.legend) ctx.addIssue({ code: 'custom', path: ['zones', 'legend'], message: '"." means "no zone" and cannot be in the legend' });
      checkRows(doc.zones.rows, 'zones', (ch) => ch === '.' || ch in doc.zones!.legend, 'in the zone legend');
    }
    if (!doc.themes.supported.includes(doc.themes.default)) {
      ctx.addIssue({ code: 'custom', path: ['themes', 'default'], message: 'default theme must be listed in supported' });
    }
    const ids = new Set<string>();
    const unique = (value: string, path: (string | number)[]) => {
      if (ids.has(value)) ctx.addIssue({ code: 'custom', path, message: `duplicate id "${value}"` });
      ids.add(value);
    };
    for (const [list, name] of [[doc.spawns, 'spawns'], [doc.exits, 'exits']] as const) {
      list.forEach((m, i) => {
        unique(m.id, [name, i, 'id']);
        const [x, y] = m.cell;
        if (x >= width || y >= height) ctx.addIssue({ code: 'custom', path: [name, i, 'cell'], message: `cell [${x}, ${y}] is outside the map` });
      });
    }
    doc.objects.forEach((o, i) => unique(o.id, ['objects', i, 'id']));
    doc.airRoutes.forEach((r, i) => unique(r.id, ['airRoutes', i, 'id']));
    const junctionCells = new Set<string>();
    doc.junctions.forEach((j, i) => {
      const key = j.cell.join(',');
      if (junctionCells.has(key)) ctx.addIssue({ code: 'custom', path: ['junctions', i, 'cell'], message: `two policies for junction ${key}` });
      junctionCells.add(key);
    });
  });

export type MapDoc = z.infer<typeof MapDocV2>;
