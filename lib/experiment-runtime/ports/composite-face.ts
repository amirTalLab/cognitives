import type { ExperimentDefinition, PoolItem } from '../schema';
import {
  CF_ALIGNED_DIFF, CF_ALIGNED_SAME, CF_CUT, CF_LARGE_MISALIGNED_DIFF, CF_LARGE_MISALIGNED_SAME,
  CF_PRACTICE, CF_SIZE, CF_SMALL_MISALIGNED_DIFF, CF_SMALL_MISALIGNED_SAME, type CfTrial,
} from '../stimuli/composite-face-trials';

// ─── Composite face ───────────────────────────────────────────────────────────
// Original: app/CompositeFace/ (page, practice, experiment, thanks, teacher),
// lib/composite-face/stimuli.ts and components/composite-face/FaceDisplay.tsx.
//
// A face is shown, then a composite: the top half of one face flush above the bottom half
// of another. The question is only about the top half — is that the person you just saw? —
// and when the halves are ALIGNED the two fuse into a single face you cannot look past, so
// the answer becomes hard. Slide the bottom half sideways and the fusion breaks and the
// difficulty goes with it.
//
// That is the whole finding, and it is why alignment gets twice as many trials as either
// misaligned condition: it is the cell the comparison rests on.

const PHASES = { fixation: 500, study: 800, blank: 500, iti: 300 };

const asPool = (trials: CfTrial[]): PoolItem[] => trials.map(t => ({
  study: t.study,
  top: t.top,
  bottom: t.bottom,
  condition: t.condition,
  offset: t.offset,
  // Stored as the answer itself rather than as a boolean, so the correctness rule can name
  // it directly and the CSV reads as the task did.
  answer: t.isSame ? 'same' : 'different',
}));

/** The composite under test: two halves, cut at the nose, the lower one possibly slid. */
const COMPOSITE = {
  kind: 'composite' as const,
  top: '{item.top}',
  bottom: '{item.bottom}',
  cut: CF_CUT,
  offset: '{item.offset}' as const,
  size: CF_SIZE,
};

const RESPONSE = {
  kind: 'choice' as const,
  layout: 'row' as const,
  options: [
    { value: 'same', label: 'Same', labelHe: 'אותו אדם' },
    { value: 'different', label: 'Different', labelHe: 'אדם אחר' },
  ],
};

const TRIAL = {
  phases: [
    { name: 'fixation', display: { kind: 'fixation' as const }, durationMs: PHASES.fixation },
    // The whole face, undivided — what the composite is later compared against.
    {
      name: 'study',
      display: { kind: 'image' as const, src: '{item.study}', size: CF_SIZE },
      durationMs: PHASES.study,
    },
    { name: 'blank', display: { kind: 'blank' as const }, durationMs: PHASES.blank },
    { name: 'test', display: COMPOSITE, awaitsResponse: true, startsClock: true },
  ],
  response: RESPONSE,
  correct: { kind: 'matchesFactor' as const, factor: 'item.answer' },
  itiMs: PHASES.iti,
};

