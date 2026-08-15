// Round-trip tests for the schema.
//
// The catalogue in docs/PARADIGM-COVERAGE.md is judgement. This is evidence: three
// experiments that already exist in this repo, written as definitions. If the definition
// produces the same design as the hand-written code — same factors, same trial count, same
// timings, same measure — the model holds. If it cannot, no coverage score saves it.
//
// Chosen to stress different parts: bouba-kiki has no correct answer, word superiority
// samples from a pool and transforms the item per condition, visual search generates a
// display from numeric factors.

import type { ExperimentDefinition } from './schema';

// ─── 1. Bouba-Kiki ────────────────────────────────────────────────────────────
// Stresses: a preference task with no correct answer, counterbalanced position, and
// control trials that must sit at chance.
// Original: app/bouba-kiki/, 2AFC rounded vs spiky, ~95% conventional mapping.

export const BOUBA_KIKI: ExperimentDefinition = {
  version: 1,
  slug: 'boubaKiki',
  title: 'Bouba-Kiki Effect',
  titleHe: 'אפקט בובה-קיקי',
  category: 'LANGUAGE',
  instructions: {
    he: 'תראו שתי צורות. אחת נקראת "בובה" והשנייה "קיקי". בחרו איזו צורה היא "בובה". אין תשובה נכונה.',
    en: 'You will see two shapes. One is called "bouba", the other "kiki". Choose which is "bouba". There is no right answer.',
  },

  factors: [
    { name: 'pairType', levels: ['contrast', 'control-rounded', 'control-spiky'] },
    { name: 'roundedSide', levels: ['left', 'right'], counterbalance: true },
  ],
  repetitions: 6,
  practice: { count: 4, feedback: false },

  trial: {
    phases: [
      { name: 'fixation', display: { kind: 'fixation' }, durationMs: 500 },
      {
        name: 'choice',
        awaitsResponse: true,
        startsClock: true,
        display: {
          kind: 'pair',
          gap: 40,
          left: { kind: 'shape', shape: 'blob', size: 140, color: '#a78bfa' },
          right: { kind: 'shape', shape: 'star', size: 140, color: '#a78bfa', points: 7 },
        },
      },
    ],
    response: {
      kind: 'choice',
      layout: 'sides',
      options: [
        { value: 'left', label: 'Left shape', labelHe: 'הצורה השמאלית' },
        { value: 'right', label: 'Right shape', labelHe: 'הצורה הימנית' },
      ],
    },
    // No right answer, but scoring against roundedSide makes is_correct mean 'chose the
    // rounded shape' — which is precisely the measure. correctMeans relabels the axis.
    correct: { kind: 'matchesFactor', factor: 'roundedSide' },
    itiMs: 300,
  },

  store: ['pairType', 'roundedSide'],
  correctMeans: 'Chose the rounded shape as bouba',

  dashboard: {
    charts: [
      {
        title: 'Conventional mapping by trial type',
        kind: 'bar',
        groupBy: 'pairType',
        measure: 'accuracy',
        referenceLine: 50,
        yLabel: 'Chose rounded = bouba (%)',
        errorBars: true,
      },
      {
        title: 'Individual participants',
        kind: 'histogram',
        groupBy: 'participant',
        measure: 'accuracy',
        referenceLine: 50,
      },
    ],
  },
  mock: {
    participants: 15,
    baseRtMs: 1200,
    baseAccuracy: 0.93,   // the contrast pairs: ~95% conventional
    effects: [
      // Same-class controls have no rounded/spiky contrast, so they sit at chance.
      { factor: 'pairType', level: 'control-rounded', accuracyDelta: -0.43 },
      { factor: 'pairType', level: 'control-spiky', accuracyDelta: -0.43 },
    ],
  },
};

// ─── 2. Word Superiority ──────────────────────────────────────────────────────
// Stresses: sampling from a pool, and a display that differs per condition while drawing
// on the same item. Original: lib/word-superiority/stimuli.ts — 60 main trials, 20 per
// condition, 150ms display then a 500ms mask.

