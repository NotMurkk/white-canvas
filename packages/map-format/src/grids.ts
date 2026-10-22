import { PATH_ENCODING, type MapDoc } from './schema.ts';

/** Out-mask bits for path cells. */
export const DIR_N = 1;
export const DIR_E = 2;
export const DIR_S = 4;
export const DIR_W = 8;
export const DIR_BITS = { N: DIR_N, E: DIR_E, S: DIR_S, W: DIR_W } as const;
/** Value stored for "no path here". Path cells hold their out-mask 0..15. */
export const NO_PATH = 255;

/**
 * Path grid: one byte per cell. NO_PATH (255) = not path; 0..15 = a path cell and the directions
 * enemies leave it by. 0 is a path cell with no way out (an end, which must be an exit).
 */
export function decodePath(doc: MapDoc): Uint8Array {
  const { width, height } = doc.grid;
  const cells = new Uint8Array(width * height).fill(NO_PATH);
  doc.path?.rows.forEach((row, y) => {
    for (let x = 0; x < width; x++) {
      const ch = row[x]!;
      if (ch !== '.') cells[y * width + x] = parseInt(ch, 16);
    }
  });
  return cells;
}

export function encodePath(cells: Uint8Array, width: number, height: number): MapDoc['path'] {
  if (cells.every((c) => c === NO_PATH)) return undefined;
  const rows: string[] = [];
  for (let y = 0; y < height; y++) {
    let row = '';
    for (let x = 0; x < width; x++) {
      const c = cells[y * width + x]!;
      row += c === NO_PATH ? '.' : c.toString(16);
    }
    rows.push(row);
  }
  return { encoding: PATH_ENCODING, rows };
}

/** Zone grid: 0 = no zone, otherwise 1 + index into `kinds`. */
export interface ZoneGrid {
  kinds: string[];
  cells: Uint8Array;
}

export function decodeZones(doc: MapDoc): ZoneGrid {
  const { width, height } = doc.grid;
  const kinds = [...new Set(Object.values(doc.zones?.legend ?? {}))].sort();
  const cells = new Uint8Array(width * height);
  doc.zones?.rows.forEach((row, y) => {
    for (let x = 0; x < width; x++) {
      const kind = doc.zones!.legend[row[x]!];
      if (kind) cells[y * width + x] = kinds.indexOf(kind) + 1;
    }
  });
  return { kinds, cells };
}

export function zoneAt(z: ZoneGrid, index: number): string | undefined {
  const v = z.cells[index]!;
  return v ? z.kinds[v - 1] : undefined;
}

/** Index to store for a zone kind (adds it to the list if new). */
export function zoneValue(z: ZoneGrid, kind: string | null): number {
  if (kind === null) return 0;
  let i = z.kinds.indexOf(kind);
  if (i === -1) i = z.kinds.push(kind) - 1;
  return i + 1;
}

/** Encodes zones keeping existing symbols; new kinds get the first free letter of their name. */
export function encodeZones(z: ZoneGrid, width: number, height: number, previousLegend: Record<string, string> = {}): MapDoc['zones'] {
  const used = [...new Set(z.cells)].filter((v) => v > 0).map((v) => z.kinds[v - 1]!);
  if (used.length === 0) return undefined;
  const symbolFor = new Map<string, string>();
  for (const [sym, kind] of Object.entries(previousLegend)) if (used.includes(kind) && !symbolFor.has(kind)) symbolFor.set(kind, sym);
  const taken = new Set(symbolFor.values());
  for (const kind of used.sort()) {
    if (symbolFor.has(kind)) continue;
    const sym = [...`${kind.replace(/[^a-z]/g, '')}abcdefghijklmnopqrstuvwxyz0123456789`].find((c) => !taken.has(c));
    if (!sym) throw new Error('ran out of zone symbols');
    taken.add(sym);
    symbolFor.set(kind, sym);
  }
  const rows: string[] = [];
  for (let y = 0; y < height; y++) {
    let row = '';
    for (let x = 0; x < width; x++) {
      const v = z.cells[y * width + x]!;
      row += v ? symbolFor.get(z.kinds[v - 1]!) : '.';
    }
    rows.push(row);
  }
  const legend = Object.fromEntries([...symbolFor.entries()].map(([k, s]) => [s, k]).sort(([a], [b]) => (a! < b! ? -1 : 1)));
  return { legend, rows };
}

/** Random, stable, human-readable ids ("o_k3f9a2"). Random rather than counters so parallel branches never collide. */
export function newId(prefix: string, taken: Iterable<string> = []): string {
  const used = new Set(taken);
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789';
  for (;;) {
    let s = `${prefix}_`;
    const bytes = crypto.getRandomValues(new Uint8Array(6));
    for (const b of bytes) s += alphabet[b % alphabet.length];
    if (!used.has(s)) return s;
  }
}
