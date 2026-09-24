// Aggregating stored rows into what a chart needs, and generating mock rows when there
// are none.
//
// Both live here because they are the same shape of problem: a definition says what it
// measures, and this file turns that into numbers. Keeping the mock generator generic is
// what lets a brand-new experiment demo on day one — the sixteen hand-written experiments
// each needed a bespoke generator, and that is 16 files of work this replaces.

import type { ChartSpec, ExperimentDefinition, PoolItem, TrialDesign } from './schema';
import {
  buildTrials, MISSED, NO_RESPONSE, planStages, RECALLED, seededRandom, SHOWN,
} from './trials';

/** A stored trial, flattened — the fixed spine plus the definition's payload keys. */
export interface ResultRow {
  session_id: string;
  participant_name: string;
  trial_index: number;
  is_practice: boolean;
  response: string;
  is_correct: boolean | null;
  /** Null when nothing was timed: a timeout, or a press that came too early. */
  reaction_time_ms: number | null;
  /**
   * Which published version of the experiment this trial ran under. Null or absent for
   * trials collected before revisions existed, or from a built-in experiment.
   */
  definition_revision?: number | null;
  [key: string]: unknown;
}

/** Reads a dotted path such as "trialType.validity" out of a trial's values. */
function valueAt(values: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>(
    (acc, key) => (acc === null || acc === undefined ? undefined : (acc as Record<string, unknown>)[key]),
    values);
}

const NAMES = ['Noa', 'Yael', 'Tamar', 'Shira', 'Maya', 'Ori', 'Amit', 'Itai',
  'Lior', 'Rotem', 'Omer', 'Talia', 'Dani', 'Gal', 'Yuval'];

/**
 * Builds a deterministic mock dataset that shows the definition's stated effect.
 *
 * Deterministic so a lecturer can rehearse a class and see the same chart twice, and so a
 * screenshot stays valid. Each simulated participant gets their own speed and ability
 * offset, otherwise the by-participant charts are a flat line and the class learns the
 * wrong lesson about individual differences.
 */
