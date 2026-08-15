// Generality probe.
//
// The three round-trips prove the schema can express experiments it was derived from,
// which is a weak test — of course it fits its own training set. This file is the real
// one: eight paradigms that are NOT in this repo, written as definitions to find out what
// the schema cannot say.
//
// Chosen to stress different axes on purpose. Anything that needed a schema change is
// marked NEEDED-CHANGE with what was added, so the cost of "one more paradigm" is visible
// rather than assumed.

import type { ExperimentDefinition } from './schema';

// 1. STROOP — colour naming with a conflicting word.
// Stresses: a display whose colour comes from one factor and text from another.
// Fit: no change needed.
export const STROOP: ExperimentDefinition = {
  version: 1,
  slug: 'stroopClassic',
  title: 'Stroop Effect',
  titleHe: 'אפקט סטרופ',
  category: 'EXECUTIVE CONTROL',
  instructions: {
    he: 'תגידו את צבע הדיו של המילה, לא את המילה עצמה.',
    en: 'Name the ink colour of the word, not the word itself.',
  },
  factors: [
    { name: 'congruency', levels: ['congruent', 'incongruent', 'neutral'] },
    { name: 'inkColor', levels: ['red', 'green', 'blue', 'yellow'] },
    // The word is determined by the other two, so it is derived rather than crossed.
    { name: 'word', derivedFrom: ['congruency', 'inkColor'], mapping: {
      'congruent|red': 'אדום',   'congruent|green': 'ירוק',  'congruent|blue': 'כחול',   'congruent|yellow': 'צהוב',
      'incongruent|red': 'ירוק', 'incongruent|green': 'כחול','incongruent|blue': 'צהוב', 'incongruent|yellow': 'אדום',
      'neutral|red': 'שולחן',    'neutral|green': 'שולחן',   'neutral|blue': 'שולחן',    'neutral|yellow': 'שולחן',
    } },
  ],
  repetitions: 5,
  practice: { count: 8, feedback: true },
  trial: {
    phases: [
      { name: 'fixation', display: { kind: 'fixation' }, durationMs: 500 },
      {
        name: 'stimulus',
        awaitsResponse: true,
        startsClock: true,
        display: { kind: 'text', text: '{word}', color: '{inkColor}', size: 56 },
      },
    ],
    response: {
      kind: 'choice',
      layout: 'row',
      options: [
        { value: 'red', label: 'Red', labelHe: 'אדום' },
        { value: 'green', label: 'Green', labelHe: 'ירוק' },
        { value: 'blue', label: 'Blue', labelHe: 'כחול' },
        { value: 'yellow', label: 'Yellow', labelHe: 'צהוב' },
      ],
    },
    correct: { kind: 'matchesFactor', factor: 'inkColor' },
    itiMs: 400,
  },
  store: ['congruency', 'inkColor', 'word'],
  dashboard: {
    charts: [
      { title: 'RT by congruency', kind: 'bar', groupBy: 'congruency', measure: 'meanRt', yLabel: 'RT (ms)', errorBars: true },
      { title: 'Accuracy by congruency', kind: 'bar', groupBy: 'congruency', measure: 'accuracy', yLabel: 'Accuracy (%)', errorBars: true },
    ],
  },
};

