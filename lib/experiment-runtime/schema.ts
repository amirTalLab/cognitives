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
 *
 * An item may hold a list of items itself, so a pool entry can be a whole themed LIST —
 * DRM's "SLEEP" with its ten words and its critical lure. A stage group then draws one such
 * list per repetition and its blocks draw their trials from inside it.
 */
export type PoolItem = Record<string, string | number | boolean | PoolItem[]>;

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
   * With `sample`: take that many for EACH distinct value of this field, instead of that
   * many overall.
   *
   * DRM's recognition test is the case. It probes two studied words at every serial
   * position, each drawn from a different list, so that the serial-position curve is not
   * estimated from one or two lists that happened to win a lottery. `sample: 2` alone would
   * take two words in total; `sample: 2, per: "serialPosition"` takes two at each position,
   * which is the design.
   */
  per?: string;
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
  /**
   * A shape given as an SVG path.
   *
   * `shape` covers the primitives a design usually wants; this is for a stimulus that IS a
   * particular outline — bouba-kiki, where the shapes are the experiment and an
   * approximation would be a different study. Only the path data is taken, never markup,
   * so a definition still cannot inject anything into the page.
   */
  | { kind: 'svgPath'; d: Bound<string>; viewBox?: string; size?: Bound<number>; color?: Bound<string> }
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
  | { kind: 'stack'; items: Display[] }
  /** Displays side by side, left to right — a cue flanked by two placeholder boxes. */
  | { kind: 'row'; items: Display[]; gap?: number }
  /**
   * An outlined box, optionally holding something.
   *
   * Posner cueing is the case: two boxes stay on screen the whole trial, the target appears
   * inside one, and an exogenous cue is one box's border changing colour. `color` is the
   * border, so it can be bound to a factor like any other colour.
   */
  | { kind: 'frame'; content?: Display; size?: Bound<number>; color?: Bound<string>; thickness?: Bound<number> };

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
  /**
   * On a response phase: stop waiting after this many milliseconds.
   *
   * The trial is then recorded with the response "none" and no reaction time. That one rule
   * covers two things: a deadline (a miss, "respond faster"), and a WITHHELD response, where
   * "none" is the right answer — catch trials in Posner cueing, no-go trials in go/no-go.
   * Score that with a `mapping` rule: `{ "catch": "none", "valid": "press" }`. A choice with
   * a timeout may offer a single option, the one "go" button.
   */
  timeoutMs?: Bound<number>;
  /**
   * On a timed phase: add a random 0–jitterMs to `durationMs`, drawn afresh on every trial
   * (whole milliseconds, both ends included). A fixation of 800–1200ms is
   * `durationMs: 800, jitterMs: 400`, so the participant cannot time what comes next.
   */
  jitterMs?: Bound<number>;
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
  | { kind: 'wordList'; maxWords?: number }
  /**
   * Nothing is asked: the trial presents its phases and ends by itself.
   *
   * A study list is the case — DRM and serial order show each word for two seconds and
   * collect nothing, because the memory is measured later, in the recall block. The row is
   * still written, with the response "shown" and no reaction time, so the dashboard can say
   * what was presented and in what position.
   *
   * Declared rather than inferred from a missing `response`: every dropped field would
   * otherwise become a block that silently collects no data, which is precisely the failure
   * that is hardest to notice afterwards.
   */
  | { kind: 'none' };

/**
 * One trial can collect more than one response.
 *
 * Found by probing signal detection, where every trial takes a decision AND a confidence
 * rating. Binding each response to a named phase covers that without a separate concept:
 * a single-response trial is just the one-element case.
 */
export type ResponseStep = ResponseSpec & { phase: string };

/**
 * Whether the built trial list is shuffled, or kept in the order the design produces.
 *
 * Shuffling is right for every design whose trials are interchangeable — which is all four
 * of the ported experiments, and why it was unconditional until now. It is wrong whenever
 * the ORDER IS THE MANIPULATION: SRT repeats a fixed 12-item sequence and measures the
 * learning of it, and a study list is presented in its order so that serial position means
 * something. Shuffling those does not add noise, it deletes the experiment.
 *
 * `fixed` keeps the cross in the order the factors and pools are written, repeated
 * `repetitions` times. Note that a factor using `sample` still DRAWS at random, per
 * participant — fixed order governs the sequence of the finished list, not which items are
 * in it.
 */
