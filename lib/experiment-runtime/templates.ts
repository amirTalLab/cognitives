// Worked definitions chosen to fill gaps, not to prove a point.
//
// round-trips.ts rebuilt three live experiments; generality-probe.ts pushed eight external
// paradigms at the schema to find what it could not express. Both were arguments about
// coverage. This file is different: it exists because generation quality tracks the
// availability of a close example far more than it tracks the type definitions.
//
// An audit of the eleven earlier definitions found features the schema supports but no
// example demonstrated — `stack`, `seriesBy`, `scatter`, rotation as an independent
// variable — and whole families with no representative at all: numerical cognition, mental
// imagery, hierarchical stimuli. A generator asked for any of those had nothing to copy.
//
// Deliberately NOT here, because the dashboard cannot measure their dependent variable:
//   - `wordList` responses (divergent thinking, free recall) — no words-per-trial measure
//   - `number` responses (magnitude estimation) — no mean-of-response measure
//   - `text` responses — same
// Adding one of those measures to aggregate.ts is what unblocks them, not another example.

import type { ExperimentDefinition } from './schema';

// 1. NAVON GLOBAL/LOCAL PRECEDENCE
// Fills: `stack` (a stimulus composed of several displays), `seriesBy` (a 2x2 read as two
// lines rather than four bars), and a derived factor computed from THREE sources.
//
// The compound letter is five rows of text: a large H built from small S's. Each row is a
// derived factor, which is the general pattern for any stimulus whose parts all follow
// from the same few factors — cheaper and safer than trying to compute strings at render
// time, which the schema deliberately cannot do.
const ROW_MAP = {
  'H|H': 'H   H', 'H|S': 'S   S',
  'S|H': 'HHHHH', 'S|S': 'SSSSS',
};

/** Rows of a big letter drawn in small ones. Index 2 is the crossbar or middle stroke. */
function navonRow(index: number): Record<string, string> {
  // H: two uprights with a crossbar. S: three horizontals joined by alternating sides.
  const shapes: Record<string, string[]> = {
    H: ['X   X', 'X   X', 'XXXXX', 'X   X', 'X   X'],
    S: ['XXXXX', 'X    ', 'XXXXX', '    X', 'XXXXX'],
  };
  const out: Record<string, string> = {};
  for (const global of ['H', 'S']) {
    for (const local of ['H', 'S']) {
      out[`${global}|${local}`] = shapes[global][index].replace(/X/g, local);
    }
  }
  return out;
}

