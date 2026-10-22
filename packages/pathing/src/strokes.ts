// Path editing operations. The path tool records direction from the stroke itself, so two lanes
// painted side by side never connect by accident and branches point where the designer dragged.
import { DIR_E, DIR_N, DIR_S, DIR_W, NO_PATH } from '@tdmm/map-format';

export type Cell = { x: number; y: number };
export interface CellEdit {
  index: number;
  before: number;
  after: number;
}

export const DIRS = [
  { bit: DIR_N, dx: 0, dy: -1, name: 'N' },
  { bit: DIR_E, dx: 1, dy: 0, name: 'E' },
  { bit: DIR_S, dx: 0, dy: 1, name: 'S' },
  { bit: DIR_W, dx: -1, dy: 0, name: 'W' },
] as const;

export const opposite = (bit: number) => (bit === DIR_N ? DIR_S : bit === DIR_S ? DIR_N : bit === DIR_E ? DIR_W : DIR_E);

/** Direction bit from a to b when they are 4-neighbours, else 0. */
export function dirBetween(a: Cell, b: Cell): number {
  const d = DIRS.find((d) => a.x + d.dx === b.x && a.y + d.dy === b.y);
  return d ? d.bit : 0;
}

/**
 * The 4-connected cells from a to b, excluding a. Diagonal steps get an elbow cell so the path
 * never connects corner to corner (horizontal first, which matches how people drag).
 */
export function stepCells(a: Cell, b: Cell): Cell[] {
  const out: Cell[] = [];
  let { x, y } = a;
  const dx = Math.abs(b.x - x);
  const dy = -Math.abs(b.y - y);
  const sx = x < b.x ? 1 : -1;
  const sy = y < b.y ? 1 : -1;
  let err = dx + dy;
  while (x !== b.x || y !== b.y) {
    const e2 = 2 * err;
    const moveX = e2 >= dy;
    const moveY = e2 <= dx;
    if (moveX && moveY) {
      out.push({ x: x + sx, y });
    }
    if (moveX) {
      err += dy;
      x += sx;
    }
    if (moveY) {
      err += dx;
      y += sy;
    }
    out.push({ x, y });
  }
  return out;
}

export class PathGrid {
  readonly width: number;
  readonly height: number;
  readonly cells: Uint8Array;

  constructor(width: number, height: number, cells?: Uint8Array) {
    this.width = width;
    this.height = height;
    this.cells = cells ?? new Uint8Array(width * height).fill(NO_PATH);
  }

  inside(c: Cell) {
    return c.x >= 0 && c.y >= 0 && c.x < this.width && c.y < this.height;
  }

  index(c: Cell) {
    return c.y * this.width + c.x;
  }

  isPath(c: Cell) {
    return this.inside(c) && this.cells[this.index(c)] !== NO_PATH;
  }

  out(c: Cell) {
    return this.inside(c) ? this.cells[this.index(c)]! : NO_PATH;
  }

  private set(c: Cell, value: number, edits: CellEdit[]) {
    const index = this.index(c);
    const before = this.cells[index]!;
    if (before === value) return;
    this.cells[index] = value;
    edits.push({ index, before, after: value });
  }

  /** Makes c a path cell (with no exits yet) if it isn't one. */
  add(c: Cell, edits: CellEdit[] = []): CellEdit[] {
    if (this.inside(c) && !this.isPath(c)) this.set(c, 0, edits);
    return edits;
  }

  /**
   * Links a -> b (4-neighbours). Painting back over a link reverses it: any b -> a link is removed,
   * so a path never has a two-cell loop.
   */
  connect(a: Cell, b: Cell, edits: CellEdit[] = []): CellEdit[] {
    const bit = dirBetween(a, b);
    if (!bit || !this.inside(a) || !this.inside(b)) return edits;
    this.add(a, edits);
    this.add(b, edits);
    this.set(a, this.out(a) | bit, edits);
    const back = opposite(bit);
    if (this.out(b) & back) this.set(b, this.out(b) & ~back, edits);
    return edits;
  }

  /** Removes c from the path, along with every link pointing into it. */
  erase(c: Cell, edits: CellEdit[] = []): CellEdit[] {
    if (!this.isPath(c)) return edits;
    this.set(c, NO_PATH, edits);
    for (const d of DIRS) {
      const n = { x: c.x + d.dx, y: c.y + d.dy };
      const into = opposite(d.bit);
      if (this.isPath(n) && this.out(n) & into) this.set(n, this.out(n) & ~into, edits);
    }
    return edits;
  }
}
