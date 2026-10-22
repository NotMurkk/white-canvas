// Draws a small placeholder pack in the exact formats the real catalog uses, so the import, autotile
// and animation pipeline can be proven before any tilesets are downloaded:
//   water.png      RMXP autotile, 4 animation frames, 16 px native (48x64 per frame), like Gen 3 rips
//   path_dirt.png  RMXP autotile, 1 frame
//   ground.png     8-wide RMXP-style tileset row (grass, grass variant, flowers, snow)
// Run: npm run art:placeholder
import { mkdirSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const OUT = new URL('../assets/packs/placeholder/', import.meta.url);
const T = 16; // native tile size; the atlas build scales x2 to 32
const MINI = T / 2;

type Rgba = readonly [number, number, number, number];
const hex = (h: string, a = 255): Rgba => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), a];
const CLEAR: Rgba = [0, 0, 0, 0];

function image(width: number, height: number, paint: (x: number, y: number) => Rgba): PNG {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const c = paint(x, y);
      png.data.set(c, (y * width + x) * 4);
    }
  }
  return png;
}

/**
 * Distance (in native px) from a pixel to the "outside" of the terrain within one RMXP autotile frame,
 * negative when the pixel is outside. Rows 1-3 are a 3x3 island with rounded outer corners; the
 * top-right tile is the inner-corner piece, whose four corners touch a missing diagonal neighbour.
 */
function autotileDistance(x: number, y: number, cornerRadius: number): number | null {
  const px = x + 0.5;
  const py = y + 0.5;
  if (y >= T) {
    const lx = px;
    const ly = py - T;
    const size = 3 * T;
    const dx = Math.min(lx, size - lx);
    const dy = Math.min(ly, size - ly);
    if (dx < cornerRadius && dy < cornerRadius) {
      return cornerRadius - Math.hypot(cornerRadius - dx, cornerRadius - dy);
    }
    return Math.min(dx, dy);
  }
  if (x >= 2 * T) {
    const lx = px - 2 * T;
    const ly = py;
    const cx = lx < MINI ? 0 : T;
    const cy = ly < MINI ? 0 : T;
    return Math.hypot(lx - cx, ly - cy);
  }
  if (x < T) return autotileDistance(x, y + T, cornerRadius); // icon: reuse the island's top-left
  return null; // top-middle tile is never used by any pattern
}

interface AutotileStyle {
  outline: Rgba;
  rim: Rgba;
  fill: (x: number, y: number, frame: number) => Rgba;
  cornerRadius: number;
}

function autotile(frames: number, style: AutotileStyle): PNG {
  const frameW = 3 * T;
  return image(frameW * frames, 4 * T, (x, y) => {
    const frame = Math.floor(x / frameW);
    const fx = x % frameW;
    const d = autotileDistance(fx, y, style.cornerRadius);
    if (d === null || d < 0) return CLEAR;
    if (d < 1) return style.outline;
    if (d < 2) return style.rim;
    return style.fill(fx, y, frame);
  });
}

// Patterns repeat every 8 px (one mini) so any composition of minis tiles seamlessly.
const water = autotile(4, {
  outline: hex('#38589c'),
  rim: hex('#b8e0f8'),
  cornerRadius: 5,
  fill: (x, y, f) => {
    const u = (x + 2 * f) % 8;
    const v = y % 8;
    if ((v === 2 && u >= 1 && u <= 3) || (v === 6 && (u + 4) % 8 >= 1 && (u + 4) % 8 <= 2)) return hex('#a0d0f8');
    return hex('#5890e0');
  },
});

const dirtSpeckle = new Set(['1,2', '5,5', '3,7', '6,1']);
const pathDirt = autotile(1, {
  outline: hex('#806030'),
  rim: hex('#b89858'),
  cornerRadius: 3,
  fill: (x, y) => (dirtSpeckle.has(`${x % 8},${y % 8}`) ? hex('#c09860') : hex('#d8b878')),
});

const blades = new Set(['2,3', '3,2', '9,5', '10,4', '5,11', '6,10', '13,13', '12,12']);
const flowers = new Set(['4,4', '11,9', '7,13']);
const ground = image(8 * T, T, (x, y) => {
  const tile = Math.floor(x / T);
  const k = `${x % T},${y % T}`;
  switch (tile) {
    case 0:
      return blades.has(k) ? hex('#48a040') : hex('#70c058');
    case 1:
      return blades.has(`${(x + 5) % T},${(y + 3) % T}`) ? hex('#48a040') : hex('#78c860');
    case 2:
      if (flowers.has(k)) return hex('#f8f8f8');
      if (flowers.has(`${(x % T) - 1},${y % T}`) || flowers.has(`${(x % T) + 1},${y % T}`)) return hex('#f86858');
      return blades.has(k) ? hex('#48a040') : hex('#70c058');
    case 3:
      return blades.has(k) ? hex('#c8d8f0') : hex('#f0f4fc');
    default:
      return CLEAR;
  }
});

