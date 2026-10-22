/**
 * Undo history of transactions. A gesture (one brush stroke, one placement, one form edit) opens
 * a transaction and commits one entry, so a whole stroke is one undo step. Entries hold sparse
 * cell diffs plus before/after snapshots of the small record lists they touched.
 */
export type GridLayer = 'terrain' | 'path' | 'zones';
export type ListName = 'objects' | 'spawns' | 'exits' | 'junctions' | 'airRoutes' | 'waves';

export interface CellRecord {
  layer: GridLayer;
  index: number;
  before: number;
  after: number;
}

export interface ListRecord {
  name: ListName;
  before: string;
  after: string;
}

export interface Entry {
  label: string;
  cells: CellRecord[];
  lists: ListRecord[];
}

export class History {
  private readonly undoStack: Entry[] = [];
  private readonly redoStack: Entry[] = [];
  private readonly limit: number;

  constructor(limit = 500) {
    this.limit = limit;
  }

  push(entry: Entry) {
    this.undoStack.push(entry);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack.length = 0;
  }

  popUndo(): Entry | undefined {
    const e = this.undoStack.pop();
    if (e) this.redoStack.push(e);
    return e;
  }

  popRedo(): Entry | undefined {
    const e = this.redoStack.pop();
    if (e) this.undoStack.push(e);
    return e;
  }

  get canUndo() {
    return this.undoStack.length > 0;
  }

  get canRedo() {
    return this.redoStack.length > 0;
  }

  get depth() {
    return this.undoStack.length;
  }
}
