import type { Display, ExperimentDefinition, PoolItem } from '../schema';
import * as BANK from '../stimuli/summary-stats-arrays';
import type { SsDisplay } from '../stimuli/summary-stats-arrays';

// ─── Ensemble perception ──────────────────────────────────────────────────────
// Original: app/summaryStats/ (page, practice, ensemble, recognition, results, teacher),
// lib/summary-stats/{stimuli,analysis}.ts and components/summary-stats/.
//
// Show a handful of circles for 800ms and people can tell you their AVERAGE size accurately,
// while being close to chance on whether any particular one of them was there. The visual
// system appears to compute a summary of a set it never encoded item by item.
//
// The demonstration rests on one comparison, and it is the reason this port exists in the
// shape it does. A recognition probe is one of three things: an item that really was there,
// a value far from every member, or THE MEAN of the set — which, by construction, was never
// shown. People accept the mean at close to the rate they accept a real member. They
// remember a summary they were never given.
//
// Two kinds of trial, INTERLEAVED. That is not a presentation detail: if the question were
// predictable a participant could encode for it — hold the average, or hold the items — and
// the whole contrast between the two abilities would be a contrast between two strategies.
// Which is why this port needed the runtime to branch a display, a response and a scoring
// rule per trial rather than per block.

const asPool = (rows: SsDisplay[]): PoolItem[] => rows.map(r => ({ ...r }));

const PHASE_MS = { fixation: 500, array: 800, blank: 200 };

/** One shape per member of the set, each at its own size — the sizes are the design. */
const ARRAY_DISPLAY: Display = {
  kind: 'array' as const,
  from: '{display.items}',
  as: 'each',
  count: 0,
  item: {
    kind: 'shape' as const,
    shape: '{display.shape}',
    size: '{each.value}',
    color: '#e5e7eb',
  },
  area: { width: 520, height: 460 },
};

/** The question, which is a different question on every other trial. */
const QUESTION_DISPLAY: Display = {
  kind: 'switch' as const,
  by: 'display.question',
  cases: {
    ensemble: {
      kind: 'text' as const,
      text: '{display.promptEn}',
      textHe: '{display.promptHe}',
      size: 22,
    },
    recognition: {
      kind: 'stack' as const,
      items: [
        // The probe itself, drawn at the size being asked about.
        {
          kind: 'shape' as const,
          shape: '{display.shape}',
          size: '{display.probeValue}',
          color: '#f97316',
        },
        {
          kind: 'text' as const,
          text: '{display.promptEn}',
          textHe: '{display.promptHe}',
          size: 20,
        },
      ],
    },
  },
};

/**
 * What practice shows once an answer is in.
 *
 * An estimate has no verdict, so the original does not give one: it draws the shape the
 * participant settled on beside the shape the average actually was, and lets them see the
 * difference. A number ("the average was 43") is not the same thing — the answer was given
 * by dragging a shape until it looked right, so the correction has to be a shape too, or it
 * cannot be compared to what was done. Recognition keeps its plain right-or-wrong.
 */
const FEEDBACK_DISPLAY: Display = {
  kind: 'switch' as const,
  by: 'display.question',
  cases: {
    ensemble: {
      kind: 'row' as const,
      gap: 28,
      items: [
        {
          kind: 'stack' as const,
          items: [
            { kind: 'text' as const, text: 'Your answer', textHe: 'התשובה שלך', size: 14, color: '#9ca3af' },
            // The size the slider was left at, which the runtime keeps until the next trial
            // starts for exactly this.
            { kind: 'shape' as const, shape: '{display.shape}', size: '{answer.question}', color: '#fb923c' },
          ],
        },
        { kind: 'text' as const, text: 'vs', textHe: 'מול', size: 18, color: '#6b7280' },
        {
          kind: 'stack' as const,
          items: [
            { kind: 'text' as const, text: 'True value', textHe: 'ערך אמיתי', size: 14, color: '#9ca3af' },
            { kind: 'shape' as const, shape: '{display.shape}', size: '{display.trueMean}', color: '#34d399' },
          ],
        },
      ],
    },
    // Nothing to compare: the words below say whether the probe was there.
    recognition: { kind: 'blank' as const },
  },
};

