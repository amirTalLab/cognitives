import type { Bound, Display, ExperimentDefinition, PoolItem } from '../schema';
import { TS_PRACTICE, TS_WALKS } from '../stimuli/two-step-trials';
import {
  ISI_MS, PRACTICE_TRIALS, REWARD_MS, STAGE1_CHOICE_MS, STAGE1_STIMULI,
  STAGE2A_STIMULI, STAGE2B_STIMULI, STAGE2_CHOICE_MS, STATE_COLORS, TRANSITION_MS,
} from '../../two-step-task/stimuli';

// ─── The two-step task ────────────────────────────────────────────────────────
// Original: app/twoStepTask/ (page, practice, experiment, thanks, teacher) and
// lib/two-step-task/stimuli.ts.
//
// Pick one of two symbols. That usually — 70% of the time — takes you to one of two worlds,
// and occasionally to the other. In whichever world you land, pick again, and sometimes you
// are paid. The four payout rates drift slowly, so what was good ten trials ago may not be.
//
// The design exists to separate two ways of learning that look identical from the outside.
// A MODEL-FREE learner repeats whatever was just rewarded: paid after this first choice, do
// it again. A MODEL-BASED learner knows where each choice usually leads, so a reward reached
// through a RARE transition tells them to switch — the payout was in the other world, and
// the way to get back there is the other symbol. Rare trials are where the two come apart,
// and they are why the transition has to be probabilistic rather than fixed.
//
// WHAT THIS PORT NEEDED, and it was not what I expected: not trial history — nothing here
// depends on the previous trial, and the drifting payouts are a walk drawn before anyone
// starts — but WITHIN-trial contingency. The second half of a trial cannot be planned,
// because it depends on the first half. That is `trial.outcomes`.

const asPool = (rows: unknown[]): PoolItem[] => rows.map(r => ({ ...(r as PoolItem) }));

/** One symbol, drawn large, in the colour of the world it belongs to. */
const symbol = (text: string, color: string, size = 64): Display =>
  ({ kind: 'text', text, color, size });

/** The two first-stage symbols, side by side. */
const STAGE1_DISPLAY: Display = {
  kind: 'row',
  gap: 80,
  items: [
    symbol(STAGE1_STIMULI[0], '#22c55e'),
    symbol(STAGE1_STIMULI[1], '#22c55e'),
  ],
};

/**
 * Which world the first choice led to.
 *
 * A switch on the OUTCOME, not on a factor: the world is not known until the choice is made,
 * and on a rare trial it is not the one the participant expected.
 */
const TRANSITION_DISPLAY: Display = {
  kind: 'switch',
  by: 'state',
  cases: {
    A: symbol('◆', STATE_COLORS.A.border, 72),
    B: symbol('◆', STATE_COLORS.B.border, 72),
  },
};

/** The second-stage pair belongs to the world, so the display branches on it too. */
const STAGE2_DISPLAY: Display = {
  kind: 'switch',
  by: 'state',
  cases: {
    A: {
      kind: 'row',
      gap: 80,
      items: [
        symbol(STAGE2A_STIMULI[0], STATE_COLORS.A.border),
        symbol(STAGE2A_STIMULI[1], STATE_COLORS.A.border),
      ],
    },
    B: {
      kind: 'row',
      gap: 80,
      items: [
        symbol(STAGE2B_STIMULI[0], STATE_COLORS.B.border),
        symbol(STAGE2B_STIMULI[1], STATE_COLORS.B.border),
      ],
    },
  },
};

/** Paid or not. The only thing a model-free learner takes from the trial. */
const REWARD_DISPLAY: Display = {
  kind: 'switch',
  by: 'rewarded',
  cases: {
    true: symbol('🪙', '#facc15', 80),
    false: symbol('∅', '#64748b', 72),
  },
};

const CHOICE = {
  kind: 'choice' as const,
  layout: 'row' as const,
  options: [
    { value: 'left', label: 'Left', labelHe: 'שמאל', key: 'f' },
    { value: 'right', label: 'Right', labelHe: 'ימין', key: 'j' },
  ],
};

/**
 * Everything that follows from the two choices, looked up rather than computed.
 *
 * Each trial carries the outcome of every branch, drawn when it was built. `state` and
 * `transition` are picked by the first choice; `reward` narrows to the world's pair, and
 * `rewarded` then picks within it by the second choice. Chained, because whether the second
 * choice paid depends on both of them.
 */
const OUTCOMES: { name: string; by: string; cases: Record<string, Bound<string | number | boolean>> }[] = [
  {
    name: 'state',
    by: 'answer.stage1',
    cases: { left: '{trial.stateIfLeft}', right: '{trial.stateIfRight}' },
  },
  {
    name: 'transition',
    by: 'answer.stage1',
    cases: { left: '{trial.transitionIfLeft}', right: '{trial.transitionIfRight}' },
  },
  {
    name: 'reward',
    by: 'state',
    cases: { A: '{trial.rewardA}', B: '{trial.rewardB}' },
  },
  {
    name: 'rewarded',
    by: 'answer.stage2',
    cases: { left: '{reward.left}', right: '{reward.right}' },
  },
];

