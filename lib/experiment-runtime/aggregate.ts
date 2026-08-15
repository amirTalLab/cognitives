// Aggregating stored rows into what a chart needs, and generating mock rows when there
// are none.
//
// Both live here because they are the same shape of problem: a definition says what it
// measures, and this file turns that into numbers. Keeping the mock generator generic is
// what lets a brand-new experiment demo on day one — the sixteen hand-written experiments
// each needed a bespoke generator, and that is 16 files of work this replaces.

import type { ChartSpec, ExperimentDefinition } from './schema';
import { buildTrials, seededRandom } from './trials';

/** A stored trial, flattened — the fixed spine plus the definition's payload keys. */
export interface ResultRow {
  session_id: string;
  participant_name: string;
  trial_index: number;
  is_practice: boolean;
  response: string;
  is_correct: boolean | null;
  reaction_time_ms: number;
  [key: string]: unknown;
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
        if (String(trial.values[effect.factor]) !== effect.level) continue;
        rt += effect.rtDeltaMs ?? 0;
        acc += effect.accuracyDelta ?? 0;
      }

      const correct = rng() < Math.min(0.99, Math.max(0.02, acc));
      // Errors are slower than correct responses, as they are in real data.
      const jitter = (rng() - 0.5) * 260;
      const reaction = Math.max(220, Math.round(rt * speed + jitter + (correct ? 0 : 120)));

      const row: ResultRow = {
        session_id: `mock-${p}`,
        participant_name: name,
        trial_index: trial.index,
        is_practice: false,
        response: correct ? 'correct' : 'incorrect',
        is_correct: correct,
        reaction_time_ms: reaction,
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

function measureOf(chart: ChartSpec, rows: ResultRow[]): number {
  if (rows.length === 0) return 0;
  switch (chart.measure) {
    case 'meanRt':
      return rows.reduce((a, r) => a + r.reaction_time_ms, 0) / rows.length;
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

/**
 * Turns rows into chart points.
 *
 * Per-participant means are computed first and the SEM taken across participants, not
 * across raw trials. Doing it the other way inflates n by the trial count and produces
 * error bars far too small — a mistake that looks like a much stronger result than the
 * data supports.
 */
export function aggregate(chart: ChartSpec, rows: ResultRow[]): ChartPoint[] {
  const key = chart.groupBy.replace(/\./g, '_');
  const groupValue = (r: ResultRow) =>
    chart.groupBy === 'participant' ? String(r.participant_name) : String(r[key]);

  const groups = [...new Set(rows.map(groupValue))].filter(g => g !== 'undefined');
  const seriesKey = chart.seriesBy?.replace(/\./g, '_');
  const seriesValues = seriesKey
    ? [...new Set(rows.map(r => String(r[seriesKey])))].filter(s => s !== 'undefined')
    : [null];

  return groups.map(group => {
    const point: ChartPoint = { group, value: 0, sem: 0 };

    for (const series of seriesValues) {
      const cell = rows.filter(r =>
        groupValue(r) === group && (series === null || String(r[seriesKey!]) === series));

      const byParticipant = [...new Set(cell.map(r => r.session_id))]
        .map(sid => measureOf(chart, cell.filter(r => r.session_id === sid)));

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

    return point;
  }).sort((a, b) => {
    // Numeric groups sort numerically, so set sizes read 1, 2, 4, 8 rather than 1, 2, 4, 8
    // being alphabetised into 1, 2, 4, 8 — which breaks as soon as there is a 10.
    const na = Number(a.group), nb = Number(b.group);
    return !isNaN(na) && !isNaN(nb) ? na - nb : String(a.group).localeCompare(String(b.group));
  });
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
