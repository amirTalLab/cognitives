import type { ExperimentDefinition, PoolItem } from '../schema';
import {
  AUT_OBJECTS, AUT_TIME_PER_OBJECT_MS, CIRCLES_TIME_MS, CIRCLES_TOTAL,
  RAT_TIME_MS, RAT_TRIPLETS, RAT_TRIPLETS_HE,
} from '../../creativity/stimuli';

// ─── Creativity battery ───────────────────────────────────────────────────────
// Original: app/creativity/ (page, experiment, thanks, teacher) and lib/creativity/stimuli.ts.
//
// Three tasks that measure creativity in two different directions.
//
// DIVERGENT — how many ideas, how far apart. Alternative Uses: one minute per object to
// name as many uses for a brick as you can. Circles: four minutes to turn plain circles into
// drawings. Neither has a right answer; the measures are fluency (how many) and originality
// (how unlike everyone else's), and originality can only be judged by people afterwards.
//
// CONVERGENT — one answer, hard to find. Remote Associates: COTTAGE, SWISS, CAKE all go with
// CHEESE. Five minutes for fifteen of them.
//
// The stimuli are IMPORTED from lib/creativity/stimuli.ts, the file the hand-built pages
// use, so the objects, the triplets — including the separate Hebrew set, which is not a
// translation but its own puzzle — and every duration come from one place.

const asPool = (items: PoolItem[]): PoolItem[] => items.map(i => ({ ...i }));

/** The four objects, one block each. */
const OBJECTS: PoolItem[] = asPool(AUT_OBJECTS.map(o => ({
  index: o.index,
  nameEn: o.nameEn,
  nameHe: o.nameHe,
  // Which of the three tasks a row belongs to. The block name cannot serve: each object is
  // its own block, so a chart about "the uses task" would have to list all four by name.
  task: 'uses',
})));

/** Thirty blank circles, numbered — the drawing is what differs, not the stimulus. */
const CIRCLES: PoolItem[] = Array.from({ length: CIRCLES_TOTAL }, (_, i) => ({ index: i + 1, task: 'circles' }));

/**
 * The triplets, both languages on one item.
 *
 * The Hebrew set is NOT a translation — a word puzzle cannot be translated and stay a
 * puzzle — so each index carries its own three words and its own solution in each language,
 * and the run shows whichever the participant is taking.
 */
const TRIPLETS: PoolItem[] = RAT_TRIPLETS.map((t, i) => {
  const he = RAT_TRIPLETS_HE[i] ?? t;
  return {
    index: t.index,
    wordsEn: t.words.join('   ·   '),
    wordsHe: he.words.join('   ·   '),
    solutionEn: t.solution,
    solutionHe: he.solution,
    task: 'associates',
  };
});

/**
 * One minute with one object.
 *
 * A block each rather than a stage group repeating over a pool: the clock restarts with
 * every object in the original — four minutes for one object would be a different task —
 * and the objects are presented in a fixed order, so there is nothing for a group to shuffle.
 */
function usesBlock(object: PoolItem) {
  return {
    // A block per object needs its own name, or their rows could not be told apart. The
    // rows carry `task` as well, so a chart can ask about all four together.
    name: `uses${String(object.nameEn).replace(/[^A-Za-z]/g, '')}`,
    title: { en: `Uses for a ${String(object.nameEn).toLowerCase()}`, he: 'שימושים לחפץ' },
    instructions: {
      en: 'One minute. Name as many uses as you can — type each one and press Enter.',
      he: 'דקה אחת. מנו כמה שיותר שימושים — הקלידו כל אחד והקישו Enter.',
    },
    pools: { object: [object] },
    factors: [{ name: 'object', from: 'object' }],
    repetitions: 1,
    endsAfterMs: AUT_TIME_PER_OBJECT_MS,
    trial: {
      phases: [{
        name: 'listing',
        display: { kind: 'text' as const, text: '{object.nameEn}', textHe: '{object.nameHe}', size: 40 },
        awaitsResponse: true,
        startsClock: true,
      }],
      response: { kind: 'wordList' as const },
      // No right answers, and one row per use: the measure of a divergent task is HOW MANY
      // someone produced, which a single row holding a comma-blob cannot be counted from.
      recall: {},
      correct: { kind: 'none' as const },
      itiMs: 0,
    },
    store: ['object.index', 'object.nameEn', 'object.task'],
  };
}

