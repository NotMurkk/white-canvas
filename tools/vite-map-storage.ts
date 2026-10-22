// Editor dev-server endpoints that read and write maps/ in the repo (dev only, localhost):
//   GET  /__tdmm/maps            -> [{ id, name, width, height, hash, mtimeMs }]
//   GET  /__tdmm/map?id=<id>     -> { map, waves | null, hash }
//   POST /__tdmm/save            <- { id, map, waves, expectedHash, force? } -> { ok, hash } | 409 conflict
// Saves are re-validated with the shared schemas, must already be canonically printed, are
// refused if the file changed on disk since the editor loaded it (e.g. git pull) unless forced,
// and are written atomically (temp file + rename) with the previous version kept in .tdmm-backup/.
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import { MapFormatError, parseMap, parseWaves, printMap, printWaves } from '@tdmm/map-format';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const MAPS = resolve(ROOT, 'maps');
const BACKUP = resolve(ROOT, '.tdmm-backup');
const ID = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const MAX_BODY = 8 * 1024 * 1024;

const mapFile = (id: string) => resolve(MAPS, `${id}.map.json`);
const wavesFile = (id: string) => resolve(MAPS, `${id}.waves.json`);
const readIf = (f: string) => (existsSync(f) ? readFileSync(f, 'utf8') : null);

/** Hash of what is on disk for a map (map + waves), or null if the map doesn't exist. */
export function diskHash(id: string): string | null {
  const map = readIf(mapFile(id));
  if (map === null) return null;
  return hashOf(map, readIf(wavesFile(id)));
}

export function hashOf(map: string, waves: string | null) {
  return createHash('sha256').update(map).update('\0').update(waves ?? '').digest('hex').slice(0, 16);
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((ok, fail) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        fail(new Error('request too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => ok(Buffer.concat(chunks).toString('utf8')));
    req.on('error', fail);
  });
}

function writeAtomic(file: string, text: string) {
  const tmp = `${file}.tmp-${process.pid}`;
  writeFileSync(tmp, text, 'utf8');
  if (existsSync(file)) {
    mkdirSync(BACKUP, { recursive: true });
    copyFileSync(file, resolve(BACKUP, file.slice(MAPS.length + 1)));
  }
  renameSync(tmp, file);
}

export function mapStorage(): Plugin {
  return {
    name: 'tdmm-map-storage',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        if (!url.pathname.startsWith('/__tdmm/')) return next();
        try {
          if (req.method === 'GET' && url.pathname === '/__tdmm/maps') {
            mkdirSync(MAPS, { recursive: true });
            const list = readdirSync(MAPS)
              .filter((f) => f.endsWith('.map.json'))
              .sort()
              .flatMap((f) => {
                const id = f.slice(0, -'.map.json'.length);
                try {
                  const doc = parseMap(readFileSync(mapFile(id), 'utf8'));
                  return [{ id, name: doc.name, width: doc.grid.width, height: doc.grid.height, hash: diskHash(id), mtimeMs: statSync(mapFile(id)).mtimeMs }];
                } catch {
                  return [{ id, name: `${id} (unreadable)`, width: 0, height: 0, hash: diskHash(id), mtimeMs: 0 }];
                }
              });
            return send(res, 200, list);
          }
          if (req.method === 'GET' && url.pathname === '/__tdmm/themes') {
            // Each theme with what its built atlas resolved to: which art it has, falls back on or lacks.
            const themesDir = resolve(ROOT, 'themes');
            const list = readdirSync(themesDir)
              .filter((f) => f.endsWith('.theme.json'))
              .sort()
              .map((f) => {
                const t = JSON.parse(readFileSync(resolve(themesDir, f), 'utf8')) as { id: string; name: string; inherits?: string; atlas: string };
                const atlasFile = resolve(ROOT, 'assets', 'atlases', `${t.atlas}.atlas.json`);
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
            return send(res, 200, list);
          }
          if (req.method === 'GET' && url.pathname === '/__tdmm/map') {
            const id = url.searchParams.get('id') ?? '';
            if (!ID.test(id) || !existsSync(mapFile(id))) return send(res, 404, { error: `no map "${id}" in maps/` });
            const map = readFileSync(mapFile(id), 'utf8');
            const waves = readIf(wavesFile(id));
            return send(res, 200, { map, waves, hash: hashOf(map, waves), mtimeMs: statSync(mapFile(id)).mtimeMs });
          }
          if (req.method === 'POST' && url.pathname === '/__tdmm/save') {
            const body = JSON.parse(await readBody(req)) as { id: string; map: string; waves: string; expectedHash: string | null; force?: boolean };
            if (!ID.test(body.id)) return send(res, 400, { error: 'map ids are lowercase letters, digits, "_" and "-"' });
            const doc = parseMap(body.map);
            const waves = parseWaves(body.waves);
            if (doc.id !== body.id || waves.mapId !== body.id) return send(res, 400, { error: 'map/waves id does not match the file name' });
            if (printMap(doc) !== body.map || printWaves(waves) !== body.waves) return send(res, 400, { error: 'files must be canonically printed (printMap/printWaves)' });
            const current = diskHash(body.id);
            if (current !== body.expectedHash && !body.force) {
              return send(res, 409, { conflict: true, currentHash: current, error: current === null ? 'the map was deleted on disk' : 'the map changed on disk since you opened it' });
            }
            mkdirSync(MAPS, { recursive: true });
            writeAtomic(wavesFile(body.id), body.waves);
            writeAtomic(mapFile(body.id), body.map);
            return send(res, 200, { ok: true, hash: hashOf(body.map, body.waves) });
          }
          return send(res, 404, { error: 'unknown endpoint' });
        } catch (e) {
          const issues = e instanceof MapFormatError ? e.issues : [];
          return send(res, 400, { error: (e as Error).message, issues });
        }
      });
    },
  };
}
