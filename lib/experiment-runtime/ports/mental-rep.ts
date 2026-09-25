import type { ExperimentDefinition, PoolItem } from '../schema';
import {
  MR_ISLAND_MAP,
  MR_ROT0_DIFF, MR_ROT0_SAME, MR_ROT120_DIFF, MR_ROT120_SAME,
  MR_ROT180_DIFF, MR_ROT180_SAME, MR_ROT60_DIFF, MR_ROT60_SAME,
  MR_SCAN_LONG, MR_SCAN_MEDIUM, MR_SCAN_SHORT,
  type RotationPair, type ScanPair,
} from '../stimuli/mental-rep-stimuli';

// ─── Mental representation ────────────────────────────────────────────────────
// Original: app/mentalRep/ (page, scanning-study, scanning-test, rotation-practice,
// rotation-main, results, teacher), lib/mental-rep/{rotation,scanning}.ts and
// components/mental-rep/{BlockFigure,IslandMap}.tsx.
//
// TWO classic experiments in one session, both asking whether a mental image behaves like a
// picture. Kosslyn's island map says yes about SPACE: memorise a map, then scan in your head
// from one landmark to another, and the time it takes rises with the distance on the map you
// are no longer looking at. Shepard & Metzler's blocks say yes about ROTATION: decide whether
// two figures are the same object turned, and the time rises with the angle between them, as
// though the object were being turned at a steady rate behind your eyes.
//
// Both findings are a SLOPE rather than a difference between conditions, which is why this
// port is the one that taught the runtime to report a correlation.
//
// Scanning comes first, exactly as the original sequences it: the map has to be studied
// before it can be scanned, and rotation is self-contained.

const asRotation = (trials: RotationPair[]): PoolItem[] => trials.map(t => ({ ...t }));
const asScan = (trials: ScanPair[]): PoolItem[] => trials.map(t => ({ ...t }));

const STUDY_MS = 30_000;

/** Both tasks measure how long a mental operation takes, so both are reaction-time trials. */
const SCAN_TRIAL = {
  phases: [
    { name: 'fixation', display: { kind: 'fixation' as const }, durationMs: 500 },
    // The pair is named BEFORE the clock starts: the original gives a 1.5s "starting at X,
    // scan to Y" card, so the time it measures is scanning, not reading two words.
    {
      name: 'ready',
      display: {
        kind: 'stack' as const,
        items: [
          { kind: 'text' as const, text: '{pair.fromName}', size: 34, color: '#22d3ee' },
          { kind: 'text' as const, text: '↓', size: 30, color: '#9ca3af' },
          { kind: 'text' as const, text: '{pair.toName}', size: 34, color: '#60a5fa' },
        ],
      },
      durationMs: 1500,
    },
    {
      name: 'scan',
      display: {
        kind: 'row' as const,
        gap: 24,
        items: [
          { kind: 'text' as const, text: '{pair.fromName}', size: 28, color: '#22d3ee' },
          { kind: 'text' as const, text: '→', size: 26, color: '#d1d5db' },
          { kind: 'text' as const, text: '{pair.toName}', size: 28, color: '#60a5fa' },
        ],
      },
      awaitsResponse: true,
      startsClock: true,
    },
  ],
  // One key, and no right answer: the measure is entirely how long the press takes. Scoring
  // it would invent a correctness the task does not have.
  response: {
    kind: 'choice' as const,
    layout: 'row' as const,
    options: [{ value: 'arrived', label: 'Arrived', labelHe: 'הגעתי', key: ' ' }],
  },
  correct: { kind: 'none' as const },
  itiMs: 300,
};

const ROTATION_TRIAL = {
  phases: [
    { name: 'fixation', display: { kind: 'fixation' as const }, durationMs: 500 },
    {
      name: 'figures',
      display: {
        kind: 'pair' as const,
        gap: 48,
        left: { kind: 'image' as const, src: '{pair.left}', size: 200 },
        right: { kind: 'image' as const, src: '{pair.right}', size: 200 },
      },
      awaitsResponse: true,
      startsClock: true,
    },
  ],
  response: {
    kind: 'choice' as const,
    layout: 'row' as const,
    options: [
      { value: 'same', label: 'Same', labelHe: 'זהה', key: 's' },
      { value: 'different', label: 'Different', labelHe: 'שונה', key: 'd' },
    ],
  },
  correct: { kind: 'matchesFactor' as const, factor: 'pair.answer' },
  itiMs: 0,
};

