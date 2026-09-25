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
   * Or build the item set out of SEVERAL pools, each drawn its own way.
   *
   * A recognition test is the case that needs it. DRM's is two studied words at every
   * serial position, plus every critical lure, plus every unrelated foil — three different
   * draws that together make one shuffled list of probes. One pool with one `sample` cannot
   * say that, and splitting them into separate blocks would tell the participant which kind
   * of word they were about to see.
   */
  fromEach?: { pool: string; sample?: number; per?: string }[];
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
  /**
   * Text on screen.
   *
   * `textHe` is for text the participant READS rather than text they are being shown as a
   * stimulus — a question beside a scale, a label on a prompt. Omit it for a stimulus word,
   * which must not be translated. With it absent, `text` is used in both languages.
   */
  | { kind: 'text'; text: string; textHe?: string; size?: number; color?: string; font?: 'sans' | 'mono' }
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
   * Two pictures cut at the same height and joined into one — the top of one above the
   * bottom of another, with the lower half optionally slid sideways.
   *
   * The composite face effect IS this display. Two unrelated half-faces, aligned, fuse into
   * a face you cannot help seeing as one person, which makes judging the top half alone
   * surprisingly hard; sliding the bottom half sideways breaks the fusion and the difficulty
   * disappears. `pair` cannot express it — the halves must be flush, not side by side — and
   * nothing else in this list joins two images into a single object.
   *
   * `cut` is the fraction from the top where they meet, and `offset` is how far the lower
   * half moves, as a fraction of the width. The container stays the same size whatever the
   * offset, so the composite sits exactly where the whole face sat.
   */
  | {
      kind: 'composite';
      top: Bound<string>;
      bottom: Bound<string>;
      /** Where to cut, as a fraction from the top. 0.55 puts it at the nose. */
      cut?: Bound<number>;
      /** How far to slide the lower half, as a fraction of the width. 0 is aligned. */
      offset?: Bound<number>;
      size?: Bound<number>;
    }
  /**
   * A generated array of items in a box — visual search, ensemble perception.
   * The renderer lays them out with non-overlapping random positions.
   */
  | {
      kind: 'array';
      count: Bound<number>;
      item: Display;
      distractor?: Display;
      distractorCount?: Bound<number>;
      area?: { width: number; height: number };
      /**
       * One item per element of a LIST in the data, instead of `count` copies of one item.
       *
       * For an array whose members differ from each other in a way the trial specifies —
       * ensemble perception, where the whole question is what the average of these particular
       * sizes was, so the sizes cannot be a repeated constant or a runtime coin-flip. Give it
       * a reference to a list on a pool item, `"{display.items}"`, and each element's fields
       * are in scope inside `item` under `as` (default `each`): `size: "{each.value}"`.
       *
       * Positions stay the renderer's own random non-overlapping layout, which is what the
       * hand-built versions of these tasks do too — it is the VALUES that carry the design.
       * Given `from`, `count`, `distractor` and `groups` are ignored.
       */
      from?: string;
      /** Names each element inside `item`. Defaults to `each`. */
      as?: string;
      /**
       * Three or more kinds of item in one array, instead of a target and a distractor.
       *
       * A CONJUNCTION search needs it. Finding the red T among red Ls and blue Ts is hard
       * precisely because neither colour nor shape alone picks the target out — so the
       * display holds three kinds at once, and a target-and-distractor array cannot say it.
       * Given `groups`, `count` and `distractor` are ignored.
       */
      groups?: {
        count: Bound<number>;
        item: Display;
        /**
         * Give each item of this group one of these rotations at random, in degrees.
         *
         * Per ITEM, not per group: the distractors in a search array are turned every which
         * way, and a group that shared one rotation would line them all up into a texture
         * the eye can dismiss at a glance.
         */
        rotate?: number[];
      }[];
    }
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
  | { kind: 'frame'; content?: Display; size?: Bound<number>; color?: Bound<string>; thickness?: Bound<number> }
  /**
   * A different display depending on the trial — the visual half of `trial.response.sets`.
   *
   * Everything else here varies an ATTRIBUTE by factor: a colour, a size, a source. This
   * varies the display itself, which is what an experiment needs when one block interleaves
   * two kinds of trial. Ensemble perception is the case: the same array of circles is
   * followed either by "what was the average size?" — a slider — or by a single circle and
   * "was this one there?". The two questions have to be unpredictable, because a participant
   * who knew which was coming could encode for it and the whole comparison collapses; so
   * they cannot be split into two blocks, and the display has to branch per trial.
   *
   * `by` is a factor path and its value picks the case. A value with no case falls back to
   * the first, which the validator reports rather than allowing silently.
   */
  | { kind: 'switch'; by: string; cases: Record<string, Display> };

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
   * Render this phase with a named built-in component instead of the display above.
   *
   * THE ESCAPE HATCH, and it is meant to stay small. Allowed only where the runtime's three
   * assumptions genuinely break: the participant authors the stimulus so there are no trials
   * to plan (Wason's 2-4-6), the display cannot be declared (frame-accurate flash
   * suppression), or the input is not an HTML control (freehand drawing). Never because a
   * design is merely hard — ensemble perception looked like a candidate, and building it
   * declaratively is what gave every experiment interleaving, estimation and sliders.
   *
   * The name must be one of `PHASE_COMPONENTS` in component-names.ts. A DEFINITION CANNOT
   * INTRODUCE ONE: the pipeline writes JSON, and a component is code that ships with the
   * site. So a generated experiment cannot use this, and an experiment that needs it is one
   * to say no to rather than to approximate — a lookalike that drops the timing or the
   * drawing is not the experiment.
   *
   * What it costs, which falls on the lecturer rather than on you: a phase that is code
   * cannot be edited from /create and cannot be regenerated. Everything else about the
   * experiment stays ordinary — same results table, same dashboard, same publish flow.
   *
   * `display` is still required and is what a preview or a still frame shows.
   *
   * A component phase still sets `awaitsResponse` and the trial still declares a `response`
   * — `{ "kind": "text" }` for the rule task. The controls are not drawn, because the
   * component draws its own, but the declared shape is what scoring and the results table
   * are built from, so the answer lands in the same column as every other experiment's.
   */
  component?: string;
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
      kind: 'choice' | 'multiSelect';
      options: {
        value: string;
        label: string;
        labelHe?: string;
        key?: string;
        display?: Display;
        /**
         * Where on screen this option sits, under `layout: 'positioned'`.
         *
         * For a task where the button's PLACE is the answer rather than its label. Serial
         * reaction time is the case: four boxes in a diamond, a dot appears in one, and you
         * press that one. A row of buttons reading up/left/right/down would be a different
         * experiment — it would measure reading a direction word, not reacting to a place.
         */
        at?: 'left' | 'right' | 'top' | 'bottom' | 'center';
      }[];
      /**
       * Take the options from a LIST in the trial's data instead of the fixed list above.
       *
       * For a questionnaire, or anything whose alternatives belong to the item rather than
       * to the task: twenty reasoning questions each with their own answers cannot share one
       * set of buttons, and writing twenty blocks to give each its own would fix the order
       * for every participant.
       *
       * Point it at a list of `{ value, label, labelHe }` objects — `"{q.options}"`. When it
       * resolves to a list, `options` above is ignored and may be left empty.
       *
       * `multiSelect` is the same control with more than one answer allowed; it records the
       * chosen values joined by commas, in the order the options were offered, so two people
       * choosing the same cards produce the same string.
       */
      optionsFrom?: string;
      layout?: 'row' | 'column' | 'sides' | 'positioned';
    }
  | {
      kind: 'rating';
      min: number;
      max: number;
      /**
       * Bound, because on a questionnaire the ends of the scale belong to the question.
       *
       * The `He` siblings work like `textHe` on a text display: used on a Hebrew run, and
       * optional, so a scale labelled with numbers or symbols needs only one form.
       */
      minLabel?: Bound<string>;
      maxLabel?: Bound<string>;
      minLabelHe?: Bound<string>;
      maxLabelHe?: Bound<string>;
    }
  /**
   * A continuous scale, dragged rather than picked — for answers that are a MAGNITUDE.
   *
   * `rating` draws one button per point, which is right for a seven-point agreement scale
   * and useless for "how big were those circles on average?", where the answer is a size in
   * pixels somewhere in a range of sixty.
   *
   * `preview` is the point of it: a display rendered from the current position, so the
   * participant matches a stimulus rather than guessing a number. `{value}` inside it is
   * the position they are on. Without it this asks people to translate a remembered size
   * into arithmetic, which measures something else entirely.
   *
   * The starting position is the middle of the range unless `startAt` says otherwise, and
   * it is worth thinking about: a slider that starts at the true value is not a measurement,
   * and one that always starts low makes every estimate an underestimate.
   */
  | {
      kind: 'slider';
      /**
       * Bound, because the scale belongs to the stimulus: a circle's radius runs 15–75 and a
       * line's length 40–200, and one scale stretched over both would make the same drag
       * mean different things on different trials.
       */
      min: Bound<number>;
      max: Bound<number>;
      step?: Bound<number>;
      startAt?: Bound<number>;
      minLabel?: string;
      maxLabel?: string;
      submitLabel?: { en: string; he: string };
      preview?: Display;
    }
  /** `unit` is bound, because on a questionnaire it belongs to the question: millions, %, days. */
  | { kind: 'number'; min?: number; max?: number; unit?: Bound<string>; unitHe?: Bound<string> }
  | { kind: 'text'; multiline?: boolean; placeholder?: string }
  /** Free recall of a list — DRM, serial position. */
  | { kind: 'wordList'; maxWords?: number }
  /**
   * A drawing, captured as an image.
   *
   * For figural tasks — finish this circle into a picture, complete this shape. The answer is
   * the drawing, so it is stored as a data URI on the row and nothing about it is scored
   * automatically: divergent-thinking drawings are rated by people afterwards, and a runtime
   * that invented a score for one would be inventing the result.
   *
   * `guide` draws a faint shape into the canvas for the participant to draw ON, which is the
   * whole prompt in a circles task — an empty square would be a different test.
   */
  | { kind: 'drawing'; width?: number; height?: number; guide?: 'circle' | 'none' }
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
   *
   * ZERO means no screen at all, not one that vanishes instantly — DRM's arithmetic runs
   * straight into its recall, and a screen flashing between them would be a pause the
   * original does not have.
   */
  autoAdvanceMs?: number;

  pools?: Record<string, PoolItem[]>;
  factors: Factor[];
  exclude?: Record<string, string | number | boolean>[];
  repetitions: number;
  order?: TrialOrder;
  endsAfterMs?: number;
  /**
   * A practice run for THIS block, before its real trials.
   *
   * The definition's own `practice` covers the first block only. A block that starts a
   * genuinely different task needs its own: mental rotation practises before its forty
   * trials even though it is the second half of a session that began with mental scanning,
   * and a participant who has only ever practised part one arrives at part two cold.
   *
   * The run shows the block's intro, then the practice, then "Practice complete" with the
   * real trial count, exactly as it does for the first block.
   */
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
  /**
   * The pool holding what was STUDIED — one row comes back per entry, recalled or missed.
   *
   * Leave it out for a free list with no right answers: "name as many uses for a brick as
   * you can". One row then comes back per thing the participant said, carrying the text
   * itself and the position it came in. That is the shape the data wants either way — how
   * MANY someone produced is the measure of a divergent-thinking task, and a single row
   * holding a comma-blob can be counted only by splitting it again in a spreadsheet.
   */
  against?: string;
  /** Which field of a pool item holds the word to compare against what was typed. */
  match?: string;
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
  /**
   * `expect` may name SEVERAL acceptable responses for a factor value.
   *
   * A recognition test is why: its four buttons carry a decision and a confidence at once —
   * "sure yes", "think yes", "think no", "sure no" — so a studied word is answered correctly
   * by either of two of them. Splitting the judgement into two presses to keep one expected
   * answer per value would change what the participant is asked to do.
   */
  | { kind: 'mapping'; factor: string; expect: Record<string, string | string[]> }
  /**
   * A numeric estimate counted correct when it lands within `tolerance` of the true value.
   *
   * For tasks answered on a scale rather than with a button: estimate the average size of
   * those circles, reproduce that interval, bisect that line. The answer is never exactly
   * right, so "correct" has to mean "close enough", and the threshold belongs in the
   * definition where a lecturer can see it rather than in an analysis script.
   *
   * Choose it so that chance is a known quantity and say so. Ensemble perception uses a
   * quarter of the stimulus range, which puts guessing at 50% and makes the bar directly
   * comparable with the recognition accuracy beside it.
   */
  | { kind: 'within'; factor: string; tolerance: Bound<number> }
  /**
   * A TYPED answer matched against a factor, ignoring case and surrounding space.
   *
   * `matchesFactor` compares strings exactly, which is right for a button's value and wrong
   * for something a person typed: "Cheese" and "cheese " are the same answer, and marking
   * one of them wrong makes a class look worse at the task than it is.
   *
   * `plural: true` also accepts a trailing s or es either way, for tasks where the answer is
   * a noun and the number was never the point.
   */
  | {
      kind: 'textMatch';
      factor: string;
      plural?: boolean;
      /**
       * Also accept an answer within this many single-character edits of the target.
       *
       * For recall typed from memory a week later, where "castel" for "castle" is a
       * remembered word and a spelling slip rather than a failure to remember. Two is what
       * the hand-built testing effect allows. Keep it small — at three, short words start
       * matching each other.
       */
      editDistance?: number;
    }
  /** Preference tasks with no correct answer — ratings, free choice. */
  | { kind: 'none' };

