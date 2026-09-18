'use client';

// The teacher dashboard for any experiment definition.
//
// One dashboard for every experiment, driven by the definition's chart specs. The sixteen
// hand-written experiments each have their own dashboard file, and keeping them consistent
// was weeks of work — this is that work done once.
//
// Follows the bRMS standard the rest of the site now shares: compact left-aligned header
// with the counts underneath, right-aligned button group, amber reserved for mock data,
// and every chart behind a Reveal so a class can predict the result before seeing it.

import { useCallback, useEffect, useRef, useState, FormEvent, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { FlaskConical } from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ErrorBar, ReferenceLine, ResponsiveContainer,
} from 'recharts';
import { verifyPassword } from '@/lib/auth';
import type { ExperimentDefinition, ChartSpec } from './schema';
import {
  aggregate, generateMockRows, measureLabel, ORIGINAL_KEY, ResultRow, seriesNames, statValue,
  unmatchedOriginals, withOriginal,
} from './aggregate';

const BTN = 'px-4 py-2 text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg border border-gray-600 transition-colors';
const SERIES_COLORS = ['#a78bfa', '#38bdf8', '#fbbf24', '#34d399', '#f472b6'];

function ChartCard({ title, description, children }: {
  title: string;
  description?: string;
  children: (revealed: boolean) => ReactNode;
}) {
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6">
      <div className="flex justify-between items-center mb-4 gap-4">
        <div>
          <h3 className="font-semibold text-gray-200">{title}</h3>
          {description && <p className="text-sm text-gray-500 mt-1">{description}</p>}
        </div>
        <button onClick={() => setRevealed(r => !r)}
          className="text-xs px-3 py-1 rounded-full border border-gray-600 text-gray-400 hover:border-purple-400 hover:text-purple-400 transition-colors">
          {revealed ? 'Hide' : 'Reveal'}
        </button>
      </div>
      {children(revealed)}
    </div>
  );
}

/**
 * Most bars a chart will draw.
 *
 * A chart draws one bar per distinct value of `groupBy`. Grouped by a condition that is
 * three; grouped by a per-item field — a word, a stimulus id — it is one per item, and a
 * few hundred bars are both slow to render and impossible to read, which is not a chart
 * anyone can teach from. Truncating and saying so beats freezing the page.
 */
const MAX_GROUPS = 40;

