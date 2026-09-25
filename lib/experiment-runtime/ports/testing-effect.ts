import type { Display, ExperimentDefinition, PoolItem } from '../schema';
import {
  RESTUDY_DISPLAY_MS, RETRIEVAL_FEEDBACK_MS, RETRIEVAL_TIMEOUT_MS, SET_A, SET_B, SET_C,
  STUDY_BLANK_MS, STUDY_DISPLAY_MS, TEST_BLANK_MS, TEST_FIXATION_MS, TEST_TIMEOUT_MS,
} from '../../testing-effect/stimuli';

// ─── The testing effect ───────────────────────────────────────────────────────
// Original: app/testingEffect/ (page, session1, session2, thanks, teacher) and
// lib/testing-effect/stimuli.ts.
//
// Learn thirty-six word pairs. Then, for a third of them, read them again; for another
// third, TRY TO RECALL them with feedback; for the last third, nothing more. A week later,
// be tested on all thirty-six.
//
// The pairs you had to retrieve are the ones you remember. Being tested is not a way of
// measuring learning — it is a way of causing it, and it beats rereading, which is what
// almost everybody does instead. That is why the delay is a week: at ten minutes restudying
// looks better, and the effect reverses.
//
// TWO SITTINGS, which is what this port needed the runtime to learn. And far less than I
// expected: session two recovers exactly ONE value from session one — which counterbalance
// group the participant was in — and everything else follows from it here. So the capability
// is not "resumable sessions" but a between-subject assignment that is REMEMBERED rather than
// redrawn. See `assign.remember`.

/** The three sets, and which treatment each gets — rotated, so no set is tied to a condition. */
const ROTATION: Record<string, ['baseline' | 'restudy' | 'retrieval', 'baseline' | 'restudy' | 'retrieval', 'baseline' | 'restudy' | 'retrieval']> = {
  '1': ['baseline', 'restudy', 'retrieval'],
  '2': ['restudy', 'retrieval', 'baseline'],
  '3': ['retrieval', 'baseline', 'restudy'],
};

/**
 * One group: all thirty-six pairs, each already carrying its condition.
 *
 * Carried on the group rather than worked out per trial, because session two has to
 * reconstruct exactly this from the group label alone — a week later, with nothing else to
 * go on.
 */
const GROUPS: PoolItem[] = Object.entries(ROTATION).map(([label, conditions]) => ({
  label,
  pairs: [SET_A, SET_B, SET_C].flatMap((set, i) => set.map(pair => ({
    cue: pair.cue,
    target: pair.target,
    condition: conditions[i],
    set: ['A', 'B', 'C'][i],
    // Only a restudy trial shows anything for a while; a retrieval trial goes straight to
    // the prompt. Bound so one phase covers both.
    showMs: conditions[i] === 'restudy' ? RESTUDY_DISPLAY_MS : 0,
  }))),
}));

const CUE_AND_TARGET: Display = {
  kind: 'stack',
  items: [
    { kind: 'text', text: '{pair.cue}', size: 44, color: '#e2e8f0' },
    { kind: 'text', text: '{pair.target}', size: 36, color: '#a78bfa' },
  ],
};

const CUE_ONLY: Display = {
  kind: 'stack',
  items: [
    { kind: 'text', text: '{pair.cue}', size: 44, color: '#e2e8f0' },
    { kind: 'text', text: '?', size: 36, color: '#64748b' },
  ],
};

