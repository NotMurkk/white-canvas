/** A validation finding shown in the editor's problem list. Errors block a clean save. */
export interface Problem {
  severity: 'error' | 'warning';
  /** Stable machine code, e.g. "dead-end". */
  code: string;
  message: string;
  /** Cells to highlight / focus, [x, y]. */
  cells: [number, number][];
}
