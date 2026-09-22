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
import { WS_NONWORD_PAIRS, WS_WORD_PAIRS, type WsPair } from './stimuli/word-superiority-pairs';
import { BK_ROUNDED, BK_SPIKY } from './stimuli/bouba-kiki-shapes';

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

// ─── Stroop ───────────────────────────────────────────────────────────────────
// Original: app/stroop/ (page, experiment, thanks, teacher), lib/stroop/*, and
// components/stroop/charts/*.
//
// Not the textbook Stroop: this version crosses three ink colours with words from FOUR
// language groups — English, transliterated Hebrew, Spanish, and non-words — so a class can
// see interference appear only in the languages a reader actually knows, with non-words as
// the baseline. 12 words x 3 colours = 36 trials, and a 5-trial practice on neutral words
// that repeats until the mapping is right.

const STROOP_COLOURS = { red: '#f43f5e', green: '#34d399', yellow: '#fbbf24' } as const;
type StroopColour = keyof typeof STROOP_COLOURS;

/** `means` is the colour a word names, or null where it names nothing. */
const STROOP_WORDS: { word: string; means: StroopColour | null; group: string }[] = [
  { word: 'red', means: 'red', group: 'English' },
  { word: 'green', means: 'green', group: 'English' },
  { word: 'yellow', means: 'yellow', group: 'English' },
  { word: 'adom', means: 'red', group: 'Hebrew' },
  { word: 'yarok', means: 'green', group: 'Hebrew' },
  { word: 'tsahov', means: 'yellow', group: 'Hebrew' },
  { word: 'rojo', means: 'red', group: 'Spanish' },
  { word: 'verde', means: 'green', group: 'Spanish' },
  { word: 'amarillo', means: 'yellow', group: 'Spanish' },
  { word: 'flurg', means: null, group: 'Non-words' },
  { word: 'blaket', means: null, group: 'Non-words' },
  { word: 'zorphin', means: null, group: 'Non-words' },
];

/**
 * A non-word is neither congruent nor incongruent — it is the baseline the other groups are
 * read against, and the original dashboard draws it as its own grey bar. Naming it here
 * rather than calling it "incongruent" is what lets one `seriesBy` reproduce that chart.
 */
const STROOP_ITEMS: PoolItem[] = STROOP_WORDS.flatMap(w =>
  (Object.keys(STROOP_COLOURS) as StroopColour[]).map(colour => ({
    word: w.word,
    label: w.word.toUpperCase(),
    colour,
    hex: STROOP_COLOURS[colour],
    congruency: w.means === null ? 'baseline' : w.means === colour ? 'congruent' : 'incongruent',
    languageGroup: w.group,
  })),
);

/** The original's five practice words, in its order: neutral words in each of the colours. */
const STROOP_PRACTICE: PoolItem[] = ([
  ['welcome', 'red'], ['cognition', 'green'], ['class', 'yellow'], ['enjoy', 'green'], ['life', 'red'],
] as [string, StroopColour][]).map(([word, colour]) => ({
  word,
  label: word.toUpperCase(),
  colour,
  hex: STROOP_COLOURS[colour],
  congruency: 'baseline',
  languageGroup: 'Practice',
}));

