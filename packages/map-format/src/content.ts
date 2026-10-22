// Shared gameplay registries (content/*.json). Both the editor and the game read these, and map
// validation resolves ids against them.
import { z } from 'zod';
import { id } from './schema.ts';

const color = z.string().regex(/^#[0-9a-f]{6}$/i);

/** content/terrain-types.json: what each logical terrain means for gameplay. */
export const TerrainTypes = z.record(
  id,
  z.object({
    name: z.string(),
    /** Overlay draw order; the theme's base terrain is drawn by the base fill instead. */
    drawOrder: z.number().int(),
    /** Tower placement classes allowed on this terrain ("land", "water"...). Empty = no towers. */
    placement: z.array(z.string()),
    /** Enemies may walk here. The enemy path may only be painted on walkable terrain. */
    walkable: z.boolean(),
    /** The path tool paints this terrain under new path cells (e.g. dirt). */
    pathStyle: z.boolean().default(false),
    /** Tower range multiplier for towers standing here (multiplies with the zone's). */
    rangeMult: z.number().positive().default(1),
    /** Editor swatch colour, used before art is loaded and in the gameplay overlay. */
    color,
  }),
);
export type TerrainTypes = z.infer<typeof TerrainTypes>;

/**
 * Footprint characters, one per cell, rows top to bottom:
 *   '.'  visual only (no gameplay effect)
 *   'C'  canopy/overhang: no towers here, but enemies can pass underneath (drawn above them)
 *   'B'  base: blocks towers and the enemy path
 */
export const FOOTPRINT_CHARS = ['.', 'C', 'B'] as const;
export type FootprintRole = (typeof FOOTPRINT_CHARS)[number];

/** content/kinds.json: placeable stamp kinds. Themes map each kind to art of the same size. */
export const KindRegistry = z.record(
  id,
  z
    .object({
      name: z.string(),
      category: z.enum(['tree', 'rock', 'building', 'decor']),
      footprint: z.array(z.string().regex(/^[.CB]+$/, 'footprint rows use ".", "C" and "B"')).min(1),
      /** [col, row] inside the footprint that sits on the placed (x, y) cell. */
      anchor: z.tuple([z.number().int().min(0), z.number().int().min(0)]),
      /** Allowed on these terrains' placement classes; default: anywhere not water. */
      allowedOn: z.array(z.string()).default(['land']),
      /** Suggested cash cost when marked removable in the editor; absent = not removable by default. */
      removalCost: z.number().int().min(0).optional(),
      color,
    })
    .superRefine((k, ctx) => {
      const w = k.footprint[0]!.length;
      if (k.footprint.some((r) => r.length !== w)) ctx.addIssue({ code: 'custom', path: ['footprint'], message: 'footprint rows must be the same length' });
      if (k.anchor[0] >= w || k.anchor[1] >= k.footprint.length) ctx.addIssue({ code: 'custom', path: ['anchor'], message: 'anchor is outside the footprint' });
    }),
);
export type KindRegistry = z.infer<typeof KindRegistry>;
export type Kind = KindRegistry[string];

/** content/zones.json: painted gameplay zones. A cell has at most one zone. */
export const ZoneTypes = z.record(
  id,
  z.object({
    name: z.string(),
    /** Towers can never be built here. */
    blocksBuild: z.boolean().default(false),
    /** Tower range multiplier for towers standing here. */
    rangeMult: z.number().positive().default(1),
    color,
  }),
);
export type ZoneTypes = z.infer<typeof ZoneTypes>;

/** content/enemies.json */
export const EnemyRegistry = z.record(
  id,
  z.object({
    name: z.string(),
    hp: z.number().positive(),
    /** Tiles per second. */
    speed: z.number().positive(),
    flying: z.boolean().default(false),
    /** Lives lost when it reaches an exit. */
    damage: z.number().int().positive().default(1),
    reward: z.number().int().min(0).default(1),
    color,
    radius: z.number().positive().default(0.3),
  }),
);
export type EnemyRegistry = z.infer<typeof EnemyRegistry>;
