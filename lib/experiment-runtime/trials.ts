// Turning a definition into a trial list, and resolving trial-bound values.
//
// This is the half of the runtime that has no UI, so it is the half worth testing. The
// build order matches what every hand-written experiment in this repo does: cross the
// factors, draw pool items, repeat, counterbalance, shuffle.

// Type-only import: see the note in validate.ts — scripts/definition.mjs loads this
// module directly under Node's type stripping.
import type { Bound, ExperimentDefinition, Factor, PoolItem } from './schema';

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

/** Fisher-Yates. Genuinely random, unlike a comparator-based sort shuffle. */
export function shuffle<T>(items: T[], rng: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** The levels a factor contributes: explicit, or drawn from a pool. */
function levelsOf(
  factor: Factor,
  pools: Record<string, PoolItem[]> | undefined,
  rng: () => number,
): unknown[] {
  if (factor.levels) return factor.levels;
  if (!factor.from) return [];

  const pool = pools?.[factor.from] ?? [];
  // Sampling is per participant, so two people see different subsets of the same pool —
  // which is what the hand-written experiments do to avoid item-specific effects.
  return factor.sample ? shuffle(pool, rng).slice(0, factor.sample) : pool;
}

/** Cartesian product of the crossed factors. */
function cross(factors: Factor[], pools: Record<string, PoolItem[]> | undefined, rng: () => number) {
  let rows: Record<string, unknown>[] = [{}];
  for (const factor of factors) {
    const levels = levelsOf(factor, pools, rng);
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
  def: ExperimentDefinition,
  opts: { practice?: boolean; rng?: () => number } = {},
): Trial[] {
  const rng = opts.rng ?? Math.random;
  const practice = opts.practice ?? false;

  const derived = def.factors.filter(f => f.derivedFrom);
  const crossed = def.factors.filter(f => !f.counterbalance && !f.derivedFrom);
  const balanced = def.factors.filter(f => f.counterbalance && !f.derivedFrom);

  let rows = cross(crossed, def.pools, rng);

  // Dropped here, on the bare cross: before repetition so the work is done once, and
  // before counterbalancing so that alternates evenly over the trials that survive rather
  // than over a list with holes in it.
  if (def.exclude?.length) rows = rows.filter(row => !excluded(row, def.exclude!));

  rows = Array.from({ length: def.repetitions }, () => rows).flat();
  rows = shuffle(rows, rng);

  for (const factor of balanced) {
    const levels = levelsOf(factor, def.pools, rng);
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

  // A practice block is drawn from the same design, so it rehearses the real task.
  if (practice) {
    const count = def.practice?.count ?? 0;
    rows = shuffle(rows, rng).slice(0, count);
  }

  return rows.map((values, index) => ({
    index,
    isPractice: practice,
    values,
    seed: Math.floor(Math.random() * 2 ** 30) + index,
  }));
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

/**
 * Whether a response was correct, or null when the task has no correct answer.
 *
 * Null is a real answer, not a missing one: preference tasks like bouba-kiki measure which
 * way people go, and scoring them would be meaningless.
 */
export function isCorrect(def: ExperimentDefinition, trial: Trial, response: string): boolean | null {
  const rule = def.trial.correct;
  if (rule.kind === 'none') return null;

  if (rule.kind === 'matchesFactor') {
    return String(lookup(rule.factor, trial.values)) === response;
  }

  const value = String(lookup(rule.factor, trial.values));
  return rule.expect[value] === response;
}

/** The payload written alongside the fixed spine, from the definition's `store` list. */
export function payloadOf(def: ExperimentDefinition, trial: Trial): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of def.store) {
    // Dotted keys are flattened, so `item.target` is stored as `item_target` — JSONB reads
    // better without nesting, and the CSV export gets one column per field.
    out[key.replace(/\./g, '_')] = lookup(key, trial.values);
  }
  return out;
}