export const STROOP_PORT: ExperimentDefinition = {
  version: 1,
  slug: 'stroop',
  title: 'Stroop Effect',
  titleHe: 'ניסוי סטרופ',
  category: 'EXECUTIVE CONTROL',
  instructions: {
    en: [
      'Words will appear on screen in one of three colours: red, green or yellow.',
      'Your task: identify the colour of the letters — not the word itself!',
      'You will start with 5 practice trials, then continue to 36 real trials.',
      'Respond as fast as you can while staying accurate — use the buttons or the keyboard.',
      '',
      'Shortcuts: R red, G green, Y yellow',
      '',
      '5 practice + 36 trials • takes about 3-4 minutes',
    ].join('\n'),
    he: [
      'על המסך יופיעו מילים בשלושה צבעים שונים: אדום, ירוק או צהוב.',
      'המשימה שלכם: לזהות את צבע האותיות — לא את המילה עצמה!',
      'נתחיל ב-5 ניסויי אימון ואחר כך נמשיך ל-36 ניסויים אמיתיים.',
      'נסו להגיב מהר ככל האפשר, אבל גם בדיוק — השתמשו בכפתורים או במקשי המקלדת.',
      '',
      'מקשי קיצור: R אדום, G ירוק, Y צהוב',
      '',
      '5 אימון + 36 ניסויים • לוקח כ-3-4 דקות',
    ].join('\n'),
  },

  pools: { items: STROOP_ITEMS, practiceItems: STROOP_PRACTICE },
  factors: [{ name: 'item', from: 'items' }],
  repetitions: 1, // the pool IS the block: 12 words x 3 colours
  // Practice teaches the key mapping, so a wrong answer marks the right key and waits,
  // exactly as the original does. Never saved.
  practice: {
    count: 5,
    feedback: true,
    record: false,
    retryUntilCorrect: true,
    from: { factor: 'item', pool: 'practiceItems' },
  },

  trial: {
    phases: [
      {
        name: 'word',
        display: { kind: 'text', text: '{item.label}', size: 96, color: '{item.hex}' },
        awaitsResponse: true,
        startsClock: true,
      },
    ],
    // Y, G, R — the original's button order, with its single-letter labels.
    response: {
      kind: 'choice',
      layout: 'row',
      options: [
        { value: 'yellow', label: 'Y', key: 'y' },
        { value: 'green', label: 'G', key: 'g' },
        { value: 'red', label: 'R', key: 'r' },
      ],
    },
    correct: { kind: 'matchesFactor', factor: 'item.colour' },
    itiMs: 500,
  },

  thanks: { title: { en: 'Thank you!', he: 'תודה!' }, showResults: false },

  store: ['item.word', 'item.colour', 'item.congruency', 'item.languageGroup'],

  dashboard: {
    charts: [
      {
        title: 'Reaction Time by Language Group',
        description: 'Interference shows up only in a language the reader knows. Non-words are the baseline.',
        kind: 'bar',
        groupBy: 'item.languageGroup',
        seriesBy: 'item.congruency',
        measure: 'meanRt',
        correctOnly: true,
        errorBars: true,
        groups: [
          { value: 'English' }, { value: 'Hebrew' }, { value: 'Spanish' }, { value: 'Non-words' },
        ],
        yLabel: 'Reaction Time (ms)',
      },
      {
        title: 'Individual Subject Averages',
        description: 'Each dot is one participant in one language group. Above the diagonal = slower when the word fought the colour.',
        kind: 'xy',
        groupBy: 'participant',
        seriesBy: 'item.languageGroup',
        measure: 'meanRt',
        axes: {
          x: { measure: 'meanRt', filter: { 'item.congruency': 'congruent' }, label: 'Congruent RT (ms)' },
          y: { measure: 'meanRt', filter: { 'item.congruency': 'incongruent' }, label: 'Incongruent RT (ms)' },
        },
      },
      {
        title: 'Speed-Accuracy Tradeoff',
        description: 'Each dot is one participant in one language group. The dashed line is 90% accuracy.',
        kind: 'xy',
        groupBy: 'participant',
        seriesBy: 'item.languageGroup',
        measure: 'meanRt',
        referenceLine: 90,
        axes: {
          x: { measure: 'meanRt', label: 'Mean Reaction Time (ms)' },
          y: { measure: 'accuracy', label: 'Accuracy (%)' },
        },
      },
    ],
  },

  mock: {
    participants: 20,
    baseRtMs: 780,
    baseAccuracy: 0.95,
    effects: [
      { factor: 'item.congruency', level: 'incongruent', rtDeltaMs: 120, accuracyDelta: -0.04 },
      { factor: 'item.congruency', level: 'baseline', rtDeltaMs: 40 },
      { factor: 'item.languageGroup', level: 'Hebrew', rtDeltaMs: -20 },
      { factor: 'item.languageGroup', level: 'Spanish', rtDeltaMs: -35 },
    ],
  },

  simplifications: [
    {
      what: 'Non-words are stored as congruency "baseline" rather than as "not congruent"',
      why: 'They name no colour, so they are neither congruent nor incongruent. The original\'s dashboard already drew them as their own grey "Baseline" bar; naming the condition is what lets one chart reproduce that.',
    },
    {
      what: 'Error bars are the SEM across PARTICIPANTS; the original computed it across trials',
      why: 'Dividing by the trial count instead of the participant count inflates n and makes the bars far too small — an effect looks much stronger than the data supports. Every /run experiment computes them per participant.',
    },
    {
      what: 'A participant with no trials in a condition is left out of a chart instead of being plotted at zero',
      why: 'The original substituted 0 for a missing mean, which put every non-word point on the x = 0 line of the scatter and halved it on the speed-accuracy chart. Non-words have no congruent trials at all, so they no longer appear on "Individual Subject Averages" — there is nothing to plot them against.',
    },
    {
      what: 'Speed on the tradeoff chart is the mean over all of a participant\'s trials in that group, not the average of their congruent and incongruent means',
      why: 'The two differ whenever the conditions have unequal trial counts, which they do here — three congruent to six incongruent in each language.',
    },
    {
      what: 'Results go to the shared results table rather than stroop_results',
      why: 'The same fields are there under the runtime\'s common layout. The hand-built page keeps serving its own table at /stroop until its card is switched over.',
    },
  ],
};

