// The experiment definition schema.
//
// An experiment is data, not code: a definition is validated, stored as a row, and run by
// a single renderer. That is what makes it safe (an uploaded paper can never cause code to
// execute), instant to preview (no build), and cheap to generate (a few KB of JSON instead
// of ~20k tokens of TSX).
//
// The shape here is derived from the sixteen working experiments in this repo rather than
// from descriptions of paradigms — they are class-tested, so they show which dimensions
// actually vary. Two patterns recur in all of them and drive the whole design:
//
//   1. A trial list is FACTORS CROSSED, repeated, then shuffled. Every experiment builds
//      its trials this way (visual search crosses 4x4x2 and repeats 4x; word superiority
//      crosses 3 conditions against a sampled pool of 20 items).
//   2. A trial is a PHASE MACHINE with millisecond durations, and the display during the
//      stimulus phase is computed from that trial's factor values.
//
// See docs/PARADIGM-COVERAGE.md for what this does and does not reach: 29 of 49 classic
// paradigms are expressible as written, ~92% with the extensions noted at the bottom.

// ─── Values bound to the trial ────────────────────────────────────────────────

/**
 * A literal value, or `"{factorName}"` to take it from the current trial.
 *
 * Added after probing eight paradigms outside this repo: Posner cueing manipulates the
 * cue-target interval, so a phase DURATION is the independent variable, and the cue's
 * screen POSITION varies per trial. Anywhere a fixed value seemed obvious, some paradigm
 * turns out to manipulate it — so the default is that a value can be bound.
 *
 * Still not an expression language: `"{soa}"` is a lookup, nothing is evaluated. That
 * boundary is what keeps a definition data rather than code.
 */
export type Bound<T> = T | `{${string}}`;

// ─── Stimulus pools ───────────────────────────────────────────────────────────

/**
 * A named list of items a factor can draw from.
 *
 * Word superiority needs 24 word pairs; Stroop needs colour words; DRM needs themed lists.
 * Keeping them as pools rather than inlining them in factor levels means a factor can
 * SAMPLE (take 20 of 24, differently per participant) instead of using all of them.
 */
export type PoolItem = Record<string, string | number | boolean>;

// ─── Factors ──────────────────────────────────────────────────────────────────

/**
 * One dimension of the design. The trial list is the cross product of all factors,
 * repeated `repetitions` times, then shuffled.
 */
export interface Factor {
  /** Referenced from displays and response rules as {name}. */
  name: string;
  /** Explicit levels: `['word', 'pseudoword', 'single-letter']` or `[1, 2, 4, 8]`. */
  levels?: (string | number | boolean)[];
  /** Or draw from a pool instead of listing levels. */
  from?: string;
  /** With `from`: take this many items per participant rather than all of them. */
  sample?: number;
  /**
   * Or compute the value from other factors, via a lookup table.
   *
   * Not every value in a design is independent. A Posner cue appears on the target's side
   * when the trial is valid and the opposite side when it is invalid — cue side is a
   * consequence of validity and target side, not a third thing to cross. Same for a Stroop
   * word (congruency x ink colour) and a face's rotation (upright or inverted).
   *
   * A lookup table rather than a formula, deliberately: `mapping` is keyed by the source
   * values joined with "|", so this stays data and nothing is evaluated.
   */
  derivedFrom?: string[];
  /** Keys are source values joined by "|", in `derivedFrom` order. */
  mapping?: Record<string, string | number | boolean>;
  /**
   * Counterbalanced factors are not crossed into every cell — they alternate evenly
   * across the final list. Left/right position is the usual case: it must be balanced,
   * but it doubles the trial count if crossed naïvely.
   */
  counterbalance?: boolean;
}

// ─── Displays ─────────────────────────────────────────────────────────────────

/**
 * What is on screen during a phase.
 *
 * `{factor}` and `{factor.field}` interpolate the current trial's values, so one display
 * spec covers every cell of the design. The variants are the ones the sixteen actually
 * use; adding another is a new case here plus a branch in the renderer, and nothing else.
 */
export type Display =
  | { kind: 'text'; text: string; size?: number; color?: string; font?: 'sans' | 'mono' }
  | { kind: 'fixation'; symbol?: string }
  | { kind: 'blank' }
  | { kind: 'mask'; pattern?: string }
  /** Two shapes side by side — bouba/kiki, composite faces, same/different judgements. */
  | { kind: 'pair'; left: Display; right: Display; gap?: number }
  /** An SVG primitive. Self-contained, so no image assets need sourcing. */
  | { kind: 'shape'; shape: Bound<'blob' | 'star' | 'circle' | 'square' | 'arrow' | 'line'>; size?: Bound<number>; color?: Bound<string>; rotation?: Bound<number>; points?: Bound<number> }
  /**
   * A picture. `src` is a filename from the definition's `assets` manifest — or an
   * absolute URL / site-absolute path, for images already served by this site.
   *
   * Rotation matters here as much as for shapes — the face inversion effect is the rotation.
   */
  | { kind: 'image'; src: Bound<string>; size?: Bound<number>; rotation?: Bound<number> }
  /**
   * A generated array of items in a box — visual search, ensemble perception.
   * The renderer lays them out with non-overlapping random positions.
   */
  | { kind: 'array'; count: Bound<number>; item: Display; distractor?: Display; distractorCount?: Bound<number>; area?: { width: number; height: number } }
  /** Something at a screen location — Posner cues and targets, where the side is the manipulation. */
  | { kind: 'positioned'; at: Bound<'left' | 'right' | 'top' | 'bottom' | 'center'>; content: Display }
  /** Several displays at once. */
  | { kind: 'stack'; items: Display[] };

