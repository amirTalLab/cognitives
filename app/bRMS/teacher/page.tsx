'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ErrorBar, LineChart, Line,
  ScatterChart, Scatter, ZAxis, Cell,
} from 'recharts';
import { Eye, Download, Home, RefreshCw } from 'lucide-react';
import { getSupabase } from '@/lib/supabase';
import { TrialResult } from '@/types/brms-emotion';
import { generateMockData } from '@/lib/brms-emotion/mock-data';

const PW_HASH = '5f63c8759a4968d6e814db98e85f7658554882b44213d85f3a3b15480f47e69f';

async function sha256(str: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

const BG   = { background: '#111827', border: '1px solid #374151', borderRadius: 6 };
const TICK = { fill: '#9ca3af', fontSize: 11 };
const LBL  = { fill: '#9ca3af', fontSize: 11 };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sFmt = (v: any): any => v != null ? [`${Number(v).toFixed(2)} s`, ''] : ['', ''];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pctFmt = (v: any): any => v != null ? [`${Number(v).toFixed(1)}%`, ''] : ['', ''];

const EMOTIONS = ['fearful', 'happy', 'neutral'] as const;
const ORIENTATIONS = ['upright', 'inverted'] as const;
const EM_LABELS: Record<string, string> = { fearful: 'Fearful', happy: 'Happy', neutral: 'Neutral' };
const ORI_LABELS: Record<string, string> = { upright: 'Upright', inverted: 'Inverted' };

// ── Helpers ──────────────────────────────────────────────────────────────────

function mean(vals: number[]) { return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0; }
function sem(vals: number[]) {
  if (vals.length < 2) return 0;
  const m = mean(vals);
  const v = vals.reduce((a, x) => a + (x - m) ** 2, 0) / (vals.length - 1);
  return Math.sqrt(v / vals.length);
}
function median(vals: number[]): number {
  if (!vals.length) return 0;
  const s = [...vals].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
function r2(n: number) { return Math.round(n * 100) / 100; }

// ── Data cleaning ────────────────────────────────────────────────────────────

function cleanRows(rows: TrialResult[]): TrialResult[] {
  return rows.filter(r =>
    !r.is_practice &&
    r.is_correct &&
    r.reaction_time_ms >= 200 &&
    r.reaction_time_ms <= 15000 &&
    !r.rescue_triggered &&
    !r.timing_flag
  );
}

function sdCleanRows(rows: TrialResult[]): TrialResult[] {
  const sessions = Array.from(new Set(rows.map(r => r.session_id)));
  const cleaned: TrialResult[] = [];
  for (const sid of sessions) {
    const sRows = rows.filter(r => r.session_id === sid);
    for (const em of EMOTIONS) {
      for (const ori of ORIENTATIONS) {
        const cellRows = sRows.filter(r => r.emotion === em && r.orientation === ori);
        const rts = cellRows.map(r => r.reaction_time_ms);
        if (rts.length < 3) { cleaned.push(...cellRows); continue; }
        const m = mean(rts);
        const sd = Math.sqrt(rts.reduce((a, b) => a + (b - m) ** 2, 0) / (rts.length - 1));
        const lo = m - 3 * sd, hi = m + 3 * sd;
        cleaned.push(...cellRows.filter(r => r.reaction_time_ms >= lo && r.reaction_time_ms <= hi));
      }
    }
  }
  return cleaned;
}

function excludeParticipants(rows: TrialResult[], allRows: TrialResult[]): { kept: TrialResult[]; excludedIds: Set<string> } {
  const sessions = Array.from(new Set(rows.map(r => r.session_id)));
  if (sessions.length < 2) return { kept: rows, excludedIds: new Set() };

  const pStats = sessions.map(sid => {
    const all = allRows.filter(r => r.session_id === sid && !r.is_practice);
    const correct = all.filter(r => r.is_correct);
    const acc = all.length > 0 ? correct.length / all.length : 0;
    const cleanCorrect = rows.filter(r => r.session_id === sid);
    const medBT = median(cleanCorrect.map(r => r.reaction_time_ms));
    return { sid, acc, medBT };
  });

  const accs = pStats.map(p => p.acc);
  const bts = pStats.map(p => p.medBT);
  const accM = mean(accs), accSd = Math.sqrt(accs.reduce((a, b) => a + (b - accM) ** 2, 0) / (accs.length - 1));
  const btM = mean(bts), btSd = Math.sqrt(bts.reduce((a, b) => a + (b - btM) ** 2, 0) / (bts.length - 1));

  const excludedIds = new Set<string>();
  for (const p of pStats) {
    if (p.acc < accM - 2.5 * accSd) excludedIds.add(p.sid);
    if (p.acc < 0.9) excludedIds.add(p.sid);
    if (p.medBT < btM - 2.5 * btSd || p.medBT > btM + 2.5 * btSd) excludedIds.add(p.sid);
  }
  return { kept: rows.filter(r => !excludedIds.has(r.session_id)), excludedIds };
}

// ── Chart data computation ───────────────────────────────────────────────────

type AggMode = 'mean' | 'median';

interface BarPt { name: string; value: number; sem: number; }
interface GroupedPt { name: string; upright: number; uprightSem: number; inverted: number; invertedSem: number; }
interface LinePt { name: string; upright: number; inverted: number; }
interface ScatterPt { x: number; y: number; name: string; }
interface AccPt { name: string; upright: number; uprightSem: number; inverted: number; invertedSem: number; }

interface DashboardData {
  fig1: BarPt[];
  fig2: GroupedPt[];
  fig3: BarPt[];
  fig4: BarPt[];
  fig4lines: LinePt[];
  fig5: ScatterPt[];
  fig6: AccPt[];
  nParticipants: number;
  nTrials: number;
}

function computeDashboard(rows: TrialResult[], allRows: TrialResult[], aggMode: AggMode): DashboardData {
  const sessions = Array.from(new Set(rows.map(r => r.session_id)));
  const agg = aggMode === 'median' ? median : mean;

  const perPart = sessions.map(sid => {
    const s = rows.filter(r => r.session_id === sid);
    const name = allRows.find(r => r.session_id === sid && r.participant_name)?.participant_name ?? 'Anon';

    const cellBT = (em: string, ori: string) => {
      const c = s.filter(r => r.emotion === em && r.orientation === ori);
      return c.length ? agg(c.map(r => r.reaction_time_ms / 1000)) : NaN;
    };
    const oriBT = (ori: string) => {
      const c = s.filter(r => r.orientation === ori);
      return c.length ? agg(c.map(r => r.reaction_time_ms / 1000)) : NaN;
    };
    const emBT = (em: string) => {
      const c = s.filter(r => r.emotion === em && r.orientation === 'upright');
      return c.length ? agg(c.map(r => r.reaction_time_ms / 1000)) : NaN;
    };

    return { name, sid, cellBT, oriBT, emBT, uprightBT: oriBT('upright'), invertedBT: oriBT('inverted') };
  });

  const valid = (vals: number[]) => vals.filter(v => !isNaN(v));

  // Fig 1: Main effect of orientation
  const fig1: BarPt[] = ORIENTATIONS.map(ori => {
    const vals = valid(perPart.map(p => p.oriBT(ori)));
    return { name: ORI_LABELS[ori], value: r2(mean(vals)), sem: r2(sem(vals)) };
  });

  // Fig 2: Full 3×2
  const fig2: GroupedPt[] = EMOTIONS.map(em => {
    const upVals = valid(perPart.map(p => p.cellBT(em, 'upright')));
    const invVals = valid(perPart.map(p => p.cellBT(em, 'inverted')));
    return {
      name: EM_LABELS[em],
      upright: r2(mean(upVals)), uprightSem: r2(sem(upVals)),
      inverted: r2(mean(invVals)), invertedSem: r2(sem(invVals)),
    };
  });

  // Fig 3: Emotion, upright only
  const fig3: BarPt[] = EMOTIONS.map(em => {
    const vals = valid(perPart.map(p => p.emBT(em)));
    return { name: EM_LABELS[em], value: r2(mean(vals)), sem: r2(sem(vals)) };
  });

  // Fig 4: Inversion cost per emotion
  const fig4: BarPt[] = EMOTIONS.map(em => {
    const costs = valid(perPart.map(p => {
      const up = p.cellBT(em, 'upright');
      const inv = p.cellBT(em, 'inverted');
      return (!isNaN(up) && !isNaN(inv)) ? inv - up : NaN;
    }));
    return { name: EM_LABELS[em], value: r2(mean(costs)), sem: r2(sem(costs)) };
  });

  const fig4lines: LinePt[] = EMOTIONS.map(em => {
    const upVals = valid(perPart.map(p => p.cellBT(em, 'upright')));
    const invVals = valid(perPart.map(p => p.cellBT(em, 'inverted')));
    return { name: EM_LABELS[em], upright: r2(mean(upVals)), inverted: r2(mean(invVals)) };
  });

  // Fig 5: Individual scatter
  const fig5: ScatterPt[] = perPart
    .filter(p => !isNaN(p.uprightBT) && !isNaN(p.invertedBT))
    .map(p => ({ x: r2(p.uprightBT), y: r2(p.invertedBT), name: p.name }));

  // Fig 6: Accuracy by condition
  const fig6: AccPt[] = EMOTIONS.map(em => {
    const upAccs = valid(sessions.map(sid => {
      const all = allRows.filter(r => r.session_id === sid && !r.is_practice && r.emotion === em && r.orientation === 'upright');
      return all.length ? (all.filter(r => r.is_correct).length / all.length) * 100 : NaN;
    }));
    const invAccs = valid(sessions.map(sid => {
      const all = allRows.filter(r => r.session_id === sid && !r.is_practice && r.emotion === em && r.orientation === 'inverted');
      return all.length ? (all.filter(r => r.is_correct).length / all.length) * 100 : NaN;
    }));
    return {
      name: EM_LABELS[em],
      upright: r2(mean(upAccs)), uprightSem: r2(sem(upAccs)),
      inverted: r2(mean(invAccs)), invertedSem: r2(sem(invAccs)),
    };
  });

  return { fig1, fig2, fig3, fig4, fig4lines, fig5, fig6, nParticipants: sessions.length, nTrials: rows.length };
}

// ── Sub-components ───────────────────────────────────────────────────────────

function ChartCard({ title, subtitle, teachingPoint, revealed, onReveal, children }: {
  title: string; subtitle?: string; teachingPoint?: string;
  revealed: boolean; onReveal: () => void; children: React.ReactNode;
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
      {teachingPoint && revealed && (
        <p className="text-xs text-purple-300 mt-1 mb-3 italic">{teachingPoint}</p>
      )}
      <div className="mt-4">{children}</div>
    </div>
  );
}

const ScatterTooltip = ({ active, payload }: { active?: boolean; payload?: { payload: ScatterPt }[] }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={BG} className="px-3 py-2 text-xs text-white shadow">
      <p className="font-semibold">{d.name}</p>
      <p>Upright: {d.x}s</p>
      <p>Inverted: {d.y}s</p>
    </div>
  );
};

const Dot = (props: { cx?: number; cy?: number }) => {
  const { cx = 0, cy = 0 } = props;
  return <circle cx={cx} cy={cy} r={6} fill="#a78bfa" stroke="#fff" strokeWidth={1.5} opacity={0.85} />;
};

// ── Main page ────────────────────────────────────────────────────────────────

export default function BRMSTeacherPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rawRows, setRawRows] = useState<TrialResult[]>([]);
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [authed, setAuthed] = useState(false);
  const [pwInput, setPwInput] = useState('');
  const [pwError, setPwError] = useState(false);
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  const [useMock, setUseMock] = useState(false);
  const [cleanTrials, setCleanTrials] = useState(false);
  const [cleanParticipants, setCleanParticipants] = useState(false);
  const [aggMode, setAggMode] = useState<AggMode>('median');
  const [excludedCount, setExcludedCount] = useState(0);
  const [cleanedTrialCount, setCleanedTrialCount] = useState(0);
  const [rawTrialCount, setRawTrialCount] = useState(0);

  useEffect(() => { if (sessionStorage.getItem('brms_teacher_authed') === '1') setAuthed(true); }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await sha256(pwInput) === PW_HASH) {
      sessionStorage.setItem('brms_teacher_authed', '1');
      setAuthed(true);
    } else { setPwError(true); setPwInput(''); }
  };

  const reveal = (n: number) => setRevealed(prev => ({ ...prev, [n]: true }));

  const fetchAllRows = useCallback(async (): Promise<TrialResult[]> => {
    const supabase = getSupabase();
    if (!supabase) throw new Error('Supabase not available.');
    const PAGE = 1000;
    const all: TrialResult[] = [];
    let from = 0;
    while (true) {
      const { data: rows, error: err } = await supabase
        .from('brms_emotion_results').select('*')
        .order('created_at', { ascending: true }).range(from, from + PAGE - 1);
      if (err) throw new Error(`Database error: ${err.message}`);
      if (rows) all.push(...(rows as TrialResult[]));
      if (!rows || rows.length < PAGE) break;
      from += PAGE;
    }
    return all;
  }, []);

  const recompute = useCallback((allRows: TrialResult[], clean: boolean, exPart: boolean, agg: AggMode) => {
    if (!allRows.length) { setData(null); return; }
    let displayRows = allRows.filter(r => !r.is_practice);
    setRawTrialCount(displayRows.length);
    if (clean) {
      displayRows = cleanRows(displayRows);
      displayRows = sdCleanRows(displayRows);
    }
    setCleanedTrialCount(clean ? displayRows.length : 0);
    const { kept, excludedIds } = exPart ? excludeParticipants(displayRows, allRows) : { kept: displayRows, excludedIds: new Set<string>() };
    setExcludedCount(excludedIds.size);
    setData(kept.length > 0 ? computeDashboard(kept, allRows, agg) : null);
  }, []);

  const loadMockData = useCallback(() => {
    const rows = generateMockData();
    setRawRows(rows);
    recompute(rows, cleanTrials, cleanParticipants, aggMode);
    setLoading(false);
  }, [recompute, cleanTrials, cleanParticipants, aggMode]);

  const fetchData = useCallback(async () => {
    setRefreshing(true); setError(null);
    try {
      const rows = await fetchAllRows();
      setRawRows(rows);
      recompute(rows, cleanTrials, cleanParticipants, aggMode);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); setRefreshing(false); }
  }, [fetchAllRows, recompute, cleanTrials, cleanParticipants, aggMode]);

  useEffect(() => {
    if (!authed) return;
    if (useMock) loadMockData(); else fetchData();
  }, [authed, useMock, loadMockData, fetchData]);

  useEffect(() => {
    if (rawRows.length > 0) recompute(rawRows, cleanTrials, cleanParticipants, aggMode);
  }, [cleanTrials, cleanParticipants, aggMode, rawRows, recompute]);

  const handleDownloadCSV = async () => {
    try {
      const rows = await fetchAllRows();
      if (!rows.length) return;
      const headers = Object.keys(rows[0]).join(',');
      const csv = [headers, ...rows.map(r => Object.values(r as unknown as Record<string, unknown>).join(','))].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'brms-emotion-data.csv'; a.click();
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
        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Eye className="w-7 h-7 text-purple-400" />
              <h1 className="text-2xl font-bold">Teacher Dashboard — bRMS Emotion</h1>
            </div>
            {!loading && data && (
              <p className="text-purple-400 font-medium">
                {data.nParticipants} participant{data.nParticipants !== 1 ? 's' : ''} · {data.nTrials} trials
                {useMock && <span className="text-amber-400 ml-2">(mock data)</span>}
              </p>
            )}
          </div>
          <div className="flex gap-3 flex-wrap">
            <button onClick={() => setUseMock(v => !v)}
              className={`px-4 py-2 text-sm rounded-lg border transition-colors ${useMock ? 'bg-amber-500/20 border-amber-400 text-amber-400' : 'bg-gray-800 border-gray-600 text-gray-300 hover:bg-gray-700'}`}>
              {useMock ? 'Mock Data ON' : 'Mock Data'}
            </button>
            <button onClick={fetchData} disabled={refreshing || useMock}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg border border-gray-600">
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

        {/* Toggle buttons */}
        <div className="flex gap-3 mb-6 flex-wrap">
          <button onClick={() => setCleanTrials(v => !v)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              cleanTrials ? 'border-purple-400 text-purple-400' : 'border-gray-600 text-gray-400 hover:border-gray-400'
            }`}>
            {cleanTrials
              ? `✓ Clean Trials (${cleanedTrialCount}/${rawTrialCount})`
              : `Raw Trials (${rawTrialCount})`}
          </button>
          <button onClick={() => setCleanParticipants(v => !v)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              cleanParticipants ? 'border-purple-400 text-purple-400' : 'border-gray-600 text-gray-400 hover:border-gray-400'
            }`}>
            {cleanParticipants ? `✓ Clean Participants (−${excludedCount})` : 'All Participants'}
          </button>
          <button onClick={() => setAggMode(m => m === 'mean' ? 'median' : 'mean')}
            className="text-xs px-3 py-1.5 rounded-full border border-gray-600 text-gray-400 hover:border-gray-400 transition-colors">
            Agg: {aggMode === 'median' ? 'Median' : 'Mean'}
          </button>
        </div>

        {error && (
          <div className="bg-red-900/40 border border-red-700 rounded-xl p-4 mb-6">
            <p className="text-red-300 text-sm font-semibold mb-1">Error loading data</p>
            <p className="text-red-400 text-xs font-mono">{error}</p>
          </div>
        )}

        {loading ? (
          <p className="text-center text-gray-400 py-20 text-lg">Loading...</p>
        ) : !data || data.nParticipants === 0 ? (
          <p className="text-center text-gray-500 py-20 text-lg">No data yet — try enabling mock data above</p>
        ) : (
          <div className="flex flex-col gap-6">

            {/* Fig 1 — Main effect of orientation */}
            <ChartCard title="Figure 1 — Main Effect of Orientation"
              subtitle="Mean BT (s) collapsed across emotion. Error bars = SEM."
              teachingPoint="Upright < Inverted: the convergent-validity result showing the paradigm works."
              revealed={!!revealed[1]} onReveal={() => reveal(1)}>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data.fig1} margin={{ left: 10, bottom: 5 }} barCategoryGap="30%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="name" tick={TICK} />
                  <YAxis tick={TICK} label={{ value: 'BT (s)', angle: -90, position: 'insideLeft', style: LBL }} />
                  <Tooltip contentStyle={BG} formatter={sFmt} />
                  {revealed[1] && (
                    <Bar dataKey="value" name="BT" fill="#a78bfa" radius={[4, 4, 0, 0]}>
                      <ErrorBar dataKey="sem" width={4} strokeWidth={2} stroke="#7c3aed" direction="y" />
                    </Bar>
                  )}
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Fig 2 — Full 3×2 */}
            <ChartCard title="Figure 2 — Emotion × Orientation (3×2)"
              subtitle="Grouped BT (s) by emotion, split by orientation. Error bars = SEM."
              teachingPoint="Reads the whole design: orientation gap within each emotion, fear position, and interaction pattern."
              revealed={!!revealed[2]} onReveal={() => reveal(2)}>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data.fig2} margin={{ left: 10, bottom: 5 }} barCategoryGap="20%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="name" tick={TICK} />
                  <YAxis tick={TICK} label={{ value: 'BT (s)', angle: -90, position: 'insideLeft', style: LBL }} />
                  <Tooltip contentStyle={BG} formatter={sFmt} />
                  <Legend verticalAlign="top" />
                  {revealed[2] && (<>
                    <Bar dataKey="upright" name="Upright" fill="#34d399" radius={[4, 4, 0, 0]}>
                      <ErrorBar dataKey="uprightSem" width={4} strokeWidth={2} stroke="#059669" direction="y" />
                    </Bar>
                    <Bar dataKey="inverted" name="Inverted" fill="#f97316" radius={[4, 4, 0, 0]}>
                      <ErrorBar dataKey="invertedSem" width={4} strokeWidth={2} stroke="#c2410c" direction="y" />
                    </Bar>
                  </>)}
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Fig 3 — Emotion, upright only */}
            <ChartCard title="Figure 3 — Emotion Effect (Upright Only)"
              subtitle="BT (s) for fearful / happy / neutral faces, upright trials only."
              teachingPoint="Does fear break fastest? Is happy ≠ neutral? The classic emotion-prioritization test."
              revealed={!!revealed[3]} onReveal={() => reveal(3)}>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data.fig3} margin={{ left: 10, bottom: 5 }} barCategoryGap="30%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="name" tick={TICK} />
                  <YAxis tick={TICK} label={{ value: 'BT (s)', angle: -90, position: 'insideLeft', style: LBL }} />
                  <Tooltip contentStyle={BG} formatter={sFmt} />
                  {revealed[3] && (
                    <Bar dataKey="value" name="BT" fill="#34d399" radius={[4, 4, 0, 0]}>
                      <ErrorBar dataKey="sem" width={4} strokeWidth={2} stroke="#059669" direction="y" />
                    </Bar>
                  )}
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Fig 4 — Interaction / confound diagnostic */}
            <ChartCard title="Figure 4 — Interaction: Inversion Cost by Emotion"
              subtitle="BT(inverted) − BT(upright) per emotion, plus an interaction line plot."
              teachingPoint="If emotion differences shrink under inversion → higher-level. If they persist → low-level confound."
              revealed={!!revealed[4]} onReveal={() => reveal(4)}>
              <div className="flex flex-col gap-4">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={data.fig4} margin={{ left: 10, bottom: 5 }} barCategoryGap="30%">
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="name" tick={TICK} />
                    <YAxis tick={TICK} label={{ value: 'Inversion Cost (s)', angle: -90, position: 'insideLeft', style: LBL }} />
                    <Tooltip contentStyle={BG} formatter={sFmt} />
                    {revealed[4] && (
                      <Bar dataKey="value" name="Cost" fill="#f59e0b" radius={[4, 4, 0, 0]}>
                        <ErrorBar dataKey="sem" width={4} strokeWidth={2} stroke="#b45309" direction="y" />
                      </Bar>
                    )}
                  </BarChart>
                </ResponsiveContainer>
                {revealed[4] && (
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={data.fig4lines} margin={{ left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="name" tick={TICK} />
                      <YAxis tick={TICK} label={{ value: 'BT (s)', angle: -90, position: 'insideLeft', style: LBL }} />
                      <Tooltip contentStyle={BG} formatter={sFmt} />
                      <Legend verticalAlign="top" />
                      <Line type="monotone" dataKey="upright" name="Upright" stroke="#34d399" strokeWidth={2} dot={{ r: 5 }} />
                      <Line type="monotone" dataKey="inverted" name="Inverted" stroke="#f97316" strokeWidth={2} dot={{ r: 5 }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </ChartCard>

            {/* Fig 5 — Individual differences scatter */}
            <ChartCard title="Figure 5 — Individual Differences"
              subtitle="Each dot = one participant. X = mean BT upright, Y = mean BT inverted."
              teachingPoint="Dots above the diagonal show the inversion cost is near-universal. Spread shows stable individual differences."
              revealed={!!revealed[5]} onReveal={() => reveal(5)}>
              {data.fig5.length === 0 ? (
                <div className="h-[260px] flex items-center justify-center text-gray-500 text-sm">No data</div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <ScatterChart margin={{ left: 10, bottom: 20, right: 20, top: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="x" type="number" name="Upright BT"
                      label={{ value: 'Upright BT (s)', position: 'insideBottom', offset: -12, style: LBL }} tick={TICK} />
                    <YAxis dataKey="y" type="number" name="Inverted BT"
                      label={{ value: 'Inverted BT (s)', angle: -90, position: 'insideLeft', style: LBL }} tick={TICK} />
                    <ZAxis range={[60, 60]} />
                    <Tooltip content={<ScatterTooltip />} />
                    <Scatter
                      data={[
                        { x: 0, y: 0 },
                        { x: Math.max(...data.fig5.map(d => Math.max(d.x, d.y))) * 1.1 || 10,
                          y: Math.max(...data.fig5.map(d => Math.max(d.x, d.y))) * 1.1 || 10 },
                      ]}
                      line={{ stroke: '#6b7280', strokeWidth: 1.5, strokeDasharray: '6 4' }}
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      shape={(() => <></>) as any}
                      legendType="none" isAnimationActive={false}
                    />
                    {revealed[5] && (
                      <Scatter data={data.fig5} shape={<Dot />}>
                        {data.fig5.map((_, i) => <Cell key={i} fill="#a78bfa" />)}
                      </Scatter>
                    )}
                  </ScatterChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            {/* Fig 6 — Accuracy by condition */}
            <ChartCard title="Figure 6 — Accuracy by Condition"
              subtitle="Localization accuracy (%) per cell of the 3×2 design."
              teachingPoint="Accuracy should be high and equal across cells. If it tracks the BT pattern → speed-accuracy artifact."
              revealed={!!revealed[6]} onReveal={() => reveal(6)}>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data.fig6} margin={{ left: 10, bottom: 5 }} barCategoryGap="20%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="name" tick={TICK} />
                  <YAxis domain={[0, 100]} tick={TICK}
                    label={{ value: 'Accuracy (%)', angle: -90, position: 'insideLeft', style: LBL }} />
                  <Tooltip contentStyle={BG} formatter={pctFmt} />
                  <Legend verticalAlign="top" />
                  {revealed[6] && (<>
                    <Bar dataKey="upright" name="Upright" fill="#34d399" radius={[4, 4, 0, 0]}>
                      <ErrorBar dataKey="uprightSem" width={4} strokeWidth={2} stroke="#059669" direction="y" />
                    </Bar>
                    <Bar dataKey="inverted" name="Inverted" fill="#f97316" radius={[4, 4, 0, 0]}>
                      <ErrorBar dataKey="invertedSem" width={4} strokeWidth={2} stroke="#c2410c" direction="y" />
                    </Bar>
                  </>)}
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

          </div>
        )}
      </div>
    </div>
  );
}