// ─── Word superiority ─────────────────────────────────────────────────────────
// Original: app/wordSuperiority/ (page, practice, experiment, thanks, teacher) and
// lib/word-superiority/stimuli.ts.
//
// A Hebrew Reicher-Wheeler task. A three- or four-letter string flashes for 150ms, a row
// of # masks it, and the reader says which of two letters stood at the third position. The
// same letter is easier to report inside a real word than inside a pseudoword or alone —
// which is the effect.

/**
 * Where a pair's two members actually differ.
 *
 * The original hard-codes position 3 (index 2). That holds for 46 of the 48 pairs, but two
 * pseudoword pairs — זולב/זולך and תירב/תירך — differ at the last letter instead, because
 * ך is a final form and Hebrew only writes it at the end of a word. On those the original
 * marks the third box while the letters differ in the fourth, asking about a position that
 * was never in question.
 */
function wsTargetIndex(pair: WsPair): number {
  const a = [...pair.word1];
  const b = [...pair.word2];
  const at = a.findIndex((c, i) => c !== b[i]);
  return at === -1 ? 2 : at;
}

/**
 * One trial, fully resolved: which member of the pair is shown, and in which button order.
 *
 * The original draws both at random per trial. A definition cannot choose a string
 * conditionally, so both alternate with the index instead — which balances them exactly
 * rather than approximately, and on two different cycles so that "the first member is
 * shown" never coincides with "the correct letter is the left button".
 */
function wsItem(pair: WsPair, condition: string, index: number): PoolItem {
  const showFirst = index % 2 === 0;
  const word = showFirst ? pair.word1 : pair.word2;
  const correct = showFirst ? pair.letter1 : pair.letter2;
  const foil = showFirst ? pair.letter2 : pair.letter1;
  const length = [...pair.word1].length;
  const targetIdx = wsTargetIndex(pair);
  const correctFirst = Math.floor(index / 2) % 2 === 0;

  return {
    condition,
    // A single-letter trial shows the target letter alone, blanks elsewhere.
    stimulus: condition === 'single-letter'
      ? Array.from({ length }, (_, i) => (i === targetIdx ? correct : '_')).join('')
      : word,
    mask: '#'.repeat(length),
    // Which position is being asked about, shown while the two letters are on screen.
    shape: Array.from({ length }, (_, i) => (i === targetIdx ? '?' : '_')).join(' '),
    correctLetter: correct,
    foilLetter: foil,
    optionA: correctFirst ? correct : foil,
    optionB: correctFirst ? foil : correct,
  };
}