export const NAVON: ExperimentDefinition = {
  version: 1,
  slug: 'navonPrecedence',
  title: 'Global and Local Processing',
  titleHe: 'עיבוד גלובלי ומקומי',
  category: 'PERCEPTION',
  instructions: {
    he: 'בכל ניסיון ייאמר לכם אם לזהות את האות הגדולה או את האותיות הקטנות. לחצו על האות שזיהיתם.',
    en: 'Each trial tells you whether to identify the large letter or the small ones. Press the letter you saw.',
  },
  factors: [
    { name: 'attendTo', levels: ['global', 'local'] },
    { name: 'globalLetter', levels: ['H', 'S'] },
    { name: 'localLetter', levels: ['H', 'S'] },
    // Congruency is not crossed — it follows from the two letters. Crossing it would
    // produce cells that cannot exist, such as "congruent, global H, local S".
    { name: 'congruency', derivedFrom: ['globalLetter', 'localLetter'], mapping: {
      'H|H': 'congruent', 'H|S': 'incongruent', 'S|H': 'incongruent', 'S|S': 'congruent',
    } },
    // The correct answer depends on which level the participant was told to attend to.
    { name: 'target', derivedFrom: ['attendTo', 'globalLetter', 'localLetter'], mapping: {
      'global|H|H': 'H', 'global|H|S': 'H', 'global|S|H': 'S', 'global|S|S': 'S',
      'local|H|H': 'H',  'local|H|S': 'S',  'local|S|H': 'H',  'local|S|S': 'S',
    } },
    { name: 'row1', derivedFrom: ['globalLetter', 'localLetter'], mapping: navonRow(0) },
    { name: 'row2', derivedFrom: ['globalLetter', 'localLetter'], mapping: navonRow(1) },
    { name: 'row3', derivedFrom: ['globalLetter', 'localLetter'], mapping: navonRow(2) },
    { name: 'row4', derivedFrom: ['globalLetter', 'localLetter'], mapping: navonRow(3) },
    { name: 'row5', derivedFrom: ['globalLetter', 'localLetter'], mapping: navonRow(4) },
  ],
  repetitions: 4,
  practice: { count: 8, feedback: true },
  trial: {
    phases: [
      { name: 'cue', display: { kind: 'text', text: '{attendTo}', size: 28 }, durationMs: 800 },
      { name: 'fixation', display: { kind: 'fixation' }, durationMs: 400 },
      {
        name: 'stimulus',
        awaitsResponse: true,
        startsClock: true,
        display: {
          kind: 'stack',
          items: [
            { kind: 'text', text: '{row1}', font: 'mono', size: 28 },
            { kind: 'text', text: '{row2}', font: 'mono', size: 28 },
            { kind: 'text', text: '{row3}', font: 'mono', size: 28 },
            { kind: 'text', text: '{row4}', font: 'mono', size: 28 },
            { kind: 'text', text: '{row5}', font: 'mono', size: 28 },
          ],
        },
      },
    ],
    response: {
      kind: 'choice',
      layout: 'row',
      options: [{ value: 'H', label: 'H', key: 'h' }, { value: 'S', label: 'S', key: 's' }],
    },
    correct: { kind: 'matchesFactor', factor: 'target' },
    itiMs: 400,
  },
  store: ['attendTo', 'congruency', 'globalLetter', 'localLetter'],
  dashboard: {
    charts: [
      // seriesBy turns a 2x2 into two readable lines instead of four unlabelled bars —
      // the interaction is the finding, so the chart has to show it as one.
      { title: 'RT by level and congruency', kind: 'bar', groupBy: 'attendTo', seriesBy: 'congruency', measure: 'meanRt', yLabel: 'RT (ms)', errorBars: true },
      { title: 'Accuracy by level', kind: 'bar', groupBy: 'attendTo', measure: 'accuracy', yLabel: 'Accuracy (%)' },
    ],
  },
  mock: {
    participants: 24,
    baseRtMs: 520,
    baseAccuracy: 0.95,
    effects: [
      { factor: 'attendTo', level: 'local', rtDeltaMs: 70, accuracyDelta: -0.03 },
      { factor: 'congruency', level: 'incongruent', rtDeltaMs: 45, accuracyDelta: -0.04 },
    ],
  },
};