// 2. ERIKSEN FLANKER
// Stresses: a stimulus built by composing several items in a row.
// Fit: no change needed — 'stack' composes, and text interpolation carries the arrows.
export const FLANKER: ExperimentDefinition = {
  version: 1,
  slug: 'flanker',
  title: 'Eriksen Flanker Task',
  titleHe: 'משימת פלנקר',
  category: 'EXECUTIVE CONTROL',
  instructions: {
    he: 'התייחסו רק לחץ המרכזי. לאיזה כיוון הוא מצביע?',
    en: 'Respond only to the centre arrow. Which way does it point?',
  },
  factors: [
    { name: 'congruency', levels: ['congruent', 'incongruent', 'neutral'] },
    { name: 'targetDirection', levels: ['left', 'right'] },
    { name: 'flankerString', derivedFrom: ['congruency', 'targetDirection'], mapping: {
      'congruent|left': '◀◀◀◀◀',   'congruent|right': '▶▶▶▶▶',
      'incongruent|left': '▶▶◀▶▶', 'incongruent|right': '◀◀▶◀◀',
      'neutral|left': '——◀——',     'neutral|right': '——▶——',
    } },
  ],
  repetitions: 10,
  practice: { count: 8, feedback: true },
  trial: {
    phases: [
      { name: 'fixation', display: { kind: 'fixation' }, durationMs: 400 },
      {
        name: 'stimulus',
        awaitsResponse: true,
        startsClock: true,
        display: { kind: 'text', text: '{flankerString}', font: 'mono', size: 48 },
      },
    ],
    response: {
      kind: 'choice',
      layout: 'sides',
      options: [
        { value: 'left', label: '◀', key: 'f' },
        { value: 'right', label: '▶', key: 'j' },
      ],
    },
    correct: { kind: 'matchesFactor', factor: 'targetDirection' },
    itiMs: 300,
  },
  store: ['congruency', 'targetDirection'],
  dashboard: {
    charts: [{ title: 'RT by congruency', kind: 'bar', groupBy: 'congruency', measure: 'meanRt', yLabel: 'RT (ms)', errorBars: true }],
  },
};

// 3. POSNER CUEING
// Stresses: SOA is a FACTOR that must set a PHASE DURATION.
// NEEDED-CHANGE: durationMs had to accept a '{factor}' string, not just a number.
export const POSNER: ExperimentDefinition = {
  version: 1,
  slug: 'posnerClassic',
  title: 'Spatial Cueing',
  titleHe: 'הכוונה מרחבית',
  category: 'ATTENTION',
  instructions: {
    he: 'הביטו בנקודת המרכז. כשמופיע היעד, לחצו באיזה צד הוא הופיע.',
    en: 'Keep your eyes on the centre. When the target appears, press which side it was on.',
  },
  factors: [
    { name: 'validity', levels: ['valid', 'invalid'] },
    { name: 'soa', levels: [300, 500] },
    { name: 'targetSide', levels: ['left', 'right'], counterbalance: true },
    { name: 'cueSide', derivedFrom: ['validity', 'targetSide'], mapping: {
      'valid|left': 'left',    'valid|right': 'right',
      'invalid|left': 'right', 'invalid|right': 'left',
    } },
  ],
  repetitions: 14,
  practice: { count: 8, feedback: true },
  trial: {
    phases: [
      { name: 'fixation', display: { kind: 'fixation' }, durationMs: 500 },
      { name: 'cue', display: { kind: 'positioned', at: '{cueSide}', content: { kind: 'shape', shape: 'square', size: 40, color: '#a78bfa' } }, durationMs: 100 },
      // The cue-target interval IS the manipulation, so its duration comes from a factor.
      { name: 'soa', display: { kind: 'fixation' }, durationMs: '{soa}' },
      {
        name: 'target',
        awaitsResponse: true,
        startsClock: true,
        display: { kind: 'positioned', at: '{targetSide}', content: { kind: 'shape', shape: 'circle', size: 30, color: '#f8fafc' } },
      },
    ],
    response: {
      kind: 'choice',
      layout: 'sides',
      options: [
        { value: 'left', label: 'Left', labelHe: 'שמאל', key: 'f' },
        { value: 'right', label: 'Right', labelHe: 'ימין', key: 'j' },
      ],
    },
    correct: { kind: 'matchesFactor', factor: 'targetSide' },
    itiMs: 500,
  },
  store: ['validity', 'soa', 'targetSide'],
  dashboard: {
    charts: [
      { title: 'RT by validity', kind: 'bar', groupBy: 'validity', measure: 'meanRt', seriesBy: 'soa', yLabel: 'RT (ms)', errorBars: true },
    ],
  },
};