// ─── Phases ───────────────────────────────────────────────────────────────────

/**
 * One step of a trial. Timed phases advance on their own; the response phase waits.
 *
 * Durations are milliseconds. The renderer must drive these with plain timers and never
 * wrap a timed phase in an exit animation — a ~300ms exit silently swallows a 150ms
 * stimulus, which is the single most expensive bug in this codebase's history.
 */
export interface Phase {
  name: string;
  display: Display;
  /**
   * Omitted on a response phase, which waits for input instead.
   * Bound because in cueing paradigms the interval itself is the manipulation.
   */
  durationMs?: Bound<number>;
  /** Marks the phase that collects the response. */
  awaitsResponse?: boolean;
  /** Timer from which reaction time is measured. Defaults to the response phase. */
  startsClock?: boolean;
}

// ─── Responses ────────────────────────────────────────────────────────────────

/**
 * How the participant answers.
 *
 * Every option must work by touch as well as by keyboard — students take these on phones,
 * so a keys-only design is not acceptable.
 */
export type ResponseSpec =
  | {
      kind: 'choice';
      options: { value: string; label: string; labelHe?: string; key?: string; display?: Display }[];
      layout?: 'row' | 'column' | 'sides';
    }
  | { kind: 'rating'; min: number; max: number; minLabel?: string; maxLabel?: string }
  | { kind: 'number'; min?: number; max?: number; unit?: string }
  | { kind: 'text'; multiline?: boolean; placeholder?: string }
  /** Free recall of a list — DRM, serial position. */
  | { kind: 'wordList'; maxWords?: number };

/**
 * One trial can collect more than one response.
 *
 * Found by probing signal detection, where every trial takes a decision AND a confidence
 * rating. Binding each response to a named phase covers that without a separate concept:
 * a single-response trial is just the one-element case.
 */
export type ResponseStep = ResponseSpec & { phase: string };

/**
 * What counts as correct.
 *
 * `expression` compares against factor values: `"{targetPresent} ? 'present' : 'absent'"`
 * is deliberately not supported — instead the rule names a factor, or a mapping from
 * factor value to expected response, so the definition stays data rather than code.
 */
export type CorrectRule =
  | { kind: 'matchesFactor'; factor: string }
  | { kind: 'mapping'; factor: string; expect: Record<string, string> }
  /** Preference tasks with no correct answer — ratings, free choice. */
  | { kind: 'none' };

/**
 * How a mock dataset should look.
 *
 * The Mock Data toggle is how a lecturer demonstrates an effect with no participants, so
 * the generated data has to show the textbook result rather than noise. A generic runtime
 * cannot know that a Stroop incongruent trial is ~150ms slower — but the paper says so,
 * and the spec stage already extracts it, so the definition carries it.
 */
export interface MockSpec {
  participants: number;
  /** Baseline for a condition with no modifier applied. */
  baseRtMs: number;
  baseAccuracy: number;
  /** Per-level departures from baseline — the effect itself. */
  effects?: {
    factor: string;
    level: string;
    rtDeltaMs?: number;
    /** Added to baseAccuracy, as a proportion: 0.1 means ten points higher. */
    accuracyDelta?: number;
  }[];
}

// ─── Assets ───────────────────────────────────────────────────────────────────

/**
 * Image files the experiment puts on screen.
 *
 * Most paradigms need none — shapes and text are inline SVG precisely so a generated
 * experiment never has to source a file. But some effects ARE the image: mental rotation
 * needs those particular block figures, face inversion needs faces. Refusing every one of
 * them would rule out a whole class of classic experiments.
 *
 * The files live wherever `base` points, NOT in the repo, which is the whole point: a
 * lecturer adding stimuli must not require a commit and a deploy. Uploading puts them in
 * Supabase storage under the experiment's slug; `base` can equally be a university server
 * or a folder this site already serves, such as "/faces/".
 *
 * `files` is the manifest of what is actually there. It exists so the validator can catch
 * a definition asking for "blockA_180.png" when no such file was uploaded — otherwise the
 * first anyone knows of it is a broken image in front of a class.
 */
