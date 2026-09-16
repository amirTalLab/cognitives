// Aggregating stored rows into what a chart needs, and generating mock rows when there
// are none.
//
// Both live here because they are the same shape of problem: a definition says what it
// measures, and this file turns that into numbers. Keeping the mock generator generic is
// what lets a brand-new experiment demo on day one — the sixteen hand-written experiments
// each needed a bespoke generator, and that is 16 files of work this replaces.

import type { ChartSpec, ExperimentDefinition } from './schema';
import { buildTrials, NO_RESPONSE, seededRandom } from './trials';

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

    for (const trial of buildTrials(def, { rng })) {
      let rt = spec.baseRtMs;
      let acc = spec.baseAccuracy + ability;

      for (const effect of spec.effects ?? []) {
        // Read as a path, so an effect can name a pool field such as "trialType.validity".
        if (String(valueAt(trial.values, effect.factor)) !== String(effect.level)) continue;
        rt += (effect.rtDeltaMs ?? 0) + (effect.rtPerTrialMs ?? 0) * trial.index;
        acc += effect.accuracyDelta ?? 0;
      }

      const correct = rng() < Math.min(0.99, Math.max(0.02, acc));
      // Errors are slower than correct responses, as they are in real data.
      const jitter = (rng() - 0.5) * 260;
      const reaction = Math.max(220, Math.round(rt * speed + jitter + (correct ? 0 : 120)));

      // Where the right answer is to press nothing, a correct trial has no response and no
      // RT — exactly as the runner records it — so RT charts are never fed invented times.
      const withheld = correct && expectedResponse(def, trial.values) === NO_RESPONSE;

      const row: ResultRow = {
        session_id: `mock-${p}`,
        participant_name: name,
        trial_index: trial.index,
        is_practice: false,
        response: withheld ? NO_RESPONSE : correct ? 'correct' : 'incorrect',
        is_correct: correct,
        reaction_time_ms: withheld ? null : reaction,
      };
      for (const key of def.store) {
        row[key.replace(/\./g, '_')] = key.split('.').reduce<unknown>(
          (acc2, k) => (acc2 as Record<string, unknown>)?.[k], trial.values as unknown);
      }
      rows.push(row);
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

/** The response a trial's correctness rule expects, when the rule names one. */
function expectedResponse(def: ExperimentDefinition, values: Record<string, unknown>): string | undefined {
  const rule = def.trial.correct;
  if (rule.kind === 'mapping') return rule.expect[String(valueAt(values, rule.factor))];
  if (rule.kind === 'matchesFactor') return String(valueAt(values, rule.factor));
  return undefined;
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
      const hits = rows.filter(r => String(r.response) === chart.ofResponse).length;
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

type StatSpec = NonNullable<ExperimentDefinition['dashboard']['stats']>[number];

/**
 * The number on a stat card: the same aggregation a chart does, over the whole class as a
 * single group — so a card and a chart of the same measure can never disagree.
 */
export function statValue(stat: StatSpec, rows: ResultRow[]): number | null {
  const [point] = aggregate({ ...stat, title: stat.label, kind: 'bar', groupBy: 'all' }, rows);
  return point ? point.value : null;
}

/** Series names for a multi-series chart, in a stable order. */
export function seriesNames(chart: ChartSpec, rows: ResultRow[]): string[] {
  if (!chart.seriesBy) return [];
  const key = chart.seriesBy.replace(/\./g, '_');
  return [...new Set(rows.map(r => String(r[key])))].filter(s => s !== 'undefined').sort();
}

/** The axis label for a measure, honouring `correctMeans` on preference tasks. */
export function measureLabel(chart: ChartSpec, def: ExperimentDefinition): string {
  if (chart.yLabel) return chart.yLabel;
  if (chart.measure === 'meanRt') return 'RT (ms)';
  if (chart.measure === 'count') return 'Trials';
  if (chart.measure === 'proportion') return `Chose "${chart.ofResponse}" (%)`;
  return def.correctMeans ? `${def.correctMeans} (%)` : 'Accuracy (%)';
}
