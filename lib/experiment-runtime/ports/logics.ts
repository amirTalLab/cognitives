import type { ExperimentDefinition, PoolItem } from '../schema';
import { ANCHORING_BLOCKS, Q_RULE, SINGLE_QUESTIONS } from '../../logics/questions';
import type { QuestionDef } from '../../../types/logics';

// ─── Reasoning biases ─────────────────────────────────────────────────────────
// Original: app/logics/ (page, experiment, thanks, teacher) and lib/logics/questions.ts.
//
// A battery of the classic demonstrations that reasoning goes wrong in predictable ways:
// availability, representativeness, confirmation, anchoring, framing, and the cognitive
// reflection test. Twenty-three questions, of which seven are SPLIT — the same question
// asked two ways, one wording per participant, so the comparison is between people rather
// than within them. A 90% survival rate and a 10% mortality rate are the same fact.
//
// THE QUESTIONS ARE IMPORTED, NOT COPIED. Every word, option and split comes from
// lib/logics/questions.ts, the file the hand-built pages already use, so the two cannot
// drift and no Hebrew is retyped. This port shapes them into pools; it does not author them.
//
// Four blocks rather than one, because the SHAPE of a trial differs between kinds of
// question and a phase cannot change shape per trial: a single question is one screen, an
// anchoring block is a judgement then an estimate, the multiplication block is a timed view
// then an estimate, and the rule task is a component. See `simplifications`.

/** A question as the runtime draws it: both wordings, its own options, its own scale. */
function asQuestion(q: QuestionDef, set: string): PoolItem {
  const a = q.split && q.textA ? q.textA : q.text;
  const b = q.split && q.textB ? q.textB : q.text;
  return {
    code: q.code,
    type: q.type,
    set,
    // Both wordings on every item, equal where the question is not split, so the display
    // branches on the participant's group without needing to know which questions split.
    textAEn: a?.en ?? '',
    textAHe: a?.he ?? '',
    textBEn: b?.en ?? '',
    textBHe: b?.he ?? '',
    options: (q.options ?? []).map(o => ({ value: o.value, label: o.en, labelHe: o.he })),
    noteEn: q.multiSelectNote?.en ?? '',
    noteHe: q.multiSelectNote?.he ?? '',
    unitEn: q.unit?.en ?? '',
    unitHe: q.unit?.he ?? '',
    minLabelEn: q.likertMin?.en ?? '',
    minLabelHe: q.likertMin?.he ?? '',
    maxLabelEn: q.likertMax?.en ?? '',
    maxLabelHe: q.likertMax?.he ?? '',
    // Whether this question HAS a right answer. Framing and anchoring do not — the finding
    // is which way people lean, and scoring a preference would invent a correctness the
    // task does not have. See `ANSWERS`.
    scored: ANSWERS[q.code] ? 'yes' : 'no',
  };
}

/**
 * The right answer, where there is one.
 *
 * Taken from the hand-built dashboard (app/logics/teacher/page.tsx), which is where these
 * have always lived — a test compares the two so they cannot drift apart.
 *
 * Several accepted spellings where the answer is a word rather than a number: a participant
 * typing "second" and one typing "2" have both passed the same reflection test, and counting
 * one of them wrong would make the effect look larger than it is.
 */
const ANSWERS: Record<string, string | string[]> = {
  // Availability — the answer people miss because vivid cases come to mind first.
  'Q-A1': 'same',
  'Q-A2': 'suicide',
  'Q-A3': 'dogs',
  'Q-A4': 'third-k',
  // Representativeness.
  'Q-R1': 'equal',
  'Q-R2': 'teller',
  'Q-R3': 'equal',
  // Confirmation: the card sets that could actually falsify the rule. Recorded in the order
  // the options were offered, so one string means one set.
  'Q-WASON-A': 'E,7',
  'Q-WASON-B': 'beer,16yo',
  // Cognitive reflection: the considered answer, not the one that springs to mind.
  'Q-CRT-1': '5',
  'Q-CRT-2': '5',
  'Q-CRT-3': '47',
  'Q-CRT-4': ['2', 'second', 'שני', 'שניה', 'שנייה'],
  'Q-CRT-5': '8',
  'Q-CRT-6': '3',
};

