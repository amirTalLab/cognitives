import type { ExperimentDefinition, PoolItem, Stage } from '../schema';
import { DRM_FOILS, DRM_LISTS } from '../stimuli/drm-lists';

// ─── DRM (Deese-Roediger-McDermott) ───────────────────────────────────────────
// Original: app/drm/ (page, practice, study, test, thanks, teacher) and lib/drm/word-lists.ts.
//
// False memory. Five themed lists are studied one at a time, each followed by thirty
// seconds of arithmetic and ninety seconds of free recall; then one recognition test over
// everything. The critical lure — "sleep" for a list of bed, rest, awake... — is never
// shown, and the finding is that people recall and recognise it about as often as words
// that were actually there.
//
// Structurally this is the reason stage groups exist. The list order is drawn per
// participant, so that which list someone studied is not confounded with how far into a
// long session they met it; fifteen blocks written out one by one could not say that.
//
// Timings are the original's constants exactly: 2000ms per word, 250ms between,
// 2000ms list intro, 30s arithmetic, 90s recall.

const WORD_MS = 2000;
const ISI_MS = 250;
const LIST_INTRO_MS = 2000;
const DISTRACTOR_MS = 30_000;
const RECALL_MS = 90_000;

/** The study words, as shown. The critical lure is deliberately not among them. */
const DRM_LIST_POOL: PoolItem[] = DRM_LISTS.map(list => ({
  theme: list.theme,
  words: list.words.map(w => ({
    word: w.word,
    serialPosition: w.serialPosition,
    itemType: 'studied',
  })),
  // What recall is scored against: the ten studied words PLUS the lure, so that saying
  // "sleep" is recorded as the false memory it is rather than as an ordinary intrusion.
  probes: [
    ...list.words.map(w => ({
      word: w.word,
      serialPosition: w.serialPosition,
      itemType: 'studied',
    })),
    { word: list.lure, serialPosition: 0, itemType: 'critical_lure' },
  ],
}));

// ── Recognition probes ────────────────────────────────────────────────────────
// Two studied words at every serial position, each list's lure, and every unrelated foil:
// 20 + 5 + 25 = 50 items in one shuffled test.

const STUDIED_PROBES: PoolItem[] = DRM_LISTS.flatMap(list =>
  list.words.map(w => ({
    word: w.word,
    serialPosition: w.serialPosition,
    itemType: 'studied',
    listTheme: list.theme,
  })));

const LURE_PROBES: PoolItem[] = DRM_LISTS.map(list => ({
  word: list.lure,
  serialPosition: 0,
  itemType: 'critical_lure',
  listTheme: list.theme,
}));

const FOIL_PROBES: PoolItem[] = DRM_FOILS.map(f => ({
  word: f.word,
  serialPosition: 0,
  itemType: 'unrelated_foil',
  listTheme: 'none',
}));

/** Two-digit numbers for the odd/even filler, as the original draws them. */
const DRM_NUMBERS: PoolItem[] = Array.from({ length: 90 }, (_, i) => {
  const value = i + 10;
  return { value, parity: value % 2 === 0 ? 'even' : 'odd' };
});

const PRACTICE_WORDS: PoolItem[] = ['apple', 'banana', 'grape'].map((word, i) => ({
  word,
  serialPosition: i + 1,
  itemType: 'studied',
}));

const WORD_STYLE = { size: 64, font: 'mono' as const, color: '#34d399' };

// ── Block shapes ──────────────────────────────────────────────────────────────

/**
 * The filled delay: odd or even, for a fixed stretch of time.
 *
 * Bounded by the clock rather than by a count, because its whole job is to occupy the same
 * interval for everyone — a fast participant finishing early would get a shorter delay
 * before recall than a slow one, which is the single thing the delay must not do.
 */
function distractorBlock(name: string, endsAfterMs: number): Stage {
  return {
    name,
    autoAdvanceMs: 0,
    factors: [{ name: 'n', from: 'numbers' }],
    repetitions: 1,
    endsAfterMs,
    trial: {
      phases: [{
        name: 'ask',
        display: { kind: 'text', text: '{n.value}', ...WORD_STYLE },
        awaitsResponse: true,
        startsClock: true,
      }],
      response: {
        kind: 'choice',
        layout: 'row',
        options: [
          { value: 'even', label: 'Even', labelHe: 'זוגי' },
          { value: 'odd', label: 'Odd', labelHe: 'אי-זוגי' },
        ],
      },
      correct: { kind: 'matchesFactor', factor: 'n.parity' },
      itiMs: 300,
    },
    store: ['n.value', 'n.parity'],
  };
}

