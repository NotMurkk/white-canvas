// Finds separate objects (trees, rocks, houses...) on a tileset sheet so they can be named as
// stamp regions in pack.json. Works on the tile grid: empty tiles and "unused" marker tiles split
// objects; touching content tiles form one object. Coordinates are in tiles of the sheet's native
// size, which are exactly the region units pack.json uses.
import type { RgbaImage } from '@tdmm/autotile';

export interface FoundObject {
  /** Tile box: column, row, width, height. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Share of the box's pixels that are opaque. */
  fill: number;
  /** True if the object's outer ring of pixels is transparent (it stands alone, not part of a wall). */
  standalone: boolean;
}

type TileClass = 'empty' | 'marker' | 'content';

/**
 * Some packs (Ekat's) paint unused slots as a white tile with a red X. Those, and fully
 * transparent tiles, are not part of any object.
 */
function classify(img: RgbaImage, tile: number, tx: number, ty: number): TileClass {
  let opaque = 0;
  let red = 0;
  let white = 0;
  for (let y = 0; y < tile; y++) {
    for (let x = 0; x < tile; x++) {
      const i = ((ty * tile + y) * img.width + tx * tile + x) * 4;
      if (img.data[i + 3]! < 32) continue;
      opaque++;
      const [r, g, b] = [img.data[i]!, img.data[i + 1]!, img.data[i + 2]!];
      if (r > 190 && g < 90 && b < 90) red++;
      else if (r > 225 && g > 225 && b > 225) white++;
    }
  }
  const n = tile * tile;
  if (opaque < n * 0.02) return 'empty';
  if (red > n * 0.06 && white > n * 0.35) return 'marker';
  return 'content';
}

export function findObjects(img: RgbaImage, tile: number, maxTiles = 40): FoundObject[] {
  const cols = Math.floor(img.width / tile);
  const rows = Math.floor(img.height / tile);
  const cls: TileClass[] = [];
  for (let ty = 0; ty < rows; ty++) for (let tx = 0; tx < cols; tx++) cls.push(classify(img, tile, tx, ty));
  const seen = new Uint8Array(cols * rows);
  const found: FoundObject[] = [];
  for (let start = 0; start < cols * rows; start++) {
    if (seen[start] || cls[start] !== 'content') continue;
    const stack = [start];
    seen[start] = 1;
    let x0 = cols, y0 = rows, x1 = 0, y1 = 0, count = 0;
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % cols;
      const y = Math.floor(i / cols);
      count++;
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx;
        const ny = y + dy;
        const j = ny * cols + nx;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows || seen[j] || cls[j] !== 'content') continue;
        seen[j] = 1;
        stack.push(j);
      }
    }
    const w = x1 - x0 + 1;
    const h = y1 - y0 + 1;
    if (w * h > maxTiles) continue;
    // pixel stats inside the box
    let opaque = 0;
    let ringOpaque = 0;
    let ring = 0;
    for (let py = y0 * tile; py < (y1 + 1) * tile; py++) {
      for (let px = x0 * tile; px < (x1 + 1) * tile; px++) {
        const a = img.data[(py * img.width + px) * 4 + 3]! >= 32;
        if (a) opaque++;
        if (px === x0 * tile || px === (x1 + 1) * tile - 1 || py === y0 * tile || py === (y1 + 1) * tile - 1) {
          ring++;
          if (a) ringOpaque++;
        }
      }
    }
    found.push({ x: x0, y: y0, w, h, fill: opaque / (w * h * tile * tile), standalone: ringOpaque / ring < 0.35 && count >= 1 });
  }
  return found.sort((a, b) => a.y - b.y || a.x - b.x);
}