export function generateMockRows(def: ExperimentDefinition): ResultRow[] {
  const spec = def.mock ?? { participants: 15, baseRtMs: 700, baseAccuracy: 0.85 };
  const rows: ResultRow[] = [];

  for (let p = 0; p < spec.participants; p++) {
    const rng = seededRandom(p * 1000 + 7);
    const name = NAMES[p % NAMES.length] + (p >= NAMES.length ? ` ${Math.floor(p / NAMES.length) + 1}` : '');
    const speed = 0.85 + rng() * 0.35;          // individual speed factor
    const ability = (rng() - 0.5) * 0.12;       // individual accuracy offset

    // EVERY block, not just the first. A multi-block experiment's dashboard asks about its
    // later blocks — DRM's figures are almost all about recall and recognition — so a mock
    // set covering only the opening block leaves the whole dashboard empty, which is
    // precisely when a lecturer reaches for the Mock Data toggle.
    const plan = planStages(def, rng);
    const multiBlock = plan.length > 1;

    for (const block of plan) {
      const design = block.design;
      const stamp: Record<string, unknown> = {
        ...(multiBlock ? { stage: block.stage } : {}),
        ...(block.repetition !== undefined ? { repetition: block.repetition } : {}),
      };

      /** How likely this item is to go right, given the effects that name its values. */
      const chanceFor = (values: Record<string, unknown>) => {
        let acc = spec.baseAccuracy + ability;
        for (const effect of spec.effects ?? []) {
          if (String(valueAt(values, effect.factor)) !== String(effect.level)) continue;
          acc += effect.accuracyDelta ?? 0;
        }
        return Math.min(0.99, Math.max(0.02, acc));
      };

      // A block bounded by a clock offers far more trials than anyone finishes — that is how
      // it guarantees it never runs out. Mocking all of them would say every participant
      // answered ninety sums in thirty seconds, so only as many as the time allows are kept.
      const built = buildTrials(design, { rng, context: block.context });
      const affordable = design.endsAfterMs
        ? Math.max(1, Math.round(design.endsAfterMs / (spec.baseRtMs * speed + 300)))
        : built.length;

      for (const trial of built.slice(0, affordable)) {
        const stored: Record<string, unknown> = {};
        for (const key of design.store) {
          stored[key.replace(/\./g, '_')] = key.split('.').reduce<unknown>(
            (acc2, k) => (acc2 as Record<string, unknown>)?.[k], trial.values as unknown);
        }
        const base = {
          session_id: `mock-${p}`,
          participant_name: name,
          trial_index: trial.index,
          is_practice: false,
        };

        // A block that asks nothing presents and moves on, exactly as the runner records it.
        if (responseValues(design).length === 0 && design.trial.response
            && !Array.isArray(design.trial.response) && !('sets' in design.trial.response)
            && design.trial.response.kind === 'none') {
          rows.push({ ...base, response: SHOWN, is_correct: null, reaction_time_ms: null, ...stamp, ...stored });
          continue;
        }

        // A recall block answers once about many items, so it produces a row per studied
        // word — the shape the runner writes, and the only shape a serial-position curve or
        // a lure rate can be drawn from.
        if (design.trial.recall) {
          const against = design.trial.recall.against;
          const probes = (against.startsWith('{')
            ? valueAt(trial.values, against.slice(1, -1))
            : design.pools?.[against] ?? def.pools?.[against]) as PoolItem[] | undefined;
          let output = 0;
          for (const item of probes ?? []) {
            const came = rng() < chanceFor(item as Record<string, unknown>);
            if (came) output++;
            rows.push({
              ...base,
              response: came ? RECALLED : MISSED,
              is_correct: null,
              reaction_time_ms: null,
              ...stamp,
              ...stored,
              ...(item as Record<string, unknown>),
              outputPosition: came ? output : null,
            });
          }
          continue;
        }

        let rt = spec.baseRtMs;
        for (const effect of spec.effects ?? []) {
          // Read as a path, so an effect can name a pool field such as "trialType.validity".
          if (String(valueAt(trial.values, effect.factor)) !== String(effect.level)) continue;
          rt += (effect.rtDeltaMs ?? 0) + (effect.rtPerTrialMs ?? 0) * trial.index;
        }

        const correct = rng() < chanceFor(trial.values);
        // Errors are slower than correct responses, as they are in real data.
        const jitter = (rng() - 0.5) * 260;
        const reaction = Math.max(220, Math.round(rt * speed + jitter + (correct ? 0 : 120)));

        // Where the right answer is to press nothing, a correct trial has no response and no
        // RT — exactly as the runner records it — so RT charts are never fed invented times.
        const expected = expectedResponse(design, trial.values);
        const withheld = correct && expected.includes(NO_RESPONSE);

        // A value the experiment could really have produced, so proportion charts count
        // something. Falls back to the old literals where a definition offers no fixed set —
        // free text, or options whose labels change from trial to trial.
        const offered = responseValues(design);
        const wrongOnes = offered.filter(v => !expected.includes(v));
        const answered = correct
          ? (expected[Math.floor(rng() * expected.length)] ?? offered[Math.floor(rng() * offered.length)] ?? 'correct')
          : (wrongOnes[Math.floor(rng() * wrongOnes.length)] ?? 'incorrect');

        rows.push({
          ...base,
          response: withheld ? NO_RESPONSE : answered,
          is_correct: correct,
          reaction_time_ms: withheld ? null : reaction,
          ...stamp,
          ...stored,
        });
      }
    }
  }

  return rows;
}

// ─── Aggregation ──────────────────────────────────────────────────────────────

/** Standard error of the mean. Always fed per-participant means, never raw trials. */
export function sem(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance / values.length);
}