export type TrialOrder = 'shuffled' | 'fixed';

/**
 * A block measured in TIME rather than in trials — it ends after this long, whatever trial
 * the participant is on.
 *
 * Every block until now ran a counted list, because in a reaction-time design the trial
 * count is the design. A filled-delay task is the opposite: DRM and serial order put
 * arithmetic between studying a list and recalling it, and what matters is that the delay
 * lasted thirty seconds — how many sums anyone got through in that time is a property of
 * the participant, not of the experiment. Counting the trials instead would give a fast
 * participant a longer delay than a slow one, which is the one thing the delay must not do.
 *
 * Named so it cannot be read as a phase's `durationMs`: this ends the whole block.
 *
 * The design still needs a trial list, and should offer comfortably more trials than anyone
 * could finish — the block ends on whichever comes first, so a list that runs out cuts the
 * delay short. The validator warns when it looks too short to outlast the clock.
 */

/**
 * A later block of an experiment: its own trials, phases, responses and stored fields.
 *
 * Several of the hand-built experiments are not one block but a sequence of them — DRM
 * studies a list and then asks for free recall, serial order puts a distractor task
 * between the two, SRT follows its main task with a generation test. Each block asks a
 * different question and stores different fields, so a block is a whole design rather than
 * a phase.
 *
 * The definition's own design is the FIRST block; `stages` are the ones after it. That
 * keeps a single-block experiment exactly as it was.
 */
export interface Stage {
  /** Stored on every row of this block, so a chart can say which block it is about. */
  name: string;
  /** Shown on a short screen before the block starts. Skipped when absent. */
  title?: { en: string; he: string };
  instructions?: { en: string; he: string };
  /**
   * Move on by itself after this long, instead of waiting for a Continue button.
   *
   * A block that begins a new phase of the task wants the button — the participant reads
   * what is about to change and starts when ready. A block that is simply the next item in
   * a rhythm does not: DRM shows "List 3 — get ready" for two seconds and a three-second
   * break between lists, and turning those into ten button presses would change the pace of
   * the session and give the participant five untimed rests the design never gave them.
   */
  autoAdvanceMs?: number;

  pools?: Record<string, PoolItem[]>;
  factors: Factor[];
  exclude?: Record<string, string | number | boolean>[];
  repetitions: number;
  order?: TrialOrder;
  endsAfterMs?: number;
  practice?: ExperimentDefinition['practice'];
  trial: ExperimentDefinition['trial'];
  store: string[];
}

/**
 * A run of blocks repeated once per item drawn from a pool.
 *
 * DRM is why: it studies a themed list, fills a delay with arithmetic, asks for recall, and
 * then does the whole thing again with the next list — five times. Writing those fifteen
 * blocks out one by one would work, but it would fix the order of the lists for everybody,
 * and DRM shuffles them per participant precisely so that list identity is not confounded
 * with how far into the session it appeared. A flat list of blocks cannot say that.
 *
 * The drawn item is named by `as` and is in scope for every block in the group: a display
 * can show `{list.theme}`, a factor can draw its trials from `{list.words}`, and `store` can
 * keep `list.theme` on every row so a chart can tell the lists apart.
 */
export interface StageGroup {
  /** The pool to repeat over — one pass through the blocks per item. */
  forEach: string;
  /** Names the drawn item inside the blocks, e.g. "list" for `{list.theme}`. */
  as: string;
  /** A fresh order per participant. True when absent, which is the reason this exists. */
  shuffle?: boolean;
  /** Use only this many of the pool's items. All of them when absent. */
  take?: number;
  /** The blocks to run, in order, once per drawn item. */
  stages: Stage[];
}

/**
 * Everything needed to build and run one block of trials.
 *
 * Both a definition and a stage satisfy this, which is what lets the trial builder, the
 * scorer and the runner work on either without knowing which they have.
 */
