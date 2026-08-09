'use client';

import { useEffect, useState, useMemo, FormEvent, useCallback } from 'react';
import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import {
  ComposedChart, BarChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ErrorBar, ReferenceLine,
} from 'recharts';
import { GraduationCap, RefreshCw, Search, Download } from 'lucide-react';
import { getSupabase } from '@/lib/supabase';
import { generateMockData } from '@/lib/visual-search/mock-data';
import { verifyPassword } from '@/lib/auth';

const SS_LEVELS = [1, 2, 4, 8];
const BIN_MS = 100;
const DIST_BINS = [
  { label: 'Near 0–100', min: 0, max: 100 },
  { label: 'Mid 100–200', min: 100, max: 200 },
  { label: 'Far 200–300', min: 200, max: 300 },
  { label: 'Edge 300+', min: 300, max: Infinity },
];

function sem(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance / values.length);
}

function sdCleanRows(rows: Row[]): Row[] {
  const sessions = Array.from(new Set(rows.map(r => r.session_id)));
  const cleaned: Row[] = [];
  for (const sid of sessions) {
    const sRows = rows.filter(r => r.session_id === sid);
    const rts = sRows.filter(r => r.rt_ms != null).map(r => r.rt_ms as number);
    if (rts.length < 2) { cleaned.push(...sRows); continue; }
    const mean = rts.reduce((a, b) => a + b, 0) / rts.length;
    const sd = Math.sqrt(rts.reduce((a, b) => a + (b - mean) ** 2, 0) / (rts.length - 1));
    const lo = mean - 2.5 * sd, hi = mean + 2.5 * sd;
    cleaned.push(...sRows.filter(r => r.rt_ms == null || (r.rt_ms >= lo && r.rt_ms <= hi)));
  }
  return cleaned;
}

function computeHistogram(rows: Row[]): { bin: number; count: number }[] {
  const rts = rows.filter(r => r.correct && r.rt_ms != null).map(r => r.rt_ms as number);
  if (rts.length === 0) return [];
  const minBin = Math.floor(Math.min(...rts) / BIN_MS) * BIN_MS;
  const maxBin = Math.ceil(Math.max(...rts) / BIN_MS) * BIN_MS;
  const points: { bin: number; count: number }[] = [];
  for (let b = minBin; b <= maxBin; b += BIN_MS) {
    points.push({ bin: b, count: rts.filter(rt => rt >= b && rt < b + BIN_MS).length });
  }
  return points;
}

type Row = {
  session_id: string;
  participant_name: string | null;
  trial_number: number | null;
  target_set_size: number;
  distractor_set_size: number;
  target_present: boolean;
  target_color: string | null;
  response: string | null;
  correct: boolean;
  rt_ms: number | null;
  target_distance_from_center: number | null;
  is_practice: boolean;
  created_at: string;
};

interface SetSizePoint {
  setSize: number;
  rt: number | null;
  rtSem: number | null;
  accuracy: number | null;
  accuracySem: number | null;
}

interface PresenceContrastPoint {
  setSize: number;
  contrast: number | null;
  contrastSem: number | null;
}

interface DistanceBinPoint {
  label: string;
  rt: number | null;
  rtSem: number | null;
}

const chartStyle = { background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8 };
const axisStyle = { fill: '#a1a1aa', fontSize: 11 };

function ChartCard({ title, subtitle, children }: {
  title: string;
  subtitle?: string;
  children: (revealed: boolean) => ReactNode;
}) {
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="bg-card border border-border rounded-xl p-6 mb-6">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-200">{title}</h3>
          {subtitle && <p className="text-sm text-muted mt-1">{subtitle}</p>}
        </div>
        <button
          onClick={() => setRevealed(r => !r)}
          className="text-xs px-3 py-1 rounded-full border border-gray-600 text-gray-400 hover:border-rose-400 hover:text-rose-400 transition-colors flex-shrink-0 ml-4"
        >
          {revealed ? 'Hide' : 'Reveal'}
        </button>
      </div>
      {children(revealed)}
    </div>
  );
}