/** The response(s) a trial's correctness rule expects, when the rule names any. */
function expectedResponse(
  def: TrialDesign,
  values: Record<string, unknown>,
): string[] {
  const correct = def.trial.correct;
  // A block interleaving two tasks carries one rule per kind of trial; pick this trial's.
  const rule = 'sets' in correct
    ? correct.sets[String(valueAt(values, correct.by))] ?? Object.values(correct.sets)[0]
    : correct;
  if (!rule) return [];

  if (rule.kind === 'mapping') {
    const expected = rule.expect[String(valueAt(values, rule.factor))];
    if (expected === undefined) return [];
    return Array.isArray(expected) ? expected : [expected];
  }
  if (rule.kind === 'matchesFactor') return [String(valueAt(values, rule.factor))];
  // An estimate task: the mock answers with the true value, which is within any tolerance.
  // Left out, a mock participant would answer an estimate with a button label and the
  // dashboard a lecturer previews would show zero accuracy on a task nobody got wrong.
  if (rule.kind === 'within') return [String(valueAt(values, rule.factor))];
  return [];
}

/**
 * Every value a participant could answer with, read off the definition's own response spec.
 *
 * Mock rows used to record the literal words "correct" and "incorrect", which meant every
 * `proportion` chart aggregated to zero under Mock Data — the toggle a lecturer uses to
 * demonstrate an effect with no participants showed them an empty chart. Answering with a
 * value the experiment can actually produce is what makes those charts mean anything.
 *
 * Bound values like "{item.optionA}" are skipped: they name a different word on every trial,
 * so there is no fixed value to count.
 */
function responseValues(def: TrialDesign): string[] {
  const spec = def.trial.response;
  const specs = Array.isArray(spec)
    ? spec
    : 'sets' in spec
      ? Object.values(spec.sets).flatMap(s => (Array.isArray(s) ? s : [s]))
      : [spec];

  const out = new Set<string>();
  for (const one of specs) {
    if (one.kind === 'choice') {
      for (const option of one.options) {
        const value = String(option.value);
        if (!value.includes('{')) out.add(value);
      }
    } else if (one.kind === 'rating') {
      for (let n = one.min; n <= one.max; n++) out.add(String(n));
    }
  }
  return [...out];
}

function measureOf(chart: ChartSpec, rows: ResultRow[]): number {
  if (rows.length === 0) return 0;
  switch (chart.measure) {
    case 'meanRt': {
      // Only trials that were timed. A timeout or an early press has no RT, and averaging it
      // in as zero would drag the mean toward an impossible speed.
      const timed = rows.filter(r => typeof r.reaction_time_ms === 'number');
      if (timed.length === 0) return 0;
      return timed.reduce((a, r) => a + (r.reaction_time_ms as number), 0) / timed.length;
    }
    case 'proportion': {
      // A list counts any of several answers as a hit: a recognition test's "said old" is
      // two of its four buttons, since each carries a confidence as well as a decision.
      const wanted = Array.isArray(chart.ofResponse) ? chart.ofResponse : [chart.ofResponse];
      const hits = rows.filter(r => wanted.includes(String(r.response))).length;
      return (hits / rows.length) * 100;
    }
    case 'count':
      return rows.length;
    case 'accuracy':
    default: {
      const scored = rows.filter(r => r.is_correct !== null);
      if (scored.length === 0) return 0;
      return (scored.filter(r => r.is_correct).length / scored.length) * 100;
    }
  }
}

export interface ChartPoint {
  group: string;
  value: number;
  sem: number;
  /** One key per series when the chart splits by a second factor. */
  [series: string]: string | number;
}

/** Whether a row passes a chart's `filter` and `correctOnly`. */
function included(chart: ChartSpec, row: ResultRow): boolean {
  if (chart.correctOnly && row.is_correct !== true) return false;
  for (const [field, wanted] of Object.entries(chart.filter ?? {})) {
    const actual = String(row[field.replace(/\./g, '_')]);
    const allowed = Array.isArray(wanted) ? wanted : [wanted];
    if (!allowed.some(v => String(v) === actual)) return false;
  }
  return true;
}

/**
 * One participant's value for a chart cell.
 *
 * With `difference`, the gap between two levels WITHIN that participant, so an effect is
 * computed per person and then averaged — never mean(invalid) minus mean(valid) across
 * people, which lets one slow participant set the whole class's effect. NaN when the
 * participant has nothing measurable at either level, so they are left out rather than
 * counted as an effect of zero or of minus their whole RT.
 */
