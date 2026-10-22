import { z } from 'zod';
import { id } from './schema.ts';

export const WAVES_SCHEMA_VERSION = 1;

export const WaveGroup = z.object({
  id,
  enemy: id,
  count: z.number().int().min(1).max(999),
  /** Seconds after the round starts that the first enemy appears. */
  startSec: z.number().min(0),
  /** Seconds between enemies in this group. */
  intervalSec: z.number().min(0.05),
  spawn: id,
  /** A compiled route id, or null to let the map's junction policy choose (alternate). */
  route: z.string().nullable().default(null),
});
export type WaveGroup = z.infer<typeof WaveGroup>;

export const Round = z.object({
  bonusCash: z.number().int().min(0).default(0),
  groups: z.array(WaveGroup),
});
export type Round = z.infer<typeof Round>;

/**
 * Written by the editor when the map passes the clear check (validation + the no-tower simulation).
 * The repo test requires it and recomputes the hash, so any gameplay change after the check, or a
 * new simulation version, sends the map back through it. Deterministic: no timestamps.
 */
export const ClearCheck = z.object({
  simVersion: z.number().int(),
  gameplayHash: z.string(),
  rounds: z.number().int(),
  enemies: z.number().int(),
  durationSec: z.number(),
  leakedLives: z.number().int(),
});
export type ClearCheck = z.infer<typeof ClearCheck>;

/** maps/<id>.waves.json: authored next to the map, refers to its spawn and route ids. */
export const WavesDoc = z
  .object({
    format: z.literal('ptd-waves'),
    schemaVersion: z.literal(1),
    mapId: id,
    startCash: z.number().int().min(0).default(650),
    lives: z.number().int().min(1).default(100),
    rounds: z.array(Round).default([]),
    clearCheck: ClearCheck.optional(),
  })
  .superRefine((doc, ctx) => {
    const ids = new Set<string>();
    doc.rounds.forEach((r, ri) =>
      r.groups.forEach((g, gi) => {
        if (ids.has(g.id)) ctx.addIssue({ code: 'custom', path: ['rounds', ri, 'groups', gi, 'id'], message: `duplicate group id "${g.id}"` });
        ids.add(g.id);
      }),
    );
  });
export type WavesDoc = z.infer<typeof WavesDoc>;

export function emptyWaves(mapId: string): WavesDoc {
  return { format: 'ptd-waves', schemaVersion: 1, mapId, startCash: 650, lives: 100, rounds: [] };
}