/** 60 trials, 20 per condition. Words and single letters come from the word sheet. */
const WS_ITEMS: PoolItem[] = [
  ...WS_WORD_PAIRS.slice(0, 20).map((p, i) => wsItem(p, 'word', i)),
  ...WS_NONWORD_PAIRS.slice(0, 20).map((p, i) => wsItem(p, 'pseudoword', i)),
  // Offset by one so a pair does not show the same member here as it did as a word.
  ...WS_WORD_PAIRS.slice(0, 20).map((p, i) => wsItem(p, 'single-letter', i + 1)),
];

/** Two per condition, from the four pairs the main block never touches. */
const WS_PRACTICE: PoolItem[] = [
  wsItem(WS_WORD_PAIRS[20], 'word', 0),
  wsItem(WS_WORD_PAIRS[21], 'word', 1),
  wsItem(WS_NONWORD_PAIRS[20], 'pseudoword', 0),
  wsItem(WS_NONWORD_PAIRS[21], 'pseudoword', 1),
  wsItem(WS_WORD_PAIRS[22], 'single-letter', 0),
  wsItem(WS_WORD_PAIRS[23], 'single-letter', 1),
];

const WS_STIMULUS_STYLE = { size: 36, font: 'mono' as const };

export const WORD_SUPERIORITY_PORT: ExperimentDefinition = {
  version: 1,
  slug: 'wordSuperiority',
  title: 'Word Superiority Effect',
  titleHe: 'אפקט עליונות המילה',
  category: 'PERCEPTION',
  instructions: {
    en: [
      'On each trial a word (or letter) will flash briefly, followed by a mask.',
      'You will then see two letters — pick which one appeared at the marked position.',
      'Respond as quickly as you can while staying accurate.',
      '',
      '6 practice + 60 trials',
    ].join('\n'),
    he: [
      'בכל ניסוי תוצג מילה (או אות) למשך זמן קצר מאוד, ואחריה מסיכה.',
      'לאחר מכן תוצגנה שתי אותיות — עליך לבחור איזו מהן הופיעה במיקום המסומן.',
      'ענה מהר ככל שאפשר, אבל נסה להיות מדויק.',
      '',
      '6 ניסויי אימון + 60 ניסויים',
    ].join('\n'),
  },

  pools: { items: WS_ITEMS, practiceItems: WS_PRACTICE },
  factors: [{ name: 'item', from: 'items' }],
  repetitions: 1, // the pool is the block
  practice: {
    count: 6,
    feedback: true,
    record: false,
    from: { factor: 'item', pool: 'practiceItems' },
  },

  trial: {
    phases: [
      { name: 'fixation', display: { kind: 'fixation' }, durationMs: 500 },
      // 150ms, and nothing may animate over it: an exit transition would swallow the
      // stimulus entirely and the task would measure the mask instead.
      { name: 'stimulus', display: { kind: 'text', text: '{item.stimulus}', ...WS_STIMULUS_STYLE }, durationMs: 150 },
      { name: 'mask', display: { kind: 'text', text: '{item.mask}', ...WS_STIMULUS_STYLE }, durationMs: 500 },
      {
        name: 'choice',
        display: { kind: 'text', text: '{item.shape}', ...WS_STIMULUS_STYLE },
        awaitsResponse: true,
        startsClock: true,
      },
    ],
    response: {
      kind: 'choice',
      layout: 'row',
      options: [
        { value: '{item.optionA}', label: '{item.optionA}' },
        { value: '{item.optionB}', label: '{item.optionB}' },
      ],
    },
    correct: { kind: 'matchesFactor', factor: 'item.correctLetter' },
    itiMs: 300,
  },

  store: ['item.condition', 'item.stimulus', 'item.correctLetter'],

  dashboard: {
    charts: [
      {
        title: 'Accuracy by Condition',
        description: '50% = chance. Error bars = SEM across participants.',
        kind: 'bar',
        groupBy: 'item.condition',
        measure: 'accuracy',
        errorBars: true,
        referenceLine: 50,
        groups: [
          { value: 'word', label: 'Word' },
          { value: 'pseudoword', label: 'Pseudoword' },
          { value: 'single-letter', label: 'Single Letter' },
        ],
        yLabel: 'Accuracy (%)',
      },
      {
        title: 'Reaction Time by Condition',
        description: 'Correct trials only. Error bars = SEM.',
        kind: 'bar',
        groupBy: 'item.condition',
        measure: 'meanRt',
        correctOnly: true,
        errorBars: true,
        groups: [
          { value: 'word', label: 'Word' },
          { value: 'pseudoword', label: 'Pseudoword' },
          { value: 'single-letter', label: 'Single Letter' },
        ],
        yLabel: 'Reaction Time (ms)',
      },
      {
        title: 'Individual Participants: Word vs. Single-Letter Accuracy',
        description: 'Each dot is one participant. Above the diagonal = the word helped.',
        kind: 'xy',
        groupBy: 'participant',
        measure: 'accuracy',
        axes: {
          x: { measure: 'accuracy', filter: { 'item.condition': 'word' }, label: 'Word Accuracy (%)' },
          y: { measure: 'accuracy', filter: { 'item.condition': 'single-letter' }, label: 'Single-Letter Accuracy (%)' },
        },
      },
    ],
  },

  mock: {
    participants: 18,
    baseRtMs: 900,
    baseAccuracy: 0.62,
    effects: [
      { factor: 'item.condition', level: 'word', accuracyDelta: 0.18, rtDeltaMs: -80 },
      { factor: 'item.condition', level: 'pseudoword', accuracyDelta: 0.06, rtDeltaMs: -20 },
    ],
  },

  simplifications: [
    {
      what: 'Which member of a pair is shown, and which letter is the left button, alternate with the trial index instead of being drawn at random on every trial',
      why: 'A definition cannot pick a string conditionally. Alternating balances both exactly rather than approximately; the two cycles are offset so they never line up.',
    },
    {
      what: 'The position asked about is wherever the pair actually differs, rather than always the third letter',
      why: 'Two pseudoword pairs (זולב/זולך, תירב/תירך) differ at the last letter, because ך is a final form Hebrew writes only at the end of a word. The original marked the third box on those, asking about a position that was never in question.',
    },
    {
      what: 'The response screen marks the asked-about position as "_ ? _" rather than drawing lettered boxes',
      why: 'The runtime draws a row of boxes only at a fixed length, and these strings are three or four letters. The position asked about is the same one.',
    },
    {
      what: 'The thank-you screen shows overall accuracy rather than accuracy per condition',
      why: 'That is what the shared ending offers. The per-condition breakdown is on the teacher dashboard, where the comparison is the point.',
    },
    {
      what: 'Results go to the shared results table rather than word_superiority_results',
      why: 'The same fields under the runtime\'s common layout. The hand-built page keeps serving its own table until its card is switched over.',
    },
  ],
};