function cellMeasure(chart: ChartSpec, cell: ResultRow[]): number {
  const d = chart.difference;
  if (!d) return measureOf(chart, cell);

  const key = d.factor.replace(/\./g, '_');
  const usable = (r: ResultRow) => chart.measure !== 'meanRt' || typeof r.reaction_time_ms === 'number';
  const a = cell.filter(r => String(r[key]) === String(d.level) && usable(r));
  const b = cell.filter(r => String(r[key]) === String(d.minus) && usable(r));
  if (a.length === 0 || b.length === 0) return NaN;
  return measureOf(chart, a) - measureOf(chart, b);
}

/**
 * Turns rows into chart points.
 *
 * Per-participant means are computed first and the SEM taken across participants, not
 * across raw trials. Doing it the other way inflates n by the trial count and produces
 * error bars far too small — a mistake that looks like a much stronger result than the
 * data supports.
 */
export function aggregate(chart: ChartSpec, allRows: ResultRow[]): ChartPoint[] {
  // Narrowed first, so everything below — groups, series, participants — only ever sees the
  // trials the chart is about.
  const rows = chart.filter || chart.correctOnly ? allRows.filter(r => included(chart, r)) : allRows;

  // "sequence" is a row's place among ITS PARTICIPANT's rows in this chart, in the order they
  // were run — that person's 1st, 2nd, 3rd exogenous trial, whatever trial numbers those
  // happened to be. Counted after filtering, so it only counts what the chart counts.
  const position = new Map<ResultRow, number>();
  if (chart.groupBy === 'sequence') {
    const bySession = new Map<string, ResultRow[]>();
    for (const r of rows) {
      const list = bySession.get(r.session_id);
      if (list) list.push(r);
      else bySession.set(r.session_id, [r]);
    }
    for (const list of bySession.values()) {
      [...list]
        .sort((a, b) => Number(a.trial_index) - Number(b.trial_index))
        .forEach((r, i) => position.set(r, i));
    }
  }

  const key = chart.groupBy.replace(/\./g, '_');
  const bin = typeof chart.bin === 'number' && chart.bin > 0 ? chart.bin : 0;
  const groupValue = (r: ResultRow) => {
    if (chart.groupBy === 'participant') return String(r.participant_name);
    if (chart.groupBy === 'all') return 'All';
    const raw = chart.groupBy === 'sequence' ? position.get(r) : r[key];
    if (bin) {
      // Numbered from 1: with a bin of 33, trial_index 0–32 is group 1.
      const n = Number(raw);
      return raw !== undefined && Number.isFinite(n) ? String(Math.floor(n / bin) + 1) : 'undefined';
    }
    // Unbinned sequence positions are numbered from 1 too.
    if (chart.groupBy === 'sequence') return raw === undefined ? 'undefined' : String(Number(raw) + 1);
    return String(r[key]);
  };

  const seriesKey = chart.seriesBy?.replace(/\./g, '_');
  const NO_SERIES = ' ';

  // Bucketed in ONE pass rather than re-filtering the rows for every group and again for
  // every participant inside it. That was quadratic, and a chart grouped by a high
  // cardinality field — a word, an item id — took seconds to a minute on real mock data
  // and froze the dashboard. Grouping is what a Map is for.
  const buckets = new Map<string, Map<string, Map<string, ResultRow[]>>>();
  const seriesSeen = new Map<string, true>();

  for (const row of rows) {
    const group = groupValue(row);
    if (group === 'undefined') continue;
    const series = seriesKey ? String(row[seriesKey]) : NO_SERIES;
    if (series === 'undefined') continue;
    if (series !== NO_SERIES) seriesSeen.set(series, true);

    let bySeries = buckets.get(group);
    if (!bySeries) { bySeries = new Map(); buckets.set(group, bySeries); }
    let bySession = bySeries.get(series);
    if (!bySession) { bySession = new Map(); bySeries.set(series, bySession); }
    const list = bySession.get(row.session_id);
    if (list) list.push(row);
    else bySession.set(row.session_id, [row]);
  }

  // Every series a chart has, so a group missing one still emits a zero for it rather than
  // a hole the chart would render as a gap.
  const seriesValues: (string | null)[] = seriesKey ? [...seriesSeen.keys()] : [null];

  return [...buckets.entries()].map(([group, bySeries]) => {
    const point: ChartPoint = { group, value: 0, sem: 0 };
    let measured = false;

    for (const series of seriesValues) {
      const bySession = bySeries.get(series === null ? NO_SERIES : series);
      // A participant with nothing measurable for a difference comes back NaN and is left out.
      // Pooled charts instead treat the whole class's trials as one set, each trial counting
      // once — one value, so no error bar.
      const byParticipant = !bySession
        ? []
        : chart.pooled
          ? [cellMeasure(chart, [...bySession.values()].flat())].filter(Number.isFinite)
          : [...bySession.values()].map(cell => cellMeasure(chart, cell)).filter(Number.isFinite);
      if (byParticipant.length) measured = true;

      const mean = byParticipant.length
        ? byParticipant.reduce((a, b) => a + b, 0) / byParticipant.length
        : 0;

      if (series === null) {
        point.value = Math.round(mean * 10) / 10;
        point.sem = Math.round(sem(byParticipant) * 10) / 10;
      } else {
        point[series] = Math.round(mean * 10) / 10;
        point[`${series}__sem`] = Math.round(sem(byParticipant) * 10) / 10;
      }
    }

    // Only a `difference` can leave a group with no measurable participant at all, and a bar
    // of zero there would read as "no effect" rather than "no data".
    return measured ? point : null;
  }).filter((p): p is ChartPoint => p !== null).sort((a, b) => {
    // Groups the definition lists come first, in its order.
    const ra = groupRank(chart, a.group), rb = groupRank(chart, b.group);
    if (ra !== rb) return ra - rb;
    // Numeric groups sort numerically, so set sizes read 1, 2, 4, 8 rather than 1, 2, 4, 8
    // being alphabetised into 1, 2, 4, 8 — which breaks as soon as there is a 10.
    const na = Number(a.group), nb = Number(b.group);
    return !isNaN(na) && !isNaN(nb) ? na - nb : String(a.group).localeCompare(String(b.group));
  }).map(p => ({ ...p, group: groupLabel(chart, p.group) }));
}

