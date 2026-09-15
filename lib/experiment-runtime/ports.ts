// Hand-built experiments, ported to definitions.
//
// round-trips.ts showed the schema could express three live experiments in outline, and
// simplified each to do it. These are meant to REPLACE the hand-built pages, so they match
// them in everything but look: the same trials, practice block, timings, responses,
// feedback, what is saved, the thank-you screen, and the numbers on the dashboard. What
// still differs is listed under `simplifications`, where a lecturer can judge it.
//
// Each port uses the slug of the page it replaces. The hand-built route keeps running at
// /{slug} until the homepage is switched to /run/{slug}; sharing the slug means one lock
// covers both, and nothing else has to be renamed on the day of the switch.

import type { Display, ExperimentDefinition, PoolItem } from './schema';

// ─── Posner cueing ────────────────────────────────────────────────────────────
// Original: app/posnerCueing/ (page, experiment, thanks, teacher) and
// lib/posner-cueing/experiment.ts.
//
// Detection, not localisation: one button (or space) as soon as the ● appears in either
// box, 1500ms to respond, and nothing at all on catch trials. Per SOA (300 and 500ms) the
// original runs 40 valid, 10 invalid, 6 catch and 10 exogenous-invalid trials — 132 in all,
// shuffled together. The exogenous cue is the box on the wrong side turning red, with a
// neutral + where the arrow would be.
//
// That uneven mix is not a cross of factors, so each trial type is a pool item carrying its
// own SOA, and the pool is used whole.

type Side = 'left' | 'right';
type Soa = 300 | 500;

const BOX_GREY = '#71717a';
const CUE_RED = '#ef4444';

function posnerTrialType(validity: string, cue: Side, target: Side | null, soa: Soa): PoolItem {
  const exo = validity === 'exo_invalid';
  return {
    validity,
    soa,
    cueSide: cue,
    targetSide: target ?? 'none',
    cueSymbol: exo ? '+' : cue === 'left' ? '←' : '→',
    leftBorder: exo && cue === 'left' ? CUE_RED : BOX_GREY,
    rightBorder: exo && cue === 'right' ? CUE_RED : BOX_GREY,
    leftBorderWidth: exo && cue === 'left' ? 4 : 2,
    rightBorderWidth: exo && cue === 'right' ? 4 : 2,
    leftTarget: target === 'left' ? '●' : '',
    rightTarget: target === 'right' ? '●' : '',
  };
}

const times = (n: number, item: PoolItem): PoolItem[] => Array.from({ length: n }, () => item);

/** The main block, exactly as generateMainTrials builds it. */
const POSNER_TRIAL_TYPES: PoolItem[] = ([300, 500] as const).flatMap(soa => [
  ...times(20, posnerTrialType('valid', 'left', 'left', soa)),
  ...times(20, posnerTrialType('valid', 'right', 'right', soa)),
  ...times(5, posnerTrialType('invalid', 'left', 'right', soa)),
  ...times(5, posnerTrialType('invalid', 'right', 'left', soa)),
  ...times(3, posnerTrialType('catch', 'left', null, soa)),
  ...times(3, posnerTrialType('catch', 'right', null, soa)),
  ...times(5, posnerTrialType('exo_invalid', 'left', 'right', soa)),
  ...times(5, posnerTrialType('exo_invalid', 'right', 'left', soa)),
]);

/** The practice block, exactly as generatePracticeTrials builds it: 6 valid, 1 invalid, 1 catch. */
const POSNER_PRACTICE_TYPES: PoolItem[] = [
  posnerTrialType('valid', 'left', 'left', 300),
  posnerTrialType('valid', 'right', 'right', 500),
  posnerTrialType('valid', 'left', 'left', 500),
  posnerTrialType('valid', 'right', 'right', 300),
  posnerTrialType('valid', 'left', 'left', 300),
  posnerTrialType('valid', 'right', 'right', 500),
  posnerTrialType('invalid', 'left', 'right', 300),
  posnerTrialType('catch', 'right', null, 500),
];

/**
 * The two boxes with the centre symbol between them. The boxes are on screen for the whole
 * session — fixation, cue, target, feedback and the gap between trials — as in the original.
 * The centre sits in a fixed-width cell so the boxes do not shift as the symbol changes.
 */