export const WORD_SUPERIORITY: ExperimentDefinition = {
  version: 1,
  slug: 'wordSuperiority',
  title: 'Word Superiority Effect',
  titleHe: 'אפקט עליונות המילה',
  category: 'PERCEPTION',
  instructions: {
    he: 'תראו רצף אותיות להרף עין, ואז שתי אותיות. בחרו איזו אות הופיעה במיקום המסומן.',
    en: 'A letter string flashes briefly, then two letters appear. Choose which letter was in the marked position.',
  },

  pools: {
    // The full set from lib/word-superiority/stimuli.ts. Each item carries all three
    // renderings, so the condition selects which one is shown rather than needing a
    // separate pool per condition.
    items: [
      { word: 'אחד', pseudo: 'כודג', letters: '__ד', target: 'ד', foil: 'ר' },
      { word: 'כבד', pseudo: 'תידצ', letters: '__ד', target: 'ד', foil: 'ר' },
      { word: 'עוד', pseudo: 'לודט', letters: '__ד', target: 'ד', foil: 'ר' },
      { word: 'עבד', pseudo: 'נידג', letters: '__ד', target: 'ד', foil: 'ר' },
      { word: 'לוח', pseudo: 'פוחס', letters: '__ח', target: 'ח', foil: 'ה' },
      { word: 'פרח', pseudo: 'זיחג', letters: '__ח', target: 'ח', foil: 'ה' },
      { word: 'נוח', pseudo: 'תוחק', letters: '__ח', target: 'ח', foil: 'ה' },
      { word: 'ערב', pseudo: 'זולב', letters: '__ב', target: 'ב', foil: 'ך' },
      { word: 'חשב', pseudo: 'תירב', letters: '__ב', target: 'ב', foil: 'ך' },
      { word: 'שבת', pseudo: 'כיתג', letters: '__ת', target: 'ת', foil: 'ח' },
      { word: 'ספר', pseudo: 'נירג', letters: '__ר', target: 'ר', foil: 'ק' },
      { word: 'ארג', pseudo: 'תוגק', letters: '__ג', target: 'ג', foil: 'ז' },
      { word: 'מורה', pseudo: 'טורק', letters: '__רה', target: 'ר', foil: 'נ' },
      { word: 'כיתה', pseudo: 'ליתג', letters: '__תה', target: 'ת', foil: 'נ' },
      { word: 'חיטה', pseudo: 'זיטק', letters: '__טה', target: 'ט', foil: 'ד' },
      { word: 'מיטה', pseudo: 'ריטג', letters: '__טה', target: 'ט', foil: 'ל' },
      { word: 'חובה', pseudo: 'זובק', letters: '__בה', target: 'ב', foil: 'ל' },
      { word: 'קורה', pseudo: 'לורג', letters: '__רה', target: 'ר', foil: 'פ' },
      { word: 'שומר', pseudo: 'גומש', letters: '__מר', target: 'מ', foil: 'כ' },
      { word: 'דומה', pseudo: 'תומק', letters: '__מה', target: 'מ', foil: 'ח' },
    ],
  },

    factors: [
    { name: 'condition', levels: ['word', 'pseudoword', 'single-letter'] },
    { name: 'item', from: 'items', sample: 20 },
    { name: 'shown', derivedFrom: ['condition'], mapping: {
      'word': '{item.word}', 'pseudoword': '{item.pseudo}', 'single-letter': '{item.letters}',
    } },
  ],
  repetitions: 1,
  practice: { count: 6, feedback: true },

  trial: {
    phases: [
      { name: 'fixation', display: { kind: 'fixation' }, durationMs: 500 },
      { name: 'stimulus', display: { kind: 'text', text: '{shown}', font: 'mono', size: 48 }, durationMs: 150 },
      { name: 'mask', display: { kind: 'mask', pattern: '###' }, durationMs: 500 },
      { name: 'choice', awaitsResponse: true, startsClock: true, display: { kind: 'blank' } },
    ],
    response: {
      kind: 'choice',
      layout: 'row',
      options: [
        { value: '{item.target}', label: '{item.target}' },
        { value: '{item.foil}', label: '{item.foil}' },
      ],
    },
    correct: { kind: 'matchesFactor', factor: 'item.target' },
    itiMs: 300,
  },

  store: ['condition', 'shown', 'item.target', 'item.foil'],

  dashboard: {
    charts: [
      {
        title: 'Accuracy by condition',
        kind: 'bar',
        groupBy: 'condition',
        measure: 'accuracy',
        yLabel: 'Accuracy (%)',
        errorBars: true,
      },
      { title: 'Reaction time by condition', kind: 'bar', groupBy: 'condition', measure: 'meanRt', yLabel: 'RT (ms)', errorBars: true },
    ],
  },
  mock: {
    participants: 15,
    baseRtMs: 650,
    baseAccuracy: 0.85,   // words
    effects: [
      { factor: 'condition', level: 'pseudoword', accuracyDelta: -0.10, rtDeltaMs: 50 },
      { factor: 'condition', level: 'single-letter', accuracyDelta: -0.17, rtDeltaMs: 70 },
    ],
  },
};

