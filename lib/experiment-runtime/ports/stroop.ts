import type { ExperimentDefinition, PoolItem } from '../schema';

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
