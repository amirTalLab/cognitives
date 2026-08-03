// Summary Statistics – Stimulus & Trial Generation

import {
  StimulusType, ArrayItem, ProbeType,
  EnsembleTrial, RecognitionTrial, Trial,
} from '@/types/summary-stats';

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────

export const DISPLAY_DURATION_MS  = 800;
export const BLANK_DURATION_MS    = 200;
export const FIXATION_DURATION_MS = 500;

export const SET_SIZES = [3, 5, 7];

export const VALUE_RANGES: Record<StimulusType, { min: number; max: number }> = {
  'circles':      { min: 15, max: 75 },
  'line-lengths': { min: 40, max: 200 },
};

// Minimum distance a foil must have from every array member (15% of range).
// Circles: ≥ 9 px radius; Lines: ≥ 24 px length — clearly distinguishable.
const MIN_DIST_FRAC = 0.15;

const SVG_W = 500;
const SVG_H = 500;
const MARGIN = 60;

// ──────────────────────────────────────────────
// Slider ↔ value mapping
// ──────────────────────────────────────────────

export function sliderToValue(slider: number, type: StimulusType): number {
  const { min, max } = VALUE_RANGES[type];
  return min + (slider / 100) * (max - min);
}

export function valueToSlider(value: number, type: StimulusType): number {
  const { min, max } = VALUE_RANGES[type];
  return Math.round(((value - min) / (max - min)) * 100);
}

// ──────────────────────────────────────────────
// Labels
// ──────────────────────────────────────────────

export const STAT_LABELS: Record<StimulusType, { en: string; he: string }> = {
  'circles':      { en: 'What was the average circle size?', he: 'מהו גודל העיגול הממוצע?' },
  'line-lengths': { en: 'What was the average line length?', he: 'מהו אורך הקו הממוצע?' },
};

export const RECOGNITION_LABEL = {
  en: 'Did this item appear in the display?',
  he: 'האם פריט זה הופיע בתצוגה?',
};

export const TYPE_LABELS: Record<StimulusType, { en: string; he: string }> = {
  'circles':      { en: 'Circles', he: 'עיגולים' },
  'line-lengths': { en: 'Lines',   he: 'קווים'   },
};

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function randFloat(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function generatePositions(n: number): { x: number; y: number }[] {
  const cols = Math.ceil(Math.sqrt(n * 1.5));
  const rows = Math.ceil(n / cols);
  const cellW = (SVG_W - 2 * MARGIN) / cols;
  const cellH = (SVG_H - 2 * MARGIN) / rows;

  const positions: { x: number; y: number }[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (positions.length >= n) break;
      const cx = MARGIN + c * cellW + cellW / 2 + randFloat(-cellW * 0.25, cellW * 0.25);
      const cy = MARGIN + r * cellH + cellH / 2 + randFloat(-cellH * 0.25, cellH * 0.25);
      positions.push({ x: Math.round(cx), y: Math.round(cy) });
    }
  }
  return shuffle(positions).slice(0, n);
}

// Generate array where Math.round(mean) is NOT a member value
export function generateArray(type: StimulusType, n: number): ArrayItem[] {
  const { min, max } = VALUE_RANGES[type];
  const positions = generatePositions(n);
  let items: ArrayItem[] = [];
  let attempts = 0;
  do {
    items = positions.map((pos, i) => ({
      id: i, x: pos.x, y: pos.y,
      value: Math.round(randFloat(min, max)),
    }));
    const floatMean = items.reduce((s, it) => s + it.value, 0) / items.length;
    if (!items.some(it => it.value === Math.round(floatMean))) break;
    attempts++;
  } while (attempts < 100);
  return items;
}

export function calcTrueMean(items: ArrayItem[]): number {
  return Math.round(items.reduce((a, b) => a + b.value, 0) / items.length);
}

// Generate a non-member foil that is at least MIN_DIST_FRAC of range from every member.
// excludeValue: also reject this specific value (used to avoid the exact int mean for foil-non-mean).
function generateNonMember(
  items: ArrayItem[],
  type: StimulusType,
  excludeValue?: number,
): number {
  const { min, max } = VALUE_RANGES[type];
  const minDist = Math.round((max - min) * MIN_DIST_FRAC);
  const memberValues = items.map(i => i.value);

  for (let att = 0; att < 2000; att++) {
    const candidate = Math.round(randFloat(min, max));
    if (excludeValue !== undefined && candidate === excludeValue) continue;
    if (memberValues.some(mv => Math.abs(candidate - mv) < minDist)) continue;
    return candidate;
  }
  // Fallback (very rare): return value that at least isn't a member
  for (let att = 0; att < 500; att++) {
    const candidate = Math.round(randFloat(min, max));
    if (!memberValues.includes(candidate)) return candidate;
  }
  return Math.round(min + (max - min) * 0.5);
}

