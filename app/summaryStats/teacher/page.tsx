'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, ErrorBar, Legend,
  ScatterChart, Scatter, ZAxis, Cell,
} from 'recharts';
import { Eye, Download, Home, RefreshCw } from 'lucide-react';
import { getSupabase } from '@/lib/supabase';
import { computeTeacherData, TeacherData, ScatterPoint } from '@/lib/summary-stats/analysis';
import { TrialResult } from '@/types/summary-stats';
import { generateMockData } from '@/lib/summary-stats/mock-data';
import { verifyPassword } from '@/lib/auth';

const BG   = { background: '#111827', border: '1px solid #374151', borderRadius: 6 };
const TICK = { fill: '#9ca3af', fontSize: 11 };
const LBL  = { fill: '#9ca3af', fontSize: 11 };

const ScatterTooltip = ({ active, payload }: { active?: boolean; payload?: { payload: ScatterPoint }[] }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={BG} className="px-3 py-2 text-xs text-white shadow">
      <p className="font-semibold">{d.name}</p>
      <p>Ensemble Acc: {d.x}%</p>
      <p>Recognition Acc: {d.y}%</p>
    </div>
  );
};

const Dot = (props: { cx?: number; cy?: number }) => {
  const { cx = 0, cy = 0 } = props;
  return <circle cx={cx} cy={cy} r={6} fill="#a78bfa" stroke="#fff" strokeWidth={1.5} opacity={0.85} />;
};

// Recharts tooltip formatter — use 'as any' to satisfy strict Formatter type
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pctFmt = (v: any): any => v != null ? [`${Number(v).toFixed(1)}%`, ''] : ['', ''];

