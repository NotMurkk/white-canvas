// Client side of the editor's storage: the dev-server map endpoints, plus an IndexedDB autosave
// ring so a crash or closed tab never loses work.

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

export const listMaps = () => fetch('/__tdmm/maps').then((r) => json<MapListEntry[]>(r));
export const loadMapFiles = (id: string) => fetch(`/__tdmm/map?id=${encodeURIComponent(id)}`).then((r) => json<LoadedFiles>(r));

export function saveMapFiles(id: string, map: string, waves: string, expectedHash: string | null, force = false) {
  return fetch('/__tdmm/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, map, waves, expectedHash, force }),
  }).then((r) => json<{ ok: true; hash: string }>(r));
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