// ─── Bouba-kiki ───────────────────────────────────────────────────────────────
// Original: app/bouba-kiki/ (page, experiment, results, thanks, teacher),
// lib/bouba-kiki/{experiment,stimuli}.ts and components/bouba-kiki/ShapeDisplay.tsx.
//
// Sixteen trials shuffled together, of two kinds. Twelve main trials show a word — BOUBA,
// KIKI, MALUMA or TAKETE — and two shapes, one rounded and one spiky, to choose between.
// Four control trials show one shape and ask whether it is more bouba or more kiki, which
// is what makes the main trials interpretable: it checks the reader holds the convention
// at all. The two kinds offer different KINDS of option, which is what `response.by` is
// for.

const BK_WORDS: { text: string; type: 'rounded' | 'spiky' }[] = [
  { text: 'BOUBA', type: 'rounded' },
  { text: 'KIKI', type: 'spiky' },
  { text: 'MALUMA', type: 'rounded' },
  { text: 'TAKETE', type: 'spiky' },
];

/**
 * Twelve main trials: each word three times, each paired with one rounded and one spiky
 * shape drawn round-robin from the six of each.
 *
 * Which side is rounded alternates rather than being drawn at random, so the sides come out
 * exactly six and six. The original tosses a coin per trial.
 */
