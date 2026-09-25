// Builds the ensemble-perception stimulus banks from the hand-built original.
//
//   node scripts/build-summary-stats-stimuli.mjs
//
// Writes lib/experiment-runtime/stimuli/summary-stats-arrays.ts.
//
// Every rule here is ported from lib/summary-stats/stimuli.ts — the value ranges, the
// constraint that the rounded mean is never itself a member, the 15%-of-range minimum
// distance a foil must keep from every member, and the three kinds of probe. They are not
// decoration: the finding is that people accept the MEAN of a set as having been present
// more often than an equally absent value, and that comparison collapses if the mean is
// sometimes genuinely present or if the control foil sits close to a real member.
//
// The original generates each array live. A definition draws from pools, so this banks many
// arrays per cell and lets each participant sample from them — which keeps what the live
// generation was for: no two people see the same set of displays.

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const VALUE_RANGES = {
  circles: { min: 15, max: 75 },
  'line-lengths': { min: 40, max: 200 },
};
const SET_SIZES = [3, 5, 7];
const MIN_DIST_FRAC = 0.15;
const PER_CELL = 24;

// Deterministic, so a rebuild does not silently reshuffle every stimulus in the repo.
let seed = 20260924;
const rand = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};
const randFloat = (min, max) => min + rand() * (max - min);

/** An array whose ROUNDED MEAN is not one of its own members, as the original requires. */
function generateArray(type, n) {
  const { min, max } = VALUE_RANGES[type];
  for (let attempt = 0; attempt < 200; attempt++) {
    const values = Array.from({ length: n }, () => Math.round(randFloat(min, max)));
    const mean = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
    // The whole paradigm rests on this: the mean has to be a value they never saw, or
    // "people say they saw the mean" is just "people saw the mean".
    if (!values.includes(mean)) return { values, mean };
  }
  return null;
}

/** A value at least 15% of the range away from every member — the control foil. */
function nonMember(values, type, exclude) {
  const { min, max } = VALUE_RANGES[type];
  const minDist = Math.round((max - min) * MIN_DIST_FRAC);
  for (let attempt = 0; attempt < 2000; attempt++) {
    const candidate = Math.round(randFloat(min, max));
    if (candidate === exclude) continue;
    if (values.some(v => Math.abs(candidate - v) < minDist)) continue;
    return candidate;
  }
  return null;
}

const SHAPE = { circles: 'circle', 'line-lengths': 'line' };
const PROMPT = {
  circles: { en: 'What was the average circle size?', he: 'מהו גודל העיגול הממוצע?' },
  'line-lengths': { en: 'What was the average line length?', he: 'מהו אורך הקו הממוצע?' },
};
const RECOGNITION_PROMPT = {
  en: 'Did this item appear in the display?',
  he: 'האם פריט זה הופיע בתצוגה?',
};

// What practice says afterwards. A RECOGNITION trial has a right answer, so it gets one;
// an ESTIMATE does not — the original shows the true average beside what was given, and
// calling a number within a tolerance "correct" would tell someone their guess was right
// when it may have been well off.
//
// An estimate is answered by dragging a shape until it looks right, so the correction is a
// shape too: the port draws what was chosen beside what the average was. There is nothing
// left for a sentence to add, and "the average was 43" cannot be compared to a drag anyway,
// so the words are empty on an estimate.
const ensembleFeedback = () => ({ en: '', he: '' });
const RECOGNITION_FEEDBACK = {
  right: { en: 'Correct', he: 'נכון' },
  wrong: { en: 'Incorrect', he: 'לא נכון' },
};

/** Shared by every trial of a cell: what to draw, what to ask, and how it is scored. */
function common(type, n, values) {
  const { min, max } = VALUE_RANGES[type];
  return {
    type,
    shape: SHAPE[type],
    n,
    // One object per item, so the array display can draw one shape per element with that
    // element's own size — the sizes ARE the design here.
    items: values.map(value => ({ value })),
    scaleMin: min,
    scaleMax: max,
    // A quarter of the range, which is what the original counts as a hit. Chosen so that
    // guessing scores 50% and the ensemble bar can be read against the recognition bar
    // beside it without a footnote.
    tolerance: Math.round((max - min) / 4),
  };
}

const pools = {};
const add = (name, item) => (pools[name] ??= []).push(item);

