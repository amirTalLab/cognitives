'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ErrorBar, Legend,
  ScatterChart, Scatter, ZAxis, Cell,
} from 'recharts';
import { Eye, Download, Home, RefreshCw } from 'lucide-react';
import { getSupabase } from '@/lib/supabase';
import { TrialResult } from '@/types/testing-effect';
import { generateMockData } from '@/lib/testing-effect/mock-data';
import { verifyPassword } from '@/lib/auth';

const BG = { background: '#111827', border: '1px solid #374151', borderRadius: 6 };
const TICK = { fill: '#9ca3af', fontSize: 11 };
const LBL = { fill: '#9ca3af', fontSize: 11 };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pctFmt = (v: any): any => v != null ? [`${Number(v).toFixed(1)}%`, ''] : ['', ''];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const msFmt = (v: any): any => v != null ? [`${Number(v).toFixed(0)} ms`, ''] : ['', ''];

function mean(vals: number[]) { return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0; }
function sem(vals: number[]) {
  if (vals.length < 2) return 0;
  const m = mean(vals);
  const v = vals.reduce((a, x) => a + (x - m) ** 2, 0) / (vals.length - 1);
  return Math.sqrt(v / vals.length);
}
function round1(n: number) { return Math.round(n * 10) / 10; }

/** Compute a nice Y-axis ceiling from BarPoint data: max(value+sem), rounded up to nearest step. */
function niceMax(points: BarPoint[], minCeil = 10): number {
  const peak = Math.max(...points.map(p => p.value + p.sem), 0);
  if (peak <= 0) return minCeil;
  // Choose step size based on magnitude
  const step = peak <= 10 ? 2 : peak <= 25 ? 5 : peak <= 60 ? 10 : 20;
  return Math.max(minCeil, Math.ceil(peak / step) * step);
}

interface BarPoint { name: string; value: number; sem: number }
interface ScatterPoint { x: number; y: number; name: string }
interface DashboardData {
  chart1: BarPoint[];      // Session 2 accuracy by condition
  chart2: BarPoint[];      // Session 2 RT by condition
  chart3: BarPoint[];      // Session 1 practice accuracy by round (retrieval only)
  chart4: ScatterPoint[];  // Retrieval vs Restudy accuracy scatter
  chart5: BarPoint[];      // Conditional recall: P(S2 correct | S1 practice outcome)
  nSession1: number;
  nSession2: number;
}

const CONDITIONS = ['baseline', 'restudy', 'retrieval'] as const;
const COND_LABELS: Record<string, string> = {
  baseline: 'Baseline', restudy: 'Restudy', retrieval: 'Retrieval Practice',
};

