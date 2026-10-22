// Palette library lists (objects, terrain, path styles, zones): search, pins and recents. One
// ordering feeds both what the palette shows and what the 1-9 keys pick, so they always agree.

export type LibraryList = 'stamp' | 'terrain' | 'path' | 'zone';

export interface LibraryItem {
  id: string;
  name: string;
  color: string;
  note?: string;
  category?: string;
}

export interface LibraryPrefs {
  query: string;
  /** "list:id" keys, in the order they were pinned. */
  pins: string[];
  /** "list:id" keys, most recent first. */
  recent: string[];
}

export const RECENT_MAX = 6;

export const libKey = (list: LibraryList, id: string) => `${list}:${id}`;

/** Every word of the query must appear in the item's name, id or category. */
export function matches(item: LibraryItem, query: string): boolean {
  const hay = `${item.name} ${item.id} ${item.category ?? ''}`.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
}

export interface LibraryView {
  pinned: LibraryItem[];
  recent: LibraryItem[];
  rest: LibraryItem[];
  /** Pinned first, then the rest in content order: what 1-9 pick. */
  ordered: LibraryItem[];
}

export function libraryView(items: LibraryItem[], list: LibraryList, prefs: LibraryPrefs): LibraryView {
  const found = items.filter((i) => matches(i, prefs.query));
  const byKey = new Map(found.map((i) => [libKey(list, i.id), i]));
  const pinned = prefs.pins.map((k) => byKey.get(k)).filter((i): i is LibraryItem => !!i);
  const pinnedIds = new Set(pinned.map((i) => i.id));
  const rest = found.filter((i) => !pinnedIds.has(i.id));
  const recent = prefs.recent.map((k) => byKey.get(k)).filter((i): i is LibraryItem => !!i && !pinnedIds.has(i.id));
  return { pinned, recent, rest, ordered: [...pinned, ...rest] };
}

export function togglePin(prefs: LibraryPrefs, list: LibraryList, id: string): LibraryPrefs {
  const k = libKey(list, id);
  return { ...prefs, pins: prefs.pins.includes(k) ? prefs.pins.filter((p) => p !== k) : [...prefs.pins, k] };
}

/** Moves an item to the front of its list's recents (each list keeps its own RECENT_MAX). */
export function noteRecent(prefs: LibraryPrefs, list: LibraryList, id: string): LibraryPrefs {
  const k = libKey(list, id);
  const others = prefs.recent.filter((r) => r !== k);
  const mine = others.filter((r) => r.startsWith(`${list}:`)).slice(0, RECENT_MAX - 1);
  return { ...prefs, recent: [k, ...mine, ...others.filter((r) => !r.startsWith(`${list}:`))] };
}

const STORAGE_KEY = 'tdmm:palette';

export function loadPrefs(): LibraryPrefs {
  try {
    const v = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<LibraryPrefs> | null;
    return { query: '', pins: Array.isArray(v?.pins) ? v.pins : [], recent: Array.isArray(v?.recent) ? v.recent : [] };
  } catch {
    return { query: '', pins: [], recent: [] };
  }
}

export function savePrefs(prefs: LibraryPrefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ pins: prefs.pins, recent: prefs.recent }));
  } catch {
    // pins just won't persist
  }
}