/** Free recall: type everything you remember, for a fixed time, scored per studied word. */
function recallBlock(name: string, against: string, endsAfterMs: number): Stage {
  return {
    name,
    autoAdvanceMs: 0,
    factors: [{ name: 'block', levels: ['recall'] }],
    repetitions: 1,
    trial: {
      phases: [{
        name: 'recall',
        display: {
          kind: 'text',
          text: 'Type every word you remember from the list you just saw.',
          size: 20,
        },
        awaitsResponse: true,
        startsClock: true,
        timeoutMs: endsAfterMs,
      }],
      response: { kind: 'wordList' },
      correct: { kind: 'none' },
      recall: { against, match: 'word', intrusions: true },
    },
    store: ['list.theme'],
  };
}

export const DRM_PORT: ExperimentDefinition = {
  version: 1,
  slug: 'drm',
  title: 'DRM Memory Experiment',
  titleHe: 'ניסוי זיכרון — DRM',
  category: 'MEMORY',

  instructions: {
    en: 'Phase 1: Study — you will see lists of English words. Try to remember them.\n'
      + 'Phase 2: Math — after each list, a short odd/even task.\n'
      + 'Phase 3: Free recall — type as many words as you remember from that list.\n'
      + 'Phase 4: Recognition — decide whether you saw each word before.\n\n'
      + 'Study + Recall (~12 min) + Recognition (~3 min).',
    // Plural, like every other experiment on the site. The hand-built page addressed one
    // woman, which reads as written for someone else to half a class.
    he: 'שלב 1: למידה — תראו רשימות של מילים באנגלית. נסו לזכור אותן.\n'
      + 'שלב 2: חשבון — לאחר כל רשימה תבצעו משימה קצרה של זוגי/אי-זוגי.\n'
      + 'שלב 3: שחזור חופשי — הקלידו כמה שיותר מילים שזכרתם מהרשימה.\n'
      + 'שלב 4: זיהוי — תראו מילים ותחליטו: האם ראיתם את המילה קודם?\n\n'
      + 'למידה + שחזור (כ-12 דקות) + זיהוי (כ-3 דקות).',
  },

  pools: {
    lists: DRM_LIST_POOL,
    practiceWords: PRACTICE_WORDS,
    numbers: DRM_NUMBERS,
    studiedProbes: STUDIED_PROBES,
    lureProbes: LURE_PROBES,
    foilProbes: FOIL_PROBES,
  },

  // The first block is the practice run-through: three words, a short delay, a short recall,
  // so the shape of the task is familiar before the first real list.
  stageName: 'practiceStudy',
  factors: [{ name: 'item', from: 'practiceWords' }],
  repetitions: 1,
  order: 'fixed',
  trial: {
    phases: [
      { name: 'word', display: { kind: 'text', text: '{item.word}', ...WORD_STYLE }, durationMs: WORD_MS },
      { name: 'isi', display: { kind: 'blank' }, durationMs: ISI_MS },
    ],
    response: { kind: 'none' },
    correct: { kind: 'none' },
  },
  store: ['item.word', 'item.serialPosition'],

  stages: [
    distractorBlock('practiceDistractor', 10_000),
    recallBlock('practiceRecall', 'practiceWords', 15_000),

    {
      forEach: 'lists',
      as: 'list',
      stages: [
        {
          name: 'study',
          // The list's number is shown by the intro screen itself; its THEME is never
          // named, since the theme is the lure and saying it would be telling them the
          // answer before they are asked.
          title: { en: 'Get ready', he: 'התכונני' },
          autoAdvanceMs: LIST_INTRO_MS,
          factors: [{ name: 'item', from: '{list.words}' }],
          repetitions: 1,
          order: 'fixed',
          trial: {
            phases: [
              { name: 'word', display: { kind: 'text', text: '{item.word}', ...WORD_STYLE }, durationMs: WORD_MS },
              { name: 'isi', display: { kind: 'blank' }, durationMs: ISI_MS },
            ],
            response: { kind: 'none' },
            correct: { kind: 'none' },
          },
          store: ['item.word', 'item.serialPosition', 'list.theme'],
        },
        distractorBlock('distractor', DISTRACTOR_MS),
        recallBlock('recall', '{list.probes}', RECALL_MS),
      ],
    },

    {
      name: 'recognition',
      title: { en: 'Recognition', he: 'זיהוי' },
      instructions: {
        en: 'You will see words one at a time. For each, decide whether it appeared in any '
          + 'of the lists you studied, and how sure you are.',
        he: 'תראו מילים אחת אחרי השנייה. לכל מילה החליטו האם הופיעה באחת הרשימות שלמדתם, '
          + 'וכמה אתם בטוחים.',
      },
      factors: [{
        name: 'item',
        // Two studied words at every serial position — each likely from a different list —
        // plus every lure and every foil, shuffled into one test.
        fromEach: [
          { pool: 'studiedProbes', sample: 2, per: 'serialPosition' },
          { pool: 'lureProbes' },
          { pool: 'foilProbes' },
        ],
      }],
      repetitions: 1,
      trial: {
        phases: [{
          name: 'judge',
          display: { kind: 'text', text: '{item.word}', ...WORD_STYLE },
          awaitsResponse: true,
          startsClock: true,
        }],
        // One press carries the decision AND the confidence, as the original's four buttons do.
        response: {
          kind: 'choice',
          layout: 'row',
          options: [
            { value: 'sure_no', label: 'Sure no', labelHe: 'בטוחה שלא' },
            { value: 'think_no', label: 'Think no', labelHe: 'חושבת שלא' },
            { value: 'think_yes', label: 'Think yes', labelHe: 'חושבת שכן' },
            { value: 'sure_yes', label: 'Sure yes', labelHe: 'בטוחה שכן' },
          ],
        },
        correct: {
          kind: 'mapping',
          factor: 'item.itemType',
          expect: {
            studied: ['think_yes', 'sure_yes'],
            critical_lure: ['think_no', 'sure_no'],
            unrelated_foil: ['think_no', 'sure_no'],
          },
        },
        itiMs: 300,
      },
      store: ['item.word', 'item.itemType', 'item.serialPosition', 'item.listTheme'],
    },
  ],

  thanks: { showResults: true },

  dashboard: {
    charts: [
      {
        title: 'Figure 1: Recognition Rates by Item Type (DRM Classic Contrast)',
        description: 'Percentage called "old". The lure was never shown — if it stands with '
          + 'the studied words rather than with the foils, that is the false memory.',
        kind: 'bar',
        groupBy: 'item.itemType',
        measure: 'proportion',
        ofResponse: ['think_yes', 'sure_yes'],
        filter: { stage: 'recognition' },
        errorBars: true,
        groups: [
          { value: 'studied', label: 'Studied' },
          { value: 'critical_lure', label: 'Critical Lure' },
          { value: 'unrelated_foil', label: 'Unrelated Foil' },
        ],
        yLabel: 'Called "old" (%)',
      },
      {
        title: 'Figure 2: Free Recall — Correct vs False Recall',
        description: 'Percentage of items recalled, by what the item was. The lure was never '
          + 'presented, so anything above zero is a word remembered that never happened.',
        kind: 'bar',
        groupBy: 'itemType',
        measure: 'proportion',
        ofResponse: 'recalled',
        filter: { stage: 'recall' },
        errorBars: true,
        groups: [
          { value: 'studied', label: 'Studied words' },
          { value: 'critical_lure', label: 'Critical lure' },
        ],
        yLabel: 'Recalled (%)',
      },
      {
        title: 'Figure 3: Confidence Distribution for "OLD" Responses',
        description: 'How sure people were when they said a word was old.',
        kind: 'bar',
        groupBy: 'response',
        measure: 'count',
        filter: { stage: 'recognition', response: ['think_yes', 'sure_yes'] },
        groups: [
          { value: 'think_yes', label: 'Think yes' },
          { value: 'sure_yes', label: 'Sure yes' },
        ],
        yLabel: 'Responses',
      },
      {
        title: 'Figure 4: Serial Position Curve (Recognition)',
        description: 'Studied words only, by where they stood in their list. The ends of a '
          + 'list are remembered better than its middle.',
        kind: 'line',
        groupBy: 'item.serialPosition',
        measure: 'proportion',
        ofResponse: ['think_yes', 'sure_yes'],
        filter: { stage: 'recognition', 'item.itemType': 'studied' },
        errorBars: true,
        xLabel: 'Serial position',
        yLabel: 'Called "old" (%)',
      },
      {
        title: 'Figure 5: Free Recall vs Recognition (Individual)',
        description: 'Each dot is one participant: how much of the lure they recalled '
          + 'against how much of it they recognised.',
        kind: 'xy',
        groupBy: 'participant',
        measure: 'proportion',
        axes: {
          x: {
            measure: 'proportion',
            ofResponse: 'recalled',
            filter: { stage: 'recall', itemType: 'critical_lure' },
            label: 'Lure recalled (%)',
          },
          y: {
            measure: 'proportion',
            ofResponse: ['think_yes', 'sure_yes'],
            filter: { stage: 'recognition', 'item.itemType': 'critical_lure' },
            label: 'Lure called "old" (%)',
          },
        },
      },
      {
        title: 'Figure 6: Recognition Accuracy vs Confidence (Individual)',
        description: 'Each dot is one participant: how accurate they were against how often '
          + 'they answered with certainty rather than a guess.',
        kind: 'xy',
        groupBy: 'participant',
        measure: 'accuracy',
        axes: {
          x: {
            measure: 'accuracy',
            filter: { stage: 'recognition' },
            label: 'Recognition accuracy (%)',
          },
          y: {
            measure: 'proportion',
            ofResponse: ['sure_yes', 'sure_no'],
            filter: { stage: 'recognition' },
            label: 'Answered "sure" (%)',
          },
        },
      },
      {
        title: 'Figure 7: Math Task Performance (Individual)',
        description: 'The filled delay. Each dot is one participant: how many sums they got '
          + 'through against how many they got right.',
        kind: 'xy',
        groupBy: 'participant',
        measure: 'accuracy',
        axes: {
          x: { measure: 'count', filter: { stage: 'distractor' }, label: 'Problems attempted' },
          y: { measure: 'accuracy', filter: { stage: 'distractor' }, label: 'Accuracy (%)' },
        },
      },
    ],
    stats: [
      {
        label: 'Lure recognised',
        measure: 'proportion',
        ofResponse: ['think_yes', 'sure_yes'],
        filter: { stage: 'recognition', 'item.itemType': 'critical_lure' },
        unit: '%',
      },
      {
        label: 'Lure falsely recalled',
        measure: 'proportion',
        ofResponse: 'recalled',
        filter: { stage: 'recall', itemType: 'critical_lure' },
        unit: '%',
      },
      {
        label: 'Studied words recalled',
        measure: 'proportion',
        ofResponse: 'recalled',
        filter: { stage: 'recall', itemType: 'studied' },
        unit: '%',
      },
    ],
  },

  mock: {
    participants: 24,
    baseRtMs: 1100,
    baseAccuracy: 0.78,
    effects: [
      // Recognition. The finding: the lure is called "old" nearly as often as a studied
      // word, and far more often than an unrelated one. Scored as accuracy, calling the lure
      // old is an error — so a LOW accuracy on lure trials is exactly the false memory.
      { factor: 'item.itemType', level: 'critical_lure', accuracyDelta: -0.55 },
      { factor: 'item.itemType', level: 'unrelated_foil', accuracyDelta: 0.15 },
      // Free recall, where a row is one studied item and "correct" means it came back.
      // Roughly 62% of studied words, and the lure about 50% — the published pattern.
      { factor: 'itemType', level: 'studied', accuracyDelta: -0.16 },
      { factor: 'itemType', level: 'critical_lure', accuracyDelta: -0.28 },
    ],
  },

  simplifications: [
    {
      what: 'The recognition test is shuffled freely, without the original\'s ordering constraints',
      why: 'The original avoids runs of more than three old or new items, and avoids placing a '
        + 'critical lure straight after two studied words from its own list. The runtime '
        + 'shuffles without constraints, so those runs can occur by chance.',
    },
    {
      what: 'The practice block does not replay the words you typed back to you',
      why: 'The original ends its practice by listing what you recalled, as reassurance that '
        + 'the task worked. The runtime has no such screen; the practice still runs and is '
        + 'still scored.',
    },
    {
      what: 'The three-second break between lists is folded into the two-second list intro',
      why: 'The original shows "prepare for the next list" for three seconds and then a list '
        + 'intro for two. Here the list intro is the only screen between them, at the '
        + 'original\'s two seconds.',
    },
    {
      what: 'Figure 6 plots the proportion of confident answers rather than a mean confidence rating',
      why: 'The runtime measures proportions of a response, not the average of a rating. '
        + '"How often they answered with certainty" carries the same comparison; the '
        + 'per-response confidences are all in the CSV export.',
    },
    {
      what: 'Practice rows are saved, flagged by their block name',
      why: 'The original discards practice entirely. Here every block writes rows, which is '
        + 'how the runtime records a dropout during practice; the dashboard charts all '
        + 'filter by block, so practice never enters a figure.',
    },
  ],
};
