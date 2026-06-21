'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ErrorBar, Legend,
  ScatterChart, Scatter, ZAxis,
} from 'recharts';
import { Eye, Download, Home, RefreshCw } from 'lucide-react';
import { getSupabase } from '@/lib/supabase';
import { RAT_TRIPLETS } from '@/lib/creativity/stimuli';

const PW_HASH = '5f63c8759a4968d6e814db98e85f7658554882b44213d85f3a3b15480f47e69f';

async function sha256(str: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

const BG = { background: '#111827', border: '1px solid #374151', borderRadius: 6 };
const TICK = { fill: '#9ca3af', fontSize: 11 };
const LBL = { fill: '#9ca3af', fontSize: 11 };

function mean(vals: number[]) { return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0; }
function sem(vals: number[]) {
  if (vals.length < 2) return 0;
  const m = mean(vals);
  const v = vals.reduce((a, x) => a + (x - m) ** 2, 0) / (vals.length - 1);
  return Math.sqrt(v / vals.length);
}
function round1(n: number) { return Math.round(n * 10) / 10; }

// ── Types ────────────────────────────────────────────────────────────────────
interface AUTRow {
  session_id: string; participant_name: string | null; object_name: string;
  use_text: string; time_in_task_ms: number; is_practice: boolean;
}
interface CircleRow {
  session_id: string; participant_name: string | null; label: string;
  response_time_ms: number; time_in_task_ms: number; is_practice: boolean;
}
interface RATRow {
  session_id: string; participant_name: string | null; triplet_index: number;
  triplet_words: string; response: string | null; is_correct: boolean;
  skipped: boolean; response_time_ms: number; is_practice: boolean;
}

interface BarPoint { name: string; value: number; sem: number; }
interface ScatterPoint { x: number; y: number; name: string; }

// ── Chart computation ────────────────────────────────────────────────────────

function computeAUTCharts(rows: AUTRow[]) {
  const sessions = [...new Set(rows.map(r => r.session_id))];

  // Fluency per participant
  const fluencyPerP = sessions.map(sid => rows.filter(r => r.session_id === sid).length);

  // Originality: count each use_text across all participants; rare = appeared only once
  const useCounts: Record<string, number> = {};
  for (const r of rows) {
    const key = r.use_text.trim().toLowerCase();
    useCounts[key] = (useCounts[key] || 0) + 1;
  }
  const totalUses = rows.length;
  const rareUses = Object.values(useCounts).filter(c => c === 1).length;

  // Flexibility: unique normalized uses per participant
  const flexPerP = sessions.map(sid => {
    const pRows = rows.filter(r => r.session_id === sid);
    const unique = new Set(pRows.map(r => r.use_text.trim().toLowerCase()));
    return unique.size;
  });

  return {
    fluency: {
      data: [{ name: 'Total Uses', value: round1(mean(fluencyPerP)), sem: round1(sem(fluencyPerP)) }],
      n: sessions.length,
    },
    originality: {
      totalUses,
      uniqueUses: Object.keys(useCounts).length,
      rareUses,
      rarePct: totalUses > 0 ? round1((rareUses / totalUses) * 100) : 0,
    },
    flexibility: {
      data: [{ name: 'Unique Uses', value: round1(mean(flexPerP)), sem: round1(sem(flexPerP)) }],
    },
  };
}

function computeCirclesCharts(rows: CircleRow[]) {
  const sessions = [...new Set(rows.map(r => r.session_id))];

  const fluencyPerP = sessions.map(sid => rows.filter(r => r.session_id === sid).length);

  const labelCounts: Record<string, number> = {};
  for (const r of rows) {
    const key = r.label.trim().toLowerCase();
    labelCounts[key] = (labelCounts[key] || 0) + 1;
  }
  const totalLabels = rows.length;
  const rareLabels = Object.values(labelCounts).filter(c => c === 1).length;

  const flexPerP = sessions.map(sid => {
    const pRows = rows.filter(r => r.session_id === sid);
    const unique = new Set(pRows.map(r => r.label.trim().toLowerCase()));
    return unique.size;
  });

  // Top 5 rarest labels
  const rarestEntries = Object.entries(labelCounts)
    .filter(([, count]) => count === 1)
    .map(([label]) => label)
    .slice(0, 8);

  return {
    fluency: {
      data: [{ name: 'Circles Completed', value: round1(mean(fluencyPerP)), sem: round1(sem(fluencyPerP)) }],
      n: sessions.length,
    },
    originality: {
      totalLabels,
      uniqueLabels: Object.keys(labelCounts).length,
      rareLabels,
      rarePct: totalLabels > 0 ? round1((rareLabels / totalLabels) * 100) : 0,
      rarestEntries,
    },
    flexibility: {
      data: [{ name: 'Unique Labels', value: round1(mean(flexPerP)), sem: round1(sem(flexPerP)) }],
    },
  };
}

function computeRATCharts(rows: RATRow[]) {
  const sessions = [...new Set(rows.map(r => r.session_id))];

  // Solve rate per triplet
  const perTriplet: BarPoint[] = RAT_TRIPLETS.map(t => {
    const tRows = rows.filter(r => r.triplet_index === t.index);
    const attempts = tRows.filter(r => !r.skipped);
    const correct = tRows.filter(r => r.is_correct);
    const rate = attempts.length > 0 ? (correct.length / attempts.length) * 100 : 0;
    return { name: t.words.join('/'), value: round1(rate), sem: 0 };
  });

  // Overall solve count per participant
  const solvedPerP = sessions.map(sid => rows.filter(r => r.session_id === sid && r.is_correct).length);

  // RT for correct answers
  const rtCorrect = rows.filter(r => r.is_correct && r.response_time_ms > 0);
  const rtPerP = sessions.map(sid => {
    const pCorrect = rtCorrect.filter(r => r.session_id === sid);
    return pCorrect.length > 0 ? mean(pCorrect.map(r => r.response_time_ms)) : 0;
  }).filter(v => v > 0);

  return {
    perTriplet,
    solved: {
      data: [{ name: 'Solved', value: round1(mean(solvedPerP)), sem: round1(sem(solvedPerP)) }],
      max: RAT_TRIPLETS.length,
    },
    rt: {
      data: [{ name: 'RT (correct)', value: round1(mean(rtPerP)), sem: round1(sem(rtPerP)) }],
    },
  };
}

function computeDivVsConv(autRows: AUTRow[], ratRows: RATRow[]): ScatterPoint[] {
  const autSessions = [...new Set(autRows.map(r => r.session_id))];
  const ratSessions = [...new Set(ratRows.map(r => r.session_id))];
  const commonSessions = autSessions.filter(s => ratSessions.includes(s));

  return commonSessions.map(sid => {
    const autCount = autRows.filter(r => r.session_id === sid).length;
    const ratCount = ratRows.filter(r => r.session_id === sid && r.is_correct).length;
    const name = autRows.find(r => r.session_id === sid)?.participant_name || 'Anonymous';
    return { x: autCount, y: ratCount, name };
  });
}

// ── Sub-components ───────────────────────────────────────────────────────────

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
            className="flex-shrink-0 px-4 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-semibold rounded-lg transition-colors">
            Reveal
          </button>
        )}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const valFmt = (v: any): any => v != null ? [Number(v).toFixed(1), ''] : ['', ''];