// 4. LEXICAL DECISION
// Stresses: pool sampling with a correctness mapping derived from the pool item.
// Fit: no change needed.
export const LEXICAL_DECISION: ExperimentDefinition = {
  version: 1,
  slug: 'lexicalDecision',
  title: 'Lexical Decision',
  titleHe: 'החלטה לקסיקלית',
  category: 'LANGUAGE',
  instructions: {
    he: 'האם רצף האותיות הוא מילה אמיתית?',
    en: 'Is the letter string a real word?',
  },
  pools: {
    items: [
      { text: 'שולחן', isWord: true, frequency: 'high' },
      { text: 'מרפסת', isWord: true, frequency: 'low' },
      { text: 'שולתן', isWord: false, frequency: 'none' },
    ],
  },
  // A real definition carries the full item set; this probe holds three.
  factors: [{ name: 'item', from: 'items', sample: 3 }],
  repetitions: 20,
  practice: { count: 6, feedback: true },
  trial: {
    phases: [
      { name: 'fixation', display: { kind: 'fixation' }, durationMs: 500 },
      { name: 'stimulus', awaitsResponse: true, startsClock: true, display: { kind: 'text', text: '{item.text}', size: 48 } },
    ],
    response: {
      kind: 'choice',
      layout: 'row',
      options: [
        { value: 'word', label: 'Word', labelHe: 'מילה', key: 'j' },
        { value: 'nonword', label: 'Not a word', labelHe: 'לא מילה', key: 'f' },
      ],
    },
    correct: { kind: 'mapping', factor: 'item.isWord', expect: { true: 'word', false: 'nonword' } },
    itiMs: 300,
  },
  store: ['item.text', 'item.isWord', 'item.frequency'],
  dashboard: {
    charts: [{ title: 'RT by word frequency', kind: 'bar', groupBy: 'item.frequency', measure: 'meanRt', yLabel: 'RT (ms)', errorBars: true }],
  },
};

// 5. SEMANTIC PRIMING
// Stresses: two sequential stimulus displays within one trial.
// Fit: no change needed — phases already sequence arbitrarily.
export const SEMANTIC_PRIMING: ExperimentDefinition = {
  version: 1,
  slug: 'semanticPriming',
  title: 'Semantic Priming',
  titleHe: 'הצפה סמנטית',
  category: 'LANGUAGE',
  instructions: { he: 'האם המילה השנייה היא מילה אמיתית?', en: 'Is the second word a real word?' },
  pools: { pairs: [
    { prime: 'רופא', target: 'אחות', related: true, targetIsWord: true },
    { prime: 'שולחן', target: 'אחות', related: false, targetIsWord: true },
  ] },
  factors: [{ name: 'pair', from: 'pairs', sample: 2 }],
  repetitions: 20,
  trial: {
    phases: [
      { name: 'fixation', display: { kind: 'fixation' }, durationMs: 500 },
      { name: 'prime', display: { kind: 'text', text: '{pair.prime}', size: 44 }, durationMs: 200 },
      { name: 'blank', display: { kind: 'blank' }, durationMs: 50 },
      { name: 'target', awaitsResponse: true, startsClock: true, display: { kind: 'text', text: '{pair.target}', size: 44 } },
    ],
    response: {
      kind: 'choice',
      layout: 'row',
      options: [{ value: 'word', label: 'Word', labelHe: 'מילה' }, { value: 'nonword', label: 'Not a word', labelHe: 'לא מילה' }],
    },
    correct: { kind: 'mapping', factor: 'pair.targetIsWord', expect: { true: 'word', false: 'nonword' } },
    itiMs: 400,
  },
  store: ['pair.prime', 'pair.target', 'pair.related'],
  dashboard: {
    charts: [{ title: 'RT by relatedness', kind: 'bar', groupBy: 'pair.related', measure: 'meanRt', yLabel: 'RT (ms)', errorBars: true }],
  },
};

// 6. DELAY DISCOUNTING
// Stresses: choice option labels built from factor values rather than fixed text.
// Fit: no change needed — labels interpolate like any other string.
export const DELAY_DISCOUNTING: ExperimentDefinition = {
  version: 1,
  slug: 'delayDiscounting',
  title: 'Delay Discounting',
  titleHe: 'היוון עיכוב',
  category: 'DECISION MAKING',
  instructions: { he: 'בחרו בין סכום עכשיו לסכום גדול יותר בעתיד.', en: 'Choose between money now and more money later.' },
  factors: [
    { name: 'delayDays', levels: [1, 7, 30, 180, 365] },
    { name: 'immediateAmount', levels: [20, 50, 80] },
  ],
  repetitions: 2,
  trial: {
    phases: [{ name: 'choice', awaitsResponse: true, startsClock: true, display: { kind: 'blank' } }],
    response: {
      kind: 'choice',
      layout: 'column',
      options: [
        { value: 'now', label: '₪{immediateAmount} today', labelHe: '₪{immediateAmount} היום' },
        { value: 'later', label: '₪100 in {delayDays} days', labelHe: '₪100 בעוד {delayDays} ימים' },
      ],
    },
    correct: { kind: 'none' },
    itiMs: 200,
  },
  store: ['delayDays', 'immediateAmount'],
  dashboard: {
    charts: [{ title: 'Proportion choosing delayed reward', kind: 'line', groupBy: 'delayDays', measure: 'proportion', ofResponse: 'later', yLabel: 'Chose later (%)' }],
  },
};

