import type { ExperimentDefinition, Factor, PoolItem, Stage, TrialDesign } from '../schema';
import {
  SRT_BLOCKS, SRT_GROUPS, SRT_INTERFERENCE_BLOCK, SRT_MAX_RT_MS, SRT_REPS_PER_BLOCK,
} from '../stimuli/srt-sequences';

// ─── Serial reaction time ─────────────────────────────────────────────────────
// Original: app/srt/ (page, experiment, thanks, teacher) and lib/srt/stimuli.ts.
//
// Four boxes in a diamond; a dot appears in one and you press that box as fast as you can.
// Unknown to the participant, the locations follow a twelve-item sequence that repeats all
// the way through — so reaction times fall as the sequence is learned. Block five swaps to
// a DIFFERENT sequence without saying so, and times jump straight back up. That jump is the
// measure of implicit learning, and it is why the sequence is never mentioned.
//
// Afterwards the participant is asked whether they noticed any regularity, and then asked
// to reproduce the sequence — which usually they cannot, even though their hands had
// clearly learned it.
//
// Half the class learns sequence A and half learns B, assigned per participant, so the jump
// in block five is a property of the change rather than of one particular sequence.

const DOT = '#111827';
const CLEAR = 'transparent';

/** Where each of the four locations sits. 1=down, 2=left, 3=right, 4=up. */
const PLACES = [
  { at: 'top' as const, location: 4, label: 'up', labelHe: 'למעלה' },
  { at: 'left' as const, location: 2, label: 'left', labelHe: 'שמאלה' },
  { at: 'right' as const, location: 3, label: 'right', labelHe: 'ימינה' },
  { at: 'bottom' as const, location: 1, label: 'down', labelHe: 'למטה' },
];

/**
 * One derived colour per box: black in the box the dot is in, transparent in the other three.
 *
 * The boxes ARE the response buttons, so the dot is drawn inside whichever button answers
 * this trial rather than in a separate display. That is what keeps the stimulus and the
 * thing you press in exactly the same place — in a task where the place is the answer, a
 * few pixels of drift between them would change what is being measured.
 */
function dotColours(source: string): Factor[] {
  return PLACES.map(place => ({
    name: `dot_${place.at}`,
    derivedFrom: [source],
    mapping: Object.fromEntries(
      PLACES.map(other => [String(other.location), other.location === place.location ? DOT : CLEAR]),
    ),
  }));
}

/** The four boxes, as buttons, with the dot drawn in whichever one is the answer. */
const BOXES = {
  kind: 'choice' as const,
  layout: 'positioned' as const,
  options: PLACES.map(place => ({
    value: String(place.location),
    label: place.label,
    labelHe: place.labelHe,
    at: place.at,
    display: {
      kind: 'shape' as const,
      shape: 'circle' as const,
      size: 30,
      color: `{dot_${place.at}}` as const,
    },
  })),
};

/** One block of the main task: the twelve-item sequence, nine times over, in order. */
function blockDesign(n: number): TrialDesign {
  return {
    factors: [{ name: 'item', from: `{group.block${n}}` }, ...dotColours('item.location')],
    repetitions: SRT_REPS_PER_BLOCK,
    // The sequence IS the experiment. Shuffling here would leave a task with nothing to
    // learn and a block five that changed nothing.
    order: 'fixed',
    trial: {
      phases: [{
        name: 'respond',
        display: { kind: 'blank' },
        awaitsResponse: true,
        startsClock: true,
        timeoutMs: SRT_MAX_RT_MS,
      }],
      response: BOXES,
      correct: { kind: 'matchesFactor', factor: 'item.location' },
      // No gap: the original moves to the next dot the instant one is pressed, and the pace
      // is part of what makes the sequence learnable without being noticed.
      itiMs: 0,
    },
    store: [
      'item.location', 'item.sequencePosition', 'item.block', 'item.sequenceType',
      'group.label',
    ],
  };
}

function laterBlock(n: number): Stage {
  return {
    name: `block${n}`,
    title: { en: `Block ${n} of ${SRT_BLOCKS}`, he: `בלוק ${n} מתוך ${SRT_BLOCKS}` },
    instructions: {
      en: 'Keep going — press the box the dot appears in, as fast as you can.',
      he: 'המשיכי — לחצי על הריבוע שבו מופיעה הנקודה, מהר ככל האפשר.',
    },
    ...blockDesign(n),
  };
}