// 2. NUMERICAL DISTANCE EFFECT
// Fills: a parametric derived factor (numeric distance from two crossed numbers), the
// `scatter` chart, `groupBy: 'participant'`, and `exclude` — the cross contains six cells
// the task has no answer for, and this is the design that motivated the feature.
//
// Also the first numerical-cognition example. The design is small on purpose — it is meant
// to be copied for any "compare two values, RT falls with difference" paradigm.
export const NUMBER_COMPARISON: ExperimentDefinition = {
  version: 1,
  slug: 'numberDistance',
  title: 'Numerical Distance Effect',
  titleHe: 'אפקט המרחק המספרי',
  category: 'THINKING',
  instructions: {
    he: 'בחרו את המספר הגדול מבין השניים, מהר ככל האפשר.',
    en: 'Choose the larger of the two numbers, as quickly as you can.',
  },
  factors: [
    { name: 'left', levels: [2, 3, 4, 6, 7, 8] },
    { name: 'right', levels: [2, 3, 4, 6, 7, 8] },
    // Equal pairs are removed by `exclude` below, so distance 0 never occurs — but the
    // mapping must still cover every cell of the cross, because it is checked against the
    // full cross rather than the surviving trials.
    { name: 'distance', derivedFrom: ['left', 'right'], mapping: {
      '2|2': 0, '2|3': 1, '2|4': 2, '2|6': 4, '2|7': 5, '2|8': 6,
      '3|2': 1, '3|3': 0, '3|4': 1, '3|6': 3, '3|7': 4, '3|8': 5,
      '4|2': 2, '4|3': 1, '4|4': 0, '4|6': 2, '4|7': 3, '4|8': 4,
      '6|2': 4, '6|3': 3, '6|4': 2, '6|6': 0, '6|7': 1, '6|8': 2,
      '7|2': 5, '7|3': 4, '7|4': 3, '7|6': 1, '7|7': 0, '7|8': 1,
      '8|2': 6, '8|3': 5, '8|4': 4, '8|6': 2, '8|7': 1, '8|8': 0,
    } },
    { name: 'larger', derivedFrom: ['left', 'right'], mapping: {
      '2|2': 'same', '2|3': 'right', '2|4': 'right', '2|6': 'right', '2|7': 'right', '2|8': 'right',
      '3|2': 'left', '3|3': 'same',  '3|4': 'right', '3|6': 'right', '3|7': 'right', '3|8': 'right',
      '4|2': 'left', '4|3': 'left',  '4|4': 'same',  '4|6': 'right', '4|7': 'right', '4|8': 'right',
      '6|2': 'left', '6|3': 'left',  '6|4': 'left',  '6|6': 'same',  '6|7': 'right', '6|8': 'right',
      '7|2': 'left', '7|3': 'left',  '7|4': 'left',  '7|6': 'left',  '7|7': 'same',  '7|8': 'right',
      '8|2': 'left', '8|3': 'left',  '8|4': 'left',  '8|6': 'left',  '8|7': 'left',  '8|8': 'same',
    } },
  ],
  // "Which is larger" has no answer when the two numbers are equal, and the distance
  // effect is defined on unequal pairs. Dropping the six diagonal cells is the honest
  // version; scoring them arbitrarily was the bug the mock data caught.
  exclude: [
    { left: 2, right: 2 }, { left: 3, right: 3 }, { left: 4, right: 4 },
    { left: 6, right: 6 }, { left: 7, right: 7 }, { left: 8, right: 8 },
  ],
  repetitions: 1,
  practice: { count: 6, feedback: true },
  trial: {
    phases: [
      { name: 'fixation', display: { kind: 'fixation' }, durationMs: 400 },
      {
        name: 'stimulus',
        awaitsResponse: true,
        startsClock: true,
        display: {
          kind: 'pair',
          gap: 80,
          left: { kind: 'text', text: '{left}', size: 64 },
          right: { kind: 'text', text: '{right}', size: 64 },
        },
      },
    ],
    response: {
      kind: 'choice',
      layout: 'sides',
      options: [
        { value: 'left', label: 'Left', labelHe: 'שמאל' },
        { value: 'right', label: 'Right', labelHe: 'ימין' },
      ],
    },
    correct: { kind: 'matchesFactor', factor: 'larger' },
    itiMs: 350,
  },
  store: ['left', 'right', 'distance'],
  dashboard: {
    charts: [
      { title: 'RT by numerical distance', kind: 'line', groupBy: 'distance', measure: 'meanRt', yLabel: 'RT (ms)' },
      // Every participant as one point. The teaching value is seeing that the group effect
      // is not an artefact of two outliers, which a bar of means cannot show.
      { title: 'Mean RT per participant', kind: 'scatter', groupBy: 'participant', measure: 'meanRt', yLabel: 'RT (ms)' },
    ],
  },
  mock: {
    participants: 20,
    baseRtMs: 600,
    baseAccuracy: 0.97,
    effects: [
      { factor: 'distance', level: '1', rtDeltaMs: 120, accuracyDelta: -0.06 },
      { factor: 'distance', level: '2', rtDeltaMs: 70, accuracyDelta: -0.03 },
      { factor: 'distance', level: '5', rtDeltaMs: -30 },
      { factor: 'distance', level: '6', rtDeltaMs: -40 },
    ],
  },
};