function posnerScreen(centre: string, opts: { cued: boolean; target: boolean }): Display {
  const box = (side: Side): Display => ({
    kind: 'frame',
    size: 128,
    color: opts.cued ? `{trialType.${side}Border}` : BOX_GREY,
    thickness: opts.cued ? `{trialType.${side}BorderWidth}` : 2,
    ...(opts.target ? { content: { kind: 'text', text: `{trialType.${side}Target}`, size: 40 } } : {}),
  });
  const middle: Display = { kind: 'frame', size: 72, thickness: 0, content: { kind: 'text', text: centre, size: 40 } };
  return { kind: 'row', gap: 48, items: [box('left'), middle, box('right')] };
}

export const POSNER_CUEING: ExperimentDefinition = {
  version: 1,
  slug: 'posnerCueing',
  title: 'Spatial Cueing',
  titleHe: 'ניסוי הכוונת תשומת לב',
  category: 'ATTENTION',
  instructions: {
    en: [
      'The Posner effect',
      '',
      '1. You will see two boxes on screen — one on the left, one on the right — and a + in the middle.',
      '2. On each trial an arrow appears in the middle, pointing left (←) or right (→).',
      '3. Shortly afterwards, a ● appears inside one of the boxes.',
      '4. Your task: press the spacebar as fast as you can when you see the ●.',
      '5. The arrow usually points the right way — but not always!',
      '6. Keep your eyes on the + in the centre — do not look at the boxes.',
      '7. On some trials no target appears at all. Press nothing in that case.',
      '',
      'Press space when you see ●',
      '',
      'About 6–8 minutes • 8 practice + 132 trials',
    ].join('\n'),
    he: [
      'אפקט פוזנר',
      '',
      '1. בניסוי זה תראו שתי תיבות על המסך — אחת משמאל ואחת מימין — ו-+ במרכז.',
      '2. בכל ניסיון, חץ יופיע במרכז ויצביע שמאלה (←) או ימינה (→).',
      '3. זמן קצר לאחר מכן, יופיע ● בתוך אחת התיבות.',
      '4. המשימה שלכם: לחצו על מקש הרווח מהר ככל האפשר כשאתם רואים את ה-●.',
      '5. החץ לרוב מצביע לכיוון הנכון — אך לא תמיד!',
      '6. שמרו על עיניכם על ה-+ במרכז המסך — אל תביטו אל התיבות.',
      '7. בחלק מהניסיונות לא יופיע יעד כלל. אל תלחצו דבר במקרה זה.',
      '',
      'לחצו רווח כשרואים ●',
      '',
      'כ-6–8 דקות • 8 ניסיונות תרגול + 132 ניסיונות',
    ].join('\n'),
  },
  // The original's name field is not required.
  nameOptional: true,

  pools: { trialTypes: POSNER_TRIAL_TYPES, practiceTrialTypes: POSNER_PRACTICE_TYPES },
  factors: [{ name: 'trialType', from: 'trialTypes' }],
  repetitions: 1, // the pool is the whole main block: 132 trials
  // Practice gets the same feedback as the main block, and is never saved.
  practice: { count: 8, feedback: true, record: false, from: { factor: 'trialType', pool: 'practiceTrialTypes' } },

  trial: {
    phases: [
      // 800–1200ms, drawn afresh on every trial.
      { name: 'fixation', display: posnerScreen('+', { cued: false, target: false }), durationMs: 800, jitterMs: 400 },
      // The cue-target interval is the SOA, and the cue stays up once the target arrives.
      { name: 'cue', display: posnerScreen('{trialType.cueSymbol}', { cued: true, target: false }), durationMs: '{trialType.soa}' },
      {
        name: 'target',
        display: posnerScreen('{trialType.cueSymbol}', { cued: true, target: true }),
        awaitsResponse: true,
        startsClock: true,
        timeoutMs: 1500,
      },
    ],
    response: {
      kind: 'choice',
      layout: 'row',
      options: [{ value: 'press', label: '● Press', labelHe: '● לחצו', key: 'space' }],
    },
    // Pressing is right whenever there is a target; on a catch trial, pressing nothing is.
    correct: {
      kind: 'mapping',
      factor: 'trialType.validity',
      expect: { valid: 'press', invalid: 'press', exo_invalid: 'press', catch: 'none' },
    },
    itiMs: 600,
    // Empty boxes between trials, as the original leaves them on screen.
    itiDisplay: posnerScreen('', { cued: false, target: false }),
    // The button is on screen from fixation onward. A press before the target shows "too
    // early" and moves on to the next trial without saving anything, as the original does.
    earlyFrom: 'fixation',
    recordEarly: false,
    feedback: {
      durationMs: 500,
      inMain: true,
      // Empty boxes and a + while a message is up — the target and cue are cleared.
      display: posnerScreen('+', { cued: false, target: false }),
      timeout: { en: 'Missed — try to respond faster!', he: 'פספסת — נסו ללחוץ מהר יותר!' },
      incorrect: { en: 'No target — do not press!', he: 'לא היה יעד — אין ללחוץ!' },
      early: { en: 'Too early — wait for the ●!', he: 'מוקדם מדי — המתינו ל-●!' },
    },
  },

  // The original's thank-you page is the title alone, with no score.
  thanks: { title: { en: 'Thank you!', he: 'תודה רבה!' }, showResults: false },

  store: ['trialType.validity', 'trialType.cueSide', 'trialType.targetSide', 'trialType.soa'],

  dashboard: {
    stats: [
      { label: 'Avg Valid RT', measure: 'meanRt', correctOnly: true, filter: { 'trialType.validity': 'valid' }, unit: 'ms' },
      { label: 'Avg Invalid RT', measure: 'meanRt', correctOnly: true, filter: { 'trialType.validity': 'invalid' }, unit: 'ms' },
      {
        label: 'Avg Validity Effect',
        measure: 'meanRt',
        correctOnly: true,
        difference: { factor: 'trialType.validity', level: 'invalid', minus: 'valid' },
        unit: 'ms',
        signed: true,
      },
    ],
    charts: [
      {
        title: 'Average RT by Cue Type',
        description: 'Exogenous = misleading peripheral rectangle (always wrong side)',
        kind: 'bar',
        groupBy: 'trialType.validity',
        measure: 'meanRt',
        correctOnly: true,
        filter: { 'trialType.validity': ['valid', 'invalid', 'exo_invalid'] },
        groups: [
          { value: 'valid', label: 'Valid' },
          { value: 'invalid', label: 'Invalid' },
          { value: 'exo_invalid', label: 'Exogenous' },
        ],
        yLabel: 'RT (ms)',
        errorBars: false,
      },
      {
        title: 'Validity Effect Distribution',
        description: 'Each dot = one participant (Invalid RT − Valid RT). Dashed line = zero effect.',
        kind: 'scatter',
        groupBy: 'participant',
        measure: 'meanRt',
        correctOnly: true,
        difference: { factor: 'trialType.validity', level: 'invalid', minus: 'valid' },
        referenceLine: 0,
        yLabel: 'Validity Effect (ms)',
      },
      {
        title: 'Exogenous Cue RT Over Time',
        description: 'Mean RT for misleading-rectangle trials in 4 bins of 5 trials each. Decreasing RT = adaptation to invalid cue.',
        kind: 'line',
        // Each participant's 1st–5th, 6th–10th … answered exogenous trial, pooled across the
        // class, exactly as the original computes it.
        groupBy: 'sequence',
        bin: 5,
        pooled: true,
        measure: 'meanRt',
        correctOnly: true,
        filter: { 'trialType.validity': 'exo_invalid' },
        xLabel: 'Time Point (5 trials each)',
        yLabel: 'RT (ms)',
      },
    ],
  },

  // The original mock's effects: valid ~330ms, invalid ~375ms, exogenous ~405ms and getting
  // faster across the session, catch trials correctly left alone about 90% of the time.
  mock: {
    participants: 15,
    baseRtMs: 330,
    baseAccuracy: 0.97,
    effects: [
      { factor: 'trialType.validity', level: 'invalid', rtDeltaMs: 45, accuracyDelta: -0.02 },
      { factor: 'trialType.validity', level: 'exo_invalid', rtDeltaMs: 75, accuracyDelta: -0.03, rtPerTrialMs: -0.3 },
      { factor: 'trialType.validity', level: 'catch', accuracyDelta: -0.07 },
    ],
  },

  simplifications: [
    {
      what: 'Results go to the shared results table, so the CSV columns are named differently and a target trial is stored as "press"/"none" rather than "hit"/"miss"/"false_alarm"',
      why: 'The same information is there — cue type, sides, SOA, correctness, RT — under the runtime\'s common layout.',
    },
    {
      what: 'A participant with no answered trial at one cue type is left out of the validity effect, instead of being counted as an effect of minus their whole RT',
      why: 'The original\'s version is a bug; with 20 invalid trials per person it almost never triggers.',
    },
    {
      what: 'Mock data comes from the runtime\'s generator rather than the original\'s hand-written one',
      why: 'It shows the same three effects; the exact numbers differ.',
    },
  ],
};

export const PORTS = [POSNER_CUEING];
