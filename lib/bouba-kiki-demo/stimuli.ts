import { Trial } from '@/types/bouba-kiki-demo';

export const KEY = 'bkd';
export const FIXATION_MS = 500;
export const ITI_MS = 300;
export const N_MAIN = 12;
export const N_CONTROL = 4;
export const N_PRACTICE = 4;

// An irregular rounded blob — the "bouba" shape. Hand-tuned cubic path so it reads as
// organic rather than as a plain circle.
export const BLOB_PATH =
  'M100,18 C137,18 158,42 166,72 C174,102 186,128 166,152 C146,176 118,182 96,180 ' +
  'C68,178 40,168 26,142 C12,116 20,86 32,62 C44,38 68,18 100,18 Z';

/** Spiky star outline — the "kiki" shape. Alternating outer and inner radii. */
export function starPoints(cx: number, cy: number, outer: number, inner: number, spikes = 7): string {
  const pts: string[] = [];
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const angle = (Math.PI / spikes) * i - Math.PI / 2;
    pts.push(String(cx + r * Math.cos(angle)) + ',' + String(cy + r * Math.sin(angle)));
  }
  return pts.join(' ');
}

/** Fisher-Yates, so trial order is genuinely random rather than sort-shuffled. */
export function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function generateTrials(practice = false): Trial[] {
  if (practice) {
    return shuffle(Array.from({ length: N_PRACTICE }, (_, i) => ({
      index: i,
      leftShape: (i % 2 === 0 ? 'rounded' : 'spiky') as Trial['leftShape'],
      rightShape: (i % 2 === 0 ? 'spiky' : 'rounded') as Trial['rightShape'],
      isControl: false,
    })));
  }

  const trials: Trial[] = [];
  for (let i = 0; i < N_MAIN; i++) {
    const roundedLeft = i % 2 === 0;
    trials.push({
      index: i,
      leftShape: roundedLeft ? 'rounded' : 'spiky',
      rightShape: roundedLeft ? 'spiky' : 'rounded',
      isControl: false,
    });
  }
  // Control trials pair two shapes of the same class: with no rounded/spiky contrast the
  // choice should sit at chance, which is what makes the main-trial result meaningful.
  for (let i = 0; i < N_CONTROL; i++) {
    const kind: Trial['leftShape'] = i % 2 === 0 ? 'rounded' : 'spiky';
    trials.push({ index: N_MAIN + i, leftShape: kind, rightShape: kind, isControl: true });
  }
  return shuffle(trials).map((t, i) => ({ ...t, index: i }));
}