// 7. FACE INVERSION
// Stresses: image stimuli with a rotation driven by a factor.
// Fit: no change needed — 'image' takes the same interpolation, rotation added to shape
// and image alike.
export const FACE_INVERSION: ExperimentDefinition = {
  version: 1,
  slug: 'faceInversion',
  title: 'Face Inversion Effect',
  titleHe: 'אפקט היפוך פנים',
  category: 'PERCEPTION',
  instructions: { he: 'האם שתי הפנים זהות?', en: 'Are the two faces the same?' },
  // The one example that uses the assets manifest — and the reason the manifest exists.
  // This probe originally pointed at /faces/f1.jpg … f7.jpg, none of which are real files,
  // so every trial rendered a broken image and nothing said so. Under a manifest the same
  // mistake is a validation error before the experiment ever runs.
  //
  // `base` is a path this site already serves, so these need no upload. A lecturer's own
  // photographs go through `npm run exp:assets` instead, which writes the same two fields.
  assets: {
    base: '/faces/',
    files: ['c2_1_1.jpg', 'c2_1_2.jpg', 'c2_1_3.jpg', 'c2_1_10.jpg', 'c2_1_11.jpg', 'c2_1_12.jpg', 'c2_1_13.jpg'],
  },
  pools: {
    faces: [
      { a: 'c2_1_1.jpg', b: 'c2_1_1.jpg' },
      { a: 'c2_1_2.jpg', b: 'c2_1_3.jpg' },
      { a: 'c2_1_10.jpg', b: 'c2_1_10.jpg' },
      { a: 'c2_1_11.jpg', b: 'c2_1_12.jpg' },
      { a: 'c2_1_13.jpg', b: 'c2_1_13.jpg' },
    ],
  },
  factors: [
    { name: 'orientation', levels: ['upright', 'inverted'] },
    { name: 'sameFace', levels: [true, false] },
    { name: 'face', from: 'faces', sample: 5 },
    { name: 'rotationDeg', derivedFrom: ['orientation'], mapping: { upright: 0, inverted: 180 } },
  ],
  repetitions: 3,
  practice: { count: 6, feedback: true },
  trial: {
    phases: [
      { name: 'fixation', display: { kind: 'fixation' }, durationMs: 500 },
      { name: 'study', display: { kind: 'image', src: '{face.a}', size: 180, rotation: '{rotationDeg}' }, durationMs: 1000 },
      { name: 'blank', display: { kind: 'blank' }, durationMs: 500 },
      { name: 'test', awaitsResponse: true, startsClock: true, display: { kind: 'image', src: '{face.b}', size: 180, rotation: '{rotationDeg}' } },
    ],
    response: {
      kind: 'choice',
      layout: 'row',
      options: [{ value: 'same', label: 'Same', labelHe: 'זהה' }, { value: 'different', label: 'Different', labelHe: 'שונה' }],
    },
    correct: { kind: 'mapping', factor: 'sameFace', expect: { true: 'same', false: 'different' } },
    itiMs: 400,
  },
  store: ['orientation', 'sameFace'],
  dashboard: {
    charts: [{ title: 'Accuracy by orientation', kind: 'bar', groupBy: 'orientation', measure: 'accuracy', yLabel: 'Accuracy (%)', errorBars: true }],
  },
};