export const COMPOSITE_FACE_PORT: ExperimentDefinition = {
  version: 1,
  slug: 'CompositeFace',
  title: 'Composite Face Task',
  titleHe: 'משימת פנים מורכבות',
  category: 'PERCEPTION',

  // Word for word from the hand-built landing page (app/CompositeFace/page.tsx).
  //
  // An earlier version of this port ended with "Ignore the bottom half entirely — it is
  // always someone else", which the original never said, on the landing page or in practice.
  // It reads like a clarification and is not one: the composite effect IS the failure to
  // ignore the irrelevant half, so telling people harder to ignore it is a change to the
  // manipulation, and results collected under it would not be comparable with the results
  // already in the table.
  instructions: {
    en: 'On each trial you will briefly see a face, then a second face.\n'
      + 'The second face is split: the top half belongs to one person, the bottom to another.\n'
      + 'Judge: is the top half of the second face the same person as the first face?\n'
      + 'Press "Yes" or "No" accordingly.',
    he: 'בכל ניסוי תראה פנים לזמן קצר, ולאחר מכן פנים נוספות.\n'
      + 'הפנים השניות מחולקות: החצי העליון שייך לאדם אחד, התחתון לאדם אחר.\n'
      + 'עליך לשפוט: האם החצי העליון של הפנים השניות הוא אותו אדם כמו הפנים הראשונות?\n'
      + 'לחץ "כן" או "לא" בהתאם.',
  },

  pools: {
    alignedSame: asPool(CF_ALIGNED_SAME),
    alignedDiff: asPool(CF_ALIGNED_DIFF),
    smallSame: asPool(CF_SMALL_MISALIGNED_SAME),
    smallDiff: asPool(CF_SMALL_MISALIGNED_DIFF),
    largeSame: asPool(CF_LARGE_MISALIGNED_SAME),
    largeDiff: asPool(CF_LARGE_MISALIGNED_DIFF),
    practiceTrials: asPool(CF_PRACTICE),
  },

  // Forty trials: twenty aligned, ten of each misalignment, half of each answered "same".
  // Composed from six banked cells rather than crossed, because the cells are deliberately
  // unequal — aligned carries the comparison, so it gets twice the trials.
  factors: [{
    name: 'item',
    fromEach: [
      { pool: 'alignedSame', sample: 10 },
      { pool: 'alignedDiff', sample: 10 },
      { pool: 'smallSame', sample: 5 },
      { pool: 'smallDiff', sample: 5 },
      { pool: 'largeSame', sample: 5 },
      { pool: 'largeDiff', sample: 5 },
    ],
  }],
  repetitions: 1,

  practice: {
    count: 6,
    feedback: true,
    // Six hand-picked trials from four faces the main experiment never uses, so practice
    // cannot preview an item that is about to be tested.
    from: { factor: 'item', pool: 'practiceTrials' },
    record: false,
  },

  trial: TRIAL,

  store: ['item.condition', 'item.answer', 'item.study', 'item.top', 'item.bottom'],

  thanks: { showResults: true },

  dashboard: {
    charts: [
      {
        title: 'Accuracy by alignment',
        description: 'Judging the top half alone. Aligned halves fuse into one face, which '
          + 'is what makes the aligned condition hard — the lower the bar, the stronger the '
          + 'illusion.',
        kind: 'bar',
        groupBy: 'item.condition',
        measure: 'accuracy',
        errorBars: true,
        referenceLine: 50,
        groups: [
          { value: 'aligned', label: 'Aligned' },
          { value: 'small-misaligned', label: 'Misaligned (small)' },
          { value: 'large-misaligned', label: 'Misaligned (large)' },
        ],
        yLabel: 'Accuracy (%)',
      },
      {
        title: 'Reaction time by alignment',
        description: 'Correct trials only. Fusing two halves costs time as well as accuracy.',
        kind: 'bar',
        groupBy: 'item.condition',
        measure: 'meanRt',
        correctOnly: true,
        errorBars: true,
        groups: [
          { value: 'aligned', label: 'Aligned' },
          { value: 'small-misaligned', label: 'Misaligned (small)' },
          { value: 'large-misaligned', label: 'Misaligned (large)' },
        ],
        yLabel: 'RT (ms)',
      },
      {
        title: 'Accuracy by alignment and correct answer',
        description: 'The composite effect is largest on "same" trials, where the wrong '
          + 'bottom half pulls the judgement away from a face that really is the one studied.',
        kind: 'bar',
        groupBy: 'item.condition',
        seriesBy: 'item.answer',
        measure: 'accuracy',
        errorBars: true,
        groups: [
          { value: 'aligned', label: 'Aligned' },
          { value: 'small-misaligned', label: 'Misaligned (small)' },
          { value: 'large-misaligned', label: 'Misaligned (large)' },
        ],
        yLabel: 'Accuracy (%)',
      },
      {
        title: 'The composite effect, per participant',
        description: 'Each dot is one person: aligned accuracy against large-misaligned. '
          + 'Below the diagonal is the effect — worse when the halves line up.',
        kind: 'xy',
        groupBy: 'participant',
        measure: 'accuracy',
        axes: {
          x: {
            measure: 'accuracy',
            filter: { 'item.condition': 'large-misaligned' },
            label: 'Misaligned accuracy (%)',
          },
          y: {
            measure: 'accuracy',
            filter: { 'item.condition': 'aligned' },
            label: 'Aligned accuracy (%)',
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
        label: 'Composite effect',
        measure: 'accuracy',
        difference: { factor: 'item.condition', level: 'large-misaligned', minus: 'aligned' },
        unit: ' points',
        signed: true,
      },
      { label: 'Aligned accuracy', measure: 'accuracy', filter: { 'item.condition': 'aligned' }, unit: '%' },
    ],
  },

  mock: {
    participants: 20,
    baseRtMs: 1150,
    baseAccuracy: 0.63,
    effects: [
      // The effect: aligned halves fuse, so the top-half judgement is worse and slower.
      { factor: 'item.condition', level: 'small-misaligned', accuracyDelta: 0.14, rtDeltaMs: -120 },
      { factor: 'item.condition', level: 'large-misaligned', accuracyDelta: 0.22, rtDeltaMs: -180 },
    ],
  },

  simplifications: [
    {
      what: 'The three faces of a trial are sampled from a pre-built bank rather than drawn fresh',
      why: 'A definition draws from pools. The bank holds forty candidates per cell and each '
        + 'participant samples from it, so no two people see the same forty faces — which is '
        + 'what drawing fresh was for. The generator also checks what the original assumed: '
        + 'that a composite never shows one person in both halves, and that a "different" '
        + 'trial never puts the studied face on top.',
    },
    {
      what: 'Practice gives feedback after each trial rather than running silently',
      why: 'Six practice trials from four reserved faces, as the original. The runtime shows '
        + 'whether each was right, which is what practice on an unfamiliar judgement is for; '
        + 'practice is not saved, as in the original.',
    },
  ],
};