/** Which set of biases a question belongs to, for the dashboard. */
const SET_OF: Record<string, string> = {
  'Q-A1': 'availability', 'Q-A2': 'availability', 'Q-A3': 'availability', 'Q-A4': 'availability',
  'Q-R1': 'representativeness', 'Q-R2': 'representativeness', 'Q-R3': 'representativeness',
  'Q-WASON-A': 'confirmation', 'Q-WASON-B': 'confirmation',
  'Q-FRAME-1': 'framing', 'Q-FRAME-2': 'framing', 'Q-FRAME-3': 'framing', 'Q-FRAME-4': 'framing',
  'Q-CRT-1': 'reflection', 'Q-CRT-2': 'reflection', 'Q-CRT-3': 'reflection',
  'Q-CRT-4': 'reflection', 'Q-CRT-5': 'reflection', 'Q-CRT-6': 'reflection',
};

const SINGLES: PoolItem[] = SINGLE_QUESTIONS.map(q => asQuestion(q, SET_OF[q.code] ?? 'other'));

/** The two anchoring blocks: a high-or-low judgement against an anchor, then an estimate. */
const ANCHORS: PoolItem[] = ANCHORING_BLOCKS
  .filter(b => b.code !== 'Q-ANCH-3')
  .map(block => ({
    ...asQuestion(block.screen1, 'anchoring'),
    code: block.code,
    // The estimate that follows, which is the measure — the judgement before it exists only
    // to put a number in mind.
    estimateEn: block.screen2.text?.en ?? '',
    estimateHe: block.screen2.text?.he ?? '',
    unitEn: block.screen2.unit?.en ?? '',
    unitHe: block.screen2.unit?.he ?? '',
    scored: 'no',
  }));

/** The multiplication block: five seconds with the product, then an estimate of it. */
const MULTIPLICATION = ANCHORING_BLOCKS.find(b => b.code === 'Q-ANCH-3')!;
const MULTIPLICATION_ITEM: PoolItem = {
  ...asQuestion(MULTIPLICATION.screen1, 'anchoring'),
  code: MULTIPLICATION.code,
  estimateEn: MULTIPLICATION.screen2.text?.en ?? '',
  estimateHe: MULTIPLICATION.screen2.text?.he ?? '',
  unitEn: '',
  unitHe: '',
  scored: 'no',
};

/** The question, in the wording this participant's group was given. */
const QUESTION_TEXT = {
  kind: 'switch' as const,
  by: 'group.label',
  cases: {
    A: { kind: 'text' as const, text: '{q.textAEn}', textHe: '{q.textAHe}', size: 20 },
    B: { kind: 'text' as const, text: '{q.textBEn}', textHe: '{q.textBHe}', size: 20 },
  },
};

/** Every kind of answer the battery collects, chosen per question. */
const RESPONSES = {
  by: 'q.type',
  sets: {
    'multiple-choice': { kind: 'choice' as const, layout: 'column' as const, options: [], optionsFrom: '{q.options}' },
    'multi-select': { kind: 'multiSelect' as const, options: [], optionsFrom: '{q.options}' },
    likert: {
      kind: 'rating' as const,
      min: 1,
      max: 5,
      minLabel: '{q.minLabelEn}',
      maxLabel: '{q.maxLabelEn}',
      minLabelHe: '{q.minLabelHe}',
      maxLabelHe: '{q.maxLabelHe}',
    },
    'free-number': { kind: 'number' as const, unit: '{q.unitEn}', unitHe: '{q.unitHe}' },
  },
};