// Build probe value for a given probe type
function generateProbe(
  items: ArrayItem[],
  probeType: ProbeType,
  type: StimulusType,
): { probeValue: number; probeIsTarget: boolean } {
  const floatMean = items.reduce((s, i) => s + i.value, 0) / items.length;
  const intMean = Math.round(floatMean);

  if (probeType === 'target') {
    return { probeValue: items[Math.floor(Math.random() * items.length)].value, probeIsTarget: true };
  }
  if (probeType === 'foil-mean') {
    // The exact integer mean — guaranteed not in array by generateArray constraint
    return { probeValue: intMean, probeIsTarget: false };
  }
  // foil-non-mean: sufficiently different from every member AND ≠ intMean
  return { probeValue: generateNonMember(items, type, intMean), probeIsTarget: false };
}

// ──────────────────────────────────────────────
// Practice trial generation
// 10 trials: 5 ensemble + 5 recognition (shuffled)
// ──────────────────────────────────────────────

export function generatePracticeTrials(): Trial[] {
  const trials: Trial[] = [];
  let id = 1;

  // 5 ensemble
  const ensembleCfgs: { type: StimulusType; n: number }[] = [
    { type: 'circles',      n: 3 },
    { type: 'circles',      n: 7 },
    { type: 'line-lengths', n: 5 },
    { type: 'line-lengths', n: 3 },
    { type: 'circles',      n: 5 },
  ];
  for (const cfg of ensembleCfgs) {
    const items = generateArray(cfg.type, cfg.n);
    trials.push({
      trialId: id++, type: 'ensemble', stimulusType: cfg.type, statType: 'mean',
      items, trueValue: calcTrueMean(items), nItems: cfg.n, isPractice: true,
    });
  }

  // 5 recognition — cover all probe types
  const recCfgs: { type: StimulusType; probeType: ProbeType }[] = [
    { type: 'circles',      probeType: 'target'        },
    { type: 'line-lengths', probeType: 'foil-mean'     },
    { type: 'circles',      probeType: 'foil-non-mean' },
    { type: 'line-lengths', probeType: 'target'        },
    { type: 'circles',      probeType: 'foil-non-mean' },
  ];
  for (const cfg of recCfgs) {
    const n = SET_SIZES[Math.floor(Math.random() * SET_SIZES.length)];
    const items = generateArray(cfg.type, n);
    const { probeValue, probeIsTarget } = generateProbe(items, cfg.probeType, cfg.type);
    trials.push({
      trialId: id++, type: 'recognition', stimulusType: cfg.type,
      items, nItems: n, probeValue, probeIsTarget, probeType: cfg.probeType, isPractice: true,
    });
  }

  return shuffle(trials);
}

// ──────────────────────────────────────────────
// Main trial generation
// 3 × 2 × 2 × 6 = 72 trials
// (set sizes × types × question types × reps)
// ──────────────────────────────────────────────

export function generateMainTrials(): Trial[] {
  const TYPES: StimulusType[] = ['circles', 'line-lengths'];

  // Probe pool: 36 recognition trials, 12 each probe type
  const probePool: ProbeType[] = shuffle([
    ...Array<ProbeType>(12).fill('target'),
    ...Array<ProbeType>(12).fill('foil-mean'),
    ...Array<ProbeType>(12).fill('foil-non-mean'),
  ]);
  let probeIdx = 0;

  let id = 1;
  const ensembleTrials: EnsembleTrial[]    = [];
  const recTrials:      RecognitionTrial[] = [];

  for (const type of TYPES) {
    for (const sz of SET_SIZES) {
      for (let rep = 0; rep < 6; rep++) {
        // Ensemble
        const eItems = generateArray(type, sz);
        ensembleTrials.push({
          trialId: id++, type: 'ensemble', stimulusType: type, statType: 'mean',
          items: eItems, trueValue: calcTrueMean(eItems), nItems: sz, isPractice: false,
        });

        // Recognition
        const rItems = generateArray(type, sz);
        const pt = probePool[probeIdx++ % probePool.length];
        const { probeValue, probeIsTarget } = generateProbe(rItems, pt, type);
        recTrials.push({
          trialId: id++, type: 'recognition', stimulusType: type,
          items: rItems, nItems: sz, probeValue, probeIsTarget, probeType: pt, isPractice: false,
        });
      }
    }
  }

  return shuffle([...ensembleTrials, ...recTrials]);
}
