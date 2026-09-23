import type { ExperimentDefinition, Factor, PoolItem } from '../schema';

// ─── Visual search ────────────────────────────────────────────────────────────
// Original: app/visualSearch/ (page, experiment, results, thanks, teacher) and
// lib/visual-search/experiment.ts.
//
// A CONJUNCTION search. Find the T in your colour, among Ls in your colour and Ts in the
// other. Neither feature alone picks the target out — every red thing is not it, and every
// T is not it — so attention has to bind colour to shape one item at a time, and search
// time climbs with the number of items. That climb, and the fact that it is about twice as
// steep when the target is absent, is the whole finding.
//
// Two set sizes are manipulated separately: how many items share the target's COLOUR, and
// how many share its SHAPE. Crossing them shows which one costs more.

const SET_SIZES = [1, 2, 4, 8];
const SEARCH_MS = 5000;
const LETTER_SIZE = 34;

/** Which colour a participant hunts. Assigned per person, so neither colour is "the" target. */
const COLOUR_GROUPS: PoolItem[] = [
  { label: 'red', target: '#ef4444', other: '#3b82f6', targetName: 'red', targetNameHe: 'אדומה' },
  { label: 'blue', target: '#3b82f6', other: '#ef4444', targetName: 'blue', targetNameHe: 'כחולה' },
];

const letter = (text: string, color: string) => ({
  kind: 'text' as const, text, color, size: LETTER_SIZE, font: 'sans' as const,
});

/**
 * The counts each group of the array draws, worked out by lookup rather than arithmetic.
 *
 * A target-present trial shows one upright T plus one fewer same-colour L; an absent trial
 * shows no T and the full complement of Ls. The schema has no expression language on
 * purpose, so this is a table — and a table is checkable, which a formula buried in a
 * renderer would not be.
 */
const COUNT_FACTORS: Factor[] = [
  {
    name: 'nTarget',
    derivedFrom: ['targetPresent'],
    mapping: { true: 1, false: 0 },
  },
  {
    name: 'nSameColour',
    derivedFrom: ['targetPresent', 'targetSetSize'],
    mapping: Object.fromEntries(
      SET_SIZES.flatMap(size => [
        // Present: the target is one of the same-colour items, so one fewer L.
        [`true|${size}`, size - 1],
        [`false|${size}`, size],
      ]),
    ),
  },
];