// The first object as the definition's own block. Its title and per-block instructions are
// dropped: at this level those belong to the EXPERIMENT, and the block intro for object one
// is the landing page itself.
const { title: _blockTitle, instructions: _blockInstructions, name: FIRST_USES_NAME, ...FIRST_USES } =
  usesBlock(OBJECTS[0]);

export const CREATIVITY_PORT: ExperimentDefinition = {
  version: 1,
  slug: 'creativity',
  title: 'Creativity Battery',
  titleHe: 'סוללת יצירתיות',
  category: 'CREATIVITY',

  instructions: {
    en: 'Three short tasks, each against a clock.\n\n'
      + '1. Uses — you will see an everyday object and have one minute to name as many uses '
      + 'for it as you can. Unusual ones count for as much as sensible ones.\n'
      + '2. Circles — four minutes to turn plain circles into drawings of anything you like.\n'
      + '3. Word triples — three words that all go with a fourth. Five minutes for fifteen.\n\n'
      + 'The first two have no right answers. About 12 minutes in all.',
    he: 'שלוש משימות קצרות, כל אחת עם שעון.\n\n'
      + '1. שימושים — יוצג חפץ יומיומי ויהיה לכם דקה אחת למנות כמה שיותר שימושים עבורו. '
      + 'שימושים לא שגרתיים נחשבים בדיוק כמו הגיוניים.\n'
      + '2. עיגולים — ארבע דקות להפוך עיגולים ריקים לציורים של מה שתרצו.\n'
      + '3. שלשות מילים — שלוש מילים שכולן מתחברות למילה רביעית. חמש דקות לחמש עשרה.\n\n'
      + 'לשתי הראשונות אין תשובות נכונות. כ-12 דקות בסך הכול.',
  },

  // ── Part 1: Alternative Uses ────────────────────────────────────────────────
  //
  // The first object is the definition's own block, because every definition has one; the
  // other three follow as stages. Same block, same minute, same order as the original.
  ...FIRST_USES,
  // The same name the other three blocks get, so the CSV reads consistently.
  stageName: FIRST_USES_NAME,
  pools: { object: [OBJECTS[0]], circles: CIRCLES, triplets: TRIPLETS },

  stages: [
    ...OBJECTS.slice(1).map(usesBlock),

    // ── Part 2: Circles ───────────────────────────────────────────────────────
    //
    // Thirty circles and four minutes, so nobody reaches the end — the measure is how far
    // they got and how unlike each other the drawings are. The block is bounded by the
    // clock, exactly as the original bounds it.
    {
      name: 'circles',
      title: { en: 'Circles', he: 'עיגולים' },
      instructions: {
        en: 'Four minutes. Turn each circle into a drawing of anything you like, then name it '
          + 'and move on. There are more circles than anyone finishes.',
        he: 'ארבע דקות. הפכו כל עיגול לציור של מה שתרצו, תנו לו שם והמשיכו. '
          + 'יש יותר עיגולים ממה שמספיקים.',
      },
      factors: [{ name: 'circle', from: 'circles' }],
      repetitions: 1,
      order: 'fixed',
      endsAfterMs: CIRCLES_TIME_MS,
      trial: {
        phases: [
          {
            name: 'draw',
            display: { kind: 'blank' },
            awaitsResponse: true,
            startsClock: true,
          },
          {
            name: 'name',
            display: {
              kind: 'text',
              text: 'What is it?',
              textHe: 'מה זה?',
              size: 20,
            },
            awaitsResponse: true,
          },
        ],
        // The drawing, then what they called it. Both are the answer: a rater needs the
        // picture, and the label is what makes an ambiguous one interpretable.
        response: [
          { kind: 'drawing', width: 300, height: 300, guide: 'circle', phase: 'draw' },
          { kind: 'text', placeholder: 'Name it', phase: 'name' },
        ],
        correct: { kind: 'none' },
        itiMs: 200,
      },
      store: ['circle.index', 'circle.task'],
    },

    // ── Part 3: Remote Associates ─────────────────────────────────────────────
    {
      name: 'associates',
      title: { en: 'Word triples', he: 'שלשות מילים' },
      instructions: {
        en: 'Five minutes. Each triple of words goes with one fourth word — find it and type '
          + 'it. Skip any you cannot get; there are more than anyone finishes.',
        he: 'חמש דקות. כל שלשת מילים מתחברת למילה רביעית אחת — מצאו אותה והקלידו. '
          + 'דלגו על מה שלא מצליחים; יש יותר ממה שמספיקים.',
      },
      factors: [{ name: 'triplet', from: 'triplets' }],
      repetitions: 1,
      order: 'fixed',
      endsAfterMs: RAT_TIME_MS,
      trial: {
        phases: [{
          name: 'triple',
          display: {
            kind: 'text',
            text: '{triplet.wordsEn}',
            textHe: '{triplet.wordsHe}',
            size: 30,
          },
          awaitsResponse: true,
          startsClock: true,
        }],
        response: { kind: 'text', placeholder: 'The fourth word' },
        // Typed, so case and spacing are not the answer, and a plural is the same word. The
        // original accepts exactly these.
        correct: { kind: 'textMatch', factor: 'triplet.solutionEn', plural: true },
        itiMs: 200,
      },
      store: ['triplet.index', 'triplet.solutionEn', 'triplet.task'],
    },
  ],

  simplifications: [
    {
      what: 'A Hebrew run is scored against the English solution.',
      why: 'The runtime scores a typed answer against ONE named field, and the Hebrew '
        + 'triplets are a separate puzzle set with their own solutions. Both sets are shown '
        + 'correctly and both answers are stored, so nothing is lost from the data — but a '
        + 'Hebrew run\'s accuracy is not meaningful until scoring can pick the field by '
        + 'language. The two divergent tasks are unaffected: they have no right answers.',
    },
  ],

  thanks: { showResults: false },

  dashboard: {
    stats: [
      { label: 'Uses named per object', measure: 'count', filter: { 'object.task': 'uses' } },
      { label: 'Circles completed', measure: 'count', filter: { 'circle.task': 'circles' } },
      { label: 'Word triples solved', measure: 'accuracy', filter: { 'triplet.task': 'associates' }, unit: '%' },
    ],
    charts: [
      {
        title: 'Ideas per object',
        description: 'Fluency: how many uses each object drew out. An object nobody has a '
          + 'second use for is a harder prompt, not a less creative class.',
        kind: 'bar',
        groupBy: 'object.nameEn',
        measure: 'count',
        filter: { 'object.task': 'uses' },
        errorBars: true,
        yLabel: 'Uses named',
      },
      {
        title: 'Where ideas run out',
        description: 'Ideas by their position in the minute. The first few come quickly and '
          + 'are usually the obvious ones; the later ones are where the unusual answers live.',
        kind: 'line',
        groupBy: 'outputPosition',
        measure: 'count',
        filter: { 'object.task': 'uses' },
        xLabel: 'Which idea (1st, 2nd, …)',
        yLabel: 'How many people got that far',
      },
      {
        title: 'Word triples solved, by triple',
        description: 'Convergent thinking: one right answer, and the difficulty is entirely '
          + 'in finding it. The spread between triples is usually enormous.',
        kind: 'bar',
        groupBy: 'triplet.index',
        measure: 'accuracy',
        filter: { 'triplet.task': 'associates' },
        errorBars: true,
        yLabel: 'Solved (%)',
      },
      {
        title: 'Time to solve a triple',
        description: 'Correct answers only. A remote association either arrives or it does '
          + 'not — the times are long and the distribution is wide.',
        kind: 'bar',
        groupBy: 'triplet.index',
        measure: 'meanRt',
        correctOnly: true,
        filter: { 'triplet.task': 'associates' },
        errorBars: true,
        yLabel: 'RT (ms)',
      },
    ],
  },
};
