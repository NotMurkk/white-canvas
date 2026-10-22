// Visual-side formats: themes, imported packs and generated atlases.
import { z } from 'zod';
import { id } from './schema.ts';

/**
 * Asset keys used by themes:
 *   "pack/asset"           an autotile
 *   "pack/asset:name"      one named tile of a tileset   ("pack/asset:3,5" = column 3, row 5)
 *   "pack/asset@name"      a named multi-tile region     ("pack/asset@3,5,2,3" = col, row, w, h)
 */
export const ASSET_KEY = /^([a-z0-9_-]+)\/([a-z0-9_-]+)(?:(:|@)([a-z0-9_,-]+))?$/;

export function parseAssetKey(key: string) {
  const m = ASSET_KEY.exec(key);
  if (!m) throw new Error(`bad asset key "${key}" (expected pack/asset, pack/asset:tile or pack/asset@region)`);
  return { packId: m[1]!, assetName: m[2]!, sep: (m[3] ?? '') as '' | ':' | '@', part: m[4] };
}

/**
 * An asset reference in a theme: one key, or a fallback list tried in order at atlas-build time.
 * Lets a theme name a real pack that hasn't been downloaded yet and use placeholder art meanwhile.
 */
export const AssetRef = z.union([z.string(), z.array(z.string()).min(1)]);
export type AssetRef = z.infer<typeof AssetRef>;
export const refCandidates = (ref: AssetRef): string[] => (typeof ref === 'string' ? [ref] : ref);

/**
 * themes/*.theme.json: visual mapping only (gameplay keys are rejected by .strict()).
 * A theme may inherit from another and override only what changes, e.g. winter inherits summer
 * and swaps the ground, water, path and stamps. Anything not mapped falls back to the parent.
 */
export const ThemeDoc = z
  .object({
    format: z.literal('ptd-theme'),
    schemaVersion: z.literal(1),
    id,
    name: z.string(),
    inherits: id.optional(),
    /** Atlas this theme is packed into (one atlas per theme). */
    atlas: id,
    /** Tile drawn under every cell; terrain with base: true needs no overlay of its own. */
    baseFill: AssetRef.optional(),
    terrain: z.record(id, z.union([z.object({ base: z.literal(true) }).strict(), z.object({ autotile: AssetRef }).strict()])).default({}),
    /** Stamp kind -> region key(s). The region must be exactly the kind's footprint size. */
    objects: z.record(id, AssetRef).default({}),
  })
  .strict();
export type ThemeDoc = z.infer<typeof ThemeDoc>;

/**
 * A theme after inheritance and fallbacks, as packed into its atlas. This is what the game and
 * editor render with; every reference is a single key that exists in the atlas.
 */
export const ResolvedTheme = z.object({
  id,
  name: z.string(),
  /** This theme, then its parents. */
  chain: z.array(id),
  baseFill: z.string(),
  terrain: z.record(id, z.union([z.object({ base: z.literal(true) }), z.object({ autotile: z.string() })])),
  objects: z.record(id, z.string()),
  /** Slots where the first choice was unavailable and a later candidate (or the parent) was used. */
  fallbacks: z.array(z.object({ slot: z.string(), wanted: z.string(), used: z.string() })).default([]),
  /** Terrain kinds and stamp kinds with no art at all (drawn as plain colours). */
  missing: z.array(z.string()).default([]),
});
export type ResolvedTheme = z.infer<typeof ResolvedTheme>;

/** Theme ids from child to root; throws on unknown parents and cycles. */
export function themeChain(themes: ReadonlyMap<string, ThemeDoc>, id: string): ThemeDoc[] {
  const chain: ThemeDoc[] = [];
  const seen = new Set<string>();
  let cur: string | undefined = id;
  while (cur) {
    if (seen.has(cur)) throw new Error(`theme inheritance loops: ${[...seen, cur].join(' → ')}`);
    seen.add(cur);
    const t = themes.get(cur);
    if (!t) throw new Error(chain.length ? `theme "${chain[chain.length - 1]!.id}" inherits unknown theme "${cur}"` : `unknown theme "${cur}"`);
    chain.push(t);
    cur = t.inherits;
  }
  return chain;
}

/**
 * Resolves inheritance (child overrides parent, slot by slot) and fallbacks (first candidate for
 * which `available(key)` is true). `terrainKinds` and `stampKinds` are what content defines, so
 * gaps are reported as `missing`.
 */
