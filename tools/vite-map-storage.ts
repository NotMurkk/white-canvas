// Editor dev-server endpoints that read and write maps/ in the repo (dev only, localhost):
//   GET  /__tdmm/maps            -> [{ id, name, width, height, hash, mtimeMs }]
//   GET  /__tdmm/map?id=<id>     -> { map, waves | null, hash }
//   POST /__tdmm/save            <- { id, map, waves, expectedHash, force? } -> { ok, hash } | 409 conflict
// Saves are re-validated with the shared schemas, must already be canonically printed, are
// refused if the file changed on disk since the editor loaded it (e.g. git pull) unless forced,
// and are written atomically (temp file + rename) with the previous version kept in .tdmm-backup/.
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import { hashOf, mapIndex, themeIndex } from './repo-index.ts';

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
          if (req.method === 'GET' && url.pathname === '/__tdmm/maps') return send(res, 200, mapIndex(ROOT));
          if (req.method === 'GET' && url.pathname === '/__tdmm/themes') return send(res, 200, themeIndex(ROOT));
          if (req.method === 'GET' && url.pathname === '/__tdmm/map') {
            const id = url.searchParams.get('id') ?? '';
            if (!ID.test(id) || !existsSync(mapFile(id))) return send(res, 404, { error: `no map "${id}" in maps/` });
            const map = readFileSync(mapFile(id), 'utf8');
            const waves = readIf(wavesFile(id));
            return send(res, 200, { map, waves, hash: hashOf(map, waves), mtimeMs: statSync(mapFile(id)).mtimeMs });
          }
          if (req.method === 'POST' && url.pathname === '/__tdmm/save') {
            // Loaded on demand: the shared schemas are TypeScript source, which Vite's config
            // loader leaves to Node, so the dev server must start even where Node can't load them.
            const { parseMap, parseWaves, printMap, printWaves } = await import('@tdmm/map-format');
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
          const issues = (e as { issues?: string[] }).issues ?? [];
          return send(res, 400, { error: (e as Error).message, issues });
        }
      });
    },
  };
}
