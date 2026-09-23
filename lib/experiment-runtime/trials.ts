// Turning a definition into a trial list, and resolving trial-bound values.
//
// This is the half of the runtime that has no UI, so it is the half worth testing. The
// build order matches what every hand-written experiment in this repo does: cross the
// factors, draw pool items, repeat, counterbalance, shuffle.

// Type-only import: see the note in validate.ts — scripts/definition.mjs loads this
// module directly under Node's type stripping.
import type {
  Bound, ExperimentDefinition, Factor, PoolItem, Stage, StageGroup, TrialDesign,
} from './schema';

/** One trial: the factor values chosen for it, plus its place in the run. */
export interface Trial {
  index: number;
  isPractice: boolean;
  /** Factor name -> chosen level. Pool factors hold the whole item object. */
  values: Record<string, unknown>;
  /** Seeds anything drawn during render, so a layout is stable within a trial. */
  seed: number;
}

// ─── Resolving bound values ───────────────────────────────────────────────────

const WHOLE = /^\{([^}]+)\}$/;
const EMBEDDED = /\{([^}]+)\}/g;

/** Reads `item.target` style paths out of a trial's values. */
function lookup(path: string, values: Record<string, unknown>): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc === null || acc === undefined) return undefined;
    return (acc as Record<string, unknown>)[key];
  }, values);
}

/**
 * Resolves a literal or a `"{factor}"` reference against the current trial.
 *
 * Two cases on purpose. A whole-string reference returns the RAW value, so `"{soa}"`
 * yields the number 300 rather than the string "300" — phase durations depend on that.
 * An embedded reference interpolates into text, for labels like `"₪{amount} today"`.
 */
export function resolve<T>(value: Bound<T> | undefined, values: Record<string, unknown>): T | undefined {
  if (typeof value !== 'string') return value as T | undefined;

  const whole = value.match(WHOLE);
  if (whole) return lookup(whole[1], values) as T;

  if (!value.includes('{')) return value as unknown as T;
  return value.replace(EMBEDDED, (_m, path) => {
    const found = lookup(path, values);
    return found === undefined ? '' : String(found);
  }) as unknown as T;
}

// ─── Building the trial list ──────────────────────────────────────────────────

/**
 * Deterministic RNG, seeded per trial.
 *
 * Used for anything drawn during render — array layouts especially. Math.random there
 * would be impure (so React may recompute it unpredictably) and, worse, a memo keyed on
 * set size alone would reuse the same layout on two consecutive trials with the same set
 * size. Seeding on the trial index fixes both, and makes what a participant saw
 * reconstructable from the stored row.
 */