export default function VisualSearchTeacherPage() {
  const [authed, setAuthed] = useState(false);
  const [pwInput, setPwInput] = useState('');
  const [pwError, setPwError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rawRows, setRawRows] = useState<Row[]>([]);
  const [mode, setMode] = useState<'raw' | 'sdclean'>('raw');
  const [useMock, setUseMock] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem('ss_teacher_authed') === '1') setAuthed(true);
  }, []);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    const ok = await verifyPassword(pwInput);
    if (ok) {
      sessionStorage.setItem('ss_teacher_authed', '1');
      setAuthed(true);
    } else {
      setPwError(true);
      setPwInput('');
    }
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = getSupabase();
      if (!supabase) throw new Error('Supabase not available');
      const allData: unknown[] = [];
      let from = 0;
      while (true) {
        const { data: page, error: fetchError } = await supabase
          .from('visual_search_results')
          .select('*')
          .eq('is_practice', false)
          .order('created_at', { ascending: true })
          .range(from, from + 999);
        if (fetchError) throw fetchError;
        if (!page || page.length === 0) break;
        allData.push(...page);
        if (page.length < 1000) break;
        from += 1000;
      }
      const rows = allData as Row[];
      if (rows.length === 0) {
        setError('No data available yet.');
        setLoading(false);
        return;
      }
       
      setRawRows(rows);
    } catch (err) {
      console.error(err);
      setError('Failed to load data.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMockData = useCallback(() => {
    setError(null);
    setRawRows(generateMockData() as unknown as Row[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!authed) return;
    if (useMock) loadMockData();
    else fetchData();
  }, [authed, useMock, fetchData, loadMockData]);

  // ── Derived data ────────────────────────────────────────────────────────────
  const activeRows = useMemo(
    () => mode === 'sdclean' ? sdCleanRows(rawRows) : rawRows,
    [rawRows, mode],
  );
  const excludedCount = rawRows.length - activeRows.length;

  const sessionList = useMemo(
    () => Array.from(new Set(activeRows.map(r => r.session_id))),
    [activeRows],
  );

  const aggStats = useMemo(() => {
    if (activeRows.length === 0) return null;
    return {
      totalParticipants: sessionList.length,
      totalTrials: activeRows.length,
      overallAccuracy: Math.round((activeRows.filter(r => r.correct).length / activeRows.length) * 100),
    };
  }, [activeRows, sessionList]);

  const targetSSData = useMemo<SetSizePoint[]>(() => SS_LEVELS.map(ss => {
    const sessionRTs = sessionList.map(sid => {
      const sRows = activeRows.filter(r => r.session_id === sid && r.target_set_size === ss && r.correct && r.rt_ms != null);
      return sRows.length > 0 ? sRows.reduce((s, r) => s + (r.rt_ms ?? 0), 0) / sRows.length : null;
    }).filter((v): v is number => v !== null);
    const sessionAccs = sessionList.map(sid => {
      const sRows = activeRows.filter(r => r.session_id === sid && r.target_set_size === ss);
      return sRows.length > 0 ? sRows.filter(r => r.correct).length / sRows.length * 100 : null;
    }).filter((v): v is number => v !== null);
    return {
      setSize: ss,
      rt: sessionRTs.length > 0 ? Math.round(sessionRTs.reduce((a, b) => a + b) / sessionRTs.length) : null,
      rtSem: Math.round(sem(sessionRTs)),
      accuracy: sessionAccs.length > 0 ? Math.round(sessionAccs.reduce((a, b) => a + b) / sessionAccs.length) : null,
      accuracySem: Math.round(sem(sessionAccs) * 10) / 10,
    };
  }), [activeRows, sessionList]);

  const distractorSSData = useMemo<SetSizePoint[]>(() => SS_LEVELS.map(ss => {
    const sessionRTs = sessionList.map(sid => {
      const sRows = activeRows.filter(r => r.session_id === sid && r.distractor_set_size === ss && r.correct && r.rt_ms != null);
      return sRows.length > 0 ? sRows.reduce((s, r) => s + (r.rt_ms ?? 0), 0) / sRows.length : null;
    }).filter((v): v is number => v !== null);
    const sessionAccs = sessionList.map(sid => {
      const sRows = activeRows.filter(r => r.session_id === sid && r.distractor_set_size === ss);
      return sRows.length > 0 ? sRows.filter(r => r.correct).length / sRows.length * 100 : null;
    }).filter((v): v is number => v !== null);
    return {
      setSize: ss,
      rt: sessionRTs.length > 0 ? Math.round(sessionRTs.reduce((a, b) => a + b) / sessionRTs.length) : null,
      rtSem: Math.round(sem(sessionRTs)),
      accuracy: sessionAccs.length > 0 ? Math.round(sessionAccs.reduce((a, b) => a + b) / sessionAccs.length) : null,
      accuracySem: Math.round(sem(sessionAccs) * 10) / 10,
    };
  }), [activeRows, sessionList]);

  const contrastData = useMemo<PresenceContrastPoint[]>(() => SS_LEVELS.map(ss => {
    const sessionContrasts = sessionList.map(sid => {
      const presRows = activeRows.filter(r => r.session_id === sid && r.target_set_size === ss && r.target_present && r.correct && r.rt_ms != null);
      const absRows = activeRows.filter(r => r.session_id === sid && r.target_set_size === ss && !r.target_present && r.correct && r.rt_ms != null);
      if (presRows.length === 0 || absRows.length === 0) return null;
      const presRT = presRows.reduce((s, r) => s + (r.rt_ms ?? 0), 0) / presRows.length;
      const absRT = absRows.reduce((s, r) => s + (r.rt_ms ?? 0), 0) / absRows.length;
      return presRT - absRT;
    }).filter((v): v is number => v !== null);
    return {
      setSize: ss,
      contrast: sessionContrasts.length > 0 ? Math.round(sessionContrasts.reduce((a, b) => a + b) / sessionContrasts.length) : null,
      contrastSem: Math.round(sem(sessionContrasts)),
    };
  }), [activeRows, sessionList]);

  const distanceData = useMemo<DistanceBinPoint[]>(() => DIST_BINS.map(({ label, min, max }) => {
    const sessionRTs = sessionList.map(sid => {
      const binRows = activeRows.filter(r =>
        r.session_id === sid && r.target_present && r.correct && r.rt_ms != null &&
        r.target_distance_from_center != null &&
        (r.target_distance_from_center ?? 0) >= min &&
        (r.target_distance_from_center ?? 0) < max
      );
      return binRows.length > 0 ? binRows.reduce((s, r) => s + (r.rt_ms ?? 0), 0) / binRows.length : null;
    }).filter((v): v is number => v !== null);
    return {
      label,
      rt: sessionRTs.length > 0 ? Math.round(sessionRTs.reduce((a, b) => a + b) / sessionRTs.length) : null,
      rtSem: Math.round(sem(sessionRTs)),
    };
  }), [activeRows, sessionList]);

  const colorContrastData = useMemo(() => {
    const colorOf = (sid: string) => activeRows.find(r => r.session_id === sid)?.target_color ?? null;
    return SS_LEVELS.map(ss => {
      const blueRTs = sessionList
        .filter(sid => colorOf(sid) === 'blue')
        .map(sid => {
          const sRows = activeRows.filter(r => r.session_id === sid && r.target_set_size === ss && r.correct && r.rt_ms != null);
          return sRows.length > 0 ? sRows.reduce((s, r) => s + (r.rt_ms ?? 0), 0) / sRows.length : null;
        }).filter((v): v is number => v !== null);
      const redRTs = sessionList
        .filter(sid => colorOf(sid) === 'red')
        .map(sid => {
          const sRows = activeRows.filter(r => r.session_id === sid && r.target_set_size === ss && r.correct && r.rt_ms != null);
          return sRows.length > 0 ? sRows.reduce((s, r) => s + (r.rt_ms ?? 0), 0) / sRows.length : null;
        }).filter((v): v is number => v !== null);
      if (blueRTs.length === 0 || redRTs.length === 0) return { setSize: ss, contrast: null as number | null, contrastSem: null as number | null };
      const blueRT = blueRTs.reduce((a, b) => a + b) / blueRTs.length;
      const redRT = redRTs.reduce((a, b) => a + b) / redRTs.length;
      return {
        setSize: ss,
        contrast: Math.round(blueRT - redRT),
        contrastSem: Math.round(Math.sqrt(sem(blueRTs) ** 2 + sem(redRTs) ** 2)),
      };
    });
  }, [activeRows, sessionList]);

  const rtHistogram = useMemo(() => computeHistogram(activeRows), [activeRows]);

  function downloadCSV() {
    if (rawRows.length === 0) return;
    const headers = Object.keys(rawRows[0]).join(',');
    const csvRows = rawRows.map(r =>
      Object.values(r as unknown as Record<string, unknown>)
        .map(v => {
          if (v === null || v === undefined) return '';
          const s = String(v);
          return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(',')
    );
    const blob = new Blob([headers + '\n' + csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'visual_search_results.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Auth screen ──────────────────────────────────────────────────────────
  if (!authed) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-border rounded-xl p-10 w-full max-w-sm flex flex-col items-center gap-6"
        >
          <Search className="w-10 h-10 text-rose-400" />
          <h1 className="text-xl font-bold">Teacher Dashboard</h1>
          <form onSubmit={handleLogin} className="w-full flex flex-col gap-3">
            <input
              type="password"
              value={pwInput}
              onChange={(e) => { setPwInput(e.target.value); setPwError(false); }}
              placeholder="Password"
              autoFocus
              className={`w-full px-4 py-3 rounded-lg border bg-zinc-800 text-white outline-none transition-colors
                ${pwError ? 'border-red-500' : 'border-border focus:border-rose-400'}`}
            />
            {pwError && <p className="text-red-400 text-sm text-center">Incorrect password</p>}
            <button
              type="submit"
              className="w-full py-3 bg-rose-500 hover:bg-rose-400 text-white font-bold rounded-lg transition-colors"
            >
              Enter
            </button>
          </form>
        </motion.div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            className="inline-block mb-4"
          >
            <RefreshCw className="w-8 h-8 text-rose-400" />
          </motion.div>
          <p className="text-muted">Loading data...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <GraduationCap className="w-10 h-10 text-rose-400" />
            <div>
              <h1 className="text-4xl font-bold tracking-tight">Teacher Dashboard</h1>
              <p className="text-muted mt-1">
                Visual Search – Aggregate Results
                {useMock && <span className="text-amber-400 ml-2">(mock data)</span>}
              </p>
            </div>
          </div>
          <div className="flex gap-3 flex-wrap">
            <button
              onClick={() => setUseMock(v => !v)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border font-semibold transition-colors ${
                useMock
                  ? 'bg-amber-500/20 border-amber-400 text-amber-400'
                  : 'bg-card border-border text-gray-300 hover:border-rose-400 hover:text-rose-400'
              }`}
            >
              {useMock ? 'Mock Data ON' : 'Mock Data'}
            </button>
            {rawRows.length > 0 && (
              <button
                onClick={downloadCSV}
                className="flex items-center gap-2 px-4 py-2 bg-card border border-border text-gray-300
                           font-semibold rounded-lg hover:border-rose-400 hover:text-rose-400 transition-colors"
              >
                <Download className="w-4 h-4" />
                Download CSV
              </button>
            )}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={fetchData}
              disabled={useMock}
              className="flex items-center gap-2 px-4 py-2 bg-rose-500 text-white
                         font-semibold rounded-lg hover:bg-rose-400 transition-colors disabled:opacity-40"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh Data
            </motion.button>
          </div>
        </div>

        {/* Mode toggle */}
        {rawRows.length > 0 && (
          <div className="flex flex-col items-center gap-2 mb-8">
            <div className="flex rounded-xl border border-border bg-card overflow-hidden">
              <button
                onClick={() => setMode('raw')}
                className={`px-5 py-2 text-sm font-medium transition-colors ${
                  mode === 'raw' ? 'bg-rose-500 text-white' : 'text-muted hover:text-foreground'
                }`}
              >
                Raw Data
              </button>
              <button
                onClick={() => setMode('sdclean')}
                className={`px-5 py-2 text-sm font-medium transition-colors ${
                  mode === 'sdclean' ? 'bg-rose-500 text-white' : 'text-muted hover:text-foreground'
                }`}
              >
                SD-Clean (±2.5)
              </button>
            </div>
            <p className="text-xs text-muted h-4">
              {mode === 'sdclean'
                ? excludedCount > 0
                  ? `${excludedCount} trial${excludedCount > 1 ? 's' : ''} excluded across all participants (${activeRows.length} of ${rawRows.length} kept)`
                  : 'No trials excluded'
                : `${rawRows.length} trials`}
            </p>
          </div>
        )}

        {error && (
          <div className="bg-card border border-yellow-500/50 rounded-xl p-8 mb-8 text-center">
            <p className="text-yellow-400 mb-4">{error}</p>
            <button onClick={fetchData} className="px-4 py-2 bg-rose-500 text-white font-semibold rounded-lg hover:bg-rose-400">
              Retry
            </button>
          </div>
        )}

        {aggStats && (
          <>
            {/* Stats cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <div className="bg-card border border-border rounded-xl p-6">
                <p className="text-sm text-muted mb-1">Participants</p>
                <p className="text-3xl font-bold">{aggStats.totalParticipants}</p>
              </div>
              <div className="bg-card border border-border rounded-xl p-6">
                <p className="text-sm text-muted mb-1">Total Trials</p>
                <p className="text-3xl font-bold text-blue-400">{aggStats.totalTrials}</p>
              </div>
              <div className="bg-card border border-border rounded-xl p-6">
                <p className="text-sm text-muted mb-1">Overall Accuracy</p>
                <p className="text-3xl font-bold text-rose-400">{aggStats.overallAccuracy}%</p>
              </div>
            </div>

            {/* Chart (a): RT & accuracy vs target set size */}
            <ChartCard
              title="(a) RT & Accuracy vs Target Set Size"
              subtitle="Target-colored items in display (including target T when present). Error bars = SEM across participants."
            >
              {(revealed) => (
                <ResponsiveContainer width="100%" height={280}>
                  <ComposedChart data={targetSSData} margin={{ left: 10, right: 40, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                    <XAxis dataKey="setSize" tick={axisStyle} label={{ value: 'Set Size', position: 'insideBottom', offset: -10, style: axisStyle }} />
                    <YAxis yAxisId="rt" orientation="left" tick={axisStyle} label={{ value: 'RT (ms)', angle: -90, position: 'insideLeft', style: axisStyle }} />
                    <YAxis yAxisId="acc" orientation="right" domain={[0, 100]} tick={axisStyle} label={{ value: 'Accuracy (%)', angle: 90, position: 'insideRight', style: axisStyle }} />
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    <Tooltip contentStyle={chartStyle} formatter={(v: any) => v != null ? [v, ''] : ['N/A', '']} />
                    <Legend verticalAlign="top" wrapperStyle={{ color: '#a1a1aa', paddingBottom: 8 }} />
                    {revealed && (
                      <>
                        <Bar yAxisId="rt" dataKey="rt" name="RT (ms)" fill="#3b82f6" opacity={0.7} radius={[3, 3, 0, 0]}>
                          <ErrorBar dataKey="rtSem" width={4} strokeWidth={1.5} stroke="#6b7280" direction="y" />
                        </Bar>
                        <Line yAxisId="acc" type="monotone" dataKey="accuracy" name="Accuracy (%)" stroke="#fb7185" strokeWidth={2.5} dot={{ r: 5, fill: '#fb7185' }} connectNulls />
                      </>
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            {/* Chart (b): RT & accuracy vs distractor set size */}
            <ChartCard
              title="(b) RT & Accuracy vs Distractor Set Size"
              subtitle="Number of opposite-color T's in display. Error bars = SEM."
            >
              {(revealed) => (
                <ResponsiveContainer width="100%" height={280}>
                  <ComposedChart data={distractorSSData} margin={{ left: 10, right: 40, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                    <XAxis dataKey="setSize" tick={axisStyle} label={{ value: 'Set Size', position: 'insideBottom', offset: -10, style: axisStyle }} />
                    <YAxis yAxisId="rt" orientation="left" tick={axisStyle} label={{ value: 'RT (ms)', angle: -90, position: 'insideLeft', style: axisStyle }} />
                    <YAxis yAxisId="acc" orientation="right" domain={[0, 100]} tick={axisStyle} label={{ value: 'Accuracy (%)', angle: 90, position: 'insideRight', style: axisStyle }} />
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    <Tooltip contentStyle={chartStyle} formatter={(v: any) => v != null ? [v, ''] : ['N/A', '']} />
                    <Legend verticalAlign="top" wrapperStyle={{ color: '#a1a1aa', paddingBottom: 8 }} />
                    {revealed && (
                      <>
                        <Bar yAxisId="rt" dataKey="rt" name="RT (ms)" fill="#3b82f6" opacity={0.7} radius={[3, 3, 0, 0]}>
                          <ErrorBar dataKey="rtSem" width={4} strokeWidth={1.5} stroke="#6b7280" direction="y" />
                        </Bar>
                        <Line yAxisId="acc" type="monotone" dataKey="accuracy" name="Accuracy (%)" stroke="#fb7185" strokeWidth={2.5} dot={{ r: 5, fill: '#fb7185' }} connectNulls />
                      </>
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            {/* Chart (c): present-RT minus absent-RT vs target set size */}
            {contrastData.some(d => d.contrast != null) && (
              <ChartCard
                title="(c) Search Cost vs Target Set Size"
                subtitle="Present-RT minus Absent-RT at each target set size. Positive = present trials slower. Error bars = SEM."
              >
                {(revealed) => (
                  <ResponsiveContainer width="100%" height={260}>
                    <ComposedChart data={contrastData} margin={{ left: 10, right: 20, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                      <XAxis dataKey="setSize" tick={axisStyle} label={{ value: 'Target Set Size', position: 'insideBottom', offset: -10, style: axisStyle }} />
                      <YAxis tick={axisStyle} label={{ value: 'Present − Absent RT (ms)', angle: -90, position: 'insideLeft', style: { fill: '#a1a1aa', fontSize: 10 } }} />
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      <Tooltip contentStyle={chartStyle} formatter={(v: any) => v != null ? [`${v}ms`, 'Contrast'] : ['N/A', 'Contrast']} />
                      <Legend verticalAlign="top" wrapperStyle={{ color: '#a1a1aa', paddingBottom: 8 }} />
                      {revealed && (
                        <Bar dataKey="contrast" name="Present − Absent (ms)" fill="#f97316" radius={[4, 4, 0, 0]}>
                          <ErrorBar dataKey="contrastSem" width={4} strokeWidth={1.5} stroke="#6b7280" direction="y" />
                        </Bar>
                      )}
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>
            )}

            {/* Chart (d): present-RT vs target distance from center */}
            {distanceData.some(d => d.rt != null) && (
              <ChartCard
                title="(d) Present-RT vs Target Distance from Center"
                subtitle="Correct target-present trials. Targets near fixation should be detected faster. Error bars = SEM."
              >
                {(revealed) => (
                  <ResponsiveContainer width="100%" height={260}>
                    <ComposedChart data={distanceData} margin={{ left: 10, right: 20, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                      <XAxis dataKey="label" tick={axisStyle} label={{ value: 'Distance from Center (px)', position: 'insideBottom', offset: -10, style: axisStyle }} />
                      <YAxis tick={axisStyle} label={{ value: 'RT (ms)', angle: -90, position: 'insideLeft', style: { fill: '#a1a1aa', fontSize: 12 } }} />
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      <Tooltip contentStyle={chartStyle} formatter={(v: any) => v != null ? [`${v}ms`, 'Avg RT'] : ['N/A', 'Avg RT']} />
                      <Legend verticalAlign="top" wrapperStyle={{ color: '#a1a1aa', paddingBottom: 8 }} />
                      {revealed && (
                        <Bar dataKey="rt" name="RT (ms)" fill="#a855f7" radius={[4, 4, 0, 0]} opacity={0.8}>
                          <ErrorBar dataKey="rtSem" width={4} strokeWidth={1.5} stroke="#6b7280" direction="y" />
                        </Bar>
                      )}
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>
            )}

            {/* Chart (e): Blue vs Red target color contrast */}
            {colorContrastData.some(d => d.contrast != null) && (
              <ChartCard
                title="(e) Target Color Effect: Blue − Red RT by Set Size"
                subtitle="Mean correct RT for blue-target sessions minus red-target sessions. Positive = blue harder. Error bars = propagated SEM."
              >
                {(revealed) => (
                  <ResponsiveContainer width="100%" height={260}>
                    <ComposedChart data={colorContrastData} margin={{ left: 10, right: 20, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                      <XAxis dataKey="setSize" tick={axisStyle} label={{ value: 'Target Set Size', position: 'insideBottom', offset: -10, style: axisStyle }} />
                      <YAxis tick={axisStyle} label={{ value: 'Blue − Red RT (ms)', angle: -90, position: 'insideLeft', style: { fill: '#a1a1aa', fontSize: 11 } }} />
                      <ReferenceLine y={0} stroke="#6b7280" strokeDasharray="4 3" strokeWidth={1.5} />
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      <Tooltip contentStyle={chartStyle} formatter={(v: any) => v != null ? [`${v}ms`, 'Blue − Red'] : ['N/A', 'Blue − Red']} />
                      <Legend verticalAlign="top" wrapperStyle={{ color: '#a1a1aa', paddingBottom: 8 }} />
                      {revealed && (
                        <Bar dataKey="contrast" name="Blue − Red RT (ms)" fill="#60a5fa" radius={[4, 4, 0, 0]}>
                          <ErrorBar dataKey="contrastSem" width={4} strokeWidth={1.5} stroke="#6b7280" direction="y" />
                        </Bar>
                      )}
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>
            )}

            {/* Chart (f): RT distribution histogram */}
            {rtHistogram.length > 0 && (
              <ChartCard
                title="(f) RT Distribution"
                subtitle={`Correct trials · ${BIN_MS}ms bins · all participants${mode === 'sdclean' ? ' · SD-cleaned' : ''}`}
              >
                {(revealed) => (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={rtHistogram} margin={{ left: 10, right: 20, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                      <XAxis
                        dataKey="bin"
                        tick={axisStyle}
                        interval="preserveStartEnd"
                        label={{ value: 'RT (ms)', position: 'insideBottom', offset: -10, style: axisStyle }}
                      />
                      <YAxis
                        tick={axisStyle}
                        allowDecimals={false}
                        label={{ value: 'Count', angle: -90, position: 'insideLeft', style: axisStyle }}
                      />
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      <Tooltip contentStyle={chartStyle} formatter={(v: any) => [v, 'trials']} labelFormatter={(l) => `${l}–${(l as number) + BIN_MS}ms`} />
                      {revealed && (
                        <Bar dataKey="count" name="Trials" fill="#34d399" opacity={0.8} radius={[2, 2, 0, 0]} />
                      )}
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>
            )}
          </>
        )}
      </div>
    </main>
  );
}