export type TrialDesign =
  Pick<Stage, 'pools' | 'factors' | 'exclude' | 'repetitions' | 'order' | 'endsAfterMs' | 'practice' | 'trial' | 'store'>;

/**
 * A response whose options depend on the trial.
 *
 * `by` is a factor path — "item.responseSet" — and its value names which entry of `sets`
 * that trial uses. Every value the factor can take needs an entry; a trial naming one that
 * does not exist falls back to the first, which the validator reports rather than allowing
 * silently.
 */
export interface ResponseSets {
  by: string;
  sets: Record<string, ResponseSpec | ResponseStep[]>;
}

/**
 * Turns one typed recall list into a row per studied item.
 *
 * Free recall collects one answer but the data is per WORD: whether the item at serial
 * position seven came back, whether the critical lure did. Stored as a single row holding
 * "bed,rest,sleep" none of that is reachable — a chart would have to re-derive it, the
 * study list would have to be repeated in the dashboard spec, and the CSV export would be a
 * comma-blob rather than something analysable.
 *
 * So the block writes one row per item of `against`, each answered "recalled" or "missed",
 * carrying that item's own fields. A serial-position curve is then an ordinary proportion
 * chart grouped by the position field, and DRM's lure is simply another item in the pool
 * with its own type — no new aggregation anywhere.
 *
 * Matching ignores surrounding space and case, and the typed list may be separated by
 * commas, semicolons or spaces, since participants use all three.
 */
export interface RecallScoring {
  /** The pool holding what was studied — one row comes back per entry. */
  against: string;
  /** Which field of a pool item holds the word to compare against what was typed. */
  match: string;
  /**
   * Also write a row for each typed word matching nothing, marked `intrusion`.
   *
   * Worth having wherever intrusions are part of the finding — DRM lives on them — and
   * worth leaving off where they are only noise, since they are participant-supplied text
   * going into the results table.
   */
  intrusions?: boolean;
}

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
    /**
     * RT change per trial into the session, for effects that change as it goes on — an
     * exogenous cue the participant learns to ignore. -0.4 is 40ms faster by trial 100.
     */
    rtPerTrialMs?: number;
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
/**
 * One axis of an `xy` chart: the same measure vocabulary a chart uses, narrowed to the
 * trials that axis is about.
 *
 * `filter` and `correctOnly` here are ON TOP of the chart's own, so a chart can say "correct
 * trials only" once and each axis then name its own condition.
 */
export interface AxisSpec {
  measure: 'accuracy' | 'meanRt' | 'proportion' | 'count';
  /** Required by `measure: 'proportion'` — which response value to count. */
  ofResponse?: string;
  /** Only rows whose stored fields match, as on a chart. */
  filter?: Record<string, string | number | boolean | (string | number | boolean)[]>;
  /** Only correctly answered trials, for this axis. */
  correctOnly?: boolean;
  /** Axis label. */
  label?: string;
}