function ChartView({ chart, def, rows, revealed }: {
  chart: ChartSpec; def: ExperimentDefinition; rows: ResultRow[]; revealed: boolean;
}) {
  const all = withOriginal(chart, aggregate(chart, rows));
  const data = all.length > MAX_GROUPS ? all.slice(0, MAX_GROUPS) : all;
  const omitted = all.length - data.length;
  const series = seriesNames(chart, rows);
  const label = measureLabel(chart, def);
  const percentage = chart.measure === 'accuracy' || chart.measure === 'proportion';

  // The paper's own numbers, drawn beside the class's. Only where the chart carries them,
  // and only on the two shapes where a second series reads as a comparison.
  const originalLabel = chart.original?.label ?? 'Original study';
  const showOriginal = !!chart.original && (chart.kind === 'bar' || chart.kind === 'histogram' || chart.kind === 'line');
  const missed = unmatchedOriginals(chart, all);

  // Named rather than silent: a truncated chart that does not say so is a misread waiting
  // to happen, and the fix is usually to group by a condition instead of a per-item field.
  const note = (
    <>
      {omitted > 0 && (
        <p className="text-xs text-amber-400/80 mb-2">
          Showing the first {MAX_GROUPS} of {all.length} groups — &ldquo;{chart.groupBy}&rdquo; has too many
          distinct values to plot. Group by a condition for a chart a class can read.
        </p>
      )}
      {chart.original && !showOriginal && (
        <p className="text-xs text-amber-400/80 mb-2">
          This chart carries the original study&rsquo;s numbers, but a {chart.kind} chart has nowhere to
          put them. Use a bar or line chart to compare against {chart.original.source}.
        </p>
      )}
      {missed.length > 0 && (
        <p className="text-xs text-amber-400/80 mb-2">
          The original study has {missed.length === 1 ? 'a figure' : 'figures'} for{' '}
          {missed.map(m => `"${m}"`).join(', ')}, which {missed.length === 1 ? 'is' : 'are'} not a group on
          this chart, so {missed.length === 1 ? 'it is' : 'they are'} not drawn.
        </p>
      )}
    </>
  );

  const axes = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
      <XAxis dataKey="group" stroke="#9ca3af"
        label={chart.xLabel ? { value: chart.xLabel, position: 'insideBottom', offset: -4, fill: '#9ca3af' } : undefined} />
      <YAxis stroke="#9ca3af" domain={percentage ? [0, 100] : ['auto', 'auto']}
        label={{ value: label, angle: -90, position: 'insideLeft', fill: '#9ca3af' }} />
      <Tooltip contentStyle={{ background: '#111827', border: '1px solid #374151' }} />
      {/* Top, or the legend overlaps the axis label. */}
      <Legend verticalAlign="top" />
      {chart.referenceLine !== undefined && (
        <ReferenceLine y={chart.referenceLine} stroke="#6b7280" strokeDasharray="6 4" />
      )}
    </>
  );

  if (chart.kind === 'line') {
    return (
      <>
      {note}
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          {axes}
          {/* Drawn first and always, like the bars: dashed and muted, because it is the
              paper's reported course rather than anything measured in this room. */}
          {showOriginal && (
            <Line type="monotone" dataKey={ORIGINAL_KEY} name={originalLabel} stroke="#6b7280"
              strokeWidth={2} strokeDasharray="6 4" dot={{ r: 3 }} connectNulls />
          )}
          {revealed && (series.length
            ? series.map((s, i) => (
                <Line key={s} type="monotone" dataKey={s} name={s}
                  stroke={SERIES_COLORS[i % SERIES_COLORS.length]} strokeWidth={2} dot={{ r: 4 }} />
              ))
            : <Line type="monotone" dataKey="value" name={label} stroke="#a78bfa" strokeWidth={2} dot={{ r: 4 }} />)}
        </LineChart>
      </ResponsiveContainer>
      {chart.original && (
        <p className="text-xs text-gray-600 mt-2">{originalLabel}: {chart.original.source}</p>
      )}
      </>
    );
  }

  if (chart.kind === 'scatter') {
    return (
      <>
      {note}
      <ResponsiveContainer width="100%" height={300}>
        <ScatterChart>
          {axes}
          {revealed && <Scatter data={data} dataKey="value" name={label} fill="#a78bfa" />}
        </ScatterChart>
      </ResponsiveContainer>
      </>
    );
  }

  // Bar covers 'bar' and 'histogram'; a histogram here is one bar per participant.
  return (
    <>
    {note}
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data}>
        {axes}
        {/* First child, so it draws on the LEFT of each group, and never gated on Reveal:
            the published result is what the class reads and predicts from, and their own
            data is what appears beside it when the lecturer reveals. */}
        {showOriginal && (
          <Bar dataKey={ORIGINAL_KEY} name={originalLabel} fill="#6b7280" />
        )}
        {revealed && (series.length
          ? series.map((s, i) => (
              <Bar key={s} dataKey={s} name={s} fill={SERIES_COLORS[i % SERIES_COLORS.length]}>
                {chart.errorBars !== false && (
                  <ErrorBar dataKey={`${s}__sem`} width={4} strokeWidth={1.5} stroke="#6b7280" direction="y" />
                )}
              </Bar>
            ))
          : (
            <Bar dataKey="value" name={label} fill="#a78bfa">
              {chart.errorBars !== false && (
                <ErrorBar dataKey="sem" width={4} strokeWidth={1.5} stroke="#6b7280" direction="y" />
              )}
            </Bar>
          ))}
      </BarChart>
    </ResponsiveContainer>
    {chart.original && (
      <p className="text-xs text-gray-600 mt-2">{originalLabel}: {chart.original.source}</p>
    )}
    </>
  );
}

