'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ErrorBar,
  ScatterChart, Scatter, ZAxis, Cell,
} from 'recharts';
import { Eye, Download, Home, RefreshCw } from 'lucide-react';
import { getSupabase } from '@/lib/supabase';
import { TrialResult } from '@/types/word-superiority';
import { generateMockData } from '@/lib/word-superiority/mock-data';
import { verifyPassword } from '@/lib/auth';

const BG   = { background: '#111827', border: '1px solid #374151', borderRadius: 6 };
const TICK = { fill: '#9ca3af', fontSize: 11 };
const LBL  = { fill: '#9ca3af', fontSize: 11 };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pctFmt = (v: any): any => v != null ? [`${Number(v).toFixed(1)}%`, ''] : ['', ''];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const msFmt  = (v: any): any => v != null ? [`${Number(v).toFixed(0)} ms`, ''] : ['', ''];

// ── Analysis ─────────────────────────────────────────────────────────────────

function mean(vals: number[]) { return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0; }
function sem(vals: number[]) {
  if (vals.length < 2) return 0;
  const m = mean(vals);
  const v = vals.reduce((a, x) => a + (x - m) ** 2, 0) / (vals.length - 1);
  return Math.sqrt(v / vals.length);
}
function round1(n: number) { return Math.round(n * 10) / 10; }

interface BarPoint { name: string; value: number; sem: number; }
interface ScatterPoint { x: number; y: number; name: string; }
interface TeacherData {
  chart1: BarPoint[];    // accuracy by condition
  chart2: BarPoint[];    // RT by condition
  chart3: ScatterPoint[]; // word vs single-letter per participant
  nParticipants: number;
}

const CONDITIONS = ['word', 'pseudoword', 'single-letter'] as const;