export const TESTING_EFFECT_PORT: ExperimentDefinition = {
  version: 1,
  slug: 'testingEffect',
  title: 'Testing Effect',
  titleHe: 'אפקט הבחינה',
  category: 'MEMORY',

  instructions: {
    en: 'This experiment happens in TWO sittings, a week apart. Choose which one you are '
      + 'here for.\n\n'
      + 'In the first you will learn pairs of words — a made-up word and a real one — and '
      + 'then go over some of them again.\n'
      + 'In the second you will be asked to remember them.\n\n'
      + 'Use the SAME name both times, or we cannot match you to what you learned.',
    he: 'הניסוי הזה מתקיים בשני מפגשים, בהפרש של שבוע. בחרו לאיזה מהם הגעתם.\n\n'
      + 'במפגש הראשון תלמדו זוגות מילים — מילה מומצאת ומילה אמיתית — ואז תחזרו על חלקן.\n'
      + 'במפגש השני תתבקשו להיזכר בהן.\n\n'
      + 'השתמשו באותו שם בשני המפגשים, אחרת לא נוכל להתאים ביניכם לבין מה שלמדתם.',
  },

  sessions: [
    {
      id: 'learn',
      title: { en: 'Session 1: Learning', he: 'חלק 1: למידה' },
      description: { en: 'Learn word pairs and practice', he: 'לימוד זוגות מילים ותרגול' },
      blocks: ['study', 'practice'],
    },
    {
      id: 'test',
      title: { en: 'Session 2: Test', he: 'חלק 2: מבחן' },
      description: {
        en: 'Memory test (one week after Session 1)',
        he: 'מבחן זיכרון (שבוע לאחר חלק 1)',
      },
      blocks: ['test'],
      requires: 'learn',
    },
  ],

  pools: { groups: GROUPS },
  // Remembered, not redrawn. A second sitting that drew a fresh group would test someone on
  // pairs they never studied, and the row would look perfectly valid.
  assign: { pool: 'groups', as: 'group', remember: 'group.label' },

  // ── Session 1, block 1: study every pair once ───────────────────────────────
  factors: [{ name: 'pair', from: '{group.pairs}' }],
  repetitions: 1,
  stageName: 'study',
  trial: {
    phases: [
      { name: 'blank', display: { kind: 'blank' }, durationMs: STUDY_BLANK_MS },
      { name: 'pair', display: CUE_AND_TARGET, durationMs: STUDY_DISPLAY_MS },
    ],
    response: { kind: 'none' },
    correct: { kind: 'none' },
    itiMs: 0,
  },
  store: ['pair.cue', 'pair.target', 'pair.condition', 'pair.set', 'group.label'],

  stages: [
    // ── Session 1, block 2: go over two thirds of them ────────────────────────
    //
    // Restudy pairs are simply shown again. Retrieval pairs are TESTED, with feedback. The
    // two are interleaved, exactly as the original shuffles them together — a block of one
    // followed by a block of the other would be a different manipulation, because knowing
    // which is coming changes how you read the screen.
    {
      name: 'practice',
      title: { en: 'Going over them', he: 'חזרה על הזוגות' },
      instructions: {
        en: 'Some pairs will be shown again. For others you will see the first word and be '
          + 'asked to type the second — do your best, and you will be told the answer.',
        he: 'חלק מהזוגות יוצגו שוב. באחרים תראו את המילה הראשונה ותתבקשו להקליד את השנייה — '
          + 'נסו כמיטב יכולתכם, והתשובה תוצג לאחר מכן.',
      },
      factors: [{ name: 'pair', from: '{group.pairs}' }],
      // The third that gets nothing more is the baseline: its whole role is to have been
      // studied once and then left alone.
      exclude: [{ 'pair.condition': 'baseline' }],
      repetitions: 2,
      trial: {
        phases: [
          { name: 'blank', display: { kind: 'blank' }, durationMs: STUDY_BLANK_MS },
          // Shown for four seconds on a restudy trial and skipped on a retrieval one, which
          // is the difference between reading an answer and having to produce it.
          { name: 'show', display: CUE_AND_TARGET, durationMs: '{pair.showMs}' },
          {
            name: 'recall',
            display: CUE_ONLY,
            awaitsResponse: true,
            startsClock: true,
            timeoutMs: RETRIEVAL_TIMEOUT_MS,
          },
        ],
        // Only a retrieval trial asks for anything. A restudy trial passes through the
        // recall phase without stopping, because nothing is bound to it.
        response: {
          by: 'pair.condition',
          sets: {
            restudy: { kind: 'none' },
            retrieval: { kind: 'text', placeholder: 'The second word' },
          },
        },
        correct: {
          by: 'pair.condition',
          sets: {
            restudy: { kind: 'none' },
            // Typed from memory, so a slip of two characters is still the word.
            retrieval: { kind: 'textMatch', factor: 'pair.target', plural: true, editDistance: 2 },
          },
        },
        feedback: {
          durationMs: RETRIEVAL_FEEDBACK_MS,
          correct: { en: 'Correct', he: 'נכון' },
          incorrect: { en: 'The answer was {pair.target}', he: 'התשובה הייתה {pair.target}' },
          timeout: { en: 'The answer was {pair.target}', he: 'התשובה הייתה {pair.target}' },
        },
        itiMs: 0,
      },
      store: ['pair.cue', 'pair.target', 'pair.condition', 'pair.set', 'group.label'],
    },

    // ── Session 2: a week later, test all thirty-six ──────────────────────────
    {
      name: 'test',
      title: { en: 'What do you remember?', he: 'ממה אתם זוכרים?' },
      instructions: {
        en: 'You will see the first word of each pair. Type the second one if you can '
          + 'remember it, and leave it blank if you cannot.',
        he: 'תראו את המילה הראשונה של כל זוג. הקלידו את השנייה אם אתם זוכרים, והשאירו ריק אם לא.',
      },
      factors: [{ name: 'pair', from: '{group.pairs}' }],
      repetitions: 1,
      trial: {
        phases: [
          { name: 'fixation', display: { kind: 'fixation' }, durationMs: TEST_FIXATION_MS },
          { name: 'blank', display: { kind: 'blank' }, durationMs: TEST_BLANK_MS },
          {
            name: 'recall',
            display: CUE_ONLY,
            awaitsResponse: true,
            startsClock: true,
            timeoutMs: TEST_TIMEOUT_MS,
          },
        ],
        response: { kind: 'text', placeholder: 'The second word' },
        correct: { kind: 'textMatch', factor: 'pair.target', plural: true, editDistance: 2 },
        // No feedback: this is the measure, and telling someone the answer would turn the
        // test into another round of learning.
        itiMs: 0,
      },
      store: ['pair.cue', 'pair.target', 'pair.condition', 'pair.set', 'group.label'],
    },
  ],

  thanks: { showResults: false },

  dashboard: {
    stats: [
      { label: 'Recalled after retrieval practice', measure: 'accuracy', filter: { stage: 'test', 'pair.condition': 'retrieval' }, unit: '%' },
      { label: 'Recalled after restudying', measure: 'accuracy', filter: { stage: 'test', 'pair.condition': 'restudy' }, unit: '%' },
      {
        label: 'Testing over rereading',
        measure: 'accuracy',
        filter: { stage: 'test' },
        difference: { factor: 'pair.condition', level: 'retrieval', minus: 'restudy' },
        unit: '%',
        signed: true,
      },
    ],
    charts: [
      {
        title: 'Recalled a week later, by what was done in between',
        description: 'The whole finding. Retrieval practice should beat restudying, even '
          + 'though restudying feels more productive at the time — and it is the comparison '
          + 'with baseline that shows going over them at all was worth anything.',
        kind: 'bar',
        groupBy: 'pair.condition',
        measure: 'accuracy',
        filter: { stage: 'test' },
        errorBars: true,
        groups: [
          { value: 'baseline', label: 'Studied once' },
          { value: 'restudy', label: 'Read again' },
          { value: 'retrieval', label: 'Tested' },
        ],
        yLabel: 'Recalled (%)',
      },
      {
        title: 'How retrieval practice itself went',
        description: 'Performance during the FIRST sitting, on the pairs that were tested '
          + 'then. Usually mediocre — which is exactly why the effect is easy to miss from '
          + 'the inside: struggling to recall feels less productive than rereading, and is '
          + 'what produces the advantage a week later.',
        kind: 'bar',
        groupBy: 'pair.set',
        measure: 'accuracy',
        filter: { stage: 'practice' },
        errorBars: true,
        xLabel: 'Word set',
        yLabel: 'Correct during practice (%)',
      },
      {
        title: 'Recall by word set',
        description: 'The sets rotate through the conditions between participants, so these '
          + 'bars should be level. A set that stands out is a property of the words, not of '
          + 'the manipulation.',
        kind: 'bar',
        groupBy: 'pair.set',
        measure: 'accuracy',
        filter: { stage: 'test' },
        errorBars: true,
        yLabel: 'Recalled (%)',
      },
      {
        title: 'Each participant: tested against reread',
        description: 'One dot per person. Above the diagonal is the effect in that person.',
        kind: 'xy',
        groupBy: 'participant',
        measure: 'accuracy',
        filter: { stage: 'test' },
        axes: {
          x: { measure: 'accuracy', filter: { stage: 'test', 'pair.condition': 'restudy' }, label: 'Reread (%)' },
          y: { measure: 'accuracy', filter: { stage: 'test', 'pair.condition': 'retrieval' }, label: 'Tested (%)' },
        },
      },
    ],
  },

  mock: {
    participants: 18,
    baseRtMs: 3200,
    baseAccuracy: 0.35,
    effects: [
      // A week later: tested beats reread, and both beat studying once.
      { factor: 'pair.condition', level: 'retrieval', accuracyDelta: 0.3 },
      { factor: 'pair.condition', level: 'restudy', accuracyDelta: 0.12 },
    ],
  },
};
