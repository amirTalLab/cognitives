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

import { useCallback, useEffect, useState, FormEvent, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { FlaskConical } from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ErrorBar, ReferenceLine, ResponsiveContainer,
} from 'recharts';
import { verifyPassword } from '@/lib/auth';
import type { ExperimentDefinition, ChartSpec } from './schema';
import { aggregate, generateMockRows, measureLabel, ResultRow, seriesNames } from './aggregate';

const BTN = 'px-4 py-2 text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg border border-gray-600 transition-colors';
const SERIES_COLORS = ['#a78bfa', '#38bdf8', '#fbbf24', '#34d399', '#f472b6'];

function ChartCard({ title, children }: { title: string; children: (revealed: boolean) => ReactNode }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-semibold text-gray-200">{title}</h3>
        <button onClick={() => setRevealed(r => !r)}
          className="text-xs px-3 py-1 rounded-full border border-gray-600 text-gray-400 hover:border-purple-400 hover:text-purple-400 transition-colors">
          {revealed ? 'Hide' : 'Reveal'}
        </button>
      </div>
      {children(revealed)}
    </div>
  );
}

function ChartView({ chart, def, rows, revealed }: {
  chart: ChartSpec; def: ExperimentDefinition; rows: ResultRow[]; revealed: boolean;
}) {
  const data = aggregate(chart, rows);
  const series = seriesNames(chart, rows);
  const label = measureLabel(chart, def);
  const percentage = chart.measure === 'accuracy' || chart.measure === 'proportion';

  const axes = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
      <XAxis dataKey="group" stroke="#9ca3af" />
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
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          {axes}
          {revealed && (series.length
            ? series.map((s, i) => (
                <Line key={s} type="monotone" dataKey={s} name={s}
                  stroke={SERIES_COLORS[i % SERIES_COLORS.length]} strokeWidth={2} dot={{ r: 4 }} />
              ))
            : <Line type="monotone" dataKey="value" name={label} stroke="#a78bfa" strokeWidth={2} dot={{ r: 4 }} />)}
        </LineChart>
      </ResponsiveContainer>
    );
  }

  if (chart.kind === 'scatter') {
    return (
      <ResponsiveContainer width="100%" height={300}>
        <ScatterChart>
          {axes}
          {revealed && <Scatter data={data} dataKey="value" name={label} fill="#a78bfa" />}
        </ScatterChart>
      </ResponsiveContainer>
    );
  }

  // Bar covers 'bar' and 'histogram'; a histogram here is one bar per participant.
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data}>
        {axes}
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
  const [rows, setRows] = useState<ResultRow[]>([]);
  const [useMock, setUseMock] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem('ss_teacher_authed') === '1') setAuthed(true);
  }, []);

  const load = useCallback(async () => {
    if (useMock) { setRows(generateMockRows(definition)); return; }
    setLoading(true);
    try { setRows(await fetchRows()); } catch { setRows([]); }
    setLoading(false);
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
            </p>
          </div>
          {/* ml-auto keeps these right-aligned when they wrap under a long title. */}
          <div className="flex gap-3 flex-wrap ml-auto">
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
            {definition.dashboard.charts.map((chart, i) => (
              <ChartCard key={i} title={chart.title}>
                {revealed => <ChartView chart={chart} def={definition} rows={rows} revealed={revealed} />}
              </ChartCard>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