/**
 * A correctness rule that depends on the trial, for a block that interleaves two tasks.
 *
 * The third of the three things that have to branch together — display, response, and how
 * the answer is judged. A slider estimate is right when it is close; a yes/no is right when
 * it matches what was shown; one rule cannot express both, and a block running both kinds
 * of trial needs both.
 *
 * `by` names the same factor `trial.response.sets` keys on, so the three stay in step.
 */
export interface CorrectSets {
  by: string;
  sets: Record<string, CorrectRule>;
}

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
    /**
     * The level this effect applies to. Compared as text, so a numeric level — a block
     * number, a set size — may be written as the number it is rather than quoted.
     */
    level: string | number | boolean;
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
  ofResponse?: string | string[];
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
  kind: 'bar' | 'line' | 'scatter' | 'histogram' | 'xy' | 'pie';
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
  ofResponse?: string | string[];
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
  /**
   * `correlation` is the one measure that is not a group average: the mean WITHIN-participant
   * correlation between reaction time and the number named in `against`.
   *
   * Use it for the many findings stated as "RT rises with X" — rotation angle, distance
   * scanned, set size, memory load. Those papers report an r, and a bar chart of means
   * cannot say what an r says.
   */
  measure: ChartSpec['measure'] | 'correlation';
  /**
   * Required by `measure: 'correlation'`: the stored numeric field to correlate RT against.
   *
   * It has to be in `store` and it has to be a NUMBER — an angle in degrees, a distance, a
   * set size. A factor whose levels are words has no correlation with anything, and the
   * validator says so rather than reporting zero.
   */
  against?: string;
  ofResponse?: string | string[];
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

  /**
   * Bilingual instructions shown on the landing page. Hebrew is the default language.
   *
   * `{group.field}` interpolates the between-subject item this participant was assigned, so
   * an experiment that gives half the class one condition can actually tell them which one
   * they got. Without it the instructions can only describe the design in general, and a
   * visual search that never says which colour to hunt is not a search.
   */
  instructions: { en: string; he: string };

  /**
   * Something to SHOW on the landing page, above the instructions.
   *
   * Words are a poor way to name a stimulus. Visual search hunts a red or a blue T, and the
   * hand-built page prints that very letter in that very colour rather than the word "red"
   * — which is both quicker to take in and immune to a participant's idea of red. Bound
   * like any display, so it can show the condition this person was assigned.
   */
  instructionsDisplay?: Display;

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

  /**
   * A named gate between the landing page and the first trial.
   *
   * The same escape hatch as `Phase.component`, for a run that cannot begin until something
   * about the DEVICE is settled: bRMS measures the physical width of the screen so its
   * stimulus subtends the right visual angle, then locks the display to landscape. That is
   * not a trial and not something a definition can describe.
   *
   * One of `ONBOARDING_COMPONENTS` in component-names.ts, and subject to the same rule —
   * a generated experiment cannot use it, because it is code.
   */
  onboarding?: string;

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

  /**
   * One item drawn per PARTICIPANT, in scope for every block of their run.
   *
   * Between-subject designs need something decided once and then held to: SRT teaches half
   * the class one twelve-item sequence and half another, so that the reaction-time jump when
   * the sequence changes cannot be a property of that particular sequence. A factor cannot
   * say this — factors vary within a run, and a counterbalanced one alternates across the
   * trial list rather than fixing a condition for the person.
   *
   * The drawn item is named by `as` and reaches everything the way a stage group's item
   * does: a display shows `{group.label}`, a block draws its trials from `{group.blockOne}`,
   * and `store` keeps `group.label` on every row so a chart can split the class by it —
   * which is the whole reason to counterbalance rather than just pick one.
   *
   * Drawn once when the run starts, so it is the same in the last block as in the first.
   */
  assign?: {
    pool: string;
    as: string;
    /**
     * Give a returning participant the SAME assignment they had last time.
     *
     * For an experiment run over two visits. The testing effect studies word pairs one week
     * and tests them the next, and which set got which treatment has to match, or the
     * comparison is between two different people's conditions.
     *
     * Names the stored field that identifies the assignment — `"group.label"` — which must
     * also be in `store`, or there is nothing to recover it from. Looked up by participant
     * name against this experiment's earlier rows.
     *
     * A session that `requires` an earlier one REFUSES when there is no match rather than
     * drawing fresh: testing someone on pairs they never studied produces a row that looks
     * perfectly valid and is not.
     */
    remember?: string;
  };

  /**
   * An experiment taken in more than one sitting, days apart.
   *
   * Each session runs some of the blocks, and the landing page offers the choice — which is
   * what the hand-built version does with two buttons. A session naming `requires` cannot
   * start until the participant has been found in the earlier one, and what they were
   * assigned then is what they get now.
   *
   * The sessions share a slug, a results table and a dashboard, because they are one
   * experiment: the whole finding is the comparison between what happened in the first
   * sitting and what is remembered in the second.
   */
  sessions?: {
    id: string;
    title: { en: string; he: string };
    description: { en: string; he: string };
    /** Block names this session runs, in order. The first block is named by `stageName`. */
    blocks: string[];
    /** The session that must already have been completed. */
    requires?: string;
  }[];

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
    /** One rule, or — for a block interleaving two tasks — one per kind of trial. */
    correct: CorrectRule | CorrectSets;
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
     * Values that depend on WHAT THE PARTICIPANT JUST DID, resolved as each answer arrives.
     *
     * Everything else in a trial is settled before it starts. A two-stage choice task is not:
     * you pick one of two symbols, that takes you — usually, not always — to one of two
     * worlds, and which world decides what you are offered next. The second half of the trial
     * cannot be planned, because it depends on the first half.
     *
     * `by` names what to look at: `"answer.stage1"` is the response given in the phase called
     * stage1, and an earlier outcome is fair game too, so they can be chained. `cases` maps
     * each possible value to what this outcome becomes, and the values are bound, so they
     * usually read a pre-drawn field off the trial's own item.
     *
     * PRE-DRAWN is the point. A 70% transition and a probabilistic reward are randomness, and
     * the schema has no arithmetic on purpose — so the trial carries the outcome for every
     * branch the participant could have taken, drawn when the trial was built, and this picks
     * the one that happened. Nothing is computed at run time, the whole trial is
     * reconstructable from its stored row, and a table is checkable in a way a formula buried
     * in a renderer is not.
     *
     * Resolved outcomes are ordinary values: later phases can display them, later outcomes
     * can read them, `store` can keep them, and a correctness rule can name them.
     */
    outcomes?: {
      name: string;
      by: string;
      cases: Record<string, Bound<string | number | boolean>>;
    }[];
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