// ─── 3. Visual Search ─────────────────────────────────────────────────────────
// Stresses: numeric factors driving a generated display, and a large crossed design.
// Original: lib/visual-search/experiment.ts — 4x4x2 crossed, 4 repetitions = 128 trials.

export const VISUAL_SEARCH: ExperimentDefinition = {
  version: 1,
  slug: 'visualSearch',
  title: 'Visual Search',
  titleHe: 'חיפוש חזותי',
  category: 'ATTENTION',
  instructions: {
    he: 'חפשו את הפריט המטרה בין המסיחים. לחצו "יש" אם הוא נמצא, "אין" אם לא.',
    en: 'Search for the target among the distractors. Press "present" if it is there, "absent" if not.',
  },

  factors: [
    { name: 'targetSetSize', levels: [1, 2, 4, 8] },
    { name: 'distractorSetSize', levels: [1, 2, 4, 8] },
    { name: 'targetPresent', levels: [true, false] },
  ],
  repetitions: 4, // 4 x 4 x 2 x 4 = 128 trials, matching the original
  practice: { count: 8, feedback: true },

  trial: {
    phases: [
      { name: 'fixation', display: { kind: 'fixation' }, durationMs: 500 },
      {
        name: 'search',
        awaitsResponse: true,
        startsClock: true,
        display: {
          kind: 'array',
          count: '{targetSetSize}',
          item: { kind: 'shape', shape: 'square', color: '#3b82f6', size: 24 },
          distractorCount: '{distractorSetSize}',
          distractor: { kind: 'shape', shape: 'square', color: '#ef4444', size: 24 },
          area: { width: 600, height: 400 },
        },
      },
    ],
    response: {
      kind: 'choice',
      layout: 'row',
      options: [
        { value: 'present', label: 'Present', labelHe: 'יש', key: 'j' },
        { value: 'absent', label: 'Absent', labelHe: 'אין', key: 'f' },
      ],
    },
    correct: { kind: 'mapping', factor: 'targetPresent', expect: { true: 'present', false: 'absent' } },
    itiMs: 300,
  },

  store: ['targetSetSize', 'distractorSetSize', 'targetPresent'],

  dashboard: {
    charts: [
      {
        title: 'Reaction time by set size',
        kind: 'line',
        groupBy: 'distractorSetSize',
        seriesBy: 'targetPresent',
        measure: 'meanRt',
        yLabel: 'RT (ms)',
      },
      { title: 'Accuracy by set size', kind: 'bar', groupBy: 'distractorSetSize', measure: 'accuracy', yLabel: 'Accuracy (%)', errorBars: true },
    ],
  },
};

// Visual search: RT rises with set size, and absent trials need an exhaustive scan.
VISUAL_SEARCH.mock = {
  participants: 15,
  baseRtMs: 520,
  baseAccuracy: 0.94,
  effects: [
    { factor: 'distractorSetSize', level: '2', rtDeltaMs: 60 },
    { factor: 'distractorSetSize', level: '4', rtDeltaMs: 160 },
    { factor: 'distractorSetSize', level: '8', rtDeltaMs: 340 },
    { factor: 'targetPresent', level: 'false', rtDeltaMs: 220 },
  ],
};

export const ROUND_TRIPS = [BOUBA_KIKI, WORD_SUPERIORITY, VISUAL_SEARCH];
