// Where the editor reads and writes maps (a MapStorage), plus an IndexedDB autosave ring so a crash
// or closed tab never loses work. Built in:
//   devServerStorage  local dev: the Vite dev server reads and writes maps/ in the repo
//   staticStorage     a published build with nothing else configured: reads the copies the build
//                     includes (/maps/index.json, /themes/index.json); Save downloads the files
// The app can pass its own, e.g. GitHub-backed saving (src/lib/github-storage.ts).

/** True in a production build, where there are no /__tdmm endpoints. */
export const HOSTED = !import.meta.env.DEV;

export interface MapListEntry {
  id: string;
  name: string;
  width: number;
  height: number;
  hash: string | null;
  mtimeMs: number;
  /** Shown next to the name in the Open dialog, e.g. "unmerged changes". */
  note?: string | undefined;
}

export interface LoadedFiles {
  map: string;
  waves: string | null;
  hash: string;
  mtimeMs: number;
}

export interface SaveRequest {
  id: string;
  map: string;
  waves: string;
  /** Hash of the version this work started from (null = a new map); a mismatch is a conflict. */
  expectedHash: string | null;
  force: boolean;
  name: string;
  /** Whether the map passed the clear check (the waves file carries the stamp if so). */
  cleared: boolean;
  summary?: string | undefined;
}

export interface SaveResult {
  hash: string;
  /** One line for the top bar, e.g. "Saved maps/x.map.json". */
  message: string;
  /** Where the saved work can be seen (a pull request). */
  url?: string | undefined;
  /** Saved as a download rather than stored anywhere. */
  downloaded?: boolean | undefined;
}

export interface MapStorage {
  /** Where saves go, for tooltips: "maps/ in this repo", "pull requests on GitHub"... */
  label: string;
  listMaps(): Promise<MapListEntry[]>;
  listThemes(): Promise<ThemeListEntry[]>;
  loadMapFiles(id: string): Promise<LoadedFiles>;
  /** Throws SaveConflictError when the stored version changed since it was loaded (unless forced). */
  saveMapFiles(req: SaveRequest): Promise<SaveResult>;
}

export class SaveConflictError extends Error {}

async function json<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as T & { error?: string; issues?: string[] };
  if (res.status === 409) throw new SaveConflictError(body.error ?? 'conflict');
  if (!res.ok) throw new Error([body.error ?? `HTTP ${res.status}`, ...(body.issues ?? [])].join('\n'));
  return body;
}

export interface ThemeListEntry {
  id: string;
  name: string;
  inherits: string | null;
  /** Whether assets/atlases has a built atlas for it (run "npm run art" if not). */
  built: boolean;
  chain: string[];
  /** Terrain kinds and stamp kinds the theme has art for. */
  terrain: string[];
  objects: string[];
  fallbacks: number;
  missing: string[];
}
/** Hash of a map and its waves file: the same everywhere (dev server, GitHub saving, here). */
export async function hashOf(map: string, waves: string | null) {
  const bytes = new TextEncoder().encode(`${map}\0${waves ?? ''}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

/** Local dev: the Vite dev server reads and writes maps/ in the repo (tools/vite-map-storage.ts). */
export const devServerStorage: MapStorage = {
  label: 'maps/ in this repo',
  listMaps: () => fetch('/__tdmm/maps').then((r) => json<MapListEntry[]>(r)),
  listThemes: () => fetch('/__tdmm/themes').then((r) => json<ThemeListEntry[]>(r)),
  loadMapFiles: (id) => fetch(`/__tdmm/map?id=${encodeURIComponent(id)}`).then((r) => json<LoadedFiles>(r)),
  async saveMapFiles({ id, map, waves, expectedHash, force }) {
    const res = await fetch('/__tdmm/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, map, waves, expectedHash, force }),
    }).then((r) => json<{ ok: true; hash: string }>(r));
    return { hash: res.hash, message: `Saved maps/${id}.map.json` };
  },
};

/** A published build with no hosted saving: reads the maps the build includes; Save downloads them. */
export const staticStorage: MapStorage = {
  label: 'downloads (put them in maps/ and commit)',
  listMaps: () => fetch('/maps/index.json').then((r) => json<MapListEntry[]>(r)),
  listThemes: () => fetch('/themes/index.json').then((r) => json<ThemeListEntry[]>(r)),
  async loadMapFiles(id) {
    const res = await fetch(`/maps/${encodeURIComponent(id)}.map.json`);
    // a missing file comes back as the app's HTML 404 page, not JSON
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) throw new Error(`no map "${id}" in maps/`);
    const map = await res.text();
    const w = await fetch(`/maps/${encodeURIComponent(id)}.waves.json`);
    const waves = w.ok && (w.headers.get('content-type') ?? '').includes('json') ? await w.text() : null;
    return { map, waves, hash: await hashOf(map, waves), mtimeMs: 0 };
  },
  async saveMapFiles({ id, map, waves }) {
    download(`${id}.map.json`, map);
    download(`${id}.waves.json`, waves);
    return { hash: await hashOf(map, waves), message: `Downloaded ${id}.map.json and ${id}.waves.json`, downloaded: true };
  },
};

export const defaultStorage = HOSTED ? staticStorage : devServerStorage;

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---- autosave -----------------------------------------------------------------------------------

export interface Autosave {
  key: string;
  mapId: string;
  savedAt: number;
  /** Hash of the on-disk files this work started from (null for a never-saved map). */
  baseHash: string | null;
  map: string;
  waves: string;
}

const SLOTS = 3;
let dbPromise: Promise<IDBDatabase> | null = null;

function db() {
  dbPromise ??= new Promise((ok, fail) => {
    const req = indexedDB.open('tdmm-editor', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('autosave', { keyPath: 'key' });
    req.onsuccess = () => ok(req.result);
    req.onerror = () => fail(req.error);
  });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((ok, fail) => {
        const req = fn(d.transaction('autosave', mode).objectStore('autosave'));
        req.onsuccess = () => ok(req.result);
        req.onerror = () => fail(req.error);
      }),
  );
}

async function slotsFor(mapId: string): Promise<Autosave[]> {
  const all = await tx<Autosave[]>('readonly', (s) => s.getAll());
  return all.filter((a) => a.mapId === mapId).sort((a, b) => b.savedAt - a.savedAt);
}

/** Writes into the oldest of the map's three slots. Failures are swallowed (autosave is best-effort). */
export async function writeAutosave(a: Omit<Autosave, 'key' | 'savedAt'>) {
  try {
    const existing = await slotsFor(a.mapId);
    const used = new Set(existing.map((e) => e.key));
    const free = Array.from({ length: SLOTS }, (_, i) => `${a.mapId}#${i}`).find((k) => !used.has(k));
    const key = free ?? existing[existing.length - 1]!.key;
    await tx('readwrite', (s) => s.put({ ...a, key, savedAt: Date.now() }));
  } catch {
    // private windows and blocked storage just don't autosave
  }
}

export async function latestAutosave(mapId: string): Promise<Autosave | null> {
  try {
    return (await slotsFor(mapId))[0] ?? null;
  } catch {
    return null;
  }
}

export async function clearAutosaves(mapId: string) {
  try {
    for (const a of await slotsFor(mapId)) await tx('readwrite', (s) => s.delete(a.key));
  } catch {
    // best-effort
  }
}