// 3. MENTAL ROTATION
// Fills: rotation as the independent variable, and the mental-imagery family.
//
// Uses `shape` rather than images on purpose. Shepard and Metzler's block figures cannot be
// drawn from the primitives, and this is the version that runs with no files at all — the
// image version is the same definition with an `assets` manifest and a pool of pictures,
// which is what a lecturer who has the figures should build instead.
export const MENTAL_ROTATION: ExperimentDefinition = {
  version: 1,
  slug: 'mentalRotation',
  title: 'Mental Rotation',
  titleHe: 'סיבוב מנטלי',
  category: 'IMAGINATION',
  instructions: {
    he: 'שתי הצורות זהות או משוקפות? סובבו את הצורה הימנית בדמיונכם כדי להשוות.',
    en: 'Are the two shapes the same, or mirror images? Rotate the right-hand one in your mind to compare.',
  },
  factors: [
    { name: 'angle', levels: [0, 60, 120, 180] },
    { name: 'mirrored', levels: [false, true] },
    { name: 'points', levels: [5, 7] },
    // A mirrored figure is drawn by flipping the rotation, which is the only transform the
    // shape renderer takes — enough to make the same/different judgement real.
    { name: 'rightAngle', derivedFrom: ['angle', 'mirrored'], mapping: {
      '0|false': 0,     '0|true': 0,
      '60|false': 60,   '60|true': -60,
      '120|false': 120, '120|true': -120,
      '180|false': 180, '180|true': -180,
    } },
  ],
  repetitions: 3,
  practice: { count: 8, feedback: true },
  trial: {
    phases: [
      { name: 'fixation', display: { kind: 'fixation' }, durationMs: 500 },
      {
        name: 'stimulus',
        awaitsResponse: true,
        startsClock: true,
        display: {
          kind: 'pair',
          gap: 100,
          left: { kind: 'shape', shape: 'star', size: 120, points: '{points}', color: 'purple' },
          right: { kind: 'shape', shape: 'star', size: 120, points: '{points}', rotation: '{rightAngle}', color: 'purple' },
        },
      },
    ],
    response: {
      kind: 'choice',
      layout: 'row',
      options: [
        { value: 'same', label: 'Same', labelHe: 'זהה' },
        { value: 'mirror', label: 'Mirrored', labelHe: 'משוקף' },
      ],
    },
    correct: { kind: 'mapping', factor: 'mirrored', expect: { false: 'same', true: 'mirror' } },
    itiMs: 400,
  },
  store: ['angle', 'mirrored'],
  dashboard: {
    charts: [
      // The finding is that this line is straight: RT rises linearly with angle, as though
      // the figure were being physically turned.
      { title: 'RT by rotation angle', kind: 'line', groupBy: 'angle', measure: 'meanRt', yLabel: 'RT (ms)' },
      { title: 'Accuracy by angle', kind: 'bar', groupBy: 'angle', measure: 'accuracy', yLabel: 'Accuracy (%)', errorBars: true },
    ],
  },
  mock: {
    participants: 20,
    baseRtMs: 900,
    baseAccuracy: 0.94,
    effects: [
      { factor: 'angle', level: '60', rtDeltaMs: 300, accuracyDelta: -0.02 },
      { factor: 'angle', level: '120', rtDeltaMs: 620, accuracyDelta: -0.05 },
      { factor: 'angle', level: '180', rtDeltaMs: 900, accuracyDelta: -0.08 },
    ],
  },
};

export const TEMPLATES = [NAVON, NUMBER_COMPARISON, MENTAL_ROTATION];