const BK_MAIN: PoolItem[] = Array.from({ length: 12 }, (_, i) => {
  const word = BK_WORDS[i % BK_WORDS.length];
  const rounded = BK_ROUNDED[i % BK_ROUNDED.length];
  const spiky = BK_SPIKY[i % BK_SPIKY.length];
  const roundedOnLeft = i % 2 === 0;
  const matchingSide = word.type === 'rounded'
    ? (roundedOnLeft ? 'left' : 'right')
    : (roundedOnLeft ? 'right' : 'left');

  return {
    kind: 'main',
    responseSet: 'shapes',
    condition: word.type === 'rounded' ? 'Bouba' : 'Kiki',
    word: word.text,
    stimulusType: word.type,
    leftD: roundedOnLeft ? rounded.d : spiky.d,
    rightD: roundedOnLeft ? spiky.d : rounded.d,
    // No shape above the buttons on a main trial: the shapes ARE the buttons.
    shapeD: '',
    shapeSize: 0,
    expected: matchingSide,
  };
});

/** Four control trials: two rounded, two spiky, each shown alone. */
const BK_CONTROL: PoolItem[] = [
  { shape: BK_ROUNDED[0], type: 'rounded' as const },
  { shape: BK_ROUNDED[1], type: 'rounded' as const },
  { shape: BK_SPIKY[0], type: 'spiky' as const },
  { shape: BK_SPIKY[1], type: 'spiky' as const },
].map(({ shape, type }) => ({
  kind: 'control',
  responseSet: 'words',
  condition: 'Control',
  word: '',
  stimulusType: type,
  leftD: '',
  rightD: '',
  shapeD: shape.d,
  shapeSize: 250,
  expected: type === 'rounded' ? 'bouba' : 'kiki',
}));

