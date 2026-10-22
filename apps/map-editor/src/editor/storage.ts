// Client side of the editor's storage: the dev-server map endpoints, plus an IndexedDB autosave
// ring so a crash or closed tab never loses work.
//
// A published build has no dev server: maps and themes are read from the static copies the build
// includes (/maps/index.json, /themes/index.json), and Save downloads the two files instead of
// writing maps/. Hosted saving (GitHub or a database) is a later step.

/** True in a production build, where there are no /__tdmm endpoints. */
export const HOSTED = !import.meta.env.DEV;

export interface MapListEntry {
  id: string;
  name: string;
  width: number;
  height: number;
  hash: string | null;
  mtimeMs: number;
}

export interface LoadedFiles {
  map: string;
  waves: string | null;
  hash: string;
  mtimeMs: number;
}

export class SaveConflictError extends Error {}

async function json<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as T & { error?: string; issues?: string[] };
  if (res.status === 409) throw new SaveConflictError(body.error ?? 'conflict');
  if (!res.ok) throw new Error([body.error ?? `HTTP ${res.status}`, ...(body.issues ?? [])].join('\n'));
  return body;
}

export const listMaps = () => fetch(HOSTED ? '/maps/index.json' : '/__tdmm/maps').then((r) => json<MapListEntry[]>(r));

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
export const listThemes = () => fetch(HOSTED ? '/themes/index.json' : '/__tdmm/themes').then((r) => json<ThemeListEntry[]>(r));

export async function loadMapFiles(id: string): Promise<LoadedFiles> {
  if (!HOSTED) return fetch(`/__tdmm/map?id=${encodeURIComponent(id)}`).then((r) => json<LoadedFiles>(r));
  const res = await fetch(`/maps/${encodeURIComponent(id)}.map.json`);
  // a missing file comes back as the app's HTML 404 page, not JSON
  if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) throw new Error(`no map "${id}" in maps/`);
  const map = await res.text();
  const w = await fetch(`/maps/${encodeURIComponent(id)}.waves.json`);
  const waves = w.ok && (w.headers.get('content-type') ?? '').includes('json') ? await w.text() : null;
  return { map, waves, hash: await hashOf(map, waves), mtimeMs: 0 };
}

/** Same as the dev server's hash (tools/repo-index.ts), so autosaves match across both. */
async function hashOf(map: string, waves: string | null) {
  const bytes = new TextEncoder().encode(`${map}\0${waves ?? ''}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

/** Saves to maps/ through the dev server, or (hosted) downloads both files for you to commit. */
export async function saveMapFiles(id: string, map: string, waves: string, expectedHash: string | null, force = false): Promise<{ ok: true; hash: string; downloaded?: boolean }> {
  if (HOSTED) {
    download(`${id}.map.json`, map);
    download(`${id}.waves.json`, waves);
    return { ok: true, hash: await hashOf(map, waves), downloaded: true };
  }
  return fetch('/__tdmm/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, map, waves, expectedHash, force }),
  }).then((r) => json<{ ok: true; hash: string }>(r));
}

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