export function resolveTheme(
  themes: ReadonlyMap<string, ThemeDoc>,
  id: string,
  available: (key: string) => boolean,
  terrainKinds: readonly string[],
  stampKinds: readonly string[],
): ResolvedTheme {
  const chain = themeChain(themes, id);
  const fallbacks: ResolvedTheme['fallbacks'] = [];
  const missing: string[] = [];
  /** Walks child → parent; in each theme that defines the slot, tries its candidates in order. */
  const pick = (slot: string, get: (t: ThemeDoc) => AssetRef | undefined): string | undefined => {
    let wanted: string | undefined;
    for (const t of chain) {
      const ref = get(t);
      if (!ref) continue;
      for (const key of refCandidates(ref)) {
        wanted ??= key;
        if (available(key)) {
          if (key !== wanted) fallbacks.push({ slot, wanted, used: key });
          return key;
        }
      }
    }
    return undefined;
  };
  const baseFill = pick('baseFill', (t) => t.baseFill);
  if (!baseFill) throw new Error(`theme "${id}" has no usable baseFill (checked ${chain.map((t) => t.id).join(' → ')})`);
  const terrain: ResolvedTheme['terrain'] = {};
  for (const kind of terrainKinds) {
    const owner = chain.find((t) => t.terrain[kind]);
    const visual = owner?.terrain[kind];
    if (!visual) {
      missing.push(`terrain:${kind}`);
      continue;
    }
    if ('base' in visual) {
      terrain[kind] = { base: true };
      continue;
    }
    const key = pick(`terrain.${kind}`, (t) => {
      const v = t.terrain[kind];
      return v && 'autotile' in v ? v.autotile : undefined;
    });
    if (key) terrain[kind] = { autotile: key };
    else missing.push(`terrain:${kind}`);
  }
  const objects: Record<string, string> = {};
  for (const kind of stampKinds) {
    const key = pick(`objects.${kind}`, (t) => t.objects[kind]);
    if (key) objects[kind] = key;
    else missing.push(`object:${kind}`);
  }
  return { id, name: chain[0]!.name, chain: chain.map((t) => t.id), baseFill, terrain, objects, fallbacks, missing };
}

const tilePos = z.tuple([z.number().int().min(0), z.number().int().min(0)]);
const region = z.tuple([z.number().int().min(0), z.number().int().min(0), z.number().int().min(1), z.number().int().min(1)]);

/**
 * assets/packs/<pack>/pack.json (committed, redistributable) or assets/raw/<pack>/pack.json
 * (git-ignored raw downloads): one tileset source with its provenance.
 */
export const PackManifest = z.object({
  pack_id: id,
  name: z.string(),
  source: z.object({ site: z.string(), url: z.url().nullable(), retrieved_at: z.string() }).loose(),
  artist: z.object({ name: z.string() }),
  upstream_credits: z.array(z.string()),
  license: z.object({
    spdx: z.string().nullable(),
    credit_line: z.string().nullable(),
    status: z.enum(['ok', 'unknown', 'restricted']),
    raw_redistribution: z.enum(['allowed', 'forbidden', 'unspecified']),
    terms_snapshot: z.string().nullable().default(null),
  }),
  ripped_from_official: z.enum(['none', 'partial', 'full', 'unknown']),
  visibility: z.enum(['public-ok', 'private-only']),
  format: z.object({ native_tile_px: z.union([z.literal(16), z.literal(32)]), scale: z.union([z.literal(1), z.literal(2)]) }),
  assets: z.record(
    z.string(),
    z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('autotile'), file: z.string(), frameMs: z.number().int().positive().default(250) }),
      z.object({
        kind: z.literal('tileset'),
        file: z.string(),
        /** Named single tiles, in tiles (after scaling). Unnamed tiles can still be used as "col,row". */
        tiles: z.record(z.string(), tilePos).default({}),
        /** Named multi-tile regions for stamps: [col, row, w, h] in tiles. */
        regions: z.record(z.string(), region).default({}),
      }),
    ]),
  ),
});
export type PackManifest = z.infer<typeof PackManifest>;

/** assets/atlases/*.atlas.json: generated by tools/build-atlas.ts, never hand-edited. */
export const AtlasManifest = z.object({
  format: z.literal('ptd-atlas'),
  schemaVersion: z.literal(1),
  id,
  image: z.string(),
  imageWidth: z.number().int(),
  imageHeight: z.number().int(),
  tileSize: z.number().int(),
  margin: z.number().int(),
  spacing: z.number().int(),
  columns: z.number().int(),
  tileCount: z.number().int(),
  /** Static tiles by key -> tile index in the atlas. */
  tiles: z.record(z.string(), z.number().int()),
  /** Autotiles: frame f of pattern p lives at start + f * patterns + p. */
  autotiles: z.record(
    z.string(),
    z.object({ start: z.number().int(), patterns: z.number().int(), frames: z.number().int(), frameMs: z.number().int() }),
  ),
  /** Multi-tile stamp regions: pixel rectangle in the atlas image; w, h in tiles. */
  stamps: z.record(z.string(), z.object({ x: z.number().int(), y: z.number().int(), w: z.number().int(), h: z.number().int() })).default({}),
  /** Provenance of every source image, for credits.json. */
  sources: z.array(z.object({ key: z.string(), file: z.string(), pack: z.string() })),
  /** The theme this atlas was built for, fully resolved: what the game and editor render with. */
  theme: ResolvedTheme,
  /** Hash of everything the atlas was built from (theme chain, kinds, source images); detects stale atlases. */
  sourceHash: z.string(),
});
export type AtlasManifest = z.infer<typeof AtlasManifest>;