/** Five from each of the eight (angle x answer) cells, as the original selects them. */
const ROTATION_FACTOR = {
  name: 'pair',
  fromEach: [
    { pool: 'rot0Same', sample: 5 },
    { pool: 'rot0Diff', sample: 5 },
    { pool: 'rot60Same', sample: 5 },
    { pool: 'rot60Diff', sample: 5 },
    { pool: 'rot120Same', sample: 5 },
    { pool: 'rot120Diff', sample: 5 },
    { pool: 'rot180Same', sample: 5 },
    { pool: 'rot180Diff', sample: 5 },
  ],
};

export const MENTAL_REP_PORT: ExperimentDefinition = {
  version: 1,
  slug: 'mentalRep',
  title: 'Mental Representation',
  titleHe: 'ייצוג מנטלי',
  category: 'IMAGINATION',

  instructions: {
    en: 'This session includes two classic experiments that explore how we create and '
      + 'manipulate mental images.\n\n'
      + 'Part 1 (Scanning): memorise an island map, then 21 scanning trials.\n'
      + 'Part 2 (Rotation): 5 practice trials with feedback, then 40 main trials.\n'
      + 'Please respond as quickly and accurately as possible.\n\n'
      + 'The entire session takes about 10-15 minutes.',
    he: 'מפגש זה כולל שני ניסויים קלאסיים החוקרים כיצד אנו יוצרים ומתמרנים דימויים מנטליים.\n\n'
      + 'חלק 1 (סריקה): שינון מפת אי, ואז 21 ניסויי סריקה.\n'
      + 'חלק 2 (סיבוב): 5 ניסויי תרגול עם משוב, ואז 40 ניסויים עיקריים.\n'
      + 'אנא הגיבו מהר ככל האפשר ובדיוק מרבי.\n\n'
      + 'כל המפגש אורך כ-10-15 דקות.',
  },

  // ── Block 1: study the map ──────────────────────────────────────────────────
  //
  // One trial that shows the map for thirty seconds and asks for nothing. The whole of the
  // scanning experiment rests on this image being in memory rather than on screen: every
  // later trial names two landmarks the participant can no longer look at.
  pools: { map: [{ src: MR_ISLAND_MAP.en, srcHe: MR_ISLAND_MAP.he }] },
  factors: [{ name: 'island', from: 'map' }],
  repetitions: 1,
  stageName: 'mapStudy',
  trial: {
    phases: [{
      name: 'study',
      display: { kind: 'image', src: '{island.src}', size: 560 },
      durationMs: STUDY_MS,
    }],
    response: { kind: 'none' },
    correct: { kind: 'none' },
    itiMs: 0,
  },
  store: [],

  stages: [
    // ── Block 2: mental scanning ───────────────────────────────────────────────
    {
      name: 'scanning',
      title: { en: 'Mental Scanning', he: 'סריקה מנטלית' },
      instructions: {
        en: 'Imagine the starting location, then mentally scan to the target. '
          + 'Press SPACE when you "arrive" at the target.',
        he: 'דמיינו את מיקום ההתחלה, ואז סרקו מנטלית אל היעד. לחצו רווח כשאתם "מגיעים" ליעד.',
      },
      pools: {
        scanShort: asScan(MR_SCAN_SHORT),
        scanMedium: asScan(MR_SCAN_MEDIUM),
        scanLong: asScan(MR_SCAN_LONG),
      },
      // Seven pairs from each distance band — short, medium and long — so the 21 trials
      // span the map rather than clustering wherever the landmarks happen to be dense.
      factors: [{
        name: 'pair',
        fromEach: [
          { pool: 'scanShort', sample: 7 },
          { pool: 'scanMedium', sample: 7 },
          { pool: 'scanLong', sample: 7 },
        ],
      }],
      repetitions: 1,
      trial: SCAN_TRIAL,
      store: ['pair.distance', 'pair.distanceBin', 'pair.band', 'pair.fromName', 'pair.toName'],
    },

    // ── Block 3: mental rotation ───────────────────────────────────────────────
    //
    // Its own practice, which is the capability this port added: until now only the first
    // block of a definition could be practised, so the second half of a two-part session
    // arrived cold however clearly the definition asked for it.
    {
      name: 'rotation',
      title: { en: 'Mental Rotation', he: 'סיבוב מנטלי' },
      instructions: {
        en: 'You will see two 3D objects side by side.\n'
          + 'Decide if they are the SAME object (just rotated) or DIFFERENT objects.\n'
          + 'Press S for SAME, D for DIFFERENT.\n'
          + 'You will receive feedback during practice.',
        he: 'תראו שני אובייקטים תלת-ממדיים זה לצד זה.\n'
          + 'החליטו אם הם אותו האובייקט (רק מסובב) או אובייקטים שונים.\n'
          + 'לחצו S עבור זהה, D עבור שונה.\n'
          + 'תקבלו משוב במהלך התרגול.',
      },
      pools: {
        rot0Same: asRotation(MR_ROT0_SAME),
        rot0Diff: asRotation(MR_ROT0_DIFF),
        rot60Same: asRotation(MR_ROT60_SAME),
        rot60Diff: asRotation(MR_ROT60_DIFF),
        rot120Same: asRotation(MR_ROT120_SAME),
        rot120Diff: asRotation(MR_ROT120_DIFF),
        rot180Same: asRotation(MR_ROT180_SAME),
        rot180Diff: asRotation(MR_ROT180_DIFF),
      },
      factors: [ROTATION_FACTOR],
      repetitions: 1,
      // Five practice trials with feedback, drawn from the same bank — the original's
      // practice uses the same figures, so nothing here is held back from it.
      practice: { count: 5, feedback: true, record: false },
      trial: {
        ...ROTATION_TRIAL,
        feedback: {
          durationMs: 1500,
          correct: { en: 'Correct!', he: 'נכון!' },
          incorrect: { en: 'Incorrect', he: 'לא נכון' },
        },
      },
      store: ['pair.angle', 'pair.answer', 'pair.figure'],
    },
  ],

  thanks: { showResults: true },

  dashboard: {
    stats: [
      {
        label: 'Scanning: distance ↔ time',
        measure: 'correlation',
        against: 'pair.distance',
        filter: { stage: 'scanning' },
      },
      {
        label: 'Rotation: angle ↔ time',
        measure: 'correlation',
        against: 'pair.angle',
        filter: { stage: 'rotation' },
        correctOnly: true,
      },
      {
        label: 'Rotation accuracy',
        measure: 'accuracy',
        filter: { stage: 'rotation' },
        unit: '%',
      },
    ],
    charts: [
      {
        title: 'Scanning time by distance on the map',
        description: 'The map is gone by now — these distances exist only in the image the '
          + 'participant is holding. If the line rises, the image kept the map\'s geometry.',
        kind: 'line',
        groupBy: 'pair.distanceBin',
        measure: 'meanRt',
        filter: { stage: 'scanning' },
        errorBars: true,
        xLabel: 'Distance on the map',
        yLabel: 'Scanning time (ms)',
      },
      {
        title: 'Rotation time by angle',
        description: 'Correct trials only. A straight rise is the classic result: the figure '
          + 'appears to be turned at a steady rate, so twice the angle costs twice the time.',
        kind: 'line',
        groupBy: 'pair.angle',
        measure: 'meanRt',
        correctOnly: true,
        filter: { stage: 'rotation' },
        errorBars: true,
        xLabel: 'Rotation difference (degrees)',
        yLabel: 'RT (ms)',
      },
      {
        title: 'Rotation accuracy by angle',
        description: 'Whether the cost of a larger angle is paid in time, in errors, or both.',
        kind: 'bar',
        groupBy: 'pair.angle',
        measure: 'accuracy',
        filter: { stage: 'rotation' },
        errorBars: true,
        referenceLine: 50,
        xLabel: 'Rotation difference (degrees)',
        yLabel: 'Accuracy (%)',
      },
      {
        title: 'Rotation time by angle, same vs different',
        description: 'A "different" pair is a mirror image, which cannot be rotated into its '
          + 'twin — so deciding takes a search that a "same" pair ends as soon as it lines up.',
        kind: 'line',
        groupBy: 'pair.angle',
        seriesBy: 'pair.answer',
        measure: 'meanRt',
        correctOnly: true,
        filter: { stage: 'rotation' },
        errorBars: true,
        xLabel: 'Rotation difference (degrees)',
        yLabel: 'RT (ms)',
      },
      {
        title: 'Scanning time by distance band',
        description: 'The same scanning result in three bands, for a class too small for the '
          + 'line above to be smooth.',
        kind: 'bar',
        groupBy: 'pair.band',
        measure: 'meanRt',
        filter: { stage: 'scanning' },
        errorBars: true,
        groups: [
          { value: 'short', label: 'Short' },
          { value: 'medium', label: 'Medium' },
          { value: 'long', label: 'Long' },
        ],
        yLabel: 'Scanning time (ms)',
      },
    ],
  },
};