/** Where a group sits under `chart.groups`. Unlisted groups follow, so none is ever hidden. */
function groupRank(chart: ChartSpec, group: string): number {
  const i = chart.groups?.findIndex(g => String(g.value) === group) ?? -1;
  return i === -1 ? Number.MAX_SAFE_INTEGER : i;
}

function groupLabel(chart: ChartSpec, group: string): string {
  return chart.groups?.find(g => String(g.value) === group)?.label ?? group;
}

/**
 * What the original study reported for one group, or undefined when it reported nothing.
 *
 * Looked up by the group's own value and by the label `groups` may have renamed it to, so a
 * definition can write either — "exo_invalid" or "Exogenous" — and neither silently misses.
 */
export function originalValue(chart: ChartSpec, group: string): number | undefined {
  const values = chart.original?.values;
  if (!values) return undefined;
  if (typeof values[group] === 'number') return values[group];

  // `group` here is already the label, so map it back to the value it was renamed from.
  const named = chart.groups?.find(g => (g.label ?? String(g.value)) === group);
  const underlying = named ? String(named.value) : undefined;
  return underlying !== undefined && typeof values[underlying] === 'number' ? values[underlying] : undefined;
}

/** The key the original series is plotted under. Never a group's own name. */
export const ORIGINAL_KEY = '__original';

/**
 * Chart points with the original study's numbers attached, ready to plot beside the class.
 *
 * Kept out of aggregate() on purpose: aggregate answers "what did this class do", and the
 * paper's reported figures are not data anyone collected here.
 */
export function withOriginal(chart: ChartSpec, points: ChartPoint[]): ChartPoint[] {
  if (!chart.original) return points;
  return points.map(p => {
    const value = originalValue(chart, p.group);
    return value === undefined ? p : { ...p, [ORIGINAL_KEY]: value };
  });
}