// ── Main page ────────────────────────────────────────────────────────────────

export default function TeacherPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authed, setAuthed] = useState(false);
  const [pwInput, setPwInput] = useState('');
  const [pwError, setPwError] = useState(false);
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});

  const [autRows, setAutRows] = useState<AUTRow[]>([]);
  const [circleRows, setCircleRows] = useState<CircleRow[]>([]);
  const [ratRows, setRatRows] = useState<RATRow[]>([]);
  const [nParticipants, setNParticipants] = useState(0);

  useEffect(() => { if (sessionStorage.getItem('crt_teacher_authed') === '1') setAuthed(true); }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await sha256(pwInput) === PW_HASH) {
      sessionStorage.setItem('crt_teacher_authed', '1');
      setAuthed(true);
    } else { setPwError(true); setPwInput(''); }
  };

  const reveal = (n: number) => setRevealed(prev => ({ ...prev, [n]: true }));

  async function fetchPaginated<T>(table: string): Promise<T[]> {
    const sb = getSupabase();
    if (!sb) throw new Error('Supabase not available.');
    const all: T[] = [];
    let from = 0;
    while (true) {
      const { data: rows, error: err } = await sb
        .from(table).select('*')
        .eq('is_practice', false)
        .order('created_at', { ascending: true })
        .range(from, from + 999);
      if (err) throw new Error(`Database error: ${err.message}`);
      if (rows) all.push(...(rows as T[]));
      if (!rows || rows.length < 1000) break;
      from += 1000;
    }
    return all;
  }

  const fetchData = useCallback(async () => {
    setRefreshing(true); setError(null);
    try {
      const [aut, circles, rat] = await Promise.all([
        fetchPaginated<AUTRow>('creativity_aut_results'),
        fetchPaginated<CircleRow>('creativity_circles_results'),
        fetchPaginated<RATRow>('creativity_rat_results'),
      ]);
      setAutRows(aut);
      setCircleRows(circles);
      setRatRows(rat);

      const allSessions = new Set([
        ...aut.map(r => r.session_id),
        ...circles.map(r => r.session_id),
        ...rat.map(r => r.session_id),
      ]);
      setNParticipants(allSessions.size);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { if (authed) fetchData(); }, [authed, fetchData]);

  const handleDownloadCSV = async (table: string, filename: string) => {
    try {
      const rows = await fetchPaginated<Record<string, unknown>>(table);
      if (!rows.length) return;
      const headers = Object.keys(rows[0]).join(',');
      const csv = [headers, ...rows.map(r => Object.values(r).map(v =>
        typeof v === 'string' && v.includes(',') ? `"${v}"` : String(v ?? '')
      ).join(','))].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { console.error(e); }
  };

  // ── Password gate ──────────────────────────────────────────────────────
  if (!authed) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="bg-gray-900 border border-gray-700 rounded-2xl p-10 w-full max-w-sm flex flex-col items-center gap-6">
          <Eye className="w-10 h-10 text-emerald-400" />
          <h1 className="text-xl font-bold text-white">Teacher Dashboard</h1>
          <form onSubmit={handleLogin} className="w-full flex flex-col gap-3">
            <input type="password" value={pwInput} autoFocus
              onChange={e => { setPwInput(e.target.value); setPwError(false); }}
              placeholder="Password"
              className={`w-full px-4 py-3 rounded-xl border text-white bg-gray-800 outline-none transition-colors ${pwError ? 'border-red-500' : 'border-gray-600 focus:border-emerald-400'}`}
            />
            {pwError && <p className="text-red-400 text-sm text-center">Incorrect password</p>}
            <button type="submit" className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-white font-bold rounded-xl">Enter</button>
          </form>
        </motion.div>
      </div>
    );
  }

  // ── Compute chart data ─────────────────────────────────────────────────
  const autCharts = computeAUTCharts(autRows);
  const circlesCharts = computeCirclesCharts(circleRows);
  const ratCharts = computeRATCharts(ratRows);
  const scatterData = computeDivVsConv(autRows, ratRows);

  const hasData = nParticipants > 0;

  return (
    <div className="min-h-screen bg-[#0f172a] text-white">
      <div className="container mx-auto px-4 py-8 max-w-5xl">

        {/* Header */}
        <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Eye className="w-7 h-7 text-emerald-400" />
              <h1 className="text-2xl font-bold">Teacher Dashboard — Creativity Battery</h1>
            </div>
            {!loading && hasData && <p className="text-emerald-400 font-medium">{nParticipants} participant{nParticipants !== 1 ? 's' : ''}</p>}
          </div>
          <div className="flex gap-3 flex-wrap">
            <button onClick={fetchData} disabled={refreshing}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg border border-gray-600">
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
            </button>
            <div className="relative group">
              <button className="flex items-center gap-2 px-4 py-2 text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg border border-gray-600">
                <Download className="w-4 h-4" /> CSV
              </button>
              <div className="absolute right-0 top-full mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-lg hidden group-hover:block z-10 min-w-[160px]">
                <button onClick={() => handleDownloadCSV('creativity_aut_results', 'creativity-aut.csv')}
                  className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 rounded-t-lg">AUT Data</button>
                <button onClick={() => handleDownloadCSV('creativity_circles_results', 'creativity-circles.csv')}
                  className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700">Circles Data</button>
                <button onClick={() => handleDownloadCSV('creativity_rat_results', 'creativity-rat.csv')}
                  className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 rounded-b-lg">RAT Data</button>
              </div>
            </div>
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
        ) : !hasData ? (
          <p className="text-center text-gray-500 py-20 text-lg">No data yet</p>
        ) : (
          <div className="flex flex-col gap-6">

            {/* ─── AUT Section ─── */}
            <h2 className="text-lg font-bold text-emerald-400 border-b border-gray-700 pb-2 mt-4">
              Part 1 — Alternative Uses (AUT)
            </h2>

            <ChartCard
              title="Fluency: Mean Total Uses per Participant"
              subtitle="Error bar = SEM across participants."
              revealed={!!revealed[1]} onReveal={() => reveal(1)}
            >
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={autCharts.fluency.data} margin={{ left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="name" tick={TICK} />
                  <YAxis tick={TICK} label={{ value: 'Count', angle: -90, position: 'insideLeft', style: LBL }} />
                  <Tooltip contentStyle={BG} formatter={valFmt} />
                  {revealed[1] && (
                    <Bar dataKey="value" name="Uses" fill="#34d399" radius={[4, 4, 0, 0]}>
                      <ErrorBar dataKey="sem" width={4} strokeWidth={2} stroke="#059669" direction="y" />
                    </Bar>
                  )}
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard
              title="Originality: Rare Uses"
              subtitle="Uses that only one participant generated."
              revealed={!!revealed[2]} onReveal={() => reveal(2)}
            >
              {revealed[2] ? (
                <div className="grid grid-cols-2 gap-4 text-center">
                  <div className="bg-gray-800 rounded-lg p-4">
                    <p className="text-2xl font-bold text-emerald-400">{autCharts.originality.uniqueUses}</p>
                    <p className="text-xs text-gray-400 mt-1">Unique uses</p>
                  </div>
                  <div className="bg-gray-800 rounded-lg p-4">
                    <p className="text-2xl font-bold text-amber-400">{autCharts.originality.rareUses}</p>
                    <p className="text-xs text-gray-400 mt-1">Rare (unique to 1 participant)</p>
                  </div>
                  <div className="bg-gray-800 rounded-lg p-4 col-span-2">
                    <p className="text-2xl font-bold text-sky-400">{autCharts.originality.rarePct}%</p>
                    <p className="text-xs text-gray-400 mt-1">of all uses are rare</p>
                  </div>
                </div>
              ) : (
                <div className="h-[100px]" />
              )}
            </ChartCard>

            {/* ─── Circles Section ─── */}
            <h2 className="text-lg font-bold text-sky-400 border-b border-gray-700 pb-2 mt-4">
              Part 2 — Circles
            </h2>

            <ChartCard
              title="Fluency: Mean Circles Completed per Participant"
              subtitle="Error bar = SEM."
              revealed={!!revealed[3]} onReveal={() => reveal(3)}
            >
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={circlesCharts.fluency.data} margin={{ left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="name" tick={TICK} />
                  <YAxis tick={TICK} domain={[0, 30]} label={{ value: 'Count', angle: -90, position: 'insideLeft', style: LBL }} />
                  <Tooltip contentStyle={BG} formatter={valFmt} />
                  {revealed[3] && (
                    <Bar dataKey="value" name="Circles" fill="#38bdf8" radius={[4, 4, 0, 0]}>
                      <ErrorBar dataKey="sem" width={4} strokeWidth={2} stroke="#0284c7" direction="y" />
                    </Bar>
                  )}
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard
              title="Originality: Rare Labels & Showcase"
              subtitle="Labels unique to one participant."
              revealed={!!revealed[4]} onReveal={() => reveal(4)}
            >
              {revealed[4] ? (
                <div className="flex flex-col gap-4">
                  <div className="grid grid-cols-2 gap-4 text-center">
                    <div className="bg-gray-800 rounded-lg p-4">
                      <p className="text-2xl font-bold text-sky-400">{circlesCharts.originality.uniqueLabels}</p>
                      <p className="text-xs text-gray-400 mt-1">Unique labels</p>
                    </div>
                    <div className="bg-gray-800 rounded-lg p-4">
                      <p className="text-2xl font-bold text-amber-400">{circlesCharts.originality.rareLabels}</p>
                      <p className="text-xs text-gray-400 mt-1">Rare labels</p>
                    </div>
                  </div>
                  {circlesCharts.originality.rarestEntries.length > 0 && (
                    <div className="bg-gray-800 rounded-lg p-4">
                      <p className="text-xs text-gray-400 mb-2">Rarest drawings (unique labels):</p>
                      <div className="flex flex-wrap gap-2">
                        {circlesCharts.originality.rarestEntries.map((label, i) => (
                          <span key={i} className="px-3 py-1 bg-gray-700 text-sky-300 text-sm rounded-full">{label}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="h-[100px]" />
              )}
            </ChartCard>

            {/* ─── RAT Section ─── */}
            <h2 className="text-lg font-bold text-amber-400 border-b border-gray-700 pb-2 mt-4">
              Part 3 — Remote Associates (RAT)
            </h2>

            <ChartCard
              title="Solve Rate per Triplet"
              subtitle="Percentage of non-skipped attempts that were correct."
              revealed={!!revealed[5]} onReveal={() => reveal(5)}
            >
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={ratCharts.perTriplet} margin={{ left: 10, bottom: 60 }} barCategoryGap="20%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="name" tick={{ ...TICK, fontSize: 9 }} angle={-45} textAnchor="end" interval={0} />
                  <YAxis domain={[0, 100]} tick={TICK}
                    label={{ value: 'Solve Rate (%)', angle: -90, position: 'insideLeft', style: LBL }} />
                  <Tooltip contentStyle={BG} />
                  {revealed[5] && (
                    <Bar dataKey="value" name="Solve Rate" fill="#fbbf24" radius={[4, 4, 0, 0]} />
                  )}
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <ChartCard
                title="Mean Triplets Solved"
                subtitle={`Out of ${RAT_TRIPLETS.length}. Error bar = SEM.`}
                revealed={!!revealed[6]} onReveal={() => reveal(6)}
              >
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={ratCharts.solved.data} margin={{ left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="name" tick={TICK} />
                    <YAxis tick={TICK} domain={[0, RAT_TRIPLETS.length]}
                      label={{ value: 'Count', angle: -90, position: 'insideLeft', style: LBL }} />
                    <Tooltip contentStyle={BG} formatter={valFmt} />
                    {revealed[6] && (
                      <Bar dataKey="value" name="Solved" fill="#fbbf24" radius={[4, 4, 0, 0]}>
                        <ErrorBar dataKey="sem" width={4} strokeWidth={2} stroke="#d97706" direction="y" />
                      </Bar>
                    )}
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard
                title="Mean RT (Correct Answers)"
                subtitle="Error bar = SEM."
                revealed={!!revealed[7]} onReveal={() => reveal(7)}
              >
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={ratCharts.rt.data} margin={{ left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="name" tick={TICK} />
                    <YAxis tick={TICK}
                      label={{ value: 'RT (ms)', angle: -90, position: 'insideLeft', style: LBL }} />
                    <Tooltip contentStyle={BG} />
                    {revealed[7] && (
                      <Bar dataKey="value" name="RT" fill="#fb923c" radius={[4, 4, 0, 0]}>
                        <ErrorBar dataKey="sem" width={4} strokeWidth={2} stroke="#c2410c" direction="y" />
                      </Bar>
                    )}
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>

            {/* ─── Combined Section ─── */}
            <h2 className="text-lg font-bold text-white border-b border-gray-700 pb-2 mt-4">
              Combined: Divergent vs. Convergent
            </h2>

            <ChartCard
              title="AUT Fluency vs. RAT Solved"
              subtitle="Each dot = one participant. Divergent (AUT uses) vs. Convergent (RAT solved)."
              revealed={!!revealed[8]} onReveal={() => reveal(8)}
            >
              {scatterData.length === 0 ? (
                <div className="h-[260px] flex items-center justify-center text-gray-500 text-sm">No participant data yet</div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis type="number" dataKey="x" tick={TICK}
                      label={{ value: 'AUT Total Uses (divergent)', position: 'insideBottom', offset: -10, style: LBL }} />
                    <YAxis type="number" dataKey="y" tick={TICK}
                      label={{ value: 'RAT Solved (convergent)', angle: -90, position: 'insideLeft', style: LBL }} />
                    <ZAxis range={[80, 80]} />
                    <Tooltip
                      contentStyle={BG}
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      content={({ active, payload }: any) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload;
                        return (
                          <div style={BG} className="px-3 py-2 text-xs text-white shadow">
                            <p className="font-semibold">{d.name}</p>
                            <p>AUT: {d.x} uses</p>
                            <p>RAT: {d.y} solved</p>
                          </div>
                        );
                      }}
                    />
                    <Legend verticalAlign="top" />
                    {revealed[8] && (
                      <Scatter
                        name="Participants"
                        data={scatterData}
                        fill="#34d399"
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        shape={(props: any) => (
                          <circle cx={props.cx} cy={props.cy} r={6} fill="#34d399" stroke="#fff" strokeWidth={1.5} opacity={0.85} />
                        )}
                      />
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
