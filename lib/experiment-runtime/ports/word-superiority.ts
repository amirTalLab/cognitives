import type { ExperimentDefinition, PoolItem } from '../schema';
import { WS_NONWORD_PAIRS, WS_WORD_PAIRS, type WsPair } from '../stimuli/word-superiority-pairs';

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

// The words are HEBREW, so everything about a trial runs right to left — including the
// marker, which is made of underscores and a question mark and therefore has no direction
// of its own. Left to right it would point at the third letter from the END of the word,
// which is not the letter under test.
const WS_STIMULUS_STYLE = { size: 36, font: 'mono' as const, dir: 'rtl' as const };

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