/** Groups the original names that no chart point matches — a typo plots nothing at all. */
export function unmatchedOriginals(chart: ChartSpec, points: ChartPoint[]): string[] {
  if (!chart.original) return [];
  const plotted = new Set<string>();
  for (const p of points) {
    plotted.add(p.group);
    const named = chart.groups?.find(g => (g.label ?? String(g.value)) === p.group);
    if (named) plotted.add(String(named.value));
  }
  return Object.keys(chart.original.values).filter(name => !plotted.has(name));
}

type StatSpec = NonNullable<ExperimentDefinition['dashboard']['stats']>[number];

/**
 * The number on a stat card: the same aggregation a chart does, over the whole class as a
 * single group — so a card and a chart of the same measure can never disagree.
 */
export function statValue(stat: StatSpec, rows: ResultRow[]): number | null {
  if (stat.measure === 'correlation') return correlationValue(stat, rows);
  // Past the guard above, the measure is one a chart understands — but the union still
  // carries 'correlation', which no ChartSpec has.
  const measure = stat.measure as ChartSpec['measure'];
  const [point] = aggregate({ ...stat, measure, title: stat.label, kind: 'bar', groupBy: 'all' }, rows);
  return point ? point.value : null;
}

/**
 * Mean within-participant correlation between a stored number and reaction time.
 *
 * "RT rises with X" is one of the most common claims in the field — with rotation angle,
 * with distance scanned, with set size, with memory load — and the number that states it is
 * a correlation, which no group mean can express. Every other measure here answers "how much
 * on average"; this one answers "how tightly does it track".
 *
 * Per participant FIRST, then averaged, for the same reason the error bars are: one person
 * who is uniformly slow would otherwise inflate the correlation for the whole class, since
 * their slow trials sit above everyone else's at every value of X. The class mean of
 * individual rs is the number the hand-built dashboards reported, and it is the honest one.
 *
 * Participants with fewer than three usable trials, or with no variation in X or in RT, are
 * left out rather than counted as zero: r is undefined there, and zero would read as "no
 * relationship" when the truth is "not measurable from this person".
 */
function correlationValue(stat: StatSpec, allRows: ResultRow[]): number | null {
  const against = stat.against;
  if (!against) return null;
  const field = against.replace(/\./g, '_');

  const chart = { ...stat, title: stat.label, kind: 'bar', groupBy: 'all' } as ChartSpec;
  const rows = allRows.filter(r =>
    included(chart, r)
    && typeof r.reaction_time_ms === 'number'
    && typeof r[field] === 'number');

  const byParticipant = new Map<string, { x: number; y: number }[]>();
  for (const row of rows) {
    const key = String(row.participant_name);
    if (!byParticipant.has(key)) byParticipant.set(key, []);
    byParticipant.get(key)!.push({ x: row[field] as number, y: row.reaction_time_ms as number });
  }

  const rs: number[] = [];
  for (const points of byParticipant.values()) {
    const r = pearson(points);
    if (r !== null) rs.push(r);
  }
  if (!rs.length) return null;
  return rs.reduce((a, b) => a + b, 0) / rs.length;
}

/** Pearson's r, or null where it is undefined — fewer than three points, or no spread. */
export function pearson(points: { x: number; y: number }[]): number | null {
  const n = points.length;
  if (n < 3) return null;

  const sumX = points.reduce((a, p) => a + p.x, 0);
  const sumY = points.reduce((a, p) => a + p.y, 0);
  const sumXY = points.reduce((a, p) => a + p.x * p.y, 0);
  const sumX2 = points.reduce((a, p) => a + p.x * p.x, 0);
  const sumY2 = points.reduce((a, p) => a + p.y * p.y, 0);

  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  // A participant who pressed at the same speed every time, or saw one value of x: the
  // relationship is not zero, it is unmeasurable, and averaging a zero in would dilute
  // everyone else's real correlation towards nothing.
  if (denominator === 0) return null;
  return numerator / denominator;
}

/** One point of an `xy` chart: a participant, placed by two different measures. */
export interface XYPoint {
  group: string;
  series: string;
  x: number;
  y: number;
}