for (const type of Object.keys(VALUE_RANGES)) {
  const short = type === 'circles' ? 'Circles' : 'Lines';
  for (const n of SET_SIZES) {
    for (let i = 0; i < PER_CELL; i++) {
      // ── Ensemble: report the average ──
      const ens = generateArray(type, n);
      if (ens) {
        add(`ens${short}${n}`, {
          ...common(type, n, ens.values),
          question: 'ensemble',
          trueMean: ens.mean,
          feedbackRightEn: ensembleFeedback().en,
          feedbackRightHe: ensembleFeedback().he,
          feedbackWrongEn: ensembleFeedback().en,
          feedbackWrongHe: ensembleFeedback().he,
          // Every row carries every stored field, so a trial with no probe says so rather
          // than leaving a hole that reads as missing data in the export.
          probeType: 'none',
          promptEn: PROMPT[type].en,
          promptHe: PROMPT[type].he,
        });
      }

      // ── Recognition: was this one there? One pool per kind of probe, so the design can
      // draw an equal number of each rather than hoping a sample comes out balanced.
      for (const probeType of ['target', 'foilMean', 'foilNonMean']) {
        const rec = generateArray(type, n);
        if (!rec) continue;

        let probeValue;
        if (probeType === 'target') {
          probeValue = rec.values[Math.floor(rand() * rec.values.length)];
        } else if (probeType === 'foilMean') {
          probeValue = rec.mean;
        } else {
          probeValue = nonMember(rec.values, type, rec.mean);
          if (probeValue === null) continue;
        }

        add(`rec${short}${n}${probeType[0].toUpperCase()}${probeType.slice(1)}`, {
          ...common(type, n, rec.values),
          question: 'recognition',
          trueMean: rec.mean,
          feedbackRightEn: RECOGNITION_FEEDBACK.right.en,
          feedbackRightHe: RECOGNITION_FEEDBACK.right.he,
          feedbackWrongEn: RECOGNITION_FEEDBACK.wrong.en,
          feedbackWrongHe: RECOGNITION_FEEDBACK.wrong.he,
          probeValue,
          probeType,
          // Only a member of the array was actually shown. The mean was not, however
          // strongly it feels as though it was — which is the finding.
          probeIsTarget: probeType === 'target',
          answer: probeType === 'target' ? 'yes' : 'no',
          promptEn: RECOGNITION_PROMPT.en,
          promptHe: RECOGNITION_PROMPT.he,
        });
      }
    }
  }
}

// ── Practice: the original's ten fixed configurations ─────────────────────────
//
// Five ensemble and five recognition, covering both stimulus types and all three probe
// kinds, exactly as generatePracticeTrials lists them. Fixed rather than sampled because a
// practice that happened to omit recognition would leave a participant meeting it for the
// first time in a scored trial.
const PRACTICE_ENSEMBLE = [
  ['circles', 3], ['circles', 7], ['line-lengths', 5], ['line-lengths', 3], ['circles', 5],
];
const PRACTICE_RECOGNITION = [
  ['circles', 'target'], ['line-lengths', 'foilMean'], ['circles', 'foilNonMean'],
  ['line-lengths', 'target'], ['circles', 'foilNonMean'],
];

for (const [type, n] of PRACTICE_ENSEMBLE) {
  const arr = generateArray(type, n);
  add('practiceItems', {
    ...common(type, n, arr.values),
    question: 'ensemble',
    trueMean: arr.mean,
    probeType: 'none',
    feedbackRightEn: ensembleFeedback().en,
    feedbackRightHe: ensembleFeedback().he,
    feedbackWrongEn: ensembleFeedback().en,
    feedbackWrongHe: ensembleFeedback().he,
    promptEn: PROMPT[type].en,
    promptHe: PROMPT[type].he,
  });
}
for (const [type, probeType] of PRACTICE_RECOGNITION) {
  const n = SET_SIZES[Math.floor(rand() * SET_SIZES.length)];
  const arr = generateArray(type, n);
  const probeValue = probeType === 'target'
    ? arr.values[Math.floor(rand() * arr.values.length)]
    : probeType === 'foilMean' ? arr.mean : nonMember(arr.values, type, arr.mean);
  add('practiceItems', {
    ...common(type, n, arr.values),
    question: 'recognition',
    trueMean: arr.mean,
    feedbackRightEn: RECOGNITION_FEEDBACK.right.en,
    feedbackRightHe: RECOGNITION_FEEDBACK.right.he,
    feedbackWrongEn: RECOGNITION_FEEDBACK.wrong.en,
    feedbackWrongHe: RECOGNITION_FEEDBACK.wrong.he,
    probeValue,
    probeType,
    probeIsTarget: probeType === 'target',
    answer: probeType === 'target' ? 'yes' : 'no',
    promptEn: RECOGNITION_PROMPT.en,
    promptHe: RECOGNITION_PROMPT.he,
  });
}

// ── Emit ─────────────────────────────────────────────────────────────────────

const constName = name => `SS_${name.replace(/([A-Z])/g, '_$1').toUpperCase()}`;

const out = `// Ensemble-perception stimulus banks.
//
// GENERATED by scripts/build-summary-stats-stimuli.mjs — do not edit by hand.
//
// Ported from lib/summary-stats/stimuli.ts. Each item is one display: the sizes it shows,
// the true mean of those sizes, and for a recognition trial the probe and whether it was
// really there. The rounded mean is never one of an array's own members, which is the
// constraint the whole finding rests on.

export interface SsDisplay {
  type: string;
  shape: string;
  n: number;
  items: { value: number }[];
  scaleMin: number;
  scaleMax: number;
  /** How far an estimate may be from the true mean and still count — a quarter of the range. */
  tolerance: number;
  question: 'ensemble' | 'recognition';
  trueMean: number;
  probeValue?: number;
  probeType?: string;
  probeIsTarget?: boolean;
  answer?: string;
  promptEn: string;
  promptHe: string;
  /** What practice says afterwards — a verdict for recognition, the true average for an estimate. */
  feedbackRightEn: string;
  feedbackRightHe: string;
  feedbackWrongEn: string;
  feedbackWrongHe: string;
}

${Object.entries(pools).map(([name, rows]) =>
  `export const ${constName(name)}: SsDisplay[] = [\n`
  + rows.map(r => `  ${JSON.stringify(r)},`).join('\n')
  + '\n];',
).join('\n\n')}
`;

writeFileSync(join(process.cwd(), 'lib', 'experiment-runtime', 'stimuli', 'summary-stats-arrays.ts'), out);

for (const [name, rows] of Object.entries(pools)) console.log(`  ${name}: ${rows.length}`);