export const BOUBA_KIKI_PORT: ExperimentDefinition = {
  version: 1,
  slug: 'bouba-kiki',
  title: 'Bouba-Kiki Effect',
  titleHe: 'אפקט בובה-קיקי',
  category: 'LANGUAGE',
  instructions: {
    en: [
      'This experiment demonstrates a fascinating phenomenon where people associate certain sounds with specific shapes.',
      '',
      'You will see pairs of shapes on the screen.',
      'Each trial will display a word (like "BOUBA" or "KIKI").',
      'Your task is to decide which shape best matches the word.',
      'Some trials show a single shape and ask whether it is more BOUBA or more KIKI.',
      'There are no right or wrong answers - trust your intuition!',
      'The experiment takes about 3-4 minutes to complete.',
    ].join('\n'),
    he: [
      'ניסוי זה מדגים תופעה מרתקת שבה אנשים משייכים צלילים מסוימים לצורות ספציפיות.',
      '',
      'תראו זוגות של צורות על המסך.',
      'בכל ניסיון תוצג מילה (כמו "בובה" או "קיקי").',
      'המשימה שלכם היא להחליט איזו צורה תואמת הכי טוב למילה.',
      'בחלק מהניסיונות תוצג צורה אחת, והשאלה היא האם היא יותר בובה או יותר קיקי.',
      'אין תשובות נכונות או שגויות - סמכו על האינטואיציה שלכם!',
      'הניסוי אורך כ-3-4 דקות.',
    ].join('\n'),
  },

  pools: { items: [...BK_MAIN, ...BK_CONTROL] },
  factors: [{ name: 'item', from: 'items' }],
  repetitions: 1, // the pool is the block: 12 main + 4 control, shuffled together

  trial: {
    phases: [
      { name: 'fixation', display: { kind: 'fixation' }, durationMs: 500 },
      {
        name: 'ask',
        // One stack covers both kinds: a main trial has the word and a zero-sized shape, a
        // control trial an empty word and the shape at full size.
        display: {
          kind: 'stack',
          items: [
            { kind: 'text', text: '{item.word}', size: 48 },
            { kind: 'svgPath', d: '{item.shapeD}', size: '{item.shapeSize}' },
          ],
        },
        awaitsResponse: true,
        startsClock: true,
      },
    ],
    // The two kinds of trial ask different questions, so they offer different options.
    response: {
      by: 'item.responseSet',
      sets: {
        shapes: {
          kind: 'choice',
          layout: 'row',
          options: [
            { value: 'left', label: 'Left', labelHe: 'שמאל', display: { kind: 'svgPath', d: '{item.leftD}', size: 200 } },
            { value: 'right', label: 'Right', labelHe: 'ימין', display: { kind: 'svgPath', d: '{item.rightD}', size: 200 } },
          ],
        },
        words: {
          kind: 'choice',
          layout: 'row',
          options: [
            { value: 'bouba', label: 'BOUBA', labelHe: 'בובה' },
            { value: 'kiki', label: 'KIKI', labelHe: 'קיקי' },
          ],
        },
      },
    },
    correct: { kind: 'matchesFactor', factor: 'item.expected' },
    itiMs: 0,
  },

  // Scored against the conventional mapping, as the original does, while the instructions
  // still tell the reader there is no wrong answer.
  correctMeans: 'Chose the conventional shape',

  thanks: { title: { en: 'Thank You!', he: 'תודה רבה!' }, showResults: false },

  store: ['item.condition', 'item.word', 'item.stimulusType', 'item.expected'],

  dashboard: {
    charts: [
      {
        title: 'Accuracy by Word Type (Average)',
        description: 'Control trials check the reader holds the convention at all.',
        kind: 'bar',
        groupBy: 'item.condition',
        measure: 'accuracy',
        errorBars: true,
        referenceLine: 50,
        groups: [{ value: 'Bouba' }, { value: 'Kiki' }, { value: 'Control' }],
        yLabel: 'Conventional match (%)',
      },
      {
        title: 'Individual Participant Accuracy',
        description: 'One group of bars per participant.',
        kind: 'bar',
        groupBy: 'participant',
        seriesBy: 'item.condition',
        measure: 'accuracy',
        errorBars: false,
        yLabel: 'Conventional match (%)',
      },
    ],
  },

  mock: {
    participants: 16,
    baseRtMs: 1400,
    baseAccuracy: 0.86,
    effects: [
      { factor: 'item.condition', level: 'Control', accuracyDelta: 0.08, rtDeltaMs: -200 },
    ],
  },

  simplifications: [
    {
      what: 'Which side holds the rounded shape alternates with the trial index instead of being tossed per trial',
      why: 'A definition cannot choose a side at random. Alternating makes it exactly six and six rather than approximately.',
    },
    {
      what: 'The per-trial question sentence ("Which shape is BOUBA?") is not shown; the word itself is, and the instructions carry the task',
      why: 'A phase display holds one string, so it cannot be both English and Hebrew. The buttons on a control trial are bilingual and say what is being asked.',
    },
    {
      what: 'Shapes are drawn light on the dark runtime background rather than dark on white cards',
      why: 'The outlines are identical — converted path for path from the original component — but the runtime has no white card behind them.',
    },
    {
      what: 'The second chart is a group of bars per participant rather than two scatter series against a participant index',
      why: 'The same two numbers per person; the runtime draws a per-participant comparison as bars.',
    },
    {
      what: 'The participant details table is not reproduced',
      why: 'The shared dashboard has charts and stat cards, not tables. Every number in it is in the charts or the CSV export.',
    },
  ],
};

export const PORTS = [POSNER_CUEING, STROOP_PORT, WORD_SUPERIORITY_PORT, BOUBA_KIKI_PORT];