export interface AssetManifest {
  /** Where the files are served from. Must end with "/". */
  base: string;
  /** Every filename available under `base`. */
  files: string[];
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

/**
 * A teacher-dashboard chart.
 *
 * Kept declarative for the same reason as the rest: the renderer already knows how to draw
 * a bar chart with SEM error bars computed from per-participant means, so the definition
 * only has to say what to aggregate.
 */
export interface ChartSpec {
  title: string;
  kind: 'bar' | 'line' | 'scatter' | 'histogram';
  /** What goes on the x axis — a factor name, or 'participant'. */
  groupBy: string;
  /**
   * What is measured.
   *  - accuracy   percentage correct (for a preference task, percentage matching the
   *               factor named in the correctness rule — see `correctMeans`)
   *  - meanRt     mean reaction time in ms
   *  - proportion percentage giving the response named in `ofResponse`
   *  - count      number of trials
   */
  measure: 'accuracy' | 'meanRt' | 'proportion' | 'count';
  /** Required by `measure: 'proportion'` — which response value to count. */
  ofResponse?: string;
  /** Split into series by a second factor. */
  seriesBy?: string;
  /** A reference line, e.g. 50 for chance on a 2AFC task. */
  referenceLine?: number;
  yLabel?: string;
  /** SEM error bars, computed per participant first. Defaults to true for bar charts. */
  errorBars?: boolean;
}

// ─── The definition ───────────────────────────────────────────────────────────

export interface ExperimentDefinition {
  /** Bumped when the shape changes, so stored rows stay readable. */
  version: 1;

  slug: string;
  title: string;
  titleHe: string;
  category: string;

  /** Bilingual instructions shown on the landing page. Hebrew is the default language. */
  instructions: { en: string; he: string };

  /** Image files this experiment needs. Absent when it draws everything from shapes and text. */
  assets?: AssetManifest;

  pools?: Record<string, PoolItem[]>;
  factors: Factor[];

  /**
   * Cells to drop from the cross.
   *
   * A full cross produces combinations some designs cannot use: comparing two numbers
   * crosses 2 against 2, and "which is larger" has no answer there. Without this the only
   * options are to score an impossible trial arbitrarily or to invent a response for it —
   * both of which quietly change the experiment.
   *
   * Each entry is a PARTIAL set of factor values, and a trial matching all of them is
   * removed: `[{ left: 2, right: 2 }, { left: 3, right: 3 }]`. Listed cell by cell rather
   * than as a condition, for the same reason `mapping` is a table and not a formula —
   * nothing here is evaluated.
   *
   * Only crossed factors can be named. Counterbalanced and derived values are assigned
   * after the cross, so excluding on them would silently do nothing.
   */
  exclude?: Record<string, string | number | boolean>[];

  /** How many times the full cross of factors is repeated. */
  repetitions: number;

  practice?: {
    /** Trials drawn from the same design, with feedback after each. */
    count: number;
    feedback: boolean;
  };

  trial: {
    phases: Phase[];
    /** One response, or several bound to named phases. */
    response: ResponseSpec | ResponseStep[];
    correct: CorrectRule;
    /** Inter-trial interval. */
    itiMs?: number;
  };

  /**
   * Factor values and derived fields written to the results payload.
   *
   * The fixed spine — session_id, participant_name, trial_index, is_practice,
   * reaction_time_ms, is_correct, response — is always stored and is not listed here.
   * Everything named here goes into one JSONB column, which is why no per-experiment
   * table or migration is ever needed.
   */
  store: string[];

  /**
   * What "correct" means when the task has no right answer.
   *
   * Bouba-kiki scores against `roundedSide`, so is_correct records "chose the rounded
   * shape". The data is exactly right; the word is not. This label is what the dashboard
   * shows instead of "Accuracy".
   */
  correctMeans?: string;

  dashboard: { charts: ChartSpec[] };

  /** Drives the Mock Data toggle on the teacher dashboard. */
  mock?: MockSpec;

  /**
   * Where the definition knowingly departs from the paper.
   *
   * Surfaced to the lecturer before generation, alongside the [from paper] / [inferred]
   * markers on the spec. A psychologist can judge whether "fixed difficulty instead of a
   * staircase" still demonstrates the effect; the system cannot.
   */
  simplifications?: { what: string; why: string }[];
}

// ─── Not yet expressible ──────────────────────────────────────────────────────
//
// Deliberately absent, each unlocking specific paradigms (see docs/PARADIGM-COVERAGE.md):
//
//   trial history      the next trial depending on preceding ones
//                      -> task switching, n-back, Iowa gambling, reversal learning
//   adaptive difficulty staircases, spans that grow until failure
//                      -> digit span, Weber/JND, stop-signal
//   withheld response   "correct" meaning do not press
//                      -> go/no-go, stop-signal
//   block structure     blocked designs with block-level instructions and feedback
//                      -> implicit association test
//   audio               generated tones, stereo presentation
//                      -> dichotic listening
//   within-trial sequence  RSVP streams, alternating displays
//                      -> attentional blink, change blindness
//
// All six are additive: a new Display or Phase variant plus a renderer branch. None of
// them require rethinking the factors-crossed-and-shuffled core, which is why it is worth
// getting that core right first and adding these against real demand.
