import type Phaser from 'phaser';
import type { Exit, Spawn } from '@tdmm/map-format';

/** Spawn and exit markers, drawn the same way in the game and the editor. Redraws into `g`. */
export function drawMarkers(g: Phaser.GameObjects.Graphics, spawns: readonly Spawn[], exits: readonly Exit[], ts: number) {
  g.clear();
  for (const s of spawns) {
    const cx = (s.cell[0] + 0.5) * ts;
    const cy = (s.cell[1] + 0.5) * ts;
    if (s.kind === 'air') {
      g.fillStyle(0x202020).fillCircle(cx, cy, ts * 0.38);
      g.fillStyle(0x60c0f0).fillCircle(cx, cy, ts * 0.32);
      g.fillStyle(0xf8f8f8).fillTriangle(cx - ts * 0.2, cy + ts * 0.08, cx + ts * 0.2, cy + ts * 0.08, cx, cy - ts * 0.18);
      continue;
    }
    g.fillStyle(0x202020).fillCircle(cx, cy, ts * 0.38);
    g.fillStyle(0xe83030).fillCircle(cx, cy, ts * 0.32);
    g.fillStyle(0xf8f8f8).fillRect(cx - ts * 0.32, cy - 1, ts * 0.64, 2);
    g.fillStyle(0xf8f8f8).fillCircle(cx, cy, ts * 0.12);
  }
  for (const e of exits) {
    const x = e.cell[0] * ts;
    const y = e.cell[1] * ts;
    g.fillStyle(0x303840).fillRect(x + 7, y + 3, 3, ts - 6);
    g.fillStyle(0xf8d030).fillTriangle(x + 10, y + 3, x + 27, y + 9, x + 10, y + 15);
  }
  return g;
}