export function Dashboard({ definition, fetchRows }: {
  definition: ExperimentDefinition;
  /** Supplied by the route, so this component never knows where data is stored. */
  fetchRows: () => Promise<ResultRow[]>;
}) {
  const router = useRouter();
  const [authed, setAuthed] = useState(false);
  const [pwInput, setPwInput] = useState('');
  const [pwError, setPwError] = useState(false);
  const [allRows, setAllRows] = useState<ResultRow[]>([]);
  const [useMock, setUseMock] = useState(false);
  const [loading, setLoading] = useState(false);
  // Results carry the published version they ran under. When several are present, mixing
  // them in one chart can look like an effect that is really an edit, so they can be
  // narrowed to the newest — shown, never done silently.
  const [newestOnly, setNewestOnly] = useState(false);

  const revisions = [...new Set(
    allRows.map(r => r.definition_revision).filter((v): v is number => typeof v === 'number'),
  )].sort((a, b) => a - b);
  const newestRevision = revisions.length ? revisions[revisions.length - 1] : null;
  const rows = newestOnly && newestRevision !== null
    ? allRows.filter(r => r.definition_revision === newestRevision)
    : allRows;

  useEffect(() => {
    if (sessionStorage.getItem('ss_teacher_authed') === '1') setAuthed(true);
  }, []);

  // Which load is the current one. Mock rows are produced synchronously while a real fetch
  // takes as long as the network does, so without this the fetch started before Mock Data
  // was switched on resolves afterwards and replaces the mock rows — the badge still reads
  // "mock data" while the chart shows the real (usually empty) set. A lecturer
  // demonstrating an effect watches it vanish a second after it appears.
  const loadId = useRef(0);

  const load = useCallback(async () => {
    const id = ++loadId.current;
    if (useMock) { setAllRows(generateMockRows(definition)); return; }
    setLoading(true);
    try {
      const fetched = await fetchRows();
      if (id === loadId.current) setAllRows(fetched);
    } catch {
      if (id === loadId.current) setAllRows([]);
    }
    if (id === loadId.current) setLoading(false);
  }, [useMock, definition, fetchRows]);

  useEffect(() => { if (authed) void load(); }, [authed, load]);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    if (await verifyPassword(pwInput)) {
      sessionStorage.setItem('ss_teacher_authed', '1');
      setAuthed(true);
    } else {
      setPwError(true);
      setPwInput('');
    }
  };

  function downloadCsv() {
    if (rows.length === 0) return;
    const cols = [...new Set(rows.flatMap(r => Object.keys(r)))];
    const body = rows.map(r => cols.map(c => JSON.stringify(r[c] ?? '')).join(','));
    const csv = [cols.join(','), ...body].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${definition.slug}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!authed) {
    return (
      <main className="min-h-screen bg-[#0f172a] flex items-center justify-center px-6">
        <div className="bg-gray-900 border border-gray-700 rounded-2xl p-10 w-full max-w-sm flex flex-col items-center gap-6">
          <FlaskConical className="w-10 h-10 text-purple-400" />
          <h1 className="text-xl font-bold text-gray-100">Teacher Dashboard</h1>
          <form onSubmit={handleLogin} className="w-full flex flex-col gap-3">
            <input type="password" value={pwInput} autoFocus placeholder="Password"
              onChange={e => { setPwInput(e.target.value); setPwError(false); }}
              className={`w-full px-4 py-3 rounded-lg border bg-gray-800 text-white outline-none transition-colors
                ${pwError ? 'border-red-500' : 'border-gray-600 focus:border-purple-400'}`} />
            {pwError && <p className="text-red-400 text-sm text-center">Incorrect password</p>}
            <button type="submit" className="w-full py-3 bg-purple-500 hover:bg-purple-400 text-white font-bold rounded-lg">
              Enter
            </button>
          </form>
        </div>
      </main>
    );
  }

  const participants = new Set(rows.map(r => r.session_id)).size;

  return (
    <main className="min-h-screen bg-[#0f172a] px-6 py-8">
      <div className="max-w-5xl mx-auto">
        {/* Site-standard header: compact title, counts underneath, buttons right. */}
        <div className="flex items-start gap-3 flex-wrap mb-6">
          <FlaskConical className="w-7 h-7 text-purple-400 flex-shrink-0 mt-0.5" />
          <div>
            <h1 className="text-2xl font-bold text-gray-100">{definition.title}</h1>
            <p className="text-sm text-purple-400 mt-0.5">
              {participants} participants · {rows.length} trials
              {useMock && (
                <span className="ml-2 text-xs px-2 py-0.5 rounded-full border border-amber-400 bg-amber-500/20 text-amber-400">
                  mock data
                </span>
              )}
              {revisions.length > 1 && (
                <span className="ml-2 text-xs px-2 py-0.5 rounded-full border border-amber-400 bg-amber-500/20 text-amber-400">
                  {revisions.length} versions
                </span>
              )}
            </p>
          </div>
          {/* ml-auto keeps these right-aligned when they wrap under a long title. */}
          <div className="flex gap-3 flex-wrap ml-auto">
            {revisions.length > 1 && (
              <button onClick={() => setNewestOnly(v => !v)}
                className={newestOnly
                  ? 'px-4 py-2 text-sm rounded-lg border bg-amber-500/20 border-amber-400 text-amber-400'
                  : BTN}>
                {newestOnly ? `Version ${newestRevision} only` : 'All versions'}
              </button>
            )}
            <button onClick={() => setUseMock(m => !m)}
              className={useMock
                ? 'px-4 py-2 text-sm rounded-lg border bg-amber-500/20 border-amber-400 text-amber-400'
                : BTN}>
              Mock Data
            </button>
            <button onClick={load} className={BTN}>Refresh</button>
            <button onClick={downloadCsv} className={BTN}>Download CSV</button>
            <button onClick={() => router.push('/')} className={BTN}>Home</button>
          </div>
        </div>

        {definition.correctMeans && (
          <p className="text-xs text-gray-500 mb-4">
            This task has no correct answer — &ldquo;accuracy&rdquo; here means {definition.correctMeans.toLowerCase()}.
          </p>
        )}

        {/* Said out loud rather than filtered away: a difference between two versions of the
            experiment can read as an effect of the experiment. */}
        {revisions.length > 1 && !newestOnly && (
          <p className="text-xs text-amber-400/90 mb-4">
            These results come from {revisions.length} published versions of this experiment
            (v{revisions[0]}–v{newestRevision}). A change between versions can look like a result —
            switch to &ldquo;Version {newestRevision} only&rdquo; to see just the newest.
          </p>
        )}

        {loading ? (
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-10 text-center text-gray-400">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-10 text-center">
            <p className="text-gray-400">No data yet.</p>
            <p className="text-sm text-gray-600 mt-1">
              Turn on <span className="text-amber-400">Mock Data</span> to demonstrate the effect with no participants.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {definition.dashboard.stats?.length ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {definition.dashboard.stats.map((stat, i) => {
                  const value = statValue(stat, rows);
                  const shown = value === null
                    ? '—'
                    : `${stat.signed && value >= 0 ? '+' : ''}${Math.round(value)}${stat.unit ?? ''}`;
                  return (
                    <div key={i} className="bg-gray-900 border border-gray-700 rounded-2xl p-5">
                      <p className="text-sm text-gray-500 mb-1">{stat.label}</p>
                      <p className="text-2xl font-bold text-gray-100">{shown}</p>
                    </div>
                  );
                })}
              </div>
            ) : null}
            {definition.dashboard.charts.map((chart, i) => (
              <ChartCard key={i} title={chart.title} description={chart.description}>
                {revealed => <ChartView chart={chart} def={definition} rows={rows} revealed={revealed} />}
              </ChartCard>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
