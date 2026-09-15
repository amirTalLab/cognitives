// Hand-built experiments, ported to definitions.
//
// round-trips.ts showed the schema could express three live experiments in outline, and
// simplified each to do it. These are meant to REPLACE the hand-built pages: the same trial
// mix, timings, responses and feedback, so a class sees the same task and the dashboard
// shows the same effect. Anything that could not be carried over exactly is listed under
// `simplifications`, where a lecturer can judge it.
//
// Each port uses the slug of the page it replaces. The hand-built route keeps running at
// /{slug} until the homepage is switched to /run/{slug}; sharing the slug means one lock
// covers both, and nothing else has to be renamed on the day of the switch.

import type { Display, ExperimentDefinition, PoolItem } from './schema';

// ─── Posner cueing ────────────────────────────────────────────────────────────
// Original: app/posnerCueing/experiment/page.tsx and lib/posner-cueing/experiment.ts.
//
// Detection, not localisation: one button (or space) as soon as the ● appears in either
// box, 1500ms to respond, and nothing at all on catch trials. Per SOA (300 and 500ms) the
// original runs 40 valid, 10 invalid, 6 catch and 10 exogenous-invalid trials — 132 in all,
// shuffled together.
//
// That uneven mix is not a cross of factors, so it is a pool: one entry per trial of one SOA,
// crossed with SOA. The exogenous cue is the box on the wrong side turning red, with a
// neutral + where the arrow would be.

type Side = 'left' | 'right';

const BOX_GREY = '#71717a';
const CUE_RED = '#ef4444';

