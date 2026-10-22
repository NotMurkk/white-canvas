// The map and theme lists the editor shows, read straight from the repo. Used by the dev-server
// endpoints (tools/vite-map-storage.ts) and written as static files into production builds
// (tools/vite-repo-files.ts), so both give the editor the same answers. Plain Node + JSON only:
// Vite loads this inside its config, where the workspace's TypeScript packages can't be imported.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

/** Repo folders the editor and game read at runtime, served at the same paths. */
export const DATA_DIRS = ['maps', 'themes', 'content', 'assets/atlases'];

export function hashOf(map: string, waves: string | null) {
  return createHash('sha256').update(map).update('\0').update(waves ?? '').digest('hex').slice(0, 16);
}

const readIf = (f: string) => (existsSync(f) ? readFileSync(f, 'utf8') : null);

export function mapIndex(root: string) {
  const dir = resolve(root, 'maps');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.map.json'))
    .sort()
    .map((f) => {
      const id = f.slice(0, -'.map.json'.length);
      const text = readFileSync(resolve(dir, f), 'utf8');
      const hash = hashOf(text, readIf(resolve(dir, `${id}.waves.json`)));
      try {
        const doc = JSON.parse(text) as { name: string; grid: { width: number; height: number } };
        return { id, name: doc.name, width: doc.grid.width, height: doc.grid.height, hash, mtimeMs: statSync(resolve(dir, f)).mtimeMs };
      } catch {
        return { id, name: `${id} (unreadable)`, width: 0, height: 0, hash, mtimeMs: 0 };
      }
    });
}

/** Each theme with what its built atlas resolved to: which art it has, falls back on or lacks. */
export function themeIndex(root: string) {
  const dir = resolve(root, 'themes');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.theme.json'))
    .sort()
    .map((f) => {
      const t = JSON.parse(readFileSync(resolve(dir, f), 'utf8')) as { id: string; name: string; inherits?: string; atlas: string };
      const atlasFile = resolve(root, 'assets', 'atlases', `${t.atlas}.atlas.json`);
      const atlas = existsSync(atlasFile) ? (JSON.parse(readFileSync(atlasFile, 'utf8')) as { theme?: { terrain: object; objects: object; fallbacks: unknown[]; missing: string[]; chain: string[] } }) : null;
      return {
        id: t.id,
        name: t.name,
        inherits: t.inherits ?? null,
        built: !!atlas?.theme,
        chain: atlas?.theme?.chain ?? [t.id],
        terrain: atlas?.theme ? Object.keys(atlas.theme.terrain) : [],
        objects: atlas?.theme ? Object.keys(atlas.theme.objects) : [],
        fallbacks: atlas?.theme?.fallbacks.length ?? 0,
        missing: atlas?.theme?.missing ?? [],
      };
    });
}