export interface ChartSpec {
  title: string;
  /**
   * `xy` is a scatter positioned by TWO measures — one participant per point, placed by
   * (say) their congruent RT against their incongruent RT, or their speed against their
   * accuracy. Every other kind plots one value per group.
   */
  kind: 'bar' | 'line' | 'scatter' | 'histogram' | 'xy';
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
  /**
   * Only rows whose stored fields match — one value, or any of a list:
   * `{ "trialType.validity": ["valid", "invalid"] }`. Leaves out the trials a chart is not
   * about, such as catch trials in a reaction-time chart.
   */
  filter?: Record<string, string | number | boolean | (string | number | boolean)[]>;
  /** Only correctly answered trials — the usual rule for reaction times. */
  correctOnly?: boolean;
  /**
   * One level minus another, computed within each participant before averaging: a validity
   * effect is `{ "factor": "validity", "level": "invalid", "minus": "valid" }`. Grouped by
   * "participant" it shows everyone's effect; grouped by a factor, the mean effect per level.
   */
  difference?: { factor: string; level: string | number | boolean; minus: string | number | boolean };
  /**
   * Groups a numeric field into bins of this size, numbered from 1. `groupBy: "trial_index"`
   * with `bin: 33` splits a 132-trial session into quarters.
   */
  bin?: number;
  /**
   * Average every trial once across the whole class, instead of each participant first.
   * One value per group, so no error bar. For a chart that was always computed that way.
   */
  pooled?: boolean;
  /** Order and name the groups: `[{ "value": "exo_invalid", "label": "Exogenous" }]`. Unlisted groups follow. */
  groups?: { value: string | number | boolean; label?: string }[];
  /** A line under the title saying how to read the chart. */
  description?: string;
  /** Label for the x axis. */
  xLabel?: string;
  /**
   * Required by `kind: 'xy'`: what each axis measures.
   *
   * A point is emitted only where BOTH axes have something to measure. A participant with
   * no trials on one side is left out rather than plotted at zero — a zero here reads as a
   * real, impossibly fast score rather than as missing data.
   */
  axes?: { x: AxisSpec; y: AxisSpec };
  /**
   * What the original study reported, drawn beside the class's own data.
   *
   * A class of thirty is noisy, and the question a lecturer actually wants on screen is
   * "did we get what they got?". `values` is one number per group, in the same units as
   * `measure` — milliseconds for meanRt, percent for accuracy and proportion — keyed by the
   * group's value (or its label from `groups`).
   *
   * Only ever numbers a paper REPORTS. An experiment described from memory, or a paper that
   * gives no figures, simply has none: the chart then shows the class's data alone, which
   * is honest, where an invented comparison would not be.
   */
  original?: {
    /** Where the numbers come from, shown under the chart — e.g. "Stroop (1935), Exp. 2". */
    source: string;
    /** Legend name for the series. Defaults to "Original study". */
    label?: string;
    values: Record<string, number>;
  };
}

/**
 * A single number on the teacher dashboard — "Avg Validity Effect: +42ms".
 *
 * Computed by the same aggregation as a chart, over the whole class, so a card and a chart
 * of the same measure always agree.
 */
export interface StatSpec {
  label: string;
  measure: ChartSpec['measure'];
  ofResponse?: string;
  filter?: ChartSpec['filter'];
  correctOnly?: boolean;
  difference?: ChartSpec['difference'];
  /** Appended to the number: "ms", "%". */
  unit?: string;
  /** Show a "+" on positive values, for effects. */
  signed?: boolean;
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

  /**
   * Which published version this is — 1 for the first publish, then up by one each time.
   *
   * Set by the store when a definition is loaded from the database, never written by hand
   * and never part of a definition file. Every trial is saved with the revision it ran
   * under, so a dashboard can tell results collected before a change from results after it.
   * Absent on a built-in or a preview, which have no published history.
   */
  revision?: number;

  /** Let a participant start without typing a name. A name is required by default. */
  nameOptional?: boolean;

  /** The closing screen. By default a thank-you with the participant's accuracy and mean RT. */
  thanks?: {
    title?: { en: string; he: string };
    /** False for the thank-you alone, with no score. */
    showResults?: boolean;
  };

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

  /** Whether to shuffle the finished list. Shuffled when absent. */
  order?: TrialOrder;

  /** Ends the block after this long, whatever trial it is on. Runs the full list when absent. */
  endsAfterMs?: number;

  practice?: {
    /** Trials drawn from the same design, with feedback after each. */
    count: number;
    feedback: boolean;
    /**
     * Whether practice trials are saved (flagged `is_practice`). Defaults to true: a dropout
     * pattern during practice is worth seeing. False matches experiments that never stored
     * practice at all.
     */
    record?: boolean;
    /**
     * A fixed practice set instead of a random draw from the design: `factor` (a pool-drawn
     * factor) takes every item of `pool` instead of its usual pool, and `count` of the
     * resulting trials are used. For a hand-picked practice block — six easy trials, one
     * invalid, one catch — the way the original experiment was designed.
     */
    from?: { factor: string; pool: string };
    /**
     * Whether a wrong practice answer keeps the same trial on screen until it is answered
     * correctly, rather than moving on.
     *
     * For experiments that use practice to TEACH the response mapping — which colour is
     * which key — rather than to sample the design. The hand-built Stroop works this way:
     * an error highlights the correct button and the trial waits. The clock restarts on
     * each attempt, so the recorded time is of the successful attempt.
     *
     * Practice only. A main block that refused to advance would deadlock a participant who
     * cannot find the right answer, and would bias the data toward people who can.
     */
    retryUntilCorrect?: boolean;
  };

