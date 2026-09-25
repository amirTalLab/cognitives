import type { ExperimentDefinition, PoolItem, Stage, TrialDesign } from '../schema';
import { SO_LIST_1, SO_LIST_2, SO_PROBLEMS } from '../stimuli/serial-order-lists';

// ─── Serial position ──────────────────────────────────────────────────────────
// Original: app/serialOrder/ (page, experiment, thanks, teacher) and
// lib/serial-order/stimuli.ts.
//
// Two sessions, each a list of twenty Hebrew words studied one at a time and then recalled
// freely. Session one puts two and a half minutes of arithmetic between the last word and
// recall; session two asks for recall immediately. The finding is the serial-position
// curve — the start of a list is remembered (primacy) and so is the end (recency) — and
// that the filled delay in session one abolishes the recency half of it while leaving
// primacy intact.
//
// A flat sequence of five blocks, not a stage group: the two sessions study DIFFERENT lists
// and differ in whether a delay comes between, so there is nothing repeated to draw over.
//
// Timings are the original's constants exactly: 500ms fixation, 2000ms per word, 500ms
// blank, 150s of arithmetic, 120s of recall.

const FIXATION_MS = 500;
const WORD_MS = 2000;
const BLANK_MS = 500;
const DISTRACTOR_MS = 150_000;
const RECALL_MS = 120_000;

const WORD_STYLE = { size: 56, font: 'sans' as const, color: '#38bdf8' };

/** The words of one list as pool items. */
const asWords = (list: typeof SO_LIST_1): PoolItem[] =>
  list.map(w => ({ word: w.word, serialPosition: w.serialPosition, region: w.region }));

/**
 * One studied list, a word at a time, collecting nothing.
 *
 * Returns the DESIGN fields only, with no name or title: the first block of an experiment
 * is the definition itself, whose `title` is the experiment's name rather than a block
 * heading, so spreading a whole Stage into it would collide.
 */
function studyDesign(pool: string): TrialDesign {
  return {
    factors: [{ name: 'item', from: pool }],
    repetitions: 1,
    // The order IS the measure here: shuffling a study list would destroy the serial
    // positions the whole experiment is about.
    order: 'fixed',
    trial: {
      phases: [
        { name: 'fixation', display: { kind: 'fixation' }, durationMs: FIXATION_MS },
        { name: 'word', display: { kind: 'text', text: '{item.word}', ...WORD_STYLE }, durationMs: WORD_MS },
        { name: 'blank', display: { kind: 'blank' }, durationMs: BLANK_MS },
      ],
      response: { kind: 'none' },
      correct: { kind: 'none' },
    },
    store: ['item.word', 'item.serialPosition', 'item.region'],
  };
}

/** Free recall of the list just studied, scored per studied word. */
function recallBlock(name: string, against: string, session: number): Stage {
  return {
    name,
    autoAdvanceMs: 0,
    factors: [{ name: 'session', levels: [session] }],
    repetitions: 1,
    trial: {
      phases: [{
        name: 'recall',
        display: {
          kind: 'text',
          text: 'Type every word you remember, one per line, in any order.',
          size: 20,
        },
        awaitsResponse: true,
        startsClock: true,
        timeoutMs: RECALL_MS,
      }],
      response: { kind: 'wordList' },
      correct: { kind: 'none' },
      recall: { against, match: 'word', intrusions: true },
    },
    store: ['session'],
  };
}

