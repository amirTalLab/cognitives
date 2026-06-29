import { Emotion, Orientation, Side, Trial } from '@/types/brms-emotion';

// ── Constants ────────────────────────────────────────────────────────────────

export const STIMULUS_SET = 'real';

export const MASK_FRAMES    = 4;        // 4 frames @ 60 Hz ≈ 66.67 ms
export const FACE_FRAMES    = 2;        // 2 frames @ 60 Hz ≈ 33.34 ms
export const CYCLE_FRAMES   = MASK_FRAMES + FACE_FRAMES; // 6 frames = 100 ms
export const RAMP_MS        = 3000;     // face contrast ramps over 3 s
export const MAX_CONTRAST   = 0.7;      // 70% max face alpha
export const DEADLINE_MS    = 15_000;   // BT analysis deadline
export const RESCUE_START_MS = 15_000;  // mask fade begins
export const RESCUE_END_MS  = 20_000;   // trial hard-stop
export const RESCUE_DUR_MS  = RESCUE_END_MS - RESCUE_START_MS;
export const FIXATION_MS    = 500;
export const ITI_MS         = 500;
export const BREAK_EVERY    = 36;

export const TRIALS_PER_CELL = 18;
export const PRACTICE_TOTAL = 8;

export const COIN_DIAMETER_MM = 18; // 1 NIS coin

export const FRAME_ASPECT      = 2.38;  // 34.5° / 14.5°
export const FACE_W_RATIO      = 0.25;  // face width  = 0.25 × frame width
export const FACE_OFFSET_RATIO = 0.26;  // center→face center = 0.26 × frame width
export const FACE_H_RATIO      = 0.97;  // face height = 0.97 × frame height

// ── Face identities & URLs ──────────────────────────────────────────────────

export const IDENTITY_IDS = ['1', '2', '3', '4', '5', '6'];

const EMOTION_FILE: Record<Emotion, string> = {
  fearful: 'f', happy: 'h', neutral: 'n',
};

export function getFaceUrl(identityId: string, emotion: Emotion, _orientation: Orientation): string {
  return `/brms-faces/${identityId}_${EMOTION_FILE[emotion]}.png`;
}

function getAllImageUrls(): string[] {
  const urls: string[] = [];
  const emotions: Emotion[] = ['fearful', 'happy', 'neutral'];
  for (const id of IDENTITY_IDS) {
    for (const em of emotions) {
      urls.push(getFaceUrl(id, em, 'upright'));
    }
  }
  return urls;
}

// ── Image preloading ─────────────────────────────────────────────────────────

const preloadedCache: HTMLImageElement[] = [];

export function preloadAllImages(): void {
  if (preloadedCache.length > 0) return;
  const urls = getAllImageUrls();
  for (const url of urls) {
    const img = new Image();
    img.src = url;
    preloadedCache.push(img);
  }
}

// ── Mondrian mask generation ─────────────────────────────────────────────────

const MONDRIAN_COLORS = [
  '#e53935', '#1e88e5', '#fdd835', '#43a047', '#fb8c00',
  '#8e24aa', '#00acc1', '#d81b60', '#7cb342', '#f4511e',
  '#3949ab', '#c0ca33', '#039be5', '#e53935', '#ffb300',
];

export type MaskShape = 'ovals' | 'rectangles';
export const MASK_SHAPE: MaskShape = 'ovals';

export function generateMondrianCanvas(w: number, h: number, shape: MaskShape = MASK_SHAPE): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#222';
  ctx.fillRect(0, 0, w, h);
  const nShapes = shape === 'ovals'
    ? 40 + Math.floor(Math.random() * 20)
    : 200 + Math.floor(Math.random() * 80);
  for (let i = 0; i < nShapes; i++) {
    ctx.fillStyle = MONDRIAN_COLORS[Math.floor(Math.random() * MONDRIAN_COLORS.length)];
    if (shape === 'ovals') {
      // Match displayed face size: width constrained by objectFit:contain
      // Face image is 608×464, so displayed height = faceW × (464/608)
      const faceDispW = FACE_W_RATIO * w;
      const faceDispH = faceDispW * (464 / 608);
      const rx = faceDispW / 2;
      const ry = faceDispH / 2;
      const cx = Math.random() * w;
      const cy = Math.random() * h;
      const horizontal = Math.random() < 0.5;
      ctx.beginPath();
      ctx.ellipse(cx, cy, horizontal ? ry : rx, horizontal ? rx : ry, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const rw = 4 + Math.random() * (w * 0.2);
      const rh = 4 + Math.random() * (h * 0.2);
      const rx = Math.random() * (w - rw / 2) - rw / 4;
      const ry = Math.random() * (h - rh / 2) - rh / 4;
      ctx.fillRect(rx, ry, rw, rh);
    }
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

function conditionKey(t: Trial): string {
  return `${t.emotion}_${t.orientation}`;
}

function constrainedShuffle(trials: Trial[], maxAttempts = 500): Trial[] {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const shuffled = shuffle(trials);
    let valid = true;
    for (let i = 1; i < shuffled.length; i++) {
      if (shuffled[i].identityId === shuffled[i - 1].identityId ||
          conditionKey(shuffled[i]) === conditionKey(shuffled[i - 1])) {
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
  const cells: { emotion: Emotion; orientation: Orientation }[] = [];
  for (const emotion of emotions) {
    for (const orientation of orientations) {
      cells.push({ emotion, orientation });
    }
  }
  const ids = shuffle(IDENTITY_IDS);
  const all: Trial[] = [];
  for (let i = 0; i < PRACTICE_TOTAL; i++) {
    const cell = cells[i % cells.length];
    all.push({
      emotion: cell.emotion,
      orientation: cell.orientation,
      identityId: ids[i % ids.length],
      side: i % 2 === 0 ? 'left' : 'right',
      isPractice: true,
    });
  }
  return constrainedShuffle(all);
}