export const LOGICS_PORT: ExperimentDefinition = {
  version: 1,
  slug: 'logics',
  title: 'Reasoning Biases',
  titleHe: 'הטיות בחשיבה',
  category: 'REASONING',

  instructions: {
    en: 'A set of short reasoning questions — about risk, chance, wording and arithmetic.\n\n'
      + 'There is no time limit. Answer with your first considered judgement rather than '
      + 'working each one out on paper.\n'
      + 'Some questions have a right answer and some are only asking what you think.\n\n'
      + 'About 23 questions, 10-15 minutes.',
    he: 'סדרה של שאלות חשיבה קצרות — על סיכון, סיכוי, ניסוח וחשבון.\n\n'
      + 'אין הגבלת זמן. ענו לפי השיפוט הראשוני שלכם, בלי לפתור כל שאלה על דף.\n'
      + 'לחלק מהשאלות יש תשובה נכונה ולחלק אין — הן שואלות רק מה דעתכם.\n\n'
      + 'כ-23 שאלות, 10-15 דקות.',
  },

  // One wording per participant, drawn once and in scope for every block. This is the whole
  // design of the split questions: nobody sees both framings, because seeing both is what
  // makes the effect disappear.
  pools: {
    groups: [{ label: 'A' }, { label: 'B' }],
    singles: SINGLES,
  },
  assign: { pool: 'groups', as: 'group' },

  factors: [{ name: 'q', from: 'singles' }],
  repetitions: 1,
  order: 'shuffled',
  stageName: 'questions',

  trial: {
    phases: [{
      name: 'question',
      display: QUESTION_TEXT,
      awaitsResponse: true,
      startsClock: true,
    }],
    response: RESPONSES,
    // Right answers where there are right answers, and none where there are not.
    correct: {
      by: 'q.scored',
      sets: {
        yes: { kind: 'mapping', factor: 'q.code', expect: ANSWERS },
        no: { kind: 'none' },
      },
    },
    itiMs: 300,
  },

  store: ['q.code', 'q.set', 'q.type', 'q.scored', 'group.label'],

  stages: [
    // ── The rule task ─────────────────────────────────────────────────────────
    //
    // A component, because the participant authors the stimulus: they type triples and a
    // predicate judges them, so there are no trials to plan. See docs/ESCAPE-HATCH.md.
    {
      name: 'ruleDiscovery',
      title: { en: 'Discovering a rule', he: 'גילוי כלל' },
      instructions: { en: Q_RULE.text?.en ?? '', he: Q_RULE.text?.he ?? '' },
      pools: { rule: [{ code: Q_RULE.code, set: 'confirmation', type: 'interactive-rule', scored: 'no' }] },
      factors: [{ name: 'q', from: 'rule' }],
      repetitions: 1,
      trial: {
        phases: [{
          name: 'rule',
          display: { kind: 'text', text: '2 – 4 – 6', size: 28 },
          component: 'wasonRuleDiscovery',
          awaitsResponse: true,
          startsClock: true,
        }],
        response: { kind: 'text' },
        correct: { kind: 'none' },
        itiMs: 300,
      },
      store: ['q.code', 'q.set', 'q.scored', 'group.label'],
    },

    // ── Anchoring ─────────────────────────────────────────────────────────────
    //
    // Two screens: a high-or-low judgement against a number that is pure noise, then an
    // estimate. The estimate is the measure, and it lands near whichever anchor was shown.
    {
      name: 'anchoring',
      title: { en: 'Two estimates', he: 'שתי הערכות' },
      pools: { anchors: ANCHORS },
      factors: [{ name: 'q', from: 'anchors' }],
      repetitions: 1,
      order: 'shuffled',
      trial: {
        phases: [
          { name: 'judgement', display: QUESTION_TEXT, awaitsResponse: true },
          {
            name: 'estimate',
            display: { kind: 'text', text: '{q.estimateEn}', textHe: '{q.estimateHe}', size: 20 },
            awaitsResponse: true,
            startsClock: true,
          },
        ],
        response: [
          { kind: 'choice', layout: 'row', options: [], optionsFrom: '{q.options}', phase: 'judgement' },
          { kind: 'number', unit: '{q.unitEn}', unitHe: '{q.unitHe}', phase: 'estimate' },
        ],
        correct: { kind: 'none' },
        itiMs: 300,
      },
      store: ['q.code', 'q.set', 'group.label'],
    },

    // ── The multiplication estimate ───────────────────────────────────────────
    //
    // Five seconds with 1×2×…×8 or 8×7×…×1 — the same product, read in two directions — and
    // then an estimate. Estimates from the descending version run far higher, because the
    // first numbers seen do the anchoring.
    {
      name: 'multiplication',
      title: { en: 'A quick estimate', he: 'הערכה מהירה' },
      pools: { multiplication: [MULTIPLICATION_ITEM] },
      factors: [{ name: 'q', from: 'multiplication' }],
      repetitions: 1,
      trial: {
        phases: [
          // Timed, not answered: the original gives five seconds with the expression and
          // moves on by itself. Long enough to read, too short to calculate — which is the
          // condition the effect needs.
          { name: 'view', display: QUESTION_TEXT, durationMs: 5000 },
          {
            name: 'estimate',
            display: { kind: 'text', text: '{q.estimateEn}', textHe: '{q.estimateHe}', size: 20 },
            awaitsResponse: true,
            startsClock: true,
          },
        ],
        response: { kind: 'number' },
        correct: { kind: 'none' },
        itiMs: 300,
      },
      store: ['q.code', 'q.set', 'group.label'],
    },
  ],

  simplifications: [{
    what: 'The original shuffles all 23 questions into one sequence. Here the 19 single '
      + 'questions are shuffled among themselves, and then the rule task, the two anchoring '
      + 'blocks (shuffled) and the multiplication block follow, in that order.',
    why: 'The SHAPE of a trial differs between them — one screen, two screens, a timed view, '
      + 'a component — and a phase cannot change shape per trial. Each of the four is a '
      + 'between-subject comparison sitting at the same position for every participant, so '
      + 'fixing the position does not confound any of them; it only means everyone meets '
      + 'them in the same order.',
  }],

  thanks: { showResults: false },

  dashboard: {
    stats: [
      { label: 'Reflection test correct', measure: 'accuracy', filter: { 'q.set': 'reflection' }, unit: '%' },
      { label: 'Card task correct', measure: 'accuracy', filter: { 'q.set': 'confirmation' }, unit: '%' },
    ],
    charts: [
      {
        title: 'Accuracy by kind of bias',
        description: 'Only the questions with a right answer. Each bar is a different way of '
          + 'being systematically wrong.',
        kind: 'bar',
        groupBy: 'q.set',
        measure: 'accuracy',
        filter: { 'q.scored': 'yes' },
        errorBars: true,
        groups: [
          { value: 'availability', label: 'Availability' },
          { value: 'representativeness', label: 'Representativeness' },
          { value: 'confirmation', label: 'Confirmation' },
          { value: 'reflection', label: 'Reflection' },
        ],
        yLabel: 'Correct (%)',
      },
      {
        title: 'The abstract card task against the same problem told as a story',
        description: 'Identical logic, and the bar on the right is far higher. The rule is '
          + 'easier to test when it is about people breaking a law than about vowels and '
          + 'even numbers.',
        kind: 'bar',
        groupBy: 'q.code',
        measure: 'accuracy',
        filter: { 'q.set': 'confirmation' },
        errorBars: true,
        groups: [
          { value: 'Q-WASON-A', label: 'Cards (abstract)' },
          { value: 'Q-WASON-B', label: 'Bar inspector (social)' },
        ],
        yLabel: 'Correct (%)',
      },
      {
        title: 'Framing: the same fact, worded two ways',
        description: 'Each participant saw only one wording. If the wording made no '
          + 'difference the two bars would meet.',
        kind: 'bar',
        groupBy: 'q.code',
        seriesBy: 'group.label',
        measure: 'meanRt',
        filter: { 'q.set': 'framing' },
        errorBars: true,
        yLabel: 'Time to answer (ms)',
      },
      {
        title: 'Reflection test: how often the obvious answer wins',
        kind: 'bar',
        groupBy: 'q.code',
        measure: 'accuracy',
        filter: { 'q.set': 'reflection' },
        errorBars: true,
        yLabel: 'Correct (%)',
      },
    ],
  },
};