export const SERIAL_ORDER_PORT: ExperimentDefinition = {
  version: 1,
  slug: 'serialOrder',
  title: 'Serial Position',
  titleHe: 'זיכרון סדרתי',
  category: 'MEMORY',

  instructions: {
    // "Do not write anything down" is not politeness, it is the experimental control: the
    // serial-position curve IS the result here, and a participant who jots words during
    // presentation produces one that measures nothing. The original landing page said it
    // and the first version of this port dropped it.
    en: 'You will see a list of words, one at a time. Try to remember them.\n'
      + 'Do not write anything down.\n'
      + 'After the list you will do some arithmetic, and then type every word you remember, '
      + 'one per line, in any order.\n'
      + 'The whole thing happens twice, with a different list each time.',
    he: 'תראו רשימת מילים, אחת בכל פעם. נסו לזכור אותן.\n'
      + 'אל תרשמו דבר במהלך ההצגה.\n'
      + 'אחרי הרשימה תפתרו תרגילי חשבון, ואז תקלידו את כל המילים שאתם זוכרים, מילה בכל שורה, '
      + 'בכל סדר.\n'
      + 'כל זה יקרה פעמיים, עם רשימה אחרת בכל פעם.',
  },

  pools: {
    list1: asWords(SO_LIST_1),
    list2: asWords(SO_LIST_2),
    problems: SO_PROBLEMS.map(p => ({ problem: p.problem, answer: p.answer })),
  },

  // Block one: study the first list.
  stageName: 'study1',
  ...studyDesign('list1'),

  stages: [
    {
      name: 'arithmetic',
      autoAdvanceMs: 0,
      title: { en: 'Arithmetic', he: 'חשבון' },
      instructions: {
        en: 'Solve as many as you can. Type the answer and press Enter.',
        he: 'פתרו כמה שיותר. הקלידו את התשובה ולחצו Enter.',
      },
      factors: [{ name: 'sum', from: 'problems' }],
      repetitions: 1,
      // Measured in time, not trials: the delay has to be the same length for a fast
      // participant as for a slow one, or it is not the same delay.
      endsAfterMs: DISTRACTOR_MS,
      trial: {
        phases: [{
          name: 'solve',
          display: { kind: 'text', text: '{sum.problem}', size: 48, font: 'mono' },
          awaitsResponse: true,
          startsClock: true,
        }],
        response: { kind: 'number' },
        correct: { kind: 'matchesFactor', factor: 'sum.answer' },
        itiMs: 200,
      },
      store: ['sum.problem', 'sum.answer'],
    },

    recallBlock('recall1', 'list1', 1),

    {
      name: 'study2',
      ...studyDesign('list2'),
      title: { en: 'A second list', he: 'רשימה שנייה' },
      instructions: {
        en: 'Now a different list of words. This time you will be asked to recall them '
          + 'straight away, with no arithmetic in between.',
        he: 'עכשיו רשימת מילים אחרת. הפעם תתבקשו להיזכר בהן מיד, בלי חשבון באמצע.',
      },
    },

    recallBlock('recall2', 'list2', 2),
  ],

  thanks: { showResults: false },

  dashboard: {
    charts: [
      {
        title: 'Serial position curve — session 1 (delayed recall)',
        description: 'Proportion of participants recalling the word at each position, after '
          + 'two and a half minutes of arithmetic. Primacy survives the delay; recency does not.',
        kind: 'line',
        groupBy: 'serialPosition',
        measure: 'proportion',
        ofResponse: 'recalled',
        filter: { stage: 'recall1' },
        errorBars: true,
        xLabel: 'Serial position',
        yLabel: 'P(recall)',
      },
      {
        title: 'Serial position curve — session 2 (immediate recall)',
        description: 'The same list length, recalled straight away. The end of the list comes '
          + 'back as well as the beginning.',
        kind: 'line',
        groupBy: 'serialPosition',
        measure: 'proportion',
        ofResponse: 'recalled',
        filter: { stage: 'recall2' },
        errorBars: true,
        xLabel: 'Serial position',
        yLabel: 'P(recall)',
      },
      {
        title: 'Mean recall by third of the list',
        description: 'Positions 1–7, 8–13 and 14–20. The recency third is where the two '
          + 'sessions part company.',
        kind: 'bar',
        groupBy: 'region',
        seriesBy: 'stage',
        measure: 'proportion',
        ofResponse: 'recalled',
        filter: { stage: ['recall1', 'recall2'] },
        errorBars: true,
        groups: [
          { value: 'primacy', label: 'Primacy (1–7)' },
          { value: 'middle', label: 'Middle (8–13)' },
          { value: 'recency', label: 'Recency (14–20)' },
        ],
        yLabel: 'P(recall)',
      },
      {
        title: 'Per-participant thirds — session 1 (delayed)',
        kind: 'bar',
        groupBy: 'participant',
        seriesBy: 'region',
        measure: 'proportion',
        ofResponse: 'recalled',
        filter: { stage: 'recall1' },
        yLabel: 'P(recall)',
      },
      {
        title: 'Per-participant thirds — session 2 (immediate)',
        kind: 'bar',
        groupBy: 'participant',
        seriesBy: 'region',
        measure: 'proportion',
        ofResponse: 'recalled',
        filter: { stage: 'recall2' },
        yLabel: 'P(recall)',
      },
      {
        title: 'Recency: delayed against immediate',
        description: 'Each dot is one participant. Below the diagonal means the filled delay '
          + 'cost them the end of the list.',
        kind: 'xy',
        groupBy: 'participant',
        measure: 'proportion',
        axes: {
          x: {
            measure: 'proportion', ofResponse: 'recalled',
            filter: { stage: 'recall2', region: 'recency' },
            label: 'Immediate — recency (%)',
          },
          y: {
            measure: 'proportion', ofResponse: 'recalled',
            filter: { stage: 'recall1', region: 'recency' },
            label: 'Delayed — recency (%)',
          },
        },
      },
      {
        title: 'Overall recall: session 1 vs session 2',
        kind: 'xy',
        groupBy: 'participant',
        measure: 'proportion',
        axes: {
          x: {
            measure: 'proportion', ofResponse: 'recalled',
            filter: { stage: 'recall1' }, label: 'Session 1 recalled (%)',
          },
          y: {
            measure: 'proportion', ofResponse: 'recalled',
            filter: { stage: 'recall2' }, label: 'Session 2 recalled (%)',
          },
        },
      },
      {
        title: 'Arithmetic: problems attempted against accuracy',
        description: 'The filled delay. Whether someone actually did the arithmetic is worth '
          + 'seeing before trusting their session-1 curve.',
        kind: 'xy',
        groupBy: 'participant',
        measure: 'accuracy',
        axes: {
          x: { measure: 'count', filter: { stage: 'arithmetic' }, label: 'Problems attempted' },
          y: { measure: 'accuracy', filter: { stage: 'arithmetic' }, label: 'Accuracy (%)' },
        },
      },
    ],
    stats: [
      {
        label: 'Recency, delayed', measure: 'proportion', ofResponse: 'recalled',
        filter: { stage: 'recall1', region: 'recency' }, unit: '%',
      },
      {
        label: 'Recency, immediate', measure: 'proportion', ofResponse: 'recalled',
        filter: { stage: 'recall2', region: 'recency' }, unit: '%',
      },
      {
        label: 'Primacy, delayed', measure: 'proportion', ofResponse: 'recalled',
        filter: { stage: 'recall1', region: 'primacy' }, unit: '%',
      },
    ],
  },

  mock: {
    participants: 22,
    baseRtMs: 2600,
    baseAccuracy: 0.42,
    effects: [
      // The curve. Recall rows are one per studied word, so "correct" means it came back.
      { factor: 'region', level: 'primacy', accuracyDelta: 0.22 },
      { factor: 'region', level: 'middle', accuracyDelta: -0.12 },
      { factor: 'region', level: 'recency', accuracyDelta: 0.18 },
      // Arithmetic is easier than recall, so it is not dragged down by the recall baseline.
      { factor: 'sum.answer', level: 'any', accuracyDelta: 0 },
    ],
  },

  simplifications: [
    {
      what: 'The mock data cannot show recency differing between the two sessions',
      why: 'Mock effects are keyed on a trial\'s own factor values, and which session a '
        + 'recall block belongs to is a property of the block rather than of the studied '
        + 'word. Both mock curves therefore show the same shape. Real data shows the '
        + 'difference, which is what the first two charts are for.',
    },
    {
      what: 'The arithmetic is drawn from a fixed bank of 240 problems rather than generated fresh',
      why: 'A definition draws from pools. The bank is built with the original\'s own operand '
        + 'ranges and is shuffled per participant, so nobody sees the same sequence.',
    },
    {
      what: 'The lag-CRP and lag-transition figures are not reproduced',
      why: 'Conditional response probability by lag is a specialist analysis of the ORDER '
        + 'words came back in, not a measure of one trial. The order is recorded on every '
        + 'row as "outputPosition", so the analysis is available from the CSV export, but '
        + 'the dashboard has no chart kind that computes it.',
    },
    {
      what: 'Recall is typed a word at a time rather than into one free textarea',
      why: 'The original takes a textarea, one word per line. The runtime collects a word '
        + 'list, which is scored identically — and it still submits whatever has been '
        + 'entered when the two minutes are up.',
    },
  ],
};