  trial: {
    phases: Phase[];
    /**
     * One response, several bound to named phases, or a set chosen per trial.
     *
     * The last form is for an experiment whose block mixes two kinds of question. Bouba-kiki
     * is the case: most trials show a word and two SHAPES to choose between, while its
     * control trials show one shape and two WORDS. The options differ in kind, not just in
     * value, so binding them to a factor is not enough — the whole set has to swap.
     */
    response: ResponseSpec | ResponseStep[] | ResponseSets;
    correct: CorrectRule;
    /**
     * Expands a typed recall list into a row per studied item. For a `wordList` response.
     */
    recall?: RecallScoring;
    /** Inter-trial interval. */
    itiMs?: number;
    /**
     * Name of a timed phase from which the response controls are already on screen.
     *
     * Answering before the response phase begins ends the trial as too early: recorded with
     * the response "early", scored incorrect, with no reaction time. Posner cueing needs
     * this — a press during the cue is an anticipation, not a detection — and without it
     * the button would only appear with the target, which moves the layout and gives the
     * target away.
     */
    earlyFrom?: string;
    /**
     * Whether a too-early press is saved as a trial. Defaults to true. False shows the early
     * message and moves on to the next trial keeping nothing — how the hand-built
     * experiments treat an anticipation.
     */
    recordEarly?: boolean;
    /**
     * What stays on screen during the inter-trial interval. Blank when absent. Placeholder
     * boxes that are part of the paradigm — Posner's — belong here, or they vanish between
     * trials.
     */
    itiDisplay?: Display;
    /**
     * Brief messages per outcome, shown for `durationMs` and then moving on by themselves.
     *
     * When present this replaces the practice-only "Correct / Incorrect · Next" screen. It
     * shows in practice when `practice.feedback` is true, and in the main block only with
     * `inMain`. An outcome with no message shows nothing — Posner says "Missed" and "Too
     * early" but stays silent on a hit.
     */
    feedback?: {
      durationMs: number;
      inMain?: boolean;
      correct?: { en: string; he: string };
      incorrect?: { en: string; he: string };
      /** A response phase that ran out. Falls back to `incorrect`. */
      timeout?: { en: string; he: string };
      /** A press before the response phase. Falls back to `incorrect`. */
      early?: { en: string; he: string };
      /** What is on screen while a message is up. The current phase's display when absent. */
      display?: Display;
    };
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
   * Names the first block. Defaults to "main", and only matters once there is more than
   * one — DRM's first block is "study", not "main".
   */
  stageName?: string;

  /**
   * Blocks that run AFTER the design above, in order.
   *
   * The design above is the first block and these follow it, so an experiment without them
   * runs exactly as it always did — which is why the design fields stay required.
   *
   * An entry may be a StageGroup instead of a block, which repeats its own blocks once per
   * item drawn from a pool.
   */
  stages?: (Stage | StageGroup)[];

  /**
   * What "correct" means when the task has no right answer.
   *
   * Bouba-kiki scores against `roundedSide`, so is_correct records "chose the rounded
   * shape". The data is exactly right; the word is not. This label is what the dashboard
   * shows instead of "Accuracy".
   */
  correctMeans?: string;

  dashboard: { charts: ChartSpec[]; stats?: StatSpec[] };

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
//   block structure     blocked designs with block-level instructions and feedback
//                      -> implicit association test
//   audio               generated tones, stereo presentation
//                      -> dichotic listening
//   within-trial sequence  RSVP streams, alternating displays
//                      -> attentional blink, change blindness
//
// Withheld responses were on this list until `timeoutMs`, `trial.earlyFrom` and
// `trial.feedback` were added to port Posner cueing — which is what "additive" meant:
//
// All of these are additive: a new Display or Phase variant plus a renderer branch. None of
// them require rethinking the factors-crossed-and-shuffled core, which is why it is worth
// getting that core right first and adding these against real demand.
