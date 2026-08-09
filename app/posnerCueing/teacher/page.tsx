'use client';

import { useEffect, useState, FormEvent, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ScatterChart, Scatter, ReferenceLine, LineChart, Line, Cell,
} from 'recharts';
import { GraduationCap, RefreshCw, Target } from 'lucide-react';
import { getSupabase } from '@/lib/supabase';
import { PosnerResult } from '@/types/posner-cueing';
import { generateMockData } from '@/lib/posner-cueing/mock-data';
import { verifyPassword } from '@/lib/auth';

interface AggStats {
  totalParticipants: number;
  avgValidRT: number;
  avgInvalidRT: number;
  avgValidityEffect: number;
  avgExoRT: number;
}

interface SessionStat {
  session_id: string;
  participant_name: string;
  validRT: number;
  invalidRT: number;
  exoRT: number;
  validityEffect: number;
}

interface TimePoint {
  timePoint: number;
  rt: number | null;
}

export default function PosnerTeacherPage() {
  const [authed, setAuthed] = useState(false);
  const [pwInput, setPwInput] = useState('');
  const [pwError, setPwError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aggStats, setAggStats] = useState<AggStats | null>(null);
  const [sessionStats, setSessionStats] = useState<SessionStat[]>([]);
  const [exoTimeData, setExoTimeData] = useState<TimePoint[]>([]);
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

  const processRows = useCallback((data: PosnerResult[]) => {
    // Group by session
    const bySession: Record<string, PosnerResult[]> = {};
    data.forEach((r) => {
      if (!bySession[r.session_id]) bySession[r.session_id] = [];
      bySession[r.session_id].push(r);
    });

    const mean = (arr: PosnerResult[]) =>
      arr.length > 0 ? arr.reduce((s, r) => s + (r.rt_ms ?? 0), 0) / arr.length : 0;

    const sessions: SessionStat[] = [];
    Object.entries(bySession).forEach(([sid, rows]) => {
      const validHits = rows.filter(r => r.validity === 'valid' && r.response === 'hit' && r.rt_ms != null);
      const invalidHits = rows.filter(r => r.validity === 'invalid' && r.response === 'hit' && r.rt_ms != null);
      const exoHits = rows.filter(r => r.validity === 'exo_invalid' && r.response === 'hit' && r.rt_ms != null);

      const vRT = Math.round(mean(validHits));
      const iRT = Math.round(mean(invalidHits));
      const eRT = Math.round(mean(exoHits));

      sessions.push({
        session_id: sid,
        participant_name: rows[0].participant_name ?? sid.slice(0, 8),
        validRT: vRT,
        invalidRT: iRT,
        exoRT: eRT,
        validityEffect: iRT - vRT,
      });
    });

    setSessionStats(sessions);

    // Aggregate stats
    const avg = (arr: number[]) =>
      arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;

    setAggStats({
      totalParticipants: sessions.length,
      avgValidRT: avg(sessions.map(s => s.validRT).filter(v => v > 0)),
      avgInvalidRT: avg(sessions.map(s => s.invalidRT).filter(v => v > 0)),
      avgExoRT: avg(sessions.map(s => s.exoRT).filter(v => v > 0)),
      avgValidityEffect: avg(sessions.map(s => s.validityEffect)),
    });

    // Exo_invalid RT over time (4 bins of 5 trials each)
    const timePoints: TimePoint[] = [1, 2, 3, 4].map((tp) => {
      const allRTs: number[] = [];
      Object.values(bySession).forEach((rows) => {
        const exoHits = rows
          .filter(r => r.validity === 'exo_invalid' && r.response === 'hit' && r.rt_ms != null)
          .sort((a, b) => a.trial_number - b.trial_number);
        const start = (tp - 1) * 5;
        const end = tp * 5;
        exoHits.slice(start, end).forEach(r => allRTs.push(r.rt_ms!));
      });
      return {
        timePoint: tp,
        rt: allRTs.length > 0
          ? Math.round(allRTs.reduce((s, v) => s + v, 0) / allRTs.length)
          : null,
      };
    });
    setExoTimeData(timePoints);
  }, []);

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
          .from('posner_results')
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
      const data = allData as PosnerResult[];
      if (data.length === 0) {
        setError('No data available yet.');
        setLoading(false);
        return;
      }
      processRows(data);
    } catch (err) {
      console.error(err);
      setError('Failed to load data.');
    } finally {
      setLoading(false);
    }
  }, [processRows]);

  const loadMockData = useCallback(() => {
    setError(null);
    processRows(generateMockData());
    setLoading(false);
  }, [processRows]);

  useEffect(() => {
    if (!authed) return;
    if (useMock) loadMockData();
    else fetchData();
  }, [authed, useMock, fetchData, loadMockData]);

  // ── Auth screen ──────────────────────────────────────────────────────────
  if (!authed) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-border rounded-xl p-10 w-full max-w-sm flex flex-col items-center gap-6"
        >
          <Target className="w-10 h-10 text-amber-400" />
          <h1 className="text-xl font-bold">Teacher Dashboard</h1>
          <form onSubmit={handleLogin} className="w-full flex flex-col gap-3">
            <input
              type="password"
              value={pwInput}
              onChange={(e) => { setPwInput(e.target.value); setPwError(false); }}
              placeholder="Password"
              autoFocus
              className={`w-full px-4 py-3 rounded-lg border bg-zinc-800 text-white outline-none transition-colors
                ${pwError ? 'border-red-500' : 'border-border focus:border-amber-400'}`}
            />
            {pwError && <p className="text-red-400 text-sm text-center">Incorrect password</p>}
            <button
              type="submit"
              className="w-full py-3 bg-amber-400 hover:bg-amber-300 text-zinc-900 font-bold rounded-lg transition-colors"
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
            <RefreshCw className="w-8 h-8 text-amber-400" />
          </motion.div>
          <p className="text-muted">Loading data...</p>
        </div>
      </main>
    );
  }

  // Chart 1: RT by validity (3 bars)
  const rtBarData = [
    { name: 'Valid', rt: aggStats?.avgValidRT ?? 0, fill: '#34d399' },
    { name: 'Invalid', rt: aggStats?.avgInvalidRT ?? 0, fill: '#fb7185' },
    { name: 'Exogenous', rt: aggStats?.avgExoRT ?? 0, fill: '#f97316' },
  ];

  // Chart 2: scatter dots for validity effect per participant
  const dotData = sessionStats.map((s, i) => ({
    x: ((i * 7) % 11 - 5) * 0.08, // deterministic jitter
    y: s.validityEffect,
    label: s.participant_name,
  }));

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <GraduationCap className="w-10 h-10 text-amber-400" />
            <div>
              <h1 className="text-4xl font-bold tracking-tight">Teacher Dashboard</h1>
              <p className="text-muted mt-1">
                Posner Spatial Cueing – Aggregate Results
                {useMock && <span className="text-amber-400 ml-2">(mock data)</span>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setUseMock(v => !v)}
              className={`px-4 py-2 text-sm rounded-lg border transition-colors ${
                useMock
                  ? 'bg-amber-500/20 border-amber-400 text-amber-400'
                  : 'border-border text-muted hover:text-amber-400 hover:border-amber-400'
              }`}
            >
              {useMock ? 'Mock Data ON' : 'Mock Data'}
            </button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={fetchData}
              disabled={useMock}
              className="flex items-center gap-2 px-4 py-2 bg-amber-400 text-zinc-900
                         font-semibold rounded-lg hover:bg-amber-300 transition-colors disabled:opacity-40"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh Data
            </motion.button>
          </div>
        </div>

        {error && (
          <div className="bg-card border border-yellow-500/50 rounded-xl p-8 mb-8 text-center">
            <p className="text-yellow-400 mb-4">{error}</p>
            <button onClick={fetchData} className="px-4 py-2 bg-amber-400 text-zinc-900 font-semibold rounded-lg hover:bg-amber-300">
              Retry
            </button>
          </div>
        )}

        {aggStats && (
          <>
            {/* Stats cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <div className="bg-card border border-border rounded-xl p-6">
                <p className="text-sm text-muted mb-1">Participants</p>
                <p className="text-3xl font-bold">{aggStats.totalParticipants}</p>
              </div>
              <div className="bg-card border border-border rounded-xl p-6">
                <p className="text-sm text-muted mb-1">Avg Valid RT</p>
                <p className="text-3xl font-bold text-emerald-400">{aggStats.avgValidRT}ms</p>
              </div>
              <div className="bg-card border border-border rounded-xl p-6">
                <p className="text-sm text-muted mb-1">Avg Invalid RT</p>
                <p className="text-3xl font-bold text-rose-400">{aggStats.avgInvalidRT}ms</p>
              </div>
              <div className="bg-card border border-border rounded-xl p-6">
                <p className="text-sm text-muted mb-1">Avg Validity Effect</p>
                <p className="text-3xl font-bold text-amber-400">+{aggStats.avgValidityEffect}ms</p>
              </div>
            </div>

            {/* Chart 1: RT by validity (Valid / Invalid / Exogenous) */}
            <div className="bg-card border border-border rounded-xl p-6 mb-6">
              <h2 className="text-xl font-bold mb-1">Average RT by Cue Type</h2>
              <p className="text-sm text-muted mb-4">
                Exogenous = misleading peripheral rectangle (always wrong side)
              </p>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={rtBarData} margin={{ left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                  <XAxis dataKey="name" tick={{ fill: '#a1a1aa' }} />
                  <YAxis
                    tick={{ fill: '#a1a1aa' }}
                    label={{ value: 'RT (ms)', angle: -90, position: 'insideLeft', style: { fill: '#a1a1aa', fontSize: 12 } }}
                  />
                  <Tooltip
                    contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8 }}
                    formatter={(v) => [`${v}ms`, 'Avg RT']}
                  />
                  <Bar dataKey="rt" radius={[4, 4, 0, 0]}>
                    {rtBarData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Chart 2: Validity effect scatter (individual dots + y=0 line) */}
            {sessionStats.length > 0 && (
              <div className="bg-card border border-border rounded-xl p-6 mb-6">
                <h2 className="text-xl font-bold mb-1">Validity Effect Distribution</h2>
                <p className="text-sm text-muted mb-4">
                  Each dot = one participant (Invalid RT − Valid RT). Dashed line = zero effect.
                </p>
                <ResponsiveContainer width="100%" height={260}>
                  <ScatterChart margin={{ top: 10, right: 20, bottom: 30, left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                    <XAxis
                      type="number"
                      dataKey="x"
                      domain={[-0.6, 0.6]}
                      tick={false}
                      axisLine={false}
                      label={{ value: 'Participants (jittered)', position: 'insideBottom', offset: -10, style: { fill: '#a1a1aa', fontSize: 11 } }}
                    />
                    <YAxis
                      type="number"
                      dataKey="y"
                      tick={{ fill: '#a1a1aa' }}
                      label={{ value: 'Validity Effect (ms)', angle: -90, position: 'insideLeft', style: { fill: '#a1a1aa', fontSize: 11 } }}
                    />
                    <ReferenceLine y={0} stroke="#9ca3af" strokeDasharray="6 4" strokeWidth={2} />
                    <Tooltip
                      contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8 }}
                      formatter={(v, name) => [name === 'x' ? undefined : `${v}ms`, name === 'x' ? '' : 'Effect']}
                      cursor={false}
                    />
                    <Scatter data={dotData} fill="#fbbf24" opacity={0.85} r={6} />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Chart 3: Exo RT across 4 time points */}
            {exoTimeData.some(d => d.rt != null) && (
              <div className="bg-card border border-border rounded-xl p-6">
                <h2 className="text-xl font-bold mb-1">Exogenous Cue RT Over Time</h2>
                <p className="text-sm text-muted mb-4">
                  Mean RT for misleading-rectangle trials in 4 bins of 5 trials each. Decreasing RT = adaptation to invalid cue.
                </p>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={exoTimeData} margin={{ left: 10, right: 20, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                    <XAxis
                      dataKey="timePoint"
                      tick={{ fill: '#a1a1aa' }}
                      label={{ value: 'Time Point (5 trials each)', position: 'insideBottom', offset: -10, style: { fill: '#a1a1aa', fontSize: 11 } }}
                    />
                    <YAxis
                      tick={{ fill: '#a1a1aa' }}
                      label={{ value: 'RT (ms)', angle: -90, position: 'insideLeft', style: { fill: '#a1a1aa', fontSize: 12 } }}
                    />
                    <Tooltip
                      contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8 }}
                      formatter={(v) => (v != null ? [`${v}ms`, 'Exo RT'] : ['N/A', 'Exo RT'])}
                    />
                    <Line
                      type="monotone"
                      dataKey="rt"
                      stroke="#f97316"
                      strokeWidth={2.5}
                      dot={{ r: 6, fill: '#f97316' }}
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