export default function TeacherPage() {
  const router = useRouter();
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData]             = useState<TeacherData | null>(null);
  const [error, setError]           = useState<string | null>(null);

  // Auth
  const [authed, setAuthed]   = useState(false);
  const [pwInput, setPwInput] = useState('');
  const [pwError, setPwError] = useState(false);
  const [useMock, setUseMock] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem('ss_teacher_authed') === '1') setAuthed(true);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await verifyPassword(pwInput)) {
      sessionStorage.setItem('ss_teacher_authed', '1');
      setAuthed(true);
    } else {
      setPwError(true);
      setPwInput('');
    }
  };

  // Supabase enforces a server-side max of 1000 rows per request regardless of .limit().
  // Paginate in batches until we get a partial page (meaning we've reached the end).
  const fetchAllRows = useCallback(async (supabase: ReturnType<typeof getSupabase>) => {
    if (!supabase) throw new Error('Supabase client not available. Check environment variables.');
    const PAGE = 1000;
    const all: TrialResult[] = [];
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from('summary_stats_results')
        .select('*')
        .order('created_at', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw new Error(`Database error: ${error.message}`);
      if (data) all.push(...(data as TrialResult[]));
      if (!data || data.length < PAGE) break;
      from += PAGE;
    }
    return all;
  }, []);

  const fetchData = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const supabase = getSupabase();
      const rows = await fetchAllRows(supabase);

      if (rows && rows.length > 0) {
        const result = computeTeacherData(rows as TrialResult[]);
        setData(result);
      } else {
        setData(null);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('Teacher fetchData error:', e);
      setError(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadMockData = useCallback(() => {
    setError(null);
    setData(computeTeacherData(generateMockData()));
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    if (!authed) return;
    if (useMock) loadMockData();
    else fetchData();
  }, [authed, useMock, fetchData, loadMockData]);

  const handleDownloadCSV = async () => {
    try {
      const supabase = getSupabase();
      if (!supabase) return;
      const rows = await fetchAllRows(supabase);
      if (!rows.length) return;
      const headers = Object.keys(rows[0]).join(',');
      const csv = [headers, ...rows.map(r => Object.values(r as unknown as Record<string, unknown>).join(','))].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'ensemble-data.csv'; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { console.error(e); }
  };

  // ── Auth gate ──────────────────────────────────────────────────────────────
  if (!authed) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="bg-gray-900 border border-gray-700 rounded-2xl p-10 w-full max-w-sm flex flex-col items-center gap-6"
        >
          <Eye className="w-10 h-10 text-purple-400" />
          <h1 className="text-xl font-bold text-white">Teacher Dashboard</h1>
          <form onSubmit={handleLogin} className="w-full flex flex-col gap-3">
            <input type="password" value={pwInput} autoFocus
              onChange={e => { setPwInput(e.target.value); setPwError(false); }}
              placeholder="Password"
              className={`w-full px-4 py-3 rounded-xl border text-white bg-gray-800 outline-none transition-colors
                ${pwError ? 'border-red-500' : 'border-gray-600 focus:border-purple-400'}`}
            />
            {pwError && <p className="text-red-400 text-sm text-center">Incorrect password</p>}
            <button type="submit" className="w-full py-3 bg-purple-500 hover:bg-purple-400 text-white font-bold rounded-xl transition-colors">
              Enter
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  // ── Main dashboard ─────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0f172a] text-white">
      <div className="container mx-auto px-4 py-8 max-w-5xl">

        {/* Header */}
        <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Eye className="w-7 h-7 text-purple-400" />
              <h1 className="text-2xl font-bold">Teacher Dashboard — Ensemble Perception</h1>
            </div>
            {!loading && data && (
              <p className="text-purple-400 font-medium">
                {data.nParticipants} participant{data.nParticipants !== 1 ? 's' : ''}
                {useMock && <span className="text-amber-400 ml-2">(mock data)</span>}
              </p>
            )}
          </div>
          <div className="flex gap-3 flex-wrap">
            <button onClick={() => setUseMock(v => !v)}
              className={`px-4 py-2 text-sm rounded-lg border transition-colors ${
                useMock
                  ? 'bg-amber-500/20 border-amber-400 text-amber-400'
                  : 'bg-gray-800 border-gray-600 text-gray-300 hover:bg-gray-700'
              }`}>
              {useMock ? 'Mock Data ON' : 'Mock Data'}
            </button>
            <button onClick={fetchData} disabled={refreshing || useMock}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg border border-gray-600 disabled:opacity-40">
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button onClick={handleDownloadCSV}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg border border-gray-600">
              <Download className="w-4 h-4" />
              Download CSV
            </button>
            <button onClick={() => router.push('/')}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg border border-gray-600">
              <Home className="w-4 h-4" />
              Home
            </button>
          </div>
        </div>

        {/* Error state */}
        {error && (
          <div className="bg-red-900/40 border border-red-700 rounded-xl p-4 mb-6">
            <p className="text-red-300 text-sm font-semibold mb-1">Error loading data</p>
            <p className="text-red-400 text-xs font-mono">{error}</p>
          </div>
        )}

        {loading ? (
          <p className="text-center text-gray-400 py-20 text-lg">Loading…</p>
        ) : !data || data.nParticipants === 0 ? (
          <p className="text-center text-gray-500 py-20 text-lg">No data yet</p>
        ) : (
          <div className="flex flex-col gap-6">

            {/* ── Chart 1: Recognition & ensemble accuracy by stimulus type ── */}
            <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6">
              <h2 className="text-base font-bold mb-1">Overall Accuracy by Stimulus Type</h2>
              <p className="text-xs text-gray-400 mb-4">
                Both tasks binary, 50% = chance. Mean assessment hit = error ≤ range/4 (circles ≤15 px, lines ≤40 px). Error bars = SEM.
              </p>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data.chart1} margin={{ left: 10, bottom: 5 }} barCategoryGap="25%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="name" tick={TICK} />
                  <YAxis domain={[0, 100]} tick={TICK}
                    label={{ value: 'Accuracy (%)', angle: -90, position: 'insideLeft', style: LBL }} />
                  <Tooltip contentStyle={BG} formatter={pctFmt} />
                  <ReferenceLine y={50} stroke="#6b7280" strokeDasharray="6 3"
                    label={{ value: 'Chance (50%)', position: 'right', style: { fontSize: 10, fill: '#6b7280' } }} />
                  <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 12 }} />
                  <Bar dataKey="recognition" name="Recognition" fill="#f97316" radius={[4, 4, 0, 0]}>
                    <ErrorBar dataKey="recognitionSEM" width={4} strokeWidth={2} stroke="#c2410c" direction="y" />
                  </Bar>
                  <Bar dataKey="ensemble" name="Mean Assessment" fill="#34d399" radius={[4, 4, 0, 0]}>
                    <ErrorBar dataKey="ensembleSEM" width={4} strokeWidth={2} stroke="#059669" direction="y" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* ── Charts 2 & 3: set-size effects ── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

              {/* Chart 2: Recognition × set size */}
              <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6">
                <h2 className="text-base font-bold mb-4">Recognition Accuracy × Set Size</h2>
                <ResponsiveContainer width="100%" height={230}>
                  <LineChart data={data.chart2} margin={{ left: 10, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="setSize" tick={TICK}
                      label={{ value: 'Set Size', position: 'insideBottom', offset: -12, style: LBL }} />
                    <YAxis domain={[0, 100]} tick={TICK}
                      label={{ value: 'Accuracy (%)', angle: -90, position: 'insideLeft', style: LBL }} />
                    <Tooltip contentStyle={BG} formatter={pctFmt} />
                    <ReferenceLine y={50} stroke="#6b7280" strokeDasharray="4 3" />
                    <Legend verticalAlign="top" wrapperStyle={{ color: '#9ca3af', fontSize: 11, paddingBottom: 6 }} />
                    <Line type="monotone" dataKey="circles" name="Circles" stroke="#f97316" strokeWidth={2.5}
                      dot={{ r: 5, fill: '#f97316' }} connectNulls />
                    <Line type="monotone" dataKey="lines" name="Lines" stroke="#a78bfa" strokeWidth={2.5}
                      dot={{ r: 5, fill: '#a78bfa' }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Chart 3: Ensemble × set size */}
              <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6">
                <h2 className="text-base font-bold mb-4">Mean Assessment Accuracy × Set Size</h2>
                <ResponsiveContainer width="100%" height={230}>
                  <LineChart data={data.chart3} margin={{ left: 10, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="setSize" tick={TICK}
                      label={{ value: 'Set Size', position: 'insideBottom', offset: -12, style: LBL }} />
                    <YAxis domain={[0, 100]} tick={TICK}
                      label={{ value: 'Accuracy (%)', angle: -90, position: 'insideLeft', style: LBL }} />
                    <Tooltip contentStyle={BG} formatter={pctFmt} />
                    <Legend verticalAlign="top" wrapperStyle={{ color: '#9ca3af', fontSize: 11, paddingBottom: 6 }} />
                    <Line type="monotone" dataKey="circles" name="Circles" stroke="#34d399" strokeWidth={2.5}
                      dot={{ r: 5, fill: '#34d399' }} connectNulls />
                    <Line type="monotone" dataKey="lines" name="Lines" stroke="#60a5fa" strokeWidth={2.5}
                      dot={{ r: 5, fill: '#60a5fa' }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* ── Chart 4: Recognition × probe type ── */}
            <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6">
              <h2 className="text-base font-bold mb-1">Recognition Accuracy × Probe Type</h2>
              <p className="text-xs text-gray-400 mb-4">
                Target = shown item; Foil-mean = exact set mean (not shown); Foil-non-mean = other non-member. 50% = chance.
              </p>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data.chart4} margin={{ left: 10, bottom: 5 }} barCategoryGap="20%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="name" tick={TICK} />
                  <YAxis domain={[0, 100]} tick={TICK}
                    label={{ value: 'Accuracy (%)', angle: -90, position: 'insideLeft', style: LBL }} />
                  <Tooltip contentStyle={BG} formatter={pctFmt} />
                  <ReferenceLine y={50} stroke="#6b7280" strokeDasharray="6 3"
                    label={{ value: 'Chance (50%)', position: 'right', style: { fontSize: 10, fill: '#6b7280' } }} />
                  <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 11 }} />
                  <Bar dataKey="target" name="Target" fill="#34d399" radius={[4, 4, 0, 0]}>
                    <ErrorBar dataKey="targetSEM" width={4} strokeWidth={2} stroke="#059669" direction="y" />
                  </Bar>
                  <Bar dataKey="foil_mean" name="Foil (mean)" fill="#fb923c" radius={[4, 4, 0, 0]}>
                    <ErrorBar dataKey="foil_meanSEM" width={4} strokeWidth={2} stroke="#c2410c" direction="y" />
                  </Bar>
                  <Bar dataKey="foil_nm" name="Foil (non-mean)" fill="#e879f9" radius={[4, 4, 0, 0]}>
                    <ErrorBar dataKey="foil_nmSEM" width={4} strokeWidth={2} stroke="#a21caf" direction="y" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* ── Chart 5: Scatter per participant ── */}
            <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6">
              <h2 className="text-base font-bold mb-1">Participant Scatter: Mean Assessment vs Recognition Accuracy</h2>
              <p className="text-xs text-gray-400 mb-4">
                Each dot = one participant. Diagonal = equal performance on both tasks.
              </p>
              {data.chart5.length === 0 ? (
                <div className="h-[260px] flex items-center justify-center text-gray-500 text-sm">
                  No participant data yet
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <ScatterChart margin={{ left: 10, bottom: 20, right: 20, top: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="x" type="number" name="Ensemble Acc" domain={[0, 100]}
                      label={{ value: 'Mean Assessment Accuracy (%)', position: 'insideBottom', offset: -12, style: LBL }}
                      tick={TICK}
                    />
                    <YAxis dataKey="y" type="number" name="Recognition Acc" domain={[0, 100]}
                      label={{ value: 'Recognition Accuracy (%)', angle: -90, position: 'insideLeft', style: LBL }}
                      tick={TICK}
                    />
                    <ZAxis range={[60, 60]} />
                    <Tooltip content={<ScatterTooltip />} />
                    {/* Diagonal y=x drawn as a two-point Scatter with line and invisible shape */}
                    <Scatter
                      data={[{ x: 0, y: 0 }, { x: 100, y: 100 }]}
                      line={{ stroke: '#6b7280', strokeWidth: 1.5, strokeDasharray: '6 4' }}
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      shape={(() => <></>) as any}
                      legendType="none"
                      isAnimationActive={false}
                    />
                    <Scatter data={data.chart5} shape={<Dot />}>
                      {data.chart5.map((_, i) => <Cell key={i} fill="#f97316" />)}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              )}
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