export const SRT_PORT: ExperimentDefinition = {
  version: 1,
  slug: 'srt',
  title: 'Serial Reaction Time',
  titleHe: 'זמן תגובה סדרתי',
  category: 'LEARNING',

  instructions: {
    en: 'Four squares will appear on screen in a diamond formation.\n'
      + 'A black dot will appear inside one of them — tap the square containing the dot as '
      + 'fast as you can.\n'
      + 'The task includes several blocks. Try to respond quickly and accurately.',
    he: 'במשימה זו יופיעו ארבעה ריבועים על המסך בצורת מעוין.\n'
      + 'נקודה שחורה תופיע בתוך אחד הריבועים — לחץ/י על הריבוע שבו היא מופיעה, מהר ככל האפשר.\n'
      + 'המשימה כוללת מספר בלוקים. נסו להגיב מהר ובמדויק.',
  },

  pools: { groups: SRT_GROUPS as unknown as PoolItem[] },

  // Which sequence this participant learns, decided once and held to for the whole run.
  assign: { pool: 'groups', as: 'group' },

  stageName: 'block1',
  ...blockDesign(1),

  stages: [
    ...Array.from({ length: SRT_BLOCKS - 1 }, (_, i) => laterBlock(i + 2)),

    {
      name: 'awareness',
      title: { en: 'One question', he: 'שאלה אחת' },
      factors: [{ name: 'question', levels: ['noticed'] }],
      repetitions: 1,
      trial: {
        phases: [{
          name: 'ask',
          display: {
            kind: 'text',
            text: 'Did you notice any regularity in where the dot appeared?',
            size: 22,
          },
          awaitsResponse: true,
          startsClock: true,
        }],
        response: {
          kind: 'choice',
          layout: 'row',
          options: [
            { value: 'yes', label: 'Yes', labelHe: 'כן' },
            { value: 'no', label: 'No', labelHe: 'לא' },
          ],
        },
        // There is no right answer to whether you noticed something.
        correct: { kind: 'none' },
      },
      store: ['group.label'],
    },

    {
      name: 'generationPrime',
      title: { en: 'Almost done', he: 'כמעט סיימנו' },
      instructions: {
        en: 'There was a sequence of twelve locations that repeated throughout the task. '
          + 'You will now see the last two of it, and then be asked to reproduce the whole '
          + 'sequence by pressing the boxes. After each press the correct one is shown.',
        he: 'במהלך הניסוי הייתה סדרה של 12 מיקומים שחזרה על עצמה. כעת יוצגו שני המיקומים '
          + 'האחרונים שלה, ואז תתבקשי לשחזר את הסדרה כולה בלחיצה על הריבועים. אחרי כל לחיצה '
          + 'תוצג התשובה הנכונה.',
      },
      factors: [{ name: 'prime', from: '{group.primes}' }],
      repetitions: 1,
      order: 'fixed',
      trial: {
        phases: [{
          name: 'show',
          display: {
            kind: 'positioned',
            at: '{prime.at}',
            content: { kind: 'shape', shape: 'circle', size: 30, color: DOT },
          },
          durationMs: 750,
        }],
        response: { kind: 'none' },
        correct: { kind: 'none' },
      },
      store: ['prime.location', 'group.label'],
    },

    {
      name: 'generation',
      autoAdvanceMs: 0,
      factors: [
        { name: 'item', from: '{group.generation}' },
        ...dotColours('item.answer'),
      ],
      repetitions: 1,
      order: 'fixed',
      trial: {
        phases: [{
          name: 'guess',
          display: { kind: 'blank' },
          awaitsResponse: true,
          startsClock: true,
        }],
        response: BOXES,
        correct: { kind: 'matchesFactor', factor: 'item.answer' },
        // The correct box is shown after every press, right or wrong, as the original does —
        // which is what makes this a cued reproduction rather than a memory test.
        feedback: {
          durationMs: 750,
          inMain: true,
          display: {
            kind: 'positioned',
            at: '{item.at}',
            content: { kind: 'shape', shape: 'circle', size: 30, color: DOT },
          },
          correct: { en: 'Correct', he: 'נכון' },
          incorrect: { en: 'The correct one is shown', he: 'התשובה הנכונה מוצגת' },
        },
        itiMs: 0,
      },
      store: ['item.answer', 'item.sequencePosition', 'group.label'],
    },
  ],

  thanks: { showResults: false },

  dashboard: {
    charts: [
      {
        title: 'Mean RT by Block (correct trials)',
        description: `Times fall as the sequence is learned. Block ${SRT_INTERFERENCE_BLOCK} is `
          + 'secretly a different sequence — the jump there is the learning.',
        kind: 'line',
        groupBy: 'item.block',
        measure: 'meanRt',
        correctOnly: true,
        errorBars: true,
        filter: { 'item.sequenceType': ['main', 'interference'] },
        xLabel: 'Block',
        yLabel: 'RT (ms)',
      },
      {
        title: 'Mean RT across each block',
        description: 'Each block split into its nine passes through the sequence, so the '
          + 'within-block course of learning is visible as well as the between-block one.',
        kind: 'line',
        groupBy: 'trial_index',
        bin: 12,
        seriesBy: 'stage',
        measure: 'meanRt',
        correctOnly: true,
        filter: { 'item.sequenceType': ['main', 'interference'] },
        xLabel: 'Pass through the sequence, within block',
        yLabel: 'RT (ms)',
      },
      {
        title: 'Mean RT by Block — sequence A vs B as the learned one',
        description: 'The two counterbalancing groups. If the jump is real it happens for '
          + 'both, which is what counterbalancing is for.',
        kind: 'line',
        groupBy: 'item.block',
        seriesBy: 'group.label',
        measure: 'meanRt',
        correctOnly: true,
        filter: { 'item.sequenceType': ['main', 'interference'] },
        xLabel: 'Block',
        yLabel: 'RT (ms)',
      },
      {
        title: 'Individual participants: RT × accuracy',
        description: 'Each dot is one participant. Someone very fast and very inaccurate was '
          + 'pressing ahead of the dot rather than reacting to it.',
        kind: 'xy',
        groupBy: 'participant',
        measure: 'accuracy',
        axes: {
          x: {
            measure: 'meanRt', correctOnly: true,
            filter: { 'item.sequenceType': ['main', 'interference'] },
            label: 'Mean RT (ms)',
          },
          y: {
            measure: 'accuracy',
            filter: { 'item.sequenceType': ['main', 'interference'] },
            label: 'Accuracy (%)',
          },
        },
      },
      {
        title: 'Generation task: accuracy by sequence position',
        description: 'Reproducing the sequence from memory. 25% is chance with four '
          + 'locations — at or near it means the learning never became explicit.',
        kind: 'bar',
        groupBy: 'item.sequencePosition',
        measure: 'accuracy',
        errorBars: true,
        referenceLine: 25,
        filter: { stage: 'generation' },
        xLabel: 'Sequence position',
        yLabel: 'Accuracy (%)',
      },
      {
        title: 'Generation task: individual accuracy',
        description: 'One bar per participant, against the same 25% chance line.',
        kind: 'bar',
        groupBy: 'participant',
        measure: 'accuracy',
        referenceLine: 25,
        filter: { stage: 'generation' },
        yLabel: 'Accuracy (%)',
      },
      {
        title: 'Did participants notice a regularity?',
        description: 'Asked before the generation task, so the question could not plant the '
          + 'idea before they were tested on it.',
        kind: 'pie',
        groupBy: 'response',
        measure: 'count',
        filter: { stage: 'awareness' },
        groups: [
          { value: 'yes', label: 'Yes' },
          { value: 'no', label: 'No' },
        ],
      },
    ],
    stats: [
      {
        label: `Block ${SRT_INTERFERENCE_BLOCK} slowing`,
        measure: 'meanRt',
        correctOnly: true,
        difference: { factor: 'item.block', level: SRT_INTERFERENCE_BLOCK, minus: SRT_INTERFERENCE_BLOCK - 1 },
        unit: 'ms',
        signed: true,
      },
      {
        label: 'Generation accuracy',
        measure: 'accuracy',
        filter: { stage: 'generation' },
        unit: '%',
      },
    ],
  },

  mock: {
    participants: 24,
    baseRtMs: 520,
    baseAccuracy: 0.95,
    effects: [
      // Learning across blocks, and the jump when the sequence changes underneath them.
      { factor: 'item.block', level: 1, rtDeltaMs: 120 },
      { factor: 'item.block', level: 2, rtDeltaMs: 60 },
      { factor: 'item.block', level: 3, rtDeltaMs: 10 },
      { factor: 'item.block', level: 4, rtDeltaMs: -30 },
      { factor: 'item.block', level: SRT_INTERFERENCE_BLOCK, rtDeltaMs: 110 },
      { factor: 'item.block', level: 6, rtDeltaMs: -40 },
    ],
  },

  simplifications: [
    {
      what: 'The second chart splits each block into its nine passes rather than numbering all 54 passes end to end',
      why: 'A chart bins a stored field, and the pass number within a block is what the trial '
        + 'index gives. The same learning curve is visible, split by block instead of laid '
        + 'out along one axis.',
    },
    {
      what: 'Individual generation accuracy is one bar per participant rather than a jittered strip',
      why: 'The same number per person against the same 25% chance line. The runtime draws a '
        + 'per-participant comparison as bars.',
    },
    {
      what: 'The two priming dots are shown without the four empty boxes around them',
      why: 'A block that asks nothing has no response buttons, and the boxes ARE the buttons. '
        + 'The dot appears in the same place it would have; only the surrounding outlines '
        + 'are missing, for a second and a half before the generation task.',
    },
    {
      what: 'Each block after the first begins with a short screen naming it',
      why: 'The original runs all 648 trials without a break. The runtime marks the boundary '
        + 'between blocks; the trials, their order and their timing are unchanged.',
    },
  ],
};
