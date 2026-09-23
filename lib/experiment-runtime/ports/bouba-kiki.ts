import type { ExperimentDefinition, PoolItem } from '../schema';
import { BK_ROUNDED, BK_SPIKY } from '../stimuli/bouba-kiki-shapes';

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