function posnerTrialType(validity: string, cue: Side, target: Side | null): PoolItem {
  const exo = validity === 'exo_invalid';
  return {
    validity,
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

/** One SOA's worth of trials, exactly as lib/posner-cueing/experiment.ts builds them. */
const POSNER_TRIAL_TYPES: PoolItem[] = [
  ...times(20, posnerTrialType('valid', 'left', 'left')),
  ...times(20, posnerTrialType('valid', 'right', 'right')),
  ...times(5, posnerTrialType('invalid', 'left', 'right')),
  ...times(5, posnerTrialType('invalid', 'right', 'left')),
  ...times(3, posnerTrialType('catch', 'left', null)),
  ...times(3, posnerTrialType('catch', 'right', null)),
  ...times(5, posnerTrialType('exo_invalid', 'left', 'right')),
  ...times(5, posnerTrialType('exo_invalid', 'right', 'left')),
];

/** Two boxes with something between them. The boxes are on screen for the whole trial. */
function posnerScreen(centre: string, opts: { cued: boolean; target: boolean }): Display {
  const box = (side: Side): Display => ({
    kind: 'frame',
    size: 128,
    color: opts.cued ? `{trialType.${side}Border}` : BOX_GREY,
    thickness: opts.cued ? `{trialType.${side}BorderWidth}` : 2,
    ...(opts.target ? { content: { kind: 'text', text: `{trialType.${side}Target}`, size: 40 } } : {}),
  });
  return { kind: 'row', gap: 48, items: [box('left'), { kind: 'text', text: centre, size: 40 }, box('right')] };
}

export const POSNER_CUEING: ExperimentDefinition = {
  version: 1,
  slug: 'posnerCueing',
  title: 'Spatial Cueing',
  titleHe: 'הכוונה מרחבית',
  category: 'ATTENTION',
  instructions: {
    en: [
      'You will see two boxes on screen — one on the left, one on the right — and a + in the middle.',
      'On each trial an arrow appears in the middle, pointing left (←) or right (→).',
      'Shortly afterwards, a ● appears inside one of the boxes.',
      'Your task: press the button (or the spacebar) as fast as you can when you see the ●.',
      'The arrow usually points the right way — but not always!',
      'Keep your eyes on the + in the centre — do not look at the boxes.',
      'On some trials no target appears at all. Press nothing in that case.',
    ].join('\n'),
    he: [
      'בניסוי זה תראו שתי תיבות על המסך — אחת משמאל ואחת מימין — ו-+ במרכז.',
      'בכל ניסיון, חץ יופיע במרכז ויצביע שמאלה (←) או ימינה (→).',
      'זמן קצר לאחר מכן, יופיע ● בתוך אחת התיבות.',
      'המשימה שלכם: לחצו על הכפתור (או על מקש הרווח) מהר ככל האפשר כשאתם רואים את ה-●.',
      'החץ לרוב מצביע לכיוון הנכון — אך לא תמיד!',
      'שמרו על עיניכם על ה-+ במרכז המסך — אל תביטו אל התיבות.',
      'בחלק מהניסיונות לא יופיע יעד כלל. אל תלחצו דבר במקרה זה.',
    ].join('\n'),
  },

  pools: { trialTypes: POSNER_TRIAL_TYPES },
  factors: [
    { name: 'trialType', from: 'trialTypes' },
    { name: 'soa', levels: [300, 500] },
    // The original draws 800–1200ms uniformly on every trial. Counterbalanced over five
    // steps instead, so the fixation still cannot be timed and no trials are added.
    { name: 'fixationMs', levels: [800, 900, 1000, 1100, 1200], counterbalance: true },
  ],
  repetitions: 1, // 66 trial types x 2 SOAs = 132, matching the original
  practice: { count: 8, feedback: true },

  trial: {
    phases: [
      { name: 'fixation', display: posnerScreen('+', { cued: false, target: false }), durationMs: '{fixationMs}' },
      // The cue-target interval is the SOA, and the cue stays up once the target arrives.
      { name: 'cue', display: posnerScreen('{trialType.cueSymbol}', { cued: true, target: false }), durationMs: '{soa}' },
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
    // The button is on screen from the fixation onward, as in the original, so pressing
    // before the target is caught as an anticipation rather than ignored.
    earlyFrom: 'fixation',
    feedback: {
      durationMs: 500,
      inMain: true,
      timeout: { en: 'Missed — try to respond faster!', he: 'פספסת — נסו ללחוץ מהר יותר!' },
      incorrect: { en: 'No target — do not press!', he: 'לא היה יעד — אין ללחוץ!' },
      early: { en: 'Too early — wait for the ●!', he: 'מוקדם מדי — המתינו ל-●!' },
    },
  },

  store: ['trialType.validity', 'trialType.cueSide', 'trialType.targetSide', 'soa', 'fixationMs'],

  dashboard: {
    charts: [
      {
        title: 'Reaction time by cue type',
        kind: 'bar',
        groupBy: 'trialType.validity',
        measure: 'meanRt',
        correctOnly: true,
        filter: { 'trialType.validity': ['valid', 'invalid', 'exo_invalid'] },
        yLabel: 'RT (ms)',
        errorBars: true,
      },
      {
        title: 'Validity effect per participant (invalid − valid RT)',
        kind: 'bar',
        groupBy: 'participant',
        measure: 'meanRt',
        correctOnly: true,
        difference: { factor: 'trialType.validity', level: 'invalid', minus: 'valid' },
        referenceLine: 0,
        yLabel: 'Invalid − valid (ms)',
        errorBars: false,
      },
      {
        title: 'Exogenous cue RT across the session (quarters)',
        kind: 'line',
        groupBy: 'trial_index',
        bin: 33,
        measure: 'meanRt',
        correctOnly: true,
        filter: { 'trialType.validity': 'exo_invalid' },
        yLabel: 'RT (ms)',
      },
    ],
  },

  mock: {
    participants: 15,
    baseRtMs: 330,
    baseAccuracy: 0.97,
    effects: [
      { factor: 'trialType.validity', level: 'invalid', rtDeltaMs: 45, accuracyDelta: -0.02 },
      // Slowest, and faster as the session goes on — the participant learns to ignore it.
      { factor: 'trialType.validity', level: 'exo_invalid', rtDeltaMs: 90, accuracyDelta: -0.03, rtPerTrialMs: -0.4 },
      { factor: 'trialType.validity', level: 'catch', accuracyDelta: -0.07 },
    ],
  },

  simplifications: [
    {
      what: 'Fixation lasts one of five steps from 800 to 1200ms instead of any value in that range',
      why: 'The participant still cannot predict when the cue comes, which is all the jitter is for.',
    },
    {
      what: 'Practice is 8 trials drawn from the real design instead of a fixed set of 6 valid, 1 invalid and 1 catch',
      why: 'It rehearses the same task; a given practice block may simply contain no catch trial.',
    },
    {
      what: 'A press before the target is stored as an "early" trial instead of being discarded',
      why: 'Nothing is lost — dashboards use correct, timed trials only — and anticipations become countable.',
    },
    {
      what: 'Exogenous RT over time is shown by quarter of the session rather than by blocks of five exogenous trials',
      why: 'Both show whether the misleading cue loses its pull as the session goes on.',
    },
  ],
};

export const PORTS = [POSNER_CUEING];
