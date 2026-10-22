// Tiny synthesized feedback sounds (no audio files): Mario Maker gives every action a sound,
// so placing, erasing and refusals are audible as well as visible.
type Cue = 'place' | 'paint' | 'erase' | 'refuse' | 'undo' | 'save';

const CUES: Record<Cue, { type: OscillatorType; from: number; to: number; ms: number; gain: number }> = {
  place: { type: 'square', from: 660, to: 990, ms: 70, gain: 0.05 },
  paint: { type: 'triangle', from: 520, to: 560, ms: 35, gain: 0.04 },
  erase: { type: 'triangle', from: 420, to: 220, ms: 70, gain: 0.05 },
  refuse: { type: 'sawtooth', from: 150, to: 110, ms: 140, gain: 0.04 },
  undo: { type: 'sine', from: 700, to: 450, ms: 80, gain: 0.05 },
  save: { type: 'square', from: 520, to: 1040, ms: 140, gain: 0.04 },
};

let ctx: AudioContext | null = null;
let muted = false;
let lastPaint = 0;

export function setMuted(m: boolean) {
  muted = m;
}

export function play(cue: Cue) {
  if (muted) return;
  const now = performance.now();
  if (cue === 'paint') {
    if (now - lastPaint < 60) return; // a drag would otherwise buzz
    lastPaint = now;
  }
  try {
    ctx ??= new AudioContext();
    const c = CUES[cue];
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = c.type;
    osc.frequency.setValueAtTime(c.from, t);
    osc.frequency.exponentialRampToValueAtTime(c.to, t + c.ms / 1000);
    gain.gain.setValueAtTime(c.gain, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + c.ms / 1000);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + c.ms / 1000 + 0.02);
  } catch {
    // audio unavailable: silent
  }
}