// 8. SIGNAL DETECTION WITH CONFIDENCE
// Stresses: TWO responses in one trial — a decision, then a confidence rating.
// NEEDED-CHANGE: response had to become a list, so a trial can collect more than one.
export const SIGNAL_DETECTION: ExperimentDefinition = {
  version: 1,
  slug: 'signalDetection',
  title: 'Signal Detection',
  titleHe: 'גילוי אות',
  category: 'PERCEPTION',
  instructions: { he: 'האם הופיע אות חלש ברעש? ואז דרגו את בטחונכם.', en: 'Was a faint signal present in the noise? Then rate your confidence.' },
  factors: [
    { name: 'signalPresent', levels: [true, false] },
    { name: 'signalStrength', levels: ['low', 'medium', 'high'] },
  ],
  repetitions: 10,
  practice: { count: 8, feedback: true },
  trial: {
    phases: [
      { name: 'fixation', display: { kind: 'fixation' }, durationMs: 500 },
      { name: 'stimulus', display: { kind: 'mask', pattern: 'noise' }, durationMs: 250 },
      { name: 'decision', awaitsResponse: true, startsClock: true, display: { kind: 'blank' } },
      { name: 'confidence', awaitsResponse: true, display: { kind: 'blank' } },
    ],
    response: [
      {
        phase: 'decision',
        kind: 'choice',
        layout: 'row',
        options: [{ value: 'present', label: 'Signal', labelHe: 'אות' }, { value: 'absent', label: 'Nothing', labelHe: 'כלום' }],
      },
      { phase: 'confidence', kind: 'rating', min: 1, max: 4, minLabel: 'Guessing', maxLabel: 'Certain' },
    ],
    correct: { kind: 'mapping', factor: 'signalPresent', expect: { true: 'present', false: 'absent' } },
    itiMs: 300,
  },
  store: ['signalPresent', 'signalStrength'],
  dashboard: {
    charts: [
      { title: 'Hit rate by signal strength', kind: 'bar', groupBy: 'signalStrength', measure: 'accuracy', yLabel: 'Hit rate (%)', errorBars: true },
      { title: 'Hit rate by signal presence', kind: 'bar', groupBy: 'signalPresent', measure: 'accuracy', yLabel: 'Correct (%)', errorBars: true },
    ],
  },
};

// Mock patterns, so every probe experiment demonstrates its own effect with no data.
STROOP.mock = { participants: 15, baseRtMs: 640, baseAccuracy: 0.96, effects: [
  { factor: 'congruency', level: 'incongruent', rtDeltaMs: 150, accuracyDelta: -0.05 },
  { factor: 'congruency', level: 'neutral', rtDeltaMs: 40 },
] };
FLANKER.mock = { participants: 15, baseRtMs: 450, baseAccuracy: 0.96, effects: [
  { factor: 'congruency', level: 'incongruent', rtDeltaMs: 90, accuracyDelta: -0.06 },
  { factor: 'congruency', level: 'neutral', rtDeltaMs: 30 },
] };
POSNER.mock = { participants: 15, baseRtMs: 320, baseAccuracy: 0.97, effects: [
  { factor: 'validity', level: 'invalid', rtDeltaMs: 45 },
] };
LEXICAL_DECISION.mock = { participants: 15, baseRtMs: 620, baseAccuracy: 0.94 };
SEMANTIC_PRIMING.mock = { participants: 15, baseRtMs: 600, baseAccuracy: 0.95 };
DELAY_DISCOUNTING.mock = { participants: 15, baseRtMs: 1800, baseAccuracy: 0.5 };
FACE_INVERSION.mock = { participants: 15, baseRtMs: 900, baseAccuracy: 0.88, effects: [
  { factor: 'orientation', level: 'inverted', accuracyDelta: -0.18, rtDeltaMs: 120 },
] };
SIGNAL_DETECTION.mock = { participants: 15, baseRtMs: 700, baseAccuracy: 0.6, effects: [
  { factor: 'signalStrength', level: 'medium', accuracyDelta: 0.15 },
  { factor: 'signalStrength', level: 'high', accuracyDelta: 0.3 },
] };

export const PROBE = [
  STROOP, FLANKER, POSNER, LEXICAL_DECISION,
  SEMANTIC_PRIMING, DELAY_DISCOUNTING, FACE_INVERSION, SIGNAL_DETECTION,
];