function computeData(rows: TrialResult[]): DashboardData {
  // Session 2 final test
  const s2Rows = rows.filter(r => r.session_number === 2);
  const s2BySession: Record<string, TrialResult[]> = {};
  for (const r of s2Rows) (s2BySession[r.session_id] ??= []).push(r);

  const s2Stats = Object.entries(s2BySession).map(([, trials]) => {
    const pName = trials[0]?.participant_name || 'Anonymous';
    const byC: Record<string, TrialResult[]> = {};
    for (const c of CONDITIONS) byC[c] = trials.filter(t => t.condition === c);
    const acc = (c: string) => { const t = byC[c]; return t.length ? (t.filter(r => r.is_correct).length / t.length) * 100 : 0; };
    const rt = (c: string) => { const t = byC[c].filter(r => r.is_correct && r.reaction_time_ms); return t.length ? mean(t.map(r => r.reaction_time_ms!)) : 0; };
    return { name: pName, baselineAcc: acc('baseline'), restudyAcc: acc('restudy'), retrievalAcc: acc('retrieval'), baselineRT: rt('baseline'), restudyRT: rt('restudy'), retrievalRT: rt('retrieval') };
  });

  const chart1: BarPoint[] = CONDITIONS.map(c => ({
    name: COND_LABELS[c],
    value: round1(mean(s2Stats.map(p => p[`${c}Acc` as keyof typeof p] as number))),
    sem: round1(sem(s2Stats.map(p => p[`${c}Acc` as keyof typeof p] as number))),
  }));

  const chart2: BarPoint[] = CONDITIONS.map(c => ({
    name: COND_LABELS[c],
    value: round1(mean(s2Stats.map(p => p[`${c}RT` as keyof typeof p] as number))),
    sem: round1(sem(s2Stats.map(p => p[`${c}RT` as keyof typeof p] as number))),
  }));

  // Session 1 practice accuracy by round (retrieval trials only)
  const s1Retrieval = rows.filter(r => r.session_number === 1 && r.trial_type === 'retrieval');
  const s1BySession: Record<string, TrialResult[]> = {};
  for (const r of s1Retrieval) (s1BySession[r.session_id] ??= []).push(r);

  const s1Stats = Object.entries(s1BySession).map(([, trials]) => {
    const r1 = trials.filter(t => t.practice_round === 1);
    const r2 = trials.filter(t => t.practice_round === 2);
    const acc = (t: TrialResult[]) => t.length ? (t.filter(r => r.is_correct).length / t.length) * 100 : 0;
    return { round1Acc: acc(r1), round2Acc: acc(r2) };
  });

  const chart3: BarPoint[] = [
    { name: 'Round 1', value: round1(mean(s1Stats.map(p => p.round1Acc))), sem: round1(sem(s1Stats.map(p => p.round1Acc))) },
    { name: 'Round 2', value: round1(mean(s1Stats.map(p => p.round2Acc))), sem: round1(sem(s1Stats.map(p => p.round2Acc))) },
  ];

  // Scatter: retrieval vs restudy accuracy (Session 2)
  const chart4: ScatterPoint[] = s2Stats.map(p => ({
    x: round1(p.restudyAcc), y: round1(p.retrievalAcc), name: p.name,
  }));

  // Chart 5: Conditional recall — P(S2 correct | S1 practice outcome)
  // Link S1 and S2 data by participant_name + cue
  const byName: Record<string, TrialResult[]> = {};
  for (const r of rows) (byName[r.participant_name ?? ''] ??= []).push(r);

  const condRetHitVals: number[] = [];
  const condRetMissVals: number[] = [];
  const condRestudyVals: number[] = [];
  const condBaselineVals: number[] = [];

  for (const [, pRows] of Object.entries(byName)) {
    const s2 = pRows.filter(r => r.session_number === 2);
    if (s2.length === 0) continue;
    const s2ByCue: Record<string, TrialResult> = {};
    for (const r of s2) s2ByCue[r.cue] = r;

    // Retrieval items: S1 round 2 outcome → S2 accuracy
    const s1RetR2 = pRows.filter(r => r.session_number === 1 && r.trial_type === 'retrieval' && r.practice_round === 2);
    let hitN = 0, hitCorrect = 0, missN = 0, missCorrect = 0;
    for (const r1 of s1RetR2) {
      const s2t = s2ByCue[r1.cue];
      if (!s2t) continue;
      if (r1.is_correct) { hitN++; if (s2t.is_correct) hitCorrect++; }
      else { missN++; if (s2t.is_correct) missCorrect++; }
    }
    if (hitN > 0) condRetHitVals.push((hitCorrect / hitN) * 100);
    if (missN > 0) condRetMissVals.push((missCorrect / missN) * 100);

    // Restudy & baseline: just S2 accuracy
    const restudyS2 = s2.filter(r => r.condition === 'restudy');
    if (restudyS2.length > 0) condRestudyVals.push((restudyS2.filter(r => r.is_correct).length / restudyS2.length) * 100);
    const baselineS2 = s2.filter(r => r.condition === 'baseline');
    if (baselineS2.length > 0) condBaselineVals.push((baselineS2.filter(r => r.is_correct).length / baselineS2.length) * 100);
  }

  const chart5: BarPoint[] = [
    { name: 'Baseline', value: round1(mean(condBaselineVals)), sem: round1(sem(condBaselineVals)) },
    { name: 'Restudy', value: round1(mean(condRestudyVals)), sem: round1(sem(condRestudyVals)) },
    { name: 'Retr. (S1 miss)', value: round1(mean(condRetMissVals)), sem: round1(sem(condRetMissVals)) },
    { name: 'Retr. (S1 hit)', value: round1(mean(condRetHitVals)), sem: round1(sem(condRetHitVals)) },
  ];

  return {
    chart1, chart2, chart3, chart4, chart5,
    nSession1: Object.keys(s1BySession).length,
    nSession2: s2Stats.length,
  };
}

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
      <p>Restudy: {d.x}%</p>
      <p>Retrieval: {d.y}%</p>
    </div>
  );
};