function computeData(rows: TrialResult[]): TeacherData {
  const bySession: Record<string, TrialResult[]> = {};
  for (const r of rows) {
    if (!r.session_id || r.is_practice) continue;
    (bySession[r.session_id] ??= []).push(r);
  }

  // Per-participant stats
  const pStats = Object.entries(bySession).map(([, trials]) => {
    const name = trials.find(t => t.participant_name)?.participant_name ?? 'Anonymous';
    const byC: Record<string, TrialResult[]> = {};
    for (const cond of CONDITIONS) byC[cond] = trials.filter(t => t.condition === cond);

    const acc  = (cond: string) => byC[cond].length ? (byC[cond].filter(t => t.is_correct).length / byC[cond].length) * 100 : 0;
    const rt   = (cond: string) => { const c = byC[cond].filter(t => t.is_correct); return c.length ? mean(c.map(t => t.reaction_time_ms)) : 0; };

    return { name, wordAcc: acc('word'), nwAcc: acc('pseudoword'), slAcc: acc('single-letter'), wordRT: rt('word'), nwRT: rt('pseudoword'), slRT: rt('single-letter') };
  });

  const n = pStats.length;

  const chart1: BarPoint[] = [
    { name: 'Word',          value: round1(mean(pStats.map(p => p.wordAcc))), sem: round1(sem(pStats.map(p => p.wordAcc))) },
    { name: 'Pseudoword',    value: round1(mean(pStats.map(p => p.nwAcc))),   sem: round1(sem(pStats.map(p => p.nwAcc))) },
    { name: 'Single Letter', value: round1(mean(pStats.map(p => p.slAcc))),   sem: round1(sem(pStats.map(p => p.slAcc))) },
  ];
  const chart2: BarPoint[] = [
    { name: 'Word',          value: round1(mean(pStats.map(p => p.wordRT))), sem: round1(sem(pStats.map(p => p.wordRT))) },
    { name: 'Pseudoword',    value: round1(mean(pStats.map(p => p.nwRT))),   sem: round1(sem(pStats.map(p => p.nwRT))) },
    { name: 'Single Letter', value: round1(mean(pStats.map(p => p.slRT))),   sem: round1(sem(pStats.map(p => p.slRT))) },
  ];
  const chart3: ScatterPoint[] = pStats.map(p => ({
    x: round1(p.wordAcc), y: round1(p.slAcc), name: p.name,
  }));

  return { chart1, chart2, chart3, nParticipants: n };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ChartCard({ title, subtitle, revealed, onReveal, children }: {
  title: string; subtitle?: string; revealed: boolean; onReveal: () => void; children: React.ReactNode;
}) {
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6">
      <div className="flex items-start justify-between mb-1 gap-4">
        <div>
          <h2 className="text-base font-bold">{title}</h2>
          {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
        {!revealed && (
          <button onClick={onReveal}
            className="flex-shrink-0 px-4 py-1.5 bg-purple-500 hover:bg-purple-400 text-white text-sm font-semibold rounded-lg transition-colors">
            Reveal
          </button>
        )}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

const ScatterTooltip = ({ active, payload }: { active?: boolean; payload?: { payload: ScatterPoint }[] }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={BG} className="px-3 py-2 text-xs text-white shadow">
      <p className="font-semibold">{d.name}</p>
      <p>Word: {d.x}%</p>
      <p>Single Letter: {d.y}%</p>
    </div>
  );
};

const Dot = (props: { cx?: number; cy?: number }) => {
  const { cx = 0, cy = 0 } = props;
  return <circle cx={cx} cy={cy} r={6} fill="#a78bfa" stroke="#fff" strokeWidth={1.5} opacity={0.85} />;
};

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TeacherPage() {
  const router = useRouter();
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData]             = useState<TeacherData | null>(null);
  const [error, setError]           = useState<string | null>(null);
  const [authed, setAuthed]         = useState(false);
  const [pwInput, setPwInput]       = useState('');
  const [pwError, setPwError]       = useState(false);
  const [revealed, setRevealed]     = useState<Record<number, boolean>>({});
  const [useMock, setUseMock]       = useState(false);

  useEffect(() => { if (sessionStorage.getItem('wse_teacher_authed') === '1') setAuthed(true); }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await verifyPassword(pwInput)) {
      sessionStorage.setItem('wse_teacher_authed', '1');
      setAuthed(true);
    } else { setPwError(true); setPwInput(''); }
  };

  const reveal = (n: number) => setRevealed(prev => ({ ...prev, [n]: true }));

  const fetchAllRows = useCallback(async (supabase: ReturnType<typeof getSupabase>): Promise<TrialResult[]> => {
    if (!supabase) throw new Error('Supabase not available.');
    const PAGE = 1000;
    const all: TrialResult[] = [];
    let from = 0;
    while (true) {
      const { data: rows, error: err } = await supabase
        .from('word_superiority_results').select('*')
        .order('created_at', { ascending: true }).range(from, from + PAGE - 1);
      if (err) throw new Error(`Database error: ${err.message}`);
      if (rows) all.push(...(rows as TrialResult[]));
      if (!rows || rows.length < PAGE) break;
      from += PAGE;
    }
    return all;
  }, []);

  const fetchData = useCallback(async () => {
    setRefreshing(true); setError(null);
    try {
      const supabase = getSupabase();
      const rows = await fetchAllRows(supabase);
      setData(rows.length > 0 ? computeData(rows) : null);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); setRefreshing(false); }
  }, [fetchAllRows]);

  const loadMockData = useCallback(() => {
    setError(null);
    setData(computeData(generateMockData()));
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
      const a = document.createElement('a'); a.href = url; a.download = 'wse-data.csv'; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { console.error(e); }
  };

  if (!authed) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="bg-gray-900 border border-gray-700 rounded-2xl p-10 w-full max-w-sm flex flex-col items-center gap-6">
          <Eye className="w-10 h-10 text-purple-400" />
          <h1 className="text-xl font-bold text-white">Teacher Dashboard</h1>
          <form onSubmit={handleLogin} className="w-full flex flex-col gap-3">
            <input type="password" value={pwInput} autoFocus
              onChange={e => { setPwInput(e.target.value); setPwError(false); }}
              placeholder="Password"
              className={`w-full px-4 py-3 rounded-xl border text-white bg-gray-800 outline-none transition-colors ${pwError ? 'border-red-500' : 'border-gray-600 focus:border-purple-400'}`}
            />
            {pwError && <p className="text-red-400 text-sm text-center">Incorrect password</p>}
            <button type="submit" className="w-full py-3 bg-purple-500 hover:bg-purple-400 text-white font-bold rounded-xl">Enter</button>
          </form>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f172a] text-white">
      <div className="container mx-auto px-4 py-8 max-w-5xl">

        {/* Header */}
        <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Eye className="w-7 h-7 text-purple-400" />
              <h1 className="text-2xl font-bold">Teacher Dashboard — Word Superiority Effect</h1>
            </div>
            {!loading && data && (
              <p className="text-purple-400 font-medium">
                {data.nParticipants} participant{data.nParticipants !== 1 ? 's' : ''}
                {useMock && <span className="text-amber-400 ml-2">(mock data)</span>}
              </p>
            )}
          </div>
          <div className="flex gap-3 flex-wrap ml-auto">
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
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
            </button>
            <button onClick={handleDownloadCSV}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg border border-gray-600">
              <Download className="w-4 h-4" /> Download CSV
            </button>
            <button onClick={() => router.push('/')}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg border border-gray-600">
              <Home className="w-4 h-4" /> Home
            </button>
          </div>
        </div>

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

            {/* Chart 1 — Accuracy by condition */}
            <ChartCard
              title="Accuracy by Condition"
              subtitle="50% = chance. Error bars = SEM across participants."
              revealed={!!revealed[1]} onReveal={() => reveal(1)}
            >
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={data.chart1} margin={{ left: 10, bottom: 5 }} barCategoryGap="30%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="name" tick={TICK} />
                  <YAxis domain={[0, 100]} tick={TICK}
                    label={{ value: 'Accuracy (%)', angle: -90, position: 'insideLeft', style: LBL }} />
                  <Tooltip contentStyle={BG} formatter={pctFmt} />
                  {revealed[1] && (
                    <Bar dataKey="value" name="Accuracy" fill="#a78bfa" radius={[4, 4, 0, 0]}>
                      <ErrorBar dataKey="sem" width={4} strokeWidth={2} stroke="#7c3aed" direction="y" />
                    </Bar>
                  )}
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Chart 2 — RT by condition */}
            <ChartCard
              title="Reaction Time by Condition"
              subtitle="Correct trials only. Error bars = SEM."
              revealed={!!revealed[2]} onReveal={() => reveal(2)}
            >
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={data.chart2} margin={{ left: 10, bottom: 5 }} barCategoryGap="30%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="name" tick={TICK} />
                  <YAxis domain={[0, 2000]} tick={TICK}
                    label={{ value: 'RT (ms)', angle: -90, position: 'insideLeft', style: LBL }} />
                  <Tooltip contentStyle={BG} formatter={msFmt} />
                  {revealed[2] && (
                    <Bar dataKey="value" name="RT" fill="#34d399" radius={[4, 4, 0, 0]}>
                      <ErrorBar dataKey="sem" width={4} strokeWidth={2} stroke="#059669" direction="y" />
                    </Bar>
                  )}
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Chart 3 — Scatter: Word vs Single Letter per participant */}
            <ChartCard
              title="Individual Participants: Word vs. Single-Letter Accuracy"
              subtitle="Each dot = one participant. Diagonal = equal performance on both conditions."
              revealed={!!revealed[3]} onReveal={() => reveal(3)}
            >
              {data.chart3.length === 0 ? (
                <div className="h-[260px] flex items-center justify-center text-gray-500 text-sm">No participant data yet</div>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <ScatterChart margin={{ left: 10, bottom: 20, right: 20, top: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="x" type="number" name="Word Acc" domain={[0, 100]}
                      label={{ value: 'Word Accuracy (%)', position: 'insideBottom', offset: -12, style: LBL }} tick={TICK} />
                    <YAxis dataKey="y" type="number" name="Single Letter Acc" domain={[0, 100]}
                      label={{ value: 'Single-Letter Accuracy (%)', angle: -90, position: 'insideLeft', style: LBL }} tick={TICK} />
                    <ZAxis range={[60, 60]} />
                    <Tooltip content={<ScatterTooltip />} />
                    {/* Diagonal y=x */}
                    <Scatter
                      data={[{ x: 0, y: 0 }, { x: 100, y: 100 }]}
                      line={{ stroke: '#6b7280', strokeWidth: 1.5, strokeDasharray: '6 4' }}
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      shape={(() => <></>) as any}
                      legendType="none" isAnimationActive={false}
                    />
                    {revealed[3] && (
                      <Scatter data={data.chart3} shape={<Dot />}>
                        {data.chart3.map((_, i) => <Cell key={i} fill="#a78bfa" />)}
                      </Scatter>
                    )}
                  </ScatterChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

          </div>
        )}
      </div>
    </div>
  );
}