const TRIAL = {
  phases: [
    {
      name: 'stage1',
      display: STAGE1_DISPLAY,
      awaitsResponse: true,
      startsClock: true,
      // Two seconds to choose, then the trial is a miss. The pace is part of the task: a
      // participant who deliberates has time to reason their way to model-based behaviour
      // that they would not otherwise show.
      timeoutMs: STAGE1_CHOICE_MS,
    },
    { name: 'transition', display: TRANSITION_DISPLAY, durationMs: TRANSITION_MS },
    {
      name: 'stage2',
      display: STAGE2_DISPLAY,
      awaitsResponse: true,
      timeoutMs: STAGE2_CHOICE_MS,
    },
    { name: 'reward', display: REWARD_DISPLAY, durationMs: REWARD_MS },
  ],
  response: [
    { ...CHOICE, phase: 'stage1' },
    { ...CHOICE, phase: 'stage2' },
  ],
  outcomes: OUTCOMES,
  // No right answer: the whole point is which strategy someone uses, and scoring a choice
  // would invent a correctness the task does not have.
  correct: { kind: 'none' as const },
  itiMs: ISI_MS,
};

const STORE = [
  'trial.index', 'trial.walk', 'state', 'transition', 'rewarded',
  'trial.probA1', 'trial.probA2', 'trial.probB1', 'trial.probB2',
];

export const TWO_STEP_PORT: ExperimentDefinition = {
  version: 1,
  slug: 'twoStepTask',
  title: 'Two-Step Task',
  titleHe: 'משימת שני השלבים',
  category: 'LEARNING',

  instructions: {
    en: 'Choose one of two symbols. It will usually take you to one of two coloured worlds, '
      + 'and now and then to the other one.\n\n'
      + 'In that world, choose again. Sometimes you win a coin.\n'
      + 'How often each choice pays changes slowly, so keep track of what has been working '
      + 'and be ready for it to stop.\n\n'
      + 'You have two seconds for each choice. 10 practice + 100 trials, about 15 minutes.',
    he: 'בחרו אחד משני סמלים. הוא יוביל אתכם בדרך כלל לאחד משני עולמות צבעוניים, ומדי פעם '
      + 'לשני.\n\n'
      + 'בעולם שאליו הגעתם, בחרו שוב. לעיתים תזכו במטבע.\n'
      + 'הסיכוי שכל בחירה תשתלם משתנה לאט, אז עקבו אחרי מה שעובד והיו מוכנים לכך שיפסיק.\n\n'
      + 'יש שתי שניות לכל בחירה. 10 ניסיונות תרגול + 100 ניסיונות, כ-15 דקות.',
  },

  // A participant is given one walk for the whole run, which is what makes the drift a
  // history they can learn: a fresh walk per trial would be noise with no structure to find.
  pools: {
    walks: TS_WALKS.map((rows, i) => ({ label: `w${i + 1}`, trials: asPool(rows) })),
    practiceTrials: asPool(TS_PRACTICE),
  },
  assign: { pool: 'walks', as: 'run' },

  factors: [{ name: 'trial', from: '{run.trials}' }],
  repetitions: 1,
  // The walk is a sequence: shuffling it would destroy the slow drift that is the only thing
  // there is to learn.
  order: 'fixed',

  practice: {
    count: PRACTICE_TRIALS,
    feedback: false,
    record: false,
    from: { factor: 'trial', pool: 'practiceTrials' },
  },

  trial: TRIAL,
  store: STORE,

  thanks: { showResults: false },

  dashboard: {
    stats: [
      { label: 'Stayed after a reward', measure: 'proportion', ofResponse: 'left', unit: '%' },
      { label: 'Rewarded trials', measure: 'proportion', ofResponse: 'true', filter: { rewarded: true }, unit: '%' },
    ],
    charts: [
      {
        title: 'Where each first choice led',
        description: 'Common transitions should be about 70% — the check that the world is '
          + 'behaving as the task says it does, not a finding.',
        kind: 'bar',
        groupBy: 'transition',
        measure: 'count',
        groups: [
          { value: 'common', label: 'Common (70%)' },
          { value: 'rare', label: 'Rare (30%)' },
        ],
        yLabel: 'Trials',
      },
      {
        title: 'Rewards by world',
        description: 'How often each world paid out, which drifts across the session — this '
          + 'is the thing a participant is tracking.',
        kind: 'bar',
        groupBy: 'state',
        measure: 'proportion',
        ofResponse: 'true',
        filter: { rewarded: true },
        groups: [
          { value: 'A', label: 'World A' },
          { value: 'B', label: 'World B' },
        ],
        yLabel: 'Rewarded (%)',
      },
      {
        title: 'Second-stage choices by world',
        description: 'Whether people settle on one symbol in each world, and whether they '
          + 'move when the payouts drift.',
        kind: 'bar',
        groupBy: 'state',
        seriesBy: 'transition',
        measure: 'count',
        yLabel: 'Trials',
      },
    ],
  },

  simplifications: [{
    what: 'The headline analysis — whether someone repeats a first choice, split by whether '
      + 'the last trial was rewarded and whether its transition was common or rare — is not '
      + 'one of the charts.',
    why: 'That number compares a trial with the one BEFORE it, and the dashboard aggregates '
      + 'trials independently; it has no notion of a previous row. Everything needed to '
      + 'compute it is stored on every row — the choice, the transition, the reward and the '
      + 'trial index — so the export supports it, and the hand-built dashboard at '
      + '/twoStepTask/teacher still draws it. This is the trial-history gap, showing up in '
      + 'the analysis rather than in the task.',
  }],

  mock: {
    participants: 16,
    baseRtMs: 900,
    baseAccuracy: 0.5,
  },
};