const Dot = (props: { cx?: number; cy?: number }) => {
  const { cx = 0, cy = 0 } = props;
  return <circle cx={cx} cy={cy} r={6} fill="#a78bfa" stroke="#fff" strokeWidth={1.5} opacity={0.85} />;
};

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [authed, setAuthed] = useState(false);
  const [pwInput, setPwInput] = useState('');
  const [pwError, setPwError] = useState(false);
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  const [useMock, setUseMock] = useState(false);

  useEffect(() => { if (sessionStorage.getItem('ss_teacher_authed') === '1') setAuthed(true); }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await verifyPassword(pwInput)) {
      sessionStorage.setItem('ss_teacher_authed', '1');
      setAuthed(true);
    } else { setPwError(true); setPwInput(''); }
  };

  const reveal = (n: number) => setRevealed(prev => ({ ...prev, [n]: true }));

  const fetchAllRows = useCallback(async (supabase: ReturnType<typeof getSupabase>): Promise<TrialResult[]> => {
    if (!supabase) throw new Error('Supabase not available.');
    const all: TrialResult[] = [];
    let from = 0;
    while (true) {
      const { data: rows, error: err } = await supabase
        .from('testing_effect_results').select('*')
        .order('created_at', { ascending: true }).range(from, from + 999);
      if (err) throw new Error(`Database error: ${err.message}`);
      if (rows) all.push(...(rows as TrialResult[]));
      if (!rows || rows.length < 1000) break;
      from += 1000;
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
      const a = document.createElement('a'); a.href = url; a.download = 'testing-effect-data.csv'; a.click();
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
              className={`w-full px-4 py-3 rounded-xl border text-white bg-gray-800 outline-none transition-colors ${pwError ? 'border-red-500' : 'border-gray-600 focus:border-purple-400'}`} />
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
        <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Eye className="w-7 h-7 text-purple-400" />
              <h1 className="text-2xl font-bold">Teacher Dashboard — Testing Effect</h1>
            </div>
            {!loading && data && (
              <p className="text-purple-400 font-medium">
                Session 1: {data.nSession1} participant{data.nSession1 !== 1 ? 's' : ''} &nbsp;·&nbsp;
                Session 2: {data.nSession2} participant{data.nSession2 !== 1 ? 's' : ''}
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
        ) : !data ? (
          <p className="text-center text-gray-500 py-20 text-lg">No data yet</p>
        ) : (
          <div className="flex flex-col gap-6">

            {/* Chart 1 — Session 2 Accuracy by Condition */}
            <ChartCard
              title="Final Test Accuracy by Condition (Session 2)"
              subtitle="The testing effect: retrieval practice > restudy > baseline. Error bars = SEM."
              revealed={!!revealed[1]} onReveal={() => reveal(1)}>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={data.chart1} margin={{ left: 10, bottom: 5 }} barCategoryGap="30%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="name" tick={TICK} />
                  <YAxis domain={[0, niceMax(data.chart1)]} tick={TICK}
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

            {/* Chart 2 — Session 2 RT by Condition */}
            <ChartCard
              title="Final Test Reaction Time by Condition (Session 2)"
              subtitle="Correct trials only. Error bars = SEM."
              revealed={!!revealed[2]} onReveal={() => reveal(2)}>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={data.chart2} margin={{ left: 10, bottom: 5 }} barCategoryGap="30%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="name" tick={TICK} />
                  <YAxis tick={TICK}
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

            {/* Chart 3 — Session 1 Practice Accuracy by Round */}
            <ChartCard
              title="Retrieval Practice Accuracy by Round (Session 1)"
              subtitle="Learning across practice rounds. Error bars = SEM."
              revealed={!!revealed[3]} onReveal={() => reveal(3)}>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={data.chart3} margin={{ left: 10, bottom: 5 }} barCategoryGap="30%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="name" tick={TICK} />
                  <YAxis domain={[0, niceMax(data.chart3)]} tick={TICK}
                    label={{ value: 'Accuracy (%)', angle: -90, position: 'insideLeft', style: LBL }} />
                  <Tooltip contentStyle={BG} formatter={pctFmt} />
                  {revealed[3] && (
                    <Bar dataKey="value" name="Accuracy" fill="#60a5fa" radius={[4, 4, 0, 0]}>
                      <ErrorBar dataKey="sem" width={4} strokeWidth={2} stroke="#2563eb" direction="y" />
                    </Bar>
                  )}
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Chart 4 — Scatter: Retrieval vs Restudy Accuracy */}
            <ChartCard
              title="Individual: Retrieval Practice vs. Restudy Accuracy (Session 2)"
              subtitle="Each dot = one participant. Above diagonal = retrieval > restudy."
              revealed={!!revealed[4]} onReveal={() => reveal(4)}>
              {data.chart4.length === 0 ? (
                <div className="h-[260px] flex items-center justify-center text-gray-500 text-sm">No Session 2 data yet</div>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <ScatterChart margin={{ left: 10, bottom: 20, right: 20, top: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="x" type="number" name="Restudy" domain={[0, 100]}
                      label={{ value: 'Restudy Accuracy (%)', position: 'insideBottom', offset: -12, style: LBL }} tick={TICK} />
                    <YAxis dataKey="y" type="number" name="Retrieval" domain={[0, 100]}
                      label={{ value: 'Retrieval Accuracy (%)', angle: -90, position: 'insideLeft', style: LBL }} tick={TICK} />
                    <ZAxis range={[60, 60]} />
                    <Tooltip content={<ScatterTooltip />} />
                    <Legend verticalAlign="top" />
                    <Scatter
                      data={[{ x: 0, y: 0 }, { x: 100, y: 100 }]}
                      line={{ stroke: '#6b7280', strokeWidth: 1.5, strokeDasharray: '6 4' }}
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      shape={(() => <></>) as any}
                      legendType="none" isAnimationActive={false}
                    />
                    {revealed[4] && (
                      <Scatter data={data.chart4} shape={<Dot />} name="Participants">
                        {data.chart4.map((_, i) => <Cell key={i} fill="#a78bfa" />)}
                      </Scatter>
                    )}
                  </ScatterChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            {/* Chart 5 — Conditional Recall: P(S2 correct | S1 practice outcome) */}
            <ChartCard
              title="Delayed Recall Given Immediate Practice Outcome"
              subtitle="S2 accuracy split by S1 retrieval success. Restudy/baseline shown for comparison. Error bars = SEM."
              revealed={!!revealed[5]} onReveal={() => reveal(5)}>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={data.chart5} margin={{ left: 10, bottom: 5 }} barCategoryGap="25%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="name" tick={TICK} />
                  <YAxis domain={[0, niceMax(data.chart5)]} tick={TICK}
                    label={{ value: 'S2 Accuracy (%)', angle: -90, position: 'insideLeft', style: LBL }} />
                  <Tooltip contentStyle={BG} formatter={pctFmt} />
                  {revealed[5] && (
                    <Bar dataKey="value" name="Accuracy" fill="#a78bfa" radius={[4, 4, 0, 0]}>
                      <ErrorBar dataKey="sem" width={4} strokeWidth={2} stroke="#7c3aed" direction="y" />
                    </Bar>
                  )}
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

          </div>
        )}
      </div>
    </div>
  );
}