export const VISUAL_SEARCH_PORT: ExperimentDefinition = {
  version: 1,
  slug: 'visualSearch',
  title: 'Visual Search',
  titleHe: 'חיפוש חזותי',
  category: 'ATTENTION',

  // The letter above, in this participant's own colour — the hand-built page shows the
  // stimulus itself rather than naming it, which is quicker to read and not open to
  // anyone's idea of what "red" means.
  instructionsDisplay: {
    kind: 'text',
    text: 'T',
    color: '{group.target}',
    size: 64,
    font: 'sans',
  },

  instructions: {
    en: 'Search for a T in the colour shown above.\n\n'
      + 'On each screen you will see a scatter of letters — some T, some L, in two colours. '
      + 'Decide as fast as you can whether an upright {group.targetName} T is present.\n'
      + 'Ts in the other colour do not count, and neither do Ls in {group.targetName}.',
    he: 'חפשי את האות T בצבע המוצג למעלה.\n\n'
      + 'בכל מסך יופיעו אותיות מפוזרות — חלקן T וחלקן L, בשני צבעים. החליטי מהר ככל האפשר '
      + 'האם קיימת T זקופה {group.targetNameHe}.\n'
      + 'אותיות T בצבע השני אינן נחשבות, וגם לא אותיות L {group.targetNameHe}.',
  },

  pools: { colourGroups: COLOUR_GROUPS },
  assign: { pool: 'colourGroups', as: 'group' },

  factors: [
    // How many items share the target's colour, and how many share its shape.
    { name: 'targetSetSize', levels: SET_SIZES },
    { name: 'distractorSetSize', levels: SET_SIZES },
    { name: 'targetPresent', levels: [true, false] },
    ...COUNT_FACTORS,
  ],
  // 4 x 4 x 2 crossed, four times over: 128 trials.
  repetitions: 4,

  practice: { count: 8, feedback: true, record: false },

  trial: {
    phases: [
      { name: 'fixation', display: { kind: 'fixation' }, durationMs: 500 },
      { name: 'blank', display: { kind: 'blank' }, durationMs: 200 },
      {
        name: 'search',
        display: {
          kind: 'array',
          // Ignored in favour of `groups`, but the schema requires them.
          count: 0,
          item: letter('T', '{group.target}'),
          area: { width: 600, height: 500 },
          groups: [
            // The target: an upright T in the hunted colour. Never rotated — a T on its side
            // is an L to the eye, and rotating it would make the target unfindable.
            { count: '{nTarget}', item: letter('T', '{group.target}') },
            // Same colour, wrong shape.
            {
              count: '{nSameColour}',
              item: letter('L', '{group.target}'),
              rotate: [0, 90, 180, 270],
            },
            // Right shape, wrong colour.
            {
              count: '{distractorSetSize}',
              item: letter('T', '{group.other}'),
              rotate: [0, 90, 180, 270],
            },
          ],
        },
        awaitsResponse: true,
        startsClock: true,
        // Five seconds, then the trial is recorded as a miss and moves on — a search that
        // has not finished by then is not going to.
        timeoutMs: SEARCH_MS,
      },
    ],
    response: {
      kind: 'choice',
      layout: 'row',
      options: [
        { value: 'present', label: 'Present', labelHe: 'קיימת', key: 'f' },
        { value: 'absent', label: 'Absent', labelHe: 'לא קיימת', key: 'j' },
      ],
    },
    correct: {
      kind: 'mapping',
      factor: 'targetPresent',
      expect: { true: 'present', false: 'absent' },
    },
    itiMs: 500,
    feedback: {
      durationMs: 500,
      correct: { en: 'Correct', he: 'נכון' },
      incorrect: { en: 'Incorrect', he: 'לא נכון' },
      timeout: { en: 'Too slow', he: 'איטי מדי' },
    },
  },

  store: ['targetSetSize', 'distractorSetSize', 'targetPresent', 'group.label'],

  thanks: { showResults: true },

  dashboard: {
    charts: [
      {
        title: 'Search time by set size, target present vs absent',
        description: 'The slope is the cost of each extra item. An absent trial has to check '
          + 'everything before answering, so its slope is about twice as steep.',
        kind: 'line',
        groupBy: 'targetSetSize',
        seriesBy: 'targetPresent',
        measure: 'meanRt',
        correctOnly: true,
        errorBars: true,
        xLabel: 'Items sharing the target colour',
        yLabel: 'RT (ms)',
      },
      {
        title: 'Search time by same-colour set size',
        description: 'How much each extra item in YOUR colour costs.',
        kind: 'line',
        groupBy: 'targetSetSize',
        measure: 'meanRt',
        correctOnly: true,
        errorBars: true,
        xLabel: 'Items sharing the target colour',
        yLabel: 'RT (ms)',
      },
      {
        title: 'Search time by same-shape set size',
        description: 'How much each extra T in the OTHER colour costs. Compare the slope with '
          + 'the chart above: the two kinds of distractor are not equally expensive.',
        kind: 'line',
        groupBy: 'distractorSetSize',
        measure: 'meanRt',
        correctOnly: true,
        errorBars: true,
        xLabel: 'Items sharing the target shape',
        yLabel: 'RT (ms)',
      },
      {
        title: 'Accuracy by set size',
        description: 'Accuracy should hold up as the display fills; if it falls, people were '
          + 'guessing rather than searching.',
        kind: 'line',
        groupBy: 'targetSetSize',
        seriesBy: 'targetPresent',
        measure: 'accuracy',
        errorBars: true,
        referenceLine: 50,
        xLabel: 'Items sharing the target colour',
        yLabel: 'Accuracy (%)',
      },
      {
        title: 'The search slope, per participant',
        description: 'Each dot is one person: their time on the smallest display against '
          + 'their time on the largest. Further above the diagonal is a steeper search.',
        kind: 'xy',
        groupBy: 'participant',
        measure: 'meanRt',
        axes: {
          x: {
            measure: 'meanRt', correctOnly: true,
            filter: { targetSetSize: 1 }, label: 'RT with 1 same-colour item (ms)',
          },
          y: {
            measure: 'meanRt', correctOnly: true,
            filter: { targetSetSize: 8 }, label: 'RT with 8 same-colour items (ms)',
          },
        },
      },
      {
        title: 'Individual participants: RT × accuracy',
        kind: 'xy',
        groupBy: 'participant',
        measure: 'accuracy',
        axes: {
          x: { measure: 'meanRt', correctOnly: true, label: 'Mean RT (ms)' },
          y: { measure: 'accuracy', label: 'Accuracy (%)' },
        },
      },
    ],
    stats: [
      {
        label: 'Cost of 8 items vs 1',
        measure: 'meanRt',
        correctOnly: true,
        difference: { factor: 'targetSetSize', level: 8, minus: 1 },
        unit: 'ms',
        signed: true,
      },
      {
        label: 'Absent minus present',
        measure: 'meanRt',
        correctOnly: true,
        difference: { factor: 'targetPresent', level: false, minus: true },
        unit: 'ms',
        signed: true,
      },
    ],
  },

  mock: {
    participants: 20,
    baseRtMs: 900,
    baseAccuracy: 0.93,
    effects: [
      // Search time climbs with the number of items sharing the target's colour...
      { factor: 'targetSetSize', level: 2, rtDeltaMs: 130 },
      { factor: 'targetSetSize', level: 4, rtDeltaMs: 380 },
      { factor: 'targetSetSize', level: 8, rtDeltaMs: 900 },
      // ...and less steeply with items sharing only its shape.
      { factor: 'distractorSetSize', level: 2, rtDeltaMs: 60 },
      { factor: 'distractorSetSize', level: 4, rtDeltaMs: 170 },
      { factor: 'distractorSetSize', level: 8, rtDeltaMs: 380 },
      // An absent trial has to check everything before it can answer.
      { factor: 'targetPresent', level: false, rtDeltaMs: 420, accuracyDelta: -0.03 },
    ],
  },

  simplifications: [
    {
      what: 'Item positions are laid out by the runtime rather than by the original\'s placer',
      why: 'Both scatter items at random with a minimum gap and fall back to a jittered grid '
        + 'when the box is too crowded. The runtime seeds its layout on the trial, so what a '
        + 'participant saw can be reconstructed from the stored row, which the original could '
        + 'not do.',
    },
    {
      what: 'The distance of the target from the centre is not stored',
      why: 'The original records it and no chart uses it. The runtime does not expose where '
        + 'it placed each item; if that analysis is ever wanted, the layout is reproducible '
        + 'from the trial index.',
    },
    {
      what: 'Practice gives feedback after each trial and is not saved',
      why: 'Eight practice trials as the original, drawn from the same design. The original '
        + 'also shows feedback during practice only, which is what the runtime does.',
    },
  ],
};