/**
 * Points for a chart whose axes measure two different things.
 *
 * Both axes are computed WITHIN one participant (or whatever `groupBy` names), so a point
 * is that person's own congruent RT against their own incongruent RT. A participant with
 * nothing to measure on either axis is dropped rather than placed at zero: the hand-built
 * Stroop dashboard put non-words — which can never be congruent — on the x = 0 line, where
 * they read as impossibly fast rather than as absent.
 */
export function aggregateXY(chart: ChartSpec, allRows: ResultRow[]): XYPoint[] {
  if (!chart.axes) return [];
  const rows = chart.filter || chart.correctOnly ? allRows.filter(r => included(chart, r)) : allRows;

  const key = chart.groupBy.replace(/\./g, '_');
  const seriesKey = chart.seriesBy?.replace(/\./g, '_');
  const NO_SERIES = ' ';
  const groupValue = (r: ResultRow) =>
    chart.groupBy === 'participant' ? String(r.participant_name) : String(r[key]);

  // Keyed by group then series, exactly as aggregate() buckets, so one pass builds every
  // point rather than re-filtering the rows per axis per participant.
  const buckets = new Map<string, Map<string, ResultRow[]>>();
  for (const row of rows) {
    const group = groupValue(row);
    if (group === 'undefined') continue;
    const series = seriesKey ? String(row[seriesKey]) : NO_SERIES;
    if (series === 'undefined') continue;
    let bySeries = buckets.get(group);
    if (!bySeries) { bySeries = new Map(); buckets.set(group, bySeries); }
    const list = bySeries.get(series);
    if (list) list.push(row);
    else bySeries.set(series, [row]);
  }

  /** One axis's value over a participant's rows, or undefined when it has none to measure. */
  const axisValue = (axis: NonNullable<ChartSpec['axes']>['x'], cell: ResultRow[]) => {
    const narrowed = cell.filter(r => included(
      { ...chart, filter: axis.filter, correctOnly: axis.correctOnly ?? chart.correctOnly },
      r,
    ));
    if (narrowed.length === 0) return undefined;
    // meanRt over rows that were never timed has nothing to report either.
    if (axis.measure === 'meanRt' && !narrowed.some(r => typeof r.reaction_time_ms === 'number')) {
      return undefined;
    }
    return measureOf({ ...chart, measure: axis.measure, ofResponse: axis.ofResponse }, narrowed);
  };

  const points: XYPoint[] = [];
  for (const [group, bySeries] of buckets) {
    for (const [series, cell] of bySeries) {
      const x = axisValue(chart.axes.x, cell);
      const y = axisValue(chart.axes.y, cell);
      if (x === undefined || y === undefined) continue;
      points.push({
        group,
        series: series === NO_SERIES ? '' : series,
        x: Math.round(x * 10) / 10,
        y: Math.round(y * 10) / 10,
      });
    }
  }
  return points;
}

/** Series names for a multi-series chart, in a stable order. */
export function seriesNames(chart: ChartSpec, rows: ResultRow[]): string[] {
  if (!chart.seriesBy) return [];
  const key = chart.seriesBy.replace(/\./g, '_');
  // Only rows the chart actually draws. Reading every row instead named a series for values
  // the chart filters out — a serial-position chart split by block listed all five blocks of
  // the experiment, so the legend advertised three series that were empty everywhere.
  return [...new Set(rows.filter(r => included(chart, r)).map(r => String(r[key])))]
    .filter(s => s !== 'undefined')
    .sort();
}

/** The axis label for a measure, honouring `correctMeans` on preference tasks. */
export function measureLabel(chart: ChartSpec, def: ExperimentDefinition): string {
  if (chart.yLabel) return chart.yLabel;
  if (chart.measure === 'meanRt') return 'RT (ms)';
  if (chart.measure === 'count') return 'Trials';
  if (chart.measure === 'proportion') {
    const wanted = Array.isArray(chart.ofResponse) ? chart.ofResponse : [chart.ofResponse];
    return `Chose "${wanted.join('" or "')}" (%)`;
  }
  return def.correctMeans ? `${def.correctMeans} (%)` : 'Accuracy (%)';
}
