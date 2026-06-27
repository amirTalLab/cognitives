import { Emotion, Orientation, Side, Trial } from '@/types/brms-emotion';
import { getMockImageUrl, IDENTITY_IDS, EmotionKey, OrientationKey, getAllMockImageUrls } from './mockStimuli';

// ── Constants ────────────────────────────────────────────────────────────────

export const STIMULUS_SET: 'mock' | 'kdef' = 'mock';

export const MASK_FRAMES    = 4;        // 4 frames @ 60 Hz ≈ 66.67 ms
export const FACE_FRAMES    = 2;        // 2 frames @ 60 Hz ≈ 33.34 ms
export const CYCLE_FRAMES   = MASK_FRAMES + FACE_FRAMES; // 6 frames = 100 ms
export const RAMP_MS        = 1000;     // face contrast ramps over 1 s
export const MAX_CONTRAST   = 0.7;      // 70% max face alpha
export const DEADLINE_MS    = 15_000;   // BT analysis deadline
export const RESCUE_START_MS = 15_000;  // mask fade begins
export const RESCUE_END_MS  = 20_000;   // trial hard-stop
export const RESCUE_DUR_MS  = RESCUE_END_MS - RESCUE_START_MS;
export const FIXATION_MS    = 500;
export const ITI_MS         = 500;
export const BREAK_EVERY    = 40;

export const TRIALS_PER_CELL = 20;
export const PRACTICE_PER_CELL = 2;

export const COIN_DIAMETER_MM = 18; // 1 NIS coin
export const FACE_SIZE_MM     = 25; // target physical face size

// ── Emotion / orientation code mapping ────────────────────────────────────────

const EMOTION_CODE: Record<Emotion, EmotionKey> = {
  fearful: 'AF', happy: 'HA', neutral: 'NE',
};
const ORIENTATION_CODE: Record<Orientation, OrientationKey> = {
  upright: 'up', inverted: 'inv',
};

export function getFaceUrl(identityId: string, emotion: Emotion, orientation: Orientation): string {
  if (STIMULUS_SET === 'mock') {
    return getMockImageUrl(identityId, EMOTION_CODE[emotion], ORIENTATION_CODE[orientation]);
  }
  // KDEF path (future): return `/stimuli/kdef/${identityId}_${EMOTION_CODE[emotion]}_${ORIENTATION_CODE[orientation]}.jpg`;
  return getMockImageUrl(identityId, EMOTION_CODE[emotion], ORIENTATION_CODE[orientation]);
}

// ── Image preloading ─────────────────────────────────────────────────────────

export function preloadAllImages(): void {
  const urls = getAllMockImageUrls();
  for (const url of urls) {
    const img = new Image();
    img.src = url;
  }
}

// ── Mondrian mask generation ─────────────────────────────────────────────────

const MONDRIAN_COLORS = [
  '#e53935', '#1e88e5', '#fdd835', '#43a047', '#fb8c00',
  '#8e24aa', '#00acc1', '#d81b60', '#7cb342', '#f4511e',
  '#3949ab', '#c0ca33', '#039be5', '#e53935', '#ffb300',
];

export function generateMondrianCanvas(w: number, h: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#222';
  ctx.fillRect(0, 0, w, h);
  const nRects = 80 + Math.floor(Math.random() * 40);
  for (let i = 0; i < nRects; i++) {
    const rw = 10 + Math.random() * (w * 0.4);
    const rh = 10 + Math.random() * (h * 0.4);
    const rx = Math.random() * (w - rw / 2) - rw / 4;
    const ry = Math.random() * (h - rh / 2) - rh / 4;
    ctx.fillStyle = MONDRIAN_COLORS[Math.floor(Math.random() * MONDRIAN_COLORS.length)];
    ctx.fillRect(rx, ry, rw, rh);
  }
  return canvas;
}

export function generateMondrianPool(count: number, w: number, h: number): HTMLCanvasElement[] {
  const pool: HTMLCanvasElement[] = [];
  for (let i = 0; i < count; i++) {
    pool.push(generateMondrianCanvas(w, h));
  }
  return pool;
}

// ── Trial list generation ────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function constrainedShuffle(trials: Trial[], maxAttempts = 200): Trial[] {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const shuffled = shuffle(trials);
    let valid = true;
    for (let i = 1; i < shuffled.length; i++) {
      if (shuffled[i].identityId === shuffled[i - 1].identityId) {
        valid = false;
        break;
      }
    }
    if (valid) return shuffled;
  }
  return shuffle(trials);
}

function buildCellTrials(
  emotion: Emotion,
  orientation: Orientation,
  count: number,
  isPractice: boolean,
): Trial[] {
  const trials: Trial[] = [];
  const ids = shuffle(IDENTITY_IDS);
  let leftCount = 0;
  const halfCount = Math.floor(count / 2);

  for (let i = 0; i < count; i++) {
    const identityId = ids[i % ids.length];
    const side: Side = leftCount < halfCount && (count - i > halfCount - leftCount || Math.random() < 0.5)
      ? (leftCount++, 'left')
      : 'right';
    trials.push({ emotion, orientation, identityId, side, isPractice });
  }
  return trials;
}

export function buildTrialList(): Trial[] {
  const emotions: Emotion[] = ['fearful', 'happy', 'neutral'];
  const orientations: Orientation[] = ['upright', 'inverted'];
  const all: Trial[] = [];

  for (const emotion of emotions) {
    for (const orientation of orientations) {
      all.push(...buildCellTrials(emotion, orientation, TRIALS_PER_CELL, false));
    }
  }

  return constrainedShuffle(all);
}

export function buildPracticeList(): Trial[] {
  const emotions: Emotion[] = ['fearful', 'happy', 'neutral'];
  const orientations: Orientation[] = ['upright', 'inverted'];
  const all: Trial[] = [];

  for (const emotion of emotions) {
    for (const orientation of orientations) {
      all.push(...buildCellTrials(emotion, orientation, PRACTICE_PER_CELL, true));
    }
  }

  return shuffle(all);
}