export function seededRandom(seed: number) {
  let s = (seed % 2147483646) + 1;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

/**
 * Trials past which a design is not long, but impossible.
 *
 * A classroom task is 40-120 trials, and 400 already earns a warning from the validator.
 * This is the point where the list stops being something to sit through and becomes
 * something that cannot be allocated — generous enough that no real design reaches it by
 * accident. Lives here rather than in validate.ts because the validator imports from this
 * module, and the reverse would be a cycle.
 */
export const MAX_TRIALS = 5000;

/** Fisher-Yates. Genuinely random, unlike a comparator-based sort shuffle. */
export function shuffle<T>(items: T[], rng: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * The pool a factor draws from.
 *
 * Usually a name from the definition's own `pools`. Inside a stage group it may instead be
 * a reference like `"{list.words}"`, which reads the list drawn for this repetition — the
 * trials of DRM's study block come from whichever themed list this pass got.
 */
function poolFor(
  factor: Factor,
  pools: Record<string, PoolItem[]> | undefined,
  context: Record<string, unknown>,
): PoolItem[] {
  const from = factor.from!;
  if (from.startsWith('{')) {
    const found = resolve<unknown>(from, context);
    return Array.isArray(found) ? found as PoolItem[] : [];
  }
  return pools?.[from] ?? [];
}

/** The levels a factor contributes: explicit, or drawn from a pool. */
function levelsOf(
  factor: Factor,
  pools: Record<string, PoolItem[]> | undefined,
  rng: () => number,
  context: Record<string, unknown> = {},
): unknown[] {
  if (factor.levels) return factor.levels;
  if (!factor.from) return [];

  const pool = poolFor(factor, pools, context);
  if (!factor.sample) return pool;

  // Stratified: that many for each distinct value of the named field, rather than that many
  // overall. Drawing 20 items at random from 50 would leave some serial positions probed
  // four times and others not at all, and the curve those produce is not the one the design
  // asks for.
  if (factor.per) {
    const strata = new Map<string, PoolItem[]>();
    for (const item of pool) {
      const key = String(lookup(factor.per, item) ?? '');
      const bucket = strata.get(key);
      if (bucket) bucket.push(item);
      else strata.set(key, [item]);
    }
    return [...strata.values()].flatMap(items => shuffle(items, rng).slice(0, factor.sample));
  }

  // Sampling is per participant, so two people see different subsets of the same pool —
  // which is what the hand-written experiments do to avoid item-specific effects.
  return shuffle(pool, rng).slice(0, factor.sample);
}

/** Cartesian product of the crossed factors. */
function cross(
  factors: Factor[],
  pools: Record<string, PoolItem[]> | undefined,
  rng: () => number,
  context: Record<string, unknown>,
) {
  // Seeded with the group's drawn item rather than an empty row, so it is in scope for
  // everything that follows — exclusions, derived factors, displays and `store` alike.
  let rows: Record<string, unknown>[] = [{ ...context }];
  for (const factor of factors) {
    const levels = levelsOf(factor, pools, rng, context);
    if (levels.length === 0) continue;
    rows = rows.flatMap(row => levels.map(level => ({ ...row, [factor.name]: level })));
  }
  return rows;
}

/**
 * Whether a row matches one exclusion pattern — every named value, not just one.
 *
 * Compared as strings so a definition written in JSON matches levels declared as numbers.
 * `2` and `"2"` are the same cell to anyone reading the design, and a silent miss here
 * would leave the impossible trials in place with nothing to show why.
 */
export function excluded(row: Record<string, unknown>, patterns: Record<string, string | number | boolean>[]): boolean {
  return patterns.some(pattern =>
    Object.entries(pattern).every(([name, value]) => String(lookup(name, row)) === String(value)));
}

/**
 * Builds the trial list for one participant.
 *
 * Counterbalanced factors are assigned evenly ACROSS the finished list rather than crossed
 * into it. Crossing left/right position would double every design for a nuisance variable;
 * alternating it keeps the count right while still balancing it.
 */
export function buildTrials(
  def: TrialDesign,
  opts: {
    practice?: boolean;
    rng?: () => number;
    /**
     * Values in scope for every trial of this block — the item a stage group drew for this
     * repetition. Present in each trial's values, so displays, `store` and a factor's `from`
     * can all reach it, and absent for every block that is not inside a group.
     */
    context?: Record<string, unknown>;
  } = {},
): Trial[] {
  const rng = opts.rng ?? Math.random;
  const practice = opts.practice ?? false;
  const context = opts.context ?? {};

  const derived = def.factors.filter(f => f.derivedFrom);
  // A fixed practice set: the named factor draws every item of the practice pool instead of
  // its own levels — the hand-picked practice trials an experiment was designed with, rather
  // than a random handful of the main design.
  const fixed = practice ? def.practice?.from : undefined;
  const crossed = def.factors
    .filter(f => !f.counterbalance && !f.derivedFrom)
    .map(f => (fixed && f.name === fixed.factor
      ? { ...f, levels: undefined, from: fixed.pool, sample: undefined }
      : f));
  const balanced = def.factors.filter(f => f.counterbalance && !f.derivedFrom);

  let rows = cross(crossed, def.pools, rng, context);

  // Dropped here, on the bare cross: before repetition so the work is done once, and
  // before counterbalancing so that alternates evenly over the trials that survive rather
  // than over a list with holes in it.
  if (def.exclude?.length) rows = rows.filter(row => !excluded(row, def.exclude!));

  // Checked before allocating, not after. The validator rejects a design this large, but
  // this runs on definitions that did not necessarily come through it — a row read straight
  // from the database, a preview built from sessionStorage — and `repetitions: 1e9` here
  // does not fail slowly, it takes the tab down with it. Refusing with a message the
  // lecturer can act on is the better failure.
  const planned = rows.length * def.repetitions;
  if (!Number.isFinite(planned) || planned > MAX_TRIALS) {
    throw new Error(
      `This experiment asks for ${Number.isFinite(planned) ? planned.toLocaleString() : 'an unlimited number of'} trials, ` +
      `which is more than can be built (the limit is ${MAX_TRIALS.toLocaleString()}). Reduce "repetitions" or the number of levels.`,
    );
  }

  rows = Array.from({ length: def.repetitions }, () => rows).flat();
  // `fixed` leaves the list in the order the cross produced — for a design where the order
  // IS the manipulation: a repeating motor sequence, or a study list whose serial positions
  // are the measure. See TrialOrder.
  const fixedOrder = def.order === 'fixed';
  if (!fixedOrder) rows = shuffle(rows, rng);

  for (const factor of balanced) {
    const levels = levelsOf(factor, def.pools, rng, context);
    if (levels.length === 0) continue;
    rows = rows.map((row, i) => ({ ...row, [factor.name]: levels[i % levels.length] }));
  }

  // Derived factors are computed last, since they read the values chosen above — including
  // counterbalanced ones, which is exactly the Posner case (cue side needs target side).
  for (const factor of derived) {
    rows = rows.map(row => {
      const key = factor.derivedFrom!.map(name => String(lookup(name, row))).join('|');
      const mapped = factor.mapping?.[key];
      // A mapping value may itself point at another factor, so word superiority can say
      // "in the word condition show {item.word}, in the single-letter condition show
      // {item.letters}" — one item, three renderings, without three parallel pools.
      return { ...row, [factor.name]: resolve(mapped, row) };
    });
  }

  // A practice block is drawn from the same design, so it rehearses the real task. Under
  // fixed order it takes the opening trials rather than a random handful, so practice
  // rehearses the beginning of the sequence the participant is about to meet.
  if (practice) {
    const count = def.practice?.count ?? 0;
    rows = (fixedOrder ? rows : shuffle(rows, rng)).slice(0, count);
  }

  return rows.map((values, index) => ({
    index,
    isPractice: practice,
    values,
    seed: Math.floor(Math.random() * 2 ** 30) + index,
  }));
}

// ─── Planning the blocks of a run ─────────────────────────────────────────────

/** Tells a group from a plain block. Here rather than in schema.ts, which stays types-only. */
export function isStageGroup(entry: Stage | StageGroup): entry is StageGroup {
  return (entry as StageGroup).forEach !== undefined;
}

/** One block of a run, in the order it will happen. */
export interface PlannedBlock {
  design: TrialDesign;
  /** Stored on every row of this block, so a chart can say which block it is about. */
  stage: string;
  title?: { en: string; he: string };
  instructions?: { en: string; he: string };
  /** The intro screen moves on by itself after this long, rather than waiting for a press. */
  autoAdvanceMs?: number;
  /** The item this pass of a group drew. Empty for a block outside any group. */
  context: Record<string, unknown>;
  /** Which pass through the group this is, from 1. Absent outside a group. */
  repetition?: number;
}

/**
 * The blocks a participant will actually run, groups expanded.
 *
 * Done ONCE per participant rather than looked up as the run goes along, because a group
 * draws its order at random: asking twice would give two different orders, and DRM would
 * study one list and then test another. The plan is the record of what this participant got.
 *
 * The definition's own design is always the first block, so an experiment with no stages
 * gets a one-element plan and runs exactly as it always did.
 */
export function planStages(
  def: ExperimentDefinition,
  rng: () => number = Math.random,
): PlannedBlock[] {
  const blocks: PlannedBlock[] = [
    { design: def, stage: def.stageName ?? 'main', context: {} },
  ];

  for (const entry of def.stages ?? []) {
    if (!isStageGroup(entry)) {
      blocks.push({
        design: entry,
        stage: entry.name,
        title: entry.title,
        instructions: entry.instructions,
        autoAdvanceMs: entry.autoAdvanceMs,
        context: {},
      });
      continue;
    }

    const pool = def.pools?.[entry.forEach] ?? [];
    // Shuffled unless told otherwise: a fresh order per participant is the reason a group
    // exists at all, so that which list you studied is not confounded with when you studied it.
    const ordered = entry.shuffle === false ? [...pool] : shuffle(pool, rng);
    const drawn = entry.take ? ordered.slice(0, entry.take) : ordered;

    drawn.forEach((item, i) => {
      for (const stage of entry.stages) {
        blocks.push({
          design: stage,
          stage: stage.name,
          title: stage.title,
          instructions: stage.instructions,
          autoAdvanceMs: stage.autoAdvanceMs,
          context: { [entry.as]: item },
          repetition: i + 1,
        });
      }
    });
  }

  return blocks;
}

// ─── Timeouts, early responses and feedback ───────────────────────────────────

/**
 * The response recorded when a response phase with `timeoutMs` runs out.
 *
 * A real value rather than a blank, because in a go/no-go or catch trial it IS the right
 * answer: the correctness mapping says `"catch": "none"`, and scoring needs nothing else.
 */
export const NO_RESPONSE = 'none';

/** The response recorded when the participant answers before the response phase began. */
export const EARLY_RESPONSE = 'early';

/**
 * The response recorded for a trial that asks nothing — a study-list presentation.
 *
 * Its own value rather than NO_RESPONSE, which means a response phase that ran out: on a
 * catch trial that is the participant's answer and may be the correct one, whereas nothing
 * was ever asked here. Collapsing the two would make a study row indistinguishable from a
 * miss in the exported CSV.
 */
export const SHOWN = 'shown';

/** A studied item that came back in free recall, and one that did not. */
export const RECALLED = 'recalled';
export const MISSED = 'missed';

/** One row produced by expanding a recall answer. */
export interface RecallRow {
  response: string;
  payload: Record<string, unknown>;
}

/**
 * Compares a typed word with a studied one.
 *
 * Case and surrounding space only — no stemming and no near-miss matching. A participant
 * who writes "pillows" for "pillow" is scored as an intrusion, which is what the hand-built
 * experiments do and what a marker would have to decide anyway; guessing at intent here
 * would silently inflate recall rates and nobody would see it happen.
 */
function normalise(word: string): string {
  return word.trim().toLowerCase();
}

/**
 * Turns one typed recall list into a row per studied item.
 *
 * Returns null when the block is not a recall block, so the caller keeps its single-row
 * path. See RecallScoring for why the expansion happens here rather than in the dashboard.
 */
export function expandRecall(def: TrialDesign, trial: Trial, typedAnswer: string): RecallRow[] | null {
  const spec = def.trial.recall;
  if (!spec) return null;

  // Commas, semicolons or spaces: participants use all three, and the hand-built DRM
  // already accepted any of them. Kept as a LIST, not a set: the order words come out in is
  // itself data — lag analyses of free recall are entirely about which word followed which —
  // and a set would throw it away before anyone could ask.
  const order = typedAnswer.split(/[\s,;]+/).map(normalise).filter(Boolean);
  const firstAt = new Map<string, number>();
  order.forEach((word, i) => { if (!firstAt.has(word)) firstAt.set(word, i + 1); });
  const typed = new Set(order);
  // `against` names a pool, or — inside a stage group — points at the list drawn for this
  // repetition, so DRM's recall is scored against whichever themed list was just studied.
  const studied = spec.against.startsWith('{')
    ? (resolve<unknown>(spec.against, trial.values) as PoolItem[] | undefined) ?? []
    : def.pools?.[spec.against] ?? [];
  // The trial's own stored fields travel too — which list was studied, which block — so a
  // chart can ask about one list without the pool having to repeat it on every item.
  const context = payloadOf(def, trial);

  const rows: RecallRow[] = [];
  const matched = new Set<string>();

  for (const item of studied) {
    const word = normalise(String(item[spec.match] ?? ''));
    const came = word !== '' && typed.has(word);
    if (came) matched.add(word);
    rows.push({
      response: came ? RECALLED : MISSED,
      // `outputPosition` is where this word came in the answer — first, second, third. Null
      // for one that never came, which a chart must skip rather than read as position zero.
      payload: { ...context, ...item, outputPosition: came ? firstAt.get(word)! : null },
    });
  }

  if (spec.intrusions) {
    for (const word of typed) {
      if (matched.has(word)) continue;
      rows.push({
        response: RECALLED,
        payload: { ...context, [spec.match]: word, intrusion: true, outputPosition: firstAt.get(word)! },
      });
    }
  }

  return rows;
}

export interface Outcome {
  correct: boolean | null;
  timedOut: boolean;
  early: boolean;
}

/**
 * The message a trial's outcome earns under `trial.feedback`, or null for none.
 *
 * Checked in order — too early, correct, timed out, incorrect — so a catch trial correctly
 * left alone counts as correct rather than as a miss, and a miss can say "respond faster"
 * rather than the generic "incorrect" when the definition gives it that message.
 */
export function feedbackMessage(
  def: TrialDesign,
  outcome: Outcome,
  practice: boolean,
): { en: string; he: string } | null {
  const fb = def.trial.feedback;
  if (!fb) return null;
  const applies = practice ? def.practice?.feedback === true : fb.inMain === true;
  if (!applies) return null;

  if (outcome.early) return fb.early ?? fb.incorrect ?? null;
  if (outcome.correct === true) return fb.correct ?? null;
  if (outcome.timedOut) return fb.timeout ?? fb.incorrect ?? null;
  if (outcome.correct === false) return fb.incorrect ?? null;
  return null;
}

/**
 * How long a timed phase lasts on this trial.
 *
 * With `jitterMs`, a whole number of milliseconds is added at random, seeded by the trial
 * and the phase — so it is fixed for the life of that phase (a re-render cannot redraw it)
 * and still differs from one trial to the next.
 */
export function phaseDuration(
  phase: ExperimentDefinition['trial']['phases'][number],
  trial: Pick<Trial, 'values' | 'seed'>,
  phaseIndex: number,
): number {
  const base = Number(resolve(phase.durationMs, trial.values) ?? 0);
  const jitter = Number(resolve(phase.jitterMs, trial.values) ?? 0);
  if (!(jitter > 0)) return base;
  const draw = seededRandom(trial.seed * 31 + phaseIndex + 1)();
  return base + Math.floor(draw * (jitter + 1));
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

/**
 * Whether a response was correct, or null when the task has no correct answer.
 *
 * Null is a real answer, not a missing one: preference tasks like bouba-kiki measure which
 * way people go, and scoring them would be meaningless.
 */
export function isCorrect(def: TrialDesign, trial: Trial, response: string): boolean | null {
  const rule = def.trial.correct;
  if (rule.kind === 'none') return null;

  if (rule.kind === 'matchesFactor') {
    return String(lookup(rule.factor, trial.values)) === response;
  }

  const value = String(lookup(rule.factor, trial.values));
  return rule.expect[value] === response;
}

/** The payload written alongside the fixed spine, from the definition's `store` list. */
export function payloadOf(def: TrialDesign, trial: Trial): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of def.store) {
    // Dotted keys are flattened, so `item.target` is stored as `item_target` — JSONB reads
    // better without nesting, and the CSV export gets one column per field.
    out[key.replace(/\./g, '_')] = lookup(key, trial.values);
  }
  return out;
}
