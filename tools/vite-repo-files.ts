// Serves the repo's content folders read-only to the dev servers at the same paths the game uses:
//   /maps/*, /themes/*, /content/*, /assets/atlases/*
// Dev only (apply: 'serve'). The editor's write path (Phase 1) will be a separate, validated endpoint.
import { createReadStream, statSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const MOUNTS = ['/maps/', '/themes/', '/content/', '/assets/atlases/'];
const TYPES: Record<string, string> = { '.json': 'application/json; charset=utf-8', '.png': 'image/png' };

export function repoFiles(): Plugin {
  return {
    name: 'tdmm-repo-files',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = decodeURIComponent((req.url ?? '').split('?')[0]!);
        if (!MOUNTS.some((m) => url.startsWith(m))) return next();
        const file = resolve(ROOT, `.${url}`);
        const type = TYPES[extname(file)];
        if (!file.startsWith(ROOT + sep) || !type) return next();
        try {
          if (!statSync(file).isFile()) return next();
        } catch {
          return next();
        }
        res.setHeader('Content-Type', type);
        res.setHeader('Cache-Control', 'no-store');
        createReadStream(file).pipe(res);
      });
    },
  };
}
