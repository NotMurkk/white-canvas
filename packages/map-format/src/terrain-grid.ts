import type { MapDoc } from './schema.ts';

/**
 * In-memory terrain grid: one byte per cell indexing into `kinds`.
 * The editor mutates this; encodeTerrain() turns it back into legend rows for saving.
 */
export interface TerrainGrid {
  width: number;
  height: number;
  /** Terrain ids; cells hold an index into this list. */
  kinds: string[];
  cells: Uint8Array;
}

export function decodeTerrain(doc: MapDoc): TerrainGrid {
  const { width, height } = doc.grid;
  const kinds = [...new Set(Object.values(doc.terrain.legend))].sort();
  const indexOf = new Map(kinds.map((k, i) => [k, i]));
  const cells = new Uint8Array(width * height);
  doc.terrain.rows.forEach((row, y) => {
    for (let x = 0; x < width; x++) {
      const kind = doc.terrain.legend[row[x]!];
      if (kind === undefined) throw new Error(`unknown terrain symbol "${row[x]}" at ${x},${y}`);
      cells[y * width + x] = indexOf.get(kind)!;
    }
  });
  return { width, height, kinds, cells };
}

export function terrainAt(grid: TerrainGrid, x: number, y: number): string | undefined {
  if (x < 0 || y < 0 || x >= grid.width || y >= grid.height) return undefined;
  return grid.kinds[grid.cells[y * grid.width + x]!];
}

/** Returns a kind's index, adding it to the grid's kind list if needed. */
export function kindIndex(grid: TerrainGrid, kind: string): number {
  let i = grid.kinds.indexOf(kind);
  if (i === -1) {
    if (grid.kinds.length >= 255) throw new Error('too many terrain kinds in one map');
    i = grid.kinds.push(kind) - 1;
  }
  return i;
}

/**
 * Encodes the grid as legend + rows. Existing symbols are kept so diffs stay small;
 * new kinds get the first unused symbol from a readable set.
 */
export function encodeTerrain(grid: TerrainGrid, previousLegend: Record<string, string> = {}): MapDoc['terrain'] {
  const used = new Set<number>(grid.cells);
  const symbolFor = new Map<string, string>();
  for (const [sym, kind] of Object.entries(previousLegend)) if (!symbolFor.has(kind)) symbolFor.set(kind, sym);
  const taken = new Set(symbolFor.values());
  const pool = '.~=^#%&*+abcdefghijklmnopqrstuvwxyz0123456789';
  const legend: Record<string, string> = {};
  for (const i of [...used].sort((a, b) => a - b)) {
    const kind = grid.kinds[i]!;
    let sym = symbolFor.get(kind);
    if (sym === undefined) {
      sym = [...pool].find((c) => !taken.has(c));
      if (sym === undefined) throw new Error('ran out of terrain symbols');
      taken.add(sym);
      symbolFor.set(kind, sym);
    }
    legend[sym] = kind;
  }
  const rows: string[] = [];
  for (let y = 0; y < grid.height; y++) {
    let row = '';
    for (let x = 0; x < grid.width; x++) row += symbolFor.get(grid.kinds[grid.cells[y * grid.width + x]!]!);
    rows.push(row);
  }
  return { legend: sortKeys(legend), rows };
}

function sortKeys(obj: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(obj).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}
