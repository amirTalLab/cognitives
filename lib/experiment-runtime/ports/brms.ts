import type { ExperimentDefinition, Stage } from '../schema';
import {
  BREAK_EVERY, FIXATION_MS, IDENTITY_IDS, ITI_MS, PRACTICE_TOTAL, TRIALS_PER_CELL,
} from '../../brms-emotion/stimuli';

// ─── bRMS: emotion under suppression ──────────────────────────────────────────
// Original: app/bRMS/ (page, practice, experiment, thanks, teacher) and
// lib/brms-emotion/stimuli.ts.
//
// A face is shown to one eye while the other gets a stream of high-contrast Mondrian masks.
// The masks win — the face is invisible — until it is not, and the measure is how long that
// takes. Fearful faces break through faster than happy or neutral ones, and inverted faces
// slower, which is the argument that something reads emotion before you are aware of a face
// at all.
//
// THE POINT OF THIS PORT is that almost none of it is exotic. The trials are crossed
// factors, the rows are a spine and a payload, the dashboard is bar charts the runtime
// already draws, and `max_contrast` is a constant rather than a staircase. One phase is
// code — the suppression itself, which is a per-frame contract — and one screen is code, the
// calibration that has to know the physical width of the display. Everything else is data,
// which is why this did not need a second kind of experiment to live in.

/** 3 emotions x 2 orientations x 6 identities = 36, run three times = 108 trials. */
const COMBINATIONS = 3 * 2 * IDENTITY_IDS.length;
const BLOCKS = (TRIALS_PER_CELL * 6) / BREAK_EVERY;

const TRIAL = {
  phases: [
    { name: 'fixation', display: { kind: 'fixation' as const }, durationMs: FIXATION_MS },
    {
      name: 'suppression',
      // What a preview or a still frame shows. The real phase is the component.
      display: { kind: 'text' as const, text: '···', size: 40, color: '#475569' },
      component: 'bRMSSuppression',
      awaitsResponse: true,
      startsClock: true,
    },
  ],
  response: {
    kind: 'choice' as const,
    layout: 'row' as const,
    options: [
      { value: 'left', label: 'Left', labelHe: 'שמאל' },
      { value: 'right', label: 'Right', labelHe: 'ימין' },
    ],
  },
  // Which side the face was on. The reaction time is the finding; this is the check that
  // the participant actually saw it rather than guessing when the rescue faded the masks.
  correct: { kind: 'matchesFactor' as const, factor: 'side' },
  itiMs: ITI_MS,
};

const FACTORS = [
  { name: 'emotion', levels: ['fearful', 'happy', 'neutral'] },
  { name: 'orientation', levels: ['upright', 'inverted'] },
  { name: 'identity', levels: [...IDENTITY_IDS] },
  // Balanced across the list rather than crossed: which side the face appears on has to be
  // even, and crossing it would double a 108-trial session to 216.
  { name: 'side', levels: ['left', 'right'], counterbalance: true },
];

const STORE = ['emotion', 'orientation', 'identity', 'side'];

/** A run of 36 trials. Three of them, which is where the original's breaks fall. */
const block = (n: number): Stage => ({
  name: `block${n}`,
  title: { en: `Block ${n} of ${BLOCKS}`, he: `בלוק ${n} מתוך ${BLOCKS}` },
  instructions: {
    en: 'Take a moment if you need one. Keep your eyes on the centre, and say which side the '
      + 'face appeared on as soon as you can see it.',
    he: 'אפשר לנוח רגע. שמרו את המבט במרכז, ואמרו באיזה צד הופיעו הפנים ברגע שאתם רואים אותן.',
  },
  factors: FACTORS,
  repetitions: 1,
  trial: TRIAL,
  store: STORE,
});

