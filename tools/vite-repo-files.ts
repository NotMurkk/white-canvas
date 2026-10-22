// Gives the app the repo's data folders at the same paths the game uses:
//   /maps/*, /themes/*, /content/*, /assets/atlases/*
// In dev they're served live from the repo (edits show up on reload). In a production build
// they're copied into the client output, along with /maps/index.json and /themes/index.json
// (what the editor's map and theme lists read when there is no dev server to ask).
import { createReadStream, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import { DATA_DIRS, mapIndex, themeIndex } from './repo-index.ts';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const MOUNTS = DATA_DIRS.map((d) => `/${d}/`);
const TYPES: Record<string, string> = { '.json': 'application/json; charset=utf-8', '.png': 'image/png' };

function filesUnder(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? filesUnder(resolve(dir, e.name)) : [resolve(dir, e.name)]));
  } catch {
    return [];
  }
}

export function repoFiles(): Plugin {
  return {
    name: 'tdmm-repo-files',
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
    generateBundle() {
      // Browser build only: the server bundle never reads these.
      if (this.environment && this.environment.name !== 'client') return;
      for (const d of DATA_DIRS) {
        for (const file of filesUnder(resolve(ROOT, d))) {
          if (!TYPES[extname(file)]) continue;
          this.emitFile({ type: 'asset', fileName: relative(ROOT, file).split(sep).join('/'), source: readFileSync(file) });
        }
      }
      this.emitFile({ type: 'asset', fileName: 'maps/index.json', source: `${JSON.stringify(mapIndex(ROOT), null, 2)}\n` });
      this.emitFile({ type: 'asset', fileName: 'themes/index.json', source: `${JSON.stringify(themeIndex(ROOT), null, 2)}\n` });
    },
  };
}