// Stamps sheet, 8 x 3 tiles (16 px native). Regions are declared in pack.json:
//   tree_round 0,0 2x3 · tree_pine 2,0 1x2 · house_small 3,0 3x3 · bush 6,0 · rock 7,0 · flowers 6,1
type Painter = (x: number, y: number) => Rgba | null;
const OUTLINE = hex('#203018');
/** Fills a shape, drawing a 1 px dark outline where the shape meets empty space. */
function shape(inside: (x: number, y: number) => boolean, fill: Painter, outline: Rgba = OUTLINE): Painter {
  return (x, y) => {
    if (!inside(x, y)) return null;
    if (!inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1)) return outline;
    return fill(x, y);
  };
}
const layer = (...painters: Painter[]): Painter => (x, y) => {
  for (const p of painters) {
    const c = p(x, y);
    if (c) return c;
  }
  return null;
};
const ellipse = (cx: number, cy: number, rx: number, ry: number) => (x: number, y: number) => ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1;
const rect = (x0: number, y0: number, x1: number, y1: number) => (x: number, y: number) => x >= x0 && x < x1 && y >= y0 && y < y1;
const leafy = (light: string, dark: string, cx: number, cy: number) => (x: number, y: number) =>
  ((x * 7 + y * 13) % 11 === 0 ? hex('#a8e070') : (x - cx) * 0.6 + (y - cy) > 2 ? hex(dark) : hex(light));

const stampPainters: [number, number, Painter][] = [
  // round tree: canopy over two tiles, trunk and shadow on the bottom tile
  [0, 0, layer(
    shape(ellipse(16, 15, 15, 14), leafy('#58b048', '#3c8a3c', 16, 15)),
    shape(rect(13, 26, 19, 44), () => hex('#8a5a30')),
    (x, y) => (ellipse(16, 44, 11, 3)(x, y) ? hex('#305828', 140) : null),
  )],
  // pine: stacked triangles over a trunk
  [2 * T, 0, layer(
    shape((x, y) => y < 25 && Math.abs(x + 0.5 - 8) <= 1 + ((y % 8) + Math.floor(y / 8) * 2) * 0.55, leafy('#3f8a58', '#2a6440', 8, 12)),
    shape(rect(6, 24, 10, 30), () => hex('#7a4a28')),
    (x, y) => (ellipse(8, 30, 6, 2)(x, y) ? hex('#305828', 140) : null),
  )],
  // small house: red roof, cream walls, door, window
  [3 * T, 0, layer(
    shape((x, y) => y >= 2 && y < 20 && x >= 1 + Math.max(0, 8 - y) && x < 47 - Math.max(0, 8 - y), (x, y) => (y % 4 === 3 ? hex('#a03830') : hex('#d05040'))),
    shape(rect(21, 34, 28, 46), () => hex('#6a4024')),
    shape(rect(7, 28, 15, 36), () => hex('#80c8f0')),
    shape(rect(33, 28, 41, 36), () => hex('#80c8f0')),
    shape(rect(3, 19, 45, 46), (x, y) => (y === 19 ? hex('#a08858') : hex('#f0e0b8'))),
  )],
  [6 * T, 0, shape(ellipse(8, 9, 7.5, 6.5), leafy('#5aa848', '#3e8034', 8, 9))],
  [7 * T, 0, layer(
    shape(ellipse(8, 9, 7, 6), (x, y) => (x + y < 11 ? hex('#c8c8d0') : hex('#9090a0'))),
  )],
  // flowers: decor with a transparent background
  [6 * T, T, (x, y) => {
    for (const [fx, fy, c] of [[3, 4, '#f86858'], [11, 6, '#f8d048'], [6, 11, '#f87898'], [12, 13, '#f86858']] as const) {
      const dx = x - fx;
      const dy = y - fy;
      if (dx === 0 && dy === 0) return hex('#f8f8f8');
      if (Math.abs(dx) + Math.abs(dy) === 1) return hex(c);
      if (dx === 0 && dy === 2) return hex('#48a040');
    }
    return null;
  }],
];
const stampSizes: Record<string, [number, number]> = { 0: [2, 3], [2 * T]: [1, 2], [3 * T]: [3, 3] };
const stamps = image(8 * T, 3 * T, (x, y) => {
  for (const [ox, oy, paint] of stampPainters) {
    const [w, h] = stampSizes[ox] ?? [1, 1];
    if (x >= ox && y >= oy && x < ox + w * T && y < oy + h * T) return paint(x - ox, y - oy) ?? CLEAR;
  }
  return CLEAR;
});

mkdirSync(OUT, { recursive: true });
for (const [name, png] of [['water.png', water], ['path_dirt.png', pathDirt], ['ground.png', ground], ['stamps.png', stamps]] as const) {
  writeFileSync(new URL(name, OUT), PNG.sync.write(png));
  console.log(`wrote assets/packs/placeholder/${name} (${png.width}x${png.height})`);
}