export const BRMS_PORT: ExperimentDefinition = {
  version: 1,
  slug: 'bRMS',
  title: 'bRMS Emotion',
  titleHe: 'bRMS רגש',
  category: 'CONSCIOUSNESS',

  instructions: {
    en: 'One side of the screen will show a flickering pattern, and somewhere behind it there '
      + 'is a face.\n\n'
      + 'Keep your eyes on the centre. As soon as you can tell which side the face is on, say '
      + 'so — left or right.\n'
      + 'It may take several seconds, and that is the point: how long it takes is what is '
      + 'being measured.\n\n'
      + '8 practice + 108 trials in three blocks, about 20 minutes.',
    he: 'בצד אחד של המסך יופיע דפוס מהבהב, ומאחוריו נמצאות פנים.\n\n'
      + 'שמרו את המבט במרכז. ברגע שאתם יכולים לומר באיזה צד הפנים — אמרו זאת, שמאל או ימין.\n'
      + 'זה עשוי לקחת כמה שניות, וזו בדיוק הנקודה: משך הזמן הוא מה שנמדד.\n\n'
      + '8 ניסיונות תרגול + 108 ניסיונות בשלושה בלוקים, כ-20 דקות.',
  },

  // The display has to be measured before anything is shown: the stimulus subtends a fixed
  // visual angle, and a frame sized in pixels is a different experiment on every screen.
  onboarding: 'calibrateDisplay',

  factors: FACTORS,
  repetitions: 1,
  stageName: 'block1',
  practice: { count: PRACTICE_TOTAL, feedback: false, record: false },
  trial: TRIAL,
  store: STORE,

  stages: [block(2), block(3)],

  simplifications: [{
    what: 'Consecutive trials may share an identity or a condition; the original reshuffles '
      + 'until they do not.',
    why: 'The runtime shuffles a block freely and has no way to express "no two neighbours '
      + 'alike". With 36 trials drawn from 36 combinations the repeats are rare, and each one '
      + 'costs a little sensitivity rather than biasing a condition — every cell still gets '
      + 'exactly the trials it should. Worth adding as an ordering rule if it ever matters '
      + 'more than that.',
  }],

  thanks: { showResults: false },

  dashboard: {
    stats: [
      { label: 'Breakthrough, fearful', measure: 'meanRt', filter: { emotion: 'fearful' }, correctOnly: true, unit: 'ms' },
      { label: 'Breakthrough, neutral', measure: 'meanRt', filter: { emotion: 'neutral' }, correctOnly: true, unit: 'ms' },
      {
        label: 'Upright advantage',
        measure: 'meanRt',
        correctOnly: true,
        difference: { factor: 'orientation', level: 'inverted', minus: 'upright' },
        unit: 'ms',
        signed: true,
      },
    ],
    charts: [
      {
        title: 'Breakthrough time by emotion',
        description: 'How long the face stayed invisible. A fearful face breaking through '
          + 'first is the finding — something reads the expression before you are aware of '
          + 'the face at all.',
        kind: 'bar',
        groupBy: 'emotion',
        measure: 'meanRt',
        correctOnly: true,
        errorBars: true,
        groups: [
          { value: 'fearful', label: 'Fearful' },
          { value: 'happy', label: 'Happy' },
          { value: 'neutral', label: 'Neutral' },
        ],
        yLabel: 'Breakthrough (ms)',
      },
      {
        title: 'Breakthrough time by emotion and orientation',
        description: 'Turning a face upside down keeps its features and destroys the face. '
          + 'If the emotional advantage is about the expression rather than about contrast, '
          + 'it should shrink when inverted.',
        kind: 'bar',
        groupBy: 'emotion',
        seriesBy: 'orientation',
        measure: 'meanRt',
        correctOnly: true,
        errorBars: true,
        yLabel: 'Breakthrough (ms)',
      },
      {
        title: 'Accuracy by emotion',
        description: 'Which side the face was on. Near ceiling is what this should be — it is '
          + 'the check that people reported seeing rather than guessing, not a measure in '
          + 'its own right.',
        kind: 'bar',
        groupBy: 'emotion',
        measure: 'accuracy',
        errorBars: true,
        referenceLine: 50,
        yLabel: 'Correct side (%)',
      },
      {
        title: 'Breakthrough time per participant, fearful against neutral',
        description: 'Each dot is one person. Below the diagonal is the effect — their '
          + 'fearful faces broke through sooner than their neutral ones.',
        kind: 'xy',
        groupBy: 'participant',
        measure: 'meanRt',
        axes: {
          x: { measure: 'meanRt', filter: { emotion: 'neutral' }, correctOnly: true, label: 'Neutral (ms)' },
          y: { measure: 'meanRt', filter: { emotion: 'fearful' }, correctOnly: true, label: 'Fearful (ms)' },
        },
      },
    ],
  },

  mock: {
    participants: 14,
    baseRtMs: 4200,
    baseAccuracy: 0.94,
    effects: [
      // Fearful faces break through sooner; inverting a face costs that advantage.
      { factor: 'emotion', level: 'fearful', rtDeltaMs: -700 },
      { factor: 'emotion', level: 'happy', rtDeltaMs: -200 },
      { factor: 'orientation', level: 'inverted', rtDeltaMs: 400 },
    ],
  },
};

/** Trials per block, exported so a test can check the arithmetic rather than restate it. */
export const BRMS_SHAPE = { combinations: COMBINATIONS, blocks: BLOCKS, perBlock: BREAK_EVERY };