/** Six from each type-and-size cell, and two of each probe kind — the original's balance. */
const ENSEMBLE_CELLS = ['EnsCircles3', 'EnsCircles5', 'EnsCircles7', 'EnsLines3', 'EnsLines5', 'EnsLines7'];
const RECOGNITION_CELLS = ['Circles3', 'Circles5', 'Circles7', 'Lines3', 'Lines5', 'Lines7']
  .flatMap(cell => ['Target', 'FoilMean', 'FoilNonMean'].map(probe => `Rec${cell}${probe}`));

const poolName = (cell: string) => cell.replace(/([A-Z])/g, '_$1').toUpperCase().replace(/^_/, '');
const bankOf = (cell: string) =>
  asPool((BANK as unknown as Record<string, SsDisplay[]>)[`SS_${poolName(cell)}`]);

const POOLS: Record<string, PoolItem[]> = {
  practiceItems: asPool(BANK.SS_PRACTICE_ITEMS),
};
for (const cell of [...ENSEMBLE_CELLS, ...RECOGNITION_CELLS]) POOLS[cell] = bankOf(cell);

export const SUMMARY_STATS_PORT: ExperimentDefinition = {
  version: 1,
  slug: 'summaryStats',
  title: 'Ensemble Perception',
  titleHe: 'תפיסת מכלול',
  category: 'PERCEPTION',

  instructions: {
    en: 'You will see a group of circles or lines for a moment, and then one question '
      + 'about them.\n\n'
      + 'Sometimes you will be asked for the AVERAGE size of the group — drag the slider '
      + 'until the shape matches what you remember.\n'
      + 'Sometimes you will be shown a single shape and asked whether THAT ONE was in the '
      + 'group.\n'
      + 'You will not know which question is coming, so try to take in the whole group.\n\n'
      + '10 practice + 72 trials • about 12-15 minutes',
    he: 'תראו קבוצה של עיגולים או קווים לרגע קצר, ואחריה שאלה אחת עליה.\n\n'
      + 'לפעמים תישאלו מה הגודל הממוצע של הקבוצה — גררו את המחוון עד שהצורה מתאימה למה '
      + 'שאתם זוכרים.\n'
      + 'לפעמים תוצג צורה אחת ותישאלו האם היא הופיעה בקבוצה.\n'
      + 'לא תדעו מראש איזו שאלה תגיע, אז נסו לקלוט את הקבוצה כולה.\n\n'
      + '10 ניסויי תרגול + 72 ניסויים • כ-12-15 דקות',
  },

  pools: POOLS,

  // Six ensemble displays per type-and-size cell and two per probe kind: 36 of each
  // question, 72 in all, with the three probe kinds equally represented exactly as the
  // original's shuffled probe pool arranges.
  factors: [{
    name: 'display',
    fromEach: [
      ...ENSEMBLE_CELLS.map(pool => ({ pool, sample: 6 })),
      ...RECOGNITION_CELLS.map(pool => ({ pool, sample: 2 })),
    ],
  }],
  repetitions: 1,

  // Ten fixed practice displays rather than a sample, so practice always covers both
  // questions and all three probe kinds. A participant whose practice happened to be all
  // ensemble would meet recognition for the first time in a scored trial.
  practice: {
    count: 10,
    feedback: true,
    record: false,
    from: { factor: 'display', pool: 'practiceItems' },
  },

  trial: {
    phases: [
      { name: 'fixation', display: { kind: 'fixation' }, durationMs: PHASE_MS.fixation },
      { name: 'array', display: ARRAY_DISPLAY, durationMs: PHASE_MS.array },
      { name: 'blank', display: { kind: 'blank' }, durationMs: PHASE_MS.blank },
      { name: 'question', display: QUESTION_DISPLAY, awaitsResponse: true, startsClock: true },
    ],

    response: {
      by: 'display.question',
      sets: {
        // Dragged, with the shape redrawn as it moves: the answer is a match against a
        // remembered size, not a number someone has to work out.
        ensemble: {
          kind: 'slider',
          min: '{display.scaleMin}',
          max: '{display.scaleMax}',
          minLabel: 'Small',
          maxLabel: 'Large',
          submitLabel: { en: 'Confirm', he: 'אישור' },
          preview: {
            kind: 'shape',
            shape: '{display.shape}',
            size: '{value}',
            color: '#f97316',
          },
        },
        recognition: {
          kind: 'choice',
          layout: 'row',
          options: [
            { value: 'yes', label: 'Yes', labelHe: 'כן', key: 'f' },
            { value: 'no', label: 'No', labelHe: 'לא', key: 'j' },
          ],
        },
      },
    },

    correct: {
      by: 'display.question',
      sets: {
        // A quarter of the stimulus range, which is what the original counts as a hit and
        // puts guessing at 50% — so this bar and the recognition bar can be read together.
        ensemble: { kind: 'within', factor: 'display.trueMean', tolerance: '{display.tolerance}' },
        recognition: { kind: 'matchesFactor', factor: 'display.answer' },
      },
    },

    itiMs: 400,
    // The message comes from the ITEM, because the two questions deserve different ones. A
    // recognition probe was or was not there, so "correct" means something and is said. An
    // estimate has no verdict — calling a number inside a tolerance "correct" tells someone
    // their guess was right when it may have been well off — so it says nothing, and the
    // comparison above says it all instead.
    feedback: {
      durationMs: 1600,
      display: FEEDBACK_DISPLAY,
      correct: { en: '{display.feedbackRightEn}', he: '{display.feedbackRightHe}' },
      incorrect: { en: '{display.feedbackWrongEn}', he: '{display.feedbackWrongHe}' },
    },
  },

  // probeIsTarget is deliberately absent: it is true exactly when probeType is "target",
  // and a second column saying the same thing is one more thing to keep in step. An ensemble
  // trial carries probeType "none" rather than nothing, so every row has every column.
  store: ['display.question', 'display.type', 'display.n', 'display.probeType', 'display.trueMean'],

  thanks: { showResults: true },

  dashboard: {
    stats: [
      { label: 'Average judged right', measure: 'accuracy', filter: { 'display.question': 'ensemble' }, unit: '%' },
      { label: 'Individual items recognised', measure: 'accuracy', filter: { 'display.question': 'recognition' }, unit: '%' },
      {
        label: 'Mean accepted as seen',
        measure: 'proportion',
        ofResponse: 'yes',
        filter: { 'display.probeType': 'foilMean' },
        unit: '%',
      },
    ],
    charts: [
      {
        title: 'Knowing the average vs knowing the items',
        description: 'Both bars are scored so that guessing is 50%. The gap is the finding: '
          + 'the average of a set survives a glance that the set itself does not.',
        kind: 'bar',
        groupBy: 'display.question',
        measure: 'accuracy',
        errorBars: true,
        referenceLine: 50,
        groups: [
          { value: 'ensemble', label: 'Average size' },
          { value: 'recognition', label: 'Was this one there?' },
        ],
        yLabel: 'Accuracy (%)',
      },
      {
        title: 'Saying "yes, it was there" by what the probe actually was',
        description: 'The middle bar is the point. The mean of the set was never on screen, '
          + 'and is accepted far more often than a value that was equally absent — a memory '
          + 'of something nobody was shown.',
        kind: 'bar',
        groupBy: 'display.probeType',
        measure: 'proportion',
        ofResponse: 'yes',
        filter: { 'display.question': 'recognition' },
        errorBars: true,
        groups: [
          { value: 'target', label: 'Really there' },
          { value: 'foilMean', label: 'The average (never shown)' },
          { value: 'foilNonMean', label: 'Absent control' },
        ],
        yLabel: 'Said "yes" (%)',
      },
      {
        title: 'Accuracy by set size',
        description: 'Judging the average holds up as the group grows; recognising one item '
          + 'of it does not. A summary does not cost more to compute when there is more of it.',
        kind: 'line',
        groupBy: 'display.n',
        seriesBy: 'display.question',
        measure: 'accuracy',
        errorBars: true,
        xLabel: 'Items in the group',
        yLabel: 'Accuracy (%)',
      },
      {
        title: 'Accuracy by stimulus',
        description: 'Circles vary in size, lines in length. The effect should not care which.',
        kind: 'bar',
        groupBy: 'display.type',
        seriesBy: 'display.question',
        measure: 'accuracy',
        errorBars: true,
        groups: [
          { value: 'circles', label: 'Circles' },
          { value: 'line-lengths', label: 'Lines' },
        ],
        yLabel: 'Accuracy (%)',
      },
      {
        title: 'Reaction time by question',
        description: 'Correct trials only. Reporting an average is a slower answer than a '
          + 'yes/no, so these are read against each other rather than as one measure.',
        kind: 'bar',
        groupBy: 'display.question',
        measure: 'meanRt',
        correctOnly: true,
        errorBars: true,
        groups: [
          { value: 'ensemble', label: 'Average size' },
          { value: 'recognition', label: 'Was this one there?' },
        ],
        yLabel: 'RT (ms)',
      },
    ],
  },
};
