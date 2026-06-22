'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, Cell, LabelList,
  ScatterChart, Scatter, ZAxis,
} from 'recharts';
import { Eye, Download, Home, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { getSupabase } from '@/lib/supabase';
import { RAT_TRIPLETS } from '@/lib/creativity/stimuli';
import { generateMockData } from '@/lib/creativity/mock-data';

const PW_HASH = '5f63c8759a4968d6e814db98e85f7658554882b44213d85f3a3b15480f47e69f';

async function sha256(str: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

const TICK = { fill: '#9ca3af', fontSize: 11 };
const LBL = { fill: '#9ca3af', fontSize: 11 };
const TT_STYLE = { background: '#1e293b', border: '1px solid #475569', borderRadius: 8 };

function mean(vals: number[]) { return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0; }
function round1(n: number) { return Math.round(n * 10) / 10; }
function round2(n: number) { return Math.round(n * 100) / 100; }

// ── Types ────────────────────────────────────────────────────────────────────
interface AUTRow {
  session_id: string; participant_name: string | null; object_name: string;
  use_text: string; time_in_task_ms: number; is_practice: boolean;
}
interface CircleRow {
  session_id: string; participant_name: string | null; label: string;
  drawing_data: string; response_time_ms: number; time_in_task_ms: number; is_practice: boolean;
}
interface RATRow {
  session_id: string; participant_name: string | null; triplet_index: number;
  triplet_words: string; response: string | null; is_correct: boolean;
  skipped: boolean; response_time_ms: number; is_practice: boolean;
}

interface OrigScatterPoint { x: number; y: number; name: string; originalResponses: string[]; }

// ── Originality helpers ──────────────────────────────────────────────────────

function computeResponseFrequencies(rows: { text: string }[]) {
  const freq: Record<string, number> = {};
  for (const r of rows) {
    const key = r.text.trim().toLowerCase();
    freq[key] = (freq[key] || 0) + 1;
  }
  return freq;
}

function participantOriginalityScore(
  pRows: { text: string }[],
  globalFreq: Record<string, number>,
): number {
  if (pRows.length === 0) return 0;
  let sum = 0;
  for (const r of pRows) {
    const key = r.text.trim().toLowerCase();
    const f = globalFreq[key] || 1;
    sum += 1 / f;
  }
  return sum / pRows.length;
}

// ── AUT chart computation ────────────────────────────────────────────────────

function computeAUTCharts(rows: AUTRow[]) {
  const sessions = [...new Set(rows.map(r => r.session_id))];

  // Per-participant fluency counts
  const pCounts = sessions.map(sid => rows.filter(r => r.session_id === sid).length);
  // Histogram: x = total uses, y = how many participants had that count
  const fluencyBins: Record<number, string[]> = {};
  sessions.forEach((sid, i) => {
    const name = rows.find(r => r.session_id === sid)?.participant_name || 'Anonymous';
    (fluencyBins[pCounts[i]] ??= []).push(name);
  });
  const fluencyHist = Object.entries(fluencyBins)
    .map(([uses, names]) => ({ uses: Number(uses), count: names.length, names }))
    .sort((a, b) => a.uses - b.uses);

  const allUses = rows.map(r => ({ text: r.use_text }));
  const globalFreq = computeResponseFrequencies(allUses);

  // Originality distribution: group by frequency, y=count of labels at that freq
  const freqCounts: Record<number, string[]> = {};
  for (const [label, count] of Object.entries(globalFreq)) {
    (freqCounts[count] ??= []).push(label);
  }
  const maxFreq = Math.max(...Object.keys(freqCounts).map(Number), 1);
  const origDist = [];
  for (let f = 1; f <= maxFreq; f++) {
    const labels = freqCounts[f] || [];
    if (labels.length > 0) {
      origDist.push({ freq: f, count: labels.length, labels });
    }
  }

  // Per-participant originality scatter
  const origScatter: OrigScatterPoint[] = sessions.map(sid => {
    const pRows = rows.filter(r => r.session_id === sid);
    const fluency = pRows.length;
    const origScore = participantOriginalityScore(
      pRows.map(r => ({ text: r.use_text })), globalFreq,
    );
    const uniqueResponses = pRows
      .filter(r => globalFreq[r.use_text.trim().toLowerCase()] === 1)
      .map(r => r.use_text);
    const name = pRows[0]?.participant_name || 'Anonymous';
    return { x: fluency, y: round2(origScore), name, originalResponses: uniqueResponses };
  });

  return { fluencyHist, origDist, origScatter };
}

// ── Circles chart computation ────────────────────────────────────────────────

function computeCirclesCharts(rows: CircleRow[]) {
  const sessions = [...new Set(rows.map(r => r.session_id))];

  const pCounts = sessions.map(sid => rows.filter(r => r.session_id === sid).length);
  const fluencyBins: Record<number, string[]> = {};
  sessions.forEach((sid, i) => {
    const name = rows.find(r => r.session_id === sid)?.participant_name || 'Anonymous';
    (fluencyBins[pCounts[i]] ??= []).push(name);
  });
  const fluencyHist = Object.entries(fluencyBins)
    .map(([uses, names]) => ({ uses: Number(uses), count: names.length, names }))
    .sort((a, b) => a.uses - b.uses);

  const allLabels = rows.map(r => ({ text: r.label }));
  const globalFreq = computeResponseFrequencies(allLabels);

  const origScatter: OrigScatterPoint[] = sessions.map(sid => {
    const pRows = rows.filter(r => r.session_id === sid);
    const fluency = pRows.length;
    const origScore = participantOriginalityScore(
      pRows.map(r => ({ text: r.label })), globalFreq,
    );
    const uniqueResponses = pRows
      .filter(r => globalFreq[r.label.trim().toLowerCase()] === 1)
      .map(r => r.label);
    const name = pRows[0]?.participant_name || 'Anonymous';
    return { x: fluency, y: round2(origScore), name, originalResponses: uniqueResponses };
  });

  const carouselItems = rows
    .map(r => ({
      label: r.label,
      drawingData: r.drawing_data,
      participant: r.participant_name || 'Anonymous',
      freq: globalFreq[r.label.trim().toLowerCase()] || 1,
    }))
    .sort((a, b) => a.freq - b.freq);

  return { fluencyHist, origScatter, carousel: carouselItems };
}

// ── RAT chart computation ────────────────────────────────────────────────────

interface RATTripletPoint { name: string; value: number; solution: string; }

function computeRATCharts(rows: RATRow[]) {
  const sessions = [...new Set(rows.map(r => r.session_id))];

  const perTriplet: RATTripletPoint[] = RAT_TRIPLETS.map(t => {
    const tRows = rows.filter(r => r.triplet_index === t.index);
    const attempts = tRows.filter(r => !r.skipped);
    const correct = tRows.filter(r => r.is_correct);
    const rate = attempts.length > 0 ? (correct.length / attempts.length) * 100 : 0;
    return { name: t.words.join('/'), value: round1(rate), solution: t.solution };
  });

  // Per-participant: solved count (fluency) and mean RT
  const rtScatter = sessions.map(sid => {
    const pRows = rows.filter(r => r.session_id === sid);
    const solved = pRows.filter(r => r.is_correct).length;
    const correctRTs = pRows.filter(r => r.is_correct && r.response_time_ms > 0).map(r => r.response_time_ms);
    const avgRT = correctRTs.length > 0 ? round1(mean(correctRTs)) : 0;
    const name = pRows[0]?.participant_name || 'Anonymous';
    return { x: solved, y: avgRT, name };
  }).filter(p => p.y > 0);

  return { perTriplet, rtScatter };
}

function computeDivVsConv(autRows: AUTRow[], ratRows: RATRow[]): OrigScatterPoint[] {
  const autSessions = [...new Set(autRows.map(r => r.session_id))];
  const ratSessions = [...new Set(ratRows.map(r => r.session_id))];
  const common = autSessions.filter(s => ratSessions.includes(s));
  return common.map(sid => {
    const autCount = autRows.filter(r => r.session_id === sid).length;
    const ratCount = ratRows.filter(r => r.session_id === sid && r.is_correct).length;
    const name = autRows.find(r => r.session_id === sid)?.participant_name || 'Anonymous';
    return { x: autCount, y: ratCount, name, originalResponses: [] };
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

function OriginalityTooltip({ active, payload }: { active?: boolean; payload?: { payload: OrigScatterPoint }[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="px-4 py-3 text-xs shadow-xl rounded-lg max-w-[280px]" style={TT_STYLE}>
      <p className="font-bold text-white text-sm mb-1">{d.name}</p>
      <p className="text-gray-300">Fluency: <span className="text-white font-semibold">{d.x}</span></p>
      <p className="text-gray-300">Originality: <span className="text-white font-semibold">{d.y}</span></p>
      {d.originalResponses.length > 0 && (
        <div className="mt-2 pt-2 border-t border-gray-600">
          <p className="text-emerald-400 font-bold mb-1">Unique responses:</p>
          {d.originalResponses.slice(0, 8).map((r, i) => (
            <p key={i} className="text-gray-200 leading-snug">&bull; {r}</p>
          ))}
          {d.originalResponses.length > 8 && (
            <p className="text-gray-500 mt-0.5">+{d.originalResponses.length - 8} more</p>
          )}
        </div>
      )}
    </div>
  );
}

function OrigDistTooltip({ active, payload }: {
  active?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: { payload: { freq: number; count: number; labels: string[] } }[];
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="px-4 py-3 text-xs shadow-xl rounded-lg max-w-[320px]" style={TT_STYLE}>
      <p className="font-bold text-white text-sm mb-1">
        Frequency {d.freq}: {d.count} response{d.count !== 1 ? 's' : ''}
      </p>
      <div className="mt-1 max-h-[200px] overflow-y-auto">
        {d.labels.slice(0, 20).map((l, i) => (
          <p key={i} className="text-gray-200 leading-snug">&bull; {l}</p>
        ))}
        {d.labels.length > 20 && (
          <p className="text-gray-500 mt-0.5">+{d.labels.length - 20} more</p>
        )}
      </div>
    </div>
  );
}

function DrawingCarousel({ items }: {
  items: { label: string; drawingData: string; participant: string; freq: number }[];
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const scroll = (dir: 'left' | 'right') => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollBy({ left: dir === 'left' ? -240 : 240, behavior: 'smooth' });
  };
  if (items.length === 0) return <p className="text-gray-500 text-sm text-center py-4">No drawings yet</p>;
  return (
    <div className="relative">
      <button onClick={() => scroll('left')}
        className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 bg-gray-800/90 hover:bg-gray-700 rounded-full flex items-center justify-center border border-gray-600 text-gray-300">
        <ChevronLeft className="w-4 h-4" />
      </button>
      <div ref={scrollRef}
        className="flex gap-3 overflow-x-auto px-10 py-2"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        {items.map((item, i) => (
          <div key={i} className="flex-shrink-0 flex flex-col items-center gap-1.5 w-[140px]">
            <div className="w-[120px] h-[120px] rounded-lg overflow-hidden border border-gray-600 bg-gray-800">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.drawingData} alt={item.label} className="w-full h-full object-contain" />
            </div>
            <span className={`text-xs font-medium text-center leading-tight ${item.freq === 1 ? 'text-emerald-400' : 'text-gray-400'}`}>
              {item.label}
            </span>
            <span className="text-[10px] text-gray-500">{item.participant} {item.freq === 1 ? '(unique)' : `(×${item.freq})`}</span>
          </div>
        ))}
      </div>
      <button onClick={() => scroll('right')}
        className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 bg-gray-800/90 hover:bg-gray-700 rounded-full flex items-center justify-center border border-gray-600 text-gray-300">
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}

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
  const [useMock, setUseMock] = useState(false);

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

  const loadMockData = useCallback(() => {
    const mock = generateMockData();
    setAutRows(mock.autRows as AUTRow[]);
    setCircleRows(mock.circleRows as CircleRow[]);
    setRatRows(mock.ratRows as RATRow[]);
    const allSessions = new Set([
      ...mock.autRows.map(r => r.session_id),
      ...mock.circleRows.map(r => r.session_id),
      ...mock.ratRows.map(r => r.session_id),
    ]);
    setNParticipants(allSessions.size);
    setLoading(false);
  }, []);

  const fetchData = useCallback(async () => {
    setRefreshing(true); setError(null);
    try {
      const [aut, circles, rat] = await Promise.all([
        fetchPaginated<AUTRow>('creativity_aut_results'),
        fetchPaginated<CircleRow>('creativity_circles_results'),
        fetchPaginated<RATRow>('creativity_rat_results'),
      ]);
      setAutRows(aut); setCircleRows(circles); setRatRows(rat);
      const allSessions = new Set([
        ...aut.map(r => r.session_id), ...circles.map(r => r.session_id), ...rat.map(r => r.session_id),
      ]);
      setNParticipants(allSessions.size);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => {
    if (!authed) return;
    if (useMock) loadMockData(); else fetchData();
  }, [authed, useMock, loadMockData, fetchData]);

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
            {!loading && hasData && (
              <p className="text-emerald-400 font-medium">
                {nParticipants} participant{nParticipants !== 1 ? 's' : ''}
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
              className="flex items-center gap-2 px-4 py-2 text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg border border-gray-600 disabled:opacity-50">
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
          <p className="text-center text-gray-500 py-20 text-lg">No data yet — try enabling mock data above</p>
        ) : (
          <div className="flex flex-col gap-6">

            {/* ═══════════════════ AUT Section ═══════════════════ */}
            <h2 className="text-lg font-bold text-emerald-400 border-b border-gray-700 pb-2 mt-4">
              Part 1 — Alternative Uses (AUT)
            </h2>

            {/* AUT Fluency Histogram */}
            <ChartCard title="Fluency Distribution"
              subtitle="X = total uses given by a participant. Y = how many participants had that count. Hover for names."
              revealed={!!revealed[1]} onReveal={() => reveal(1)}>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={autCharts.fluencyHist} margin={{ left: 10, bottom: 20 }} barCategoryGap="20%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="uses" tick={TICK} type="number" domain={['dataMin - 1', 'dataMax + 1']}
                    label={{ value: 'Total uses', position: 'insideBottom', offset: -10, style: LBL }} />
                  <YAxis tick={TICK} allowDecimals={false}
                    label={{ value: '# participants', angle: -90, position: 'insideLeft', style: LBL }} />
                  <Tooltip
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    content={({ active, payload }: any) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="px-3 py-2 text-xs shadow-xl rounded-lg" style={TT_STYLE}>
                        <p className="font-bold text-white">{d.uses} uses: {d.count} participant{d.count !== 1 ? 's' : ''}</p>
                        <div className="mt-1">{d.names.map((n: string, i: number) => <p key={i} className="text-gray-300">&bull; {n}</p>)}</div>
                      </div>
                    );
                  }} />
                  {revealed[1] && (
                    <Bar dataKey="count" name="Participants" fill="#34d399" radius={[4, 4, 0, 0]} />
                  )}
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* AUT Originality Distribution */}
            <ChartCard title="Originality: Response Frequency Distribution"
              subtitle="X = how many participants gave a response. Y = how many unique responses have that frequency. Hover for examples."
              revealed={!!revealed[2]} onReveal={() => reveal(2)}>
              {revealed[2] ? (
                <div className="flex flex-col gap-3">
                  <p className="text-xs text-gray-400 leading-relaxed bg-gray-800/50 rounded-lg px-4 py-3 border border-gray-700">
                    <span className="text-emerald-400 font-semibold">Originality scoring: </span>
                    For each response, originality = 1 / (number of participants who gave that same response).
                    A participant&apos;s originality score is the mean originality across all their responses.
                    Ranges from near 0 (all common) to 1.0 (all unique).
                  </p>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={autCharts.origDist} margin={{ left: 10, bottom: 20, right: 10 }} barCategoryGap="20%">
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="freq" tick={TICK} type="number" domain={[0, 'auto']}
                        label={{ value: 'Frequency (# participants who gave this response)', position: 'insideBottom', offset: -10, style: LBL }} />
                      <YAxis tick={TICK}
                        label={{ value: '# unique responses', angle: -90, position: 'insideLeft', style: LBL }} />
                      <Tooltip content={<OrigDistTooltip />} />
                      <Bar dataKey="count" name="Responses" radius={[4, 4, 0, 0]}>
                        {autCharts.origDist.map((entry, i) => (
                          <Cell key={i} fill={entry.freq === 1 ? '#34d399' : '#6b7280'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : <div className="h-[100px]" />}
            </ChartCard>

            {/* AUT Fluency × Originality Scatter */}
            <ChartCard title="Individual: Fluency × Originality"
              subtitle="Each dot = one participant. Hover for their unique responses."
              revealed={!!revealed[3]} onReveal={() => reveal(3)}>
              {autCharts.origScatter.length === 0 ? (
                <div className="h-[260px] flex items-center justify-center text-gray-500 text-sm">No data</div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis type="number" dataKey="x" tick={TICK}
                      label={{ value: 'Fluency (total uses)', position: 'insideBottom', offset: -10, style: LBL }} />
                    <YAxis type="number" dataKey="y" tick={TICK} domain={[0, 1]}
                      label={{ value: 'Originality score', angle: -90, position: 'insideLeft', style: LBL }} />
                    <ZAxis range={[80, 80]} />
                    <Tooltip content={<OriginalityTooltip />} />
                    {revealed[3] && (
                      <Scatter name="Participants" data={autCharts.origScatter} fill="#34d399">
                        {autCharts.origScatter.map((_, i) => (
                          <Cell key={i} fill="#34d399" stroke="#fff" strokeWidth={1.5} r={6} opacity={0.85} />
                        ))}
                      </Scatter>
                    )}
                  </ScatterChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            {/* ═══════════════════ Circles Section ═══════════════════ */}
            <h2 className="text-lg font-bold text-sky-400 border-b border-gray-700 pb-2 mt-4">
              Part 2 — Circles
            </h2>

            {/* Circles Fluency Histogram */}
            <ChartCard title="Fluency Distribution"
              subtitle="X = circles completed by a participant. Y = how many participants had that count. Hover for names."
              revealed={!!revealed[4]} onReveal={() => reveal(4)}>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={circlesCharts.fluencyHist} margin={{ left: 10, bottom: 20 }} barCategoryGap="20%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="uses" tick={TICK} type="number" domain={['dataMin - 1', 'dataMax + 1']}
                    label={{ value: 'Circles completed', position: 'insideBottom', offset: -10, style: LBL }} />
                  <YAxis tick={TICK} allowDecimals={false}
                    label={{ value: '# participants', angle: -90, position: 'insideLeft', style: LBL }} />
                  <Tooltip
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    content={({ active, payload }: any) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="px-3 py-2 text-xs shadow-xl rounded-lg" style={TT_STYLE}>
                        <p className="font-bold text-white">{d.uses} circles: {d.count} participant{d.count !== 1 ? 's' : ''}</p>
                        <div className="mt-1">{d.names.map((n: string, i: number) => <p key={i} className="text-gray-300">&bull; {n}</p>)}</div>
                      </div>
                    );
                  }} />
                  {revealed[4] && (
                    <Bar dataKey="count" name="Participants" fill="#38bdf8" radius={[4, 4, 0, 0]} />
                  )}
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Circles Fluency × Originality Scatter */}
            <ChartCard title="Individual: Fluency × Originality"
              subtitle="Each dot = one participant. Hover for unique labels."
              revealed={!!revealed[5]} onReveal={() => reveal(5)}>
              {circlesCharts.origScatter.length === 0 ? (
                <div className="h-[260px] flex items-center justify-center text-gray-500 text-sm">No data</div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis type="number" dataKey="x" tick={TICK}
                      label={{ value: 'Fluency (circles)', position: 'insideBottom', offset: -10, style: LBL }} />
                    <YAxis type="number" dataKey="y" tick={TICK} domain={[0, 1]}
                      label={{ value: 'Originality score', angle: -90, position: 'insideLeft', style: LBL }} />
                    <ZAxis range={[80, 80]} />
                    <Tooltip content={<OriginalityTooltip />} />
                    {revealed[5] && (
                      <Scatter name="Participants" data={circlesCharts.origScatter} fill="#38bdf8">
                        {circlesCharts.origScatter.map((_, i) => (
                          <Cell key={i} fill="#38bdf8" stroke="#fff" strokeWidth={1.5} r={6} opacity={0.85} />
                        ))}
                      </Scatter>
                    )}
                  </ScatterChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            {/* Circles Drawing Carousel */}
            <ChartCard title="Drawing Showcase (sorted by originality)"
              subtitle="Most original (unique labels) appear first. Green label = unique."
              revealed={!!revealed[6]} onReveal={() => reveal(6)}>
              {revealed[6] ? (
                <DrawingCarousel items={circlesCharts.carousel} />
              ) : <div className="h-[100px]" />}
            </ChartCard>

            {/* ═══════════════════ RAT Section ═══════════════════ */}
            <h2 className="text-lg font-bold text-amber-400 border-b border-gray-700 pb-2 mt-4">
              Part 3 — Remote Associates (RAT)
            </h2>

            {/* RAT Solve Rate per Triplet with solutions */}
            <ChartCard title="Solve Rate per Triplet"
              subtitle="Correct answer shown above each bar."
              revealed={!!revealed[7]} onReveal={() => reveal(7)}>
              <ResponsiveContainer width="100%" height={380}>
                <BarChart data={ratCharts.perTriplet} margin={{ left: 10, bottom: 60, top: 25 }} barCategoryGap="20%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="name" tick={{ ...TICK, fontSize: 9 }} angle={-45} textAnchor="end" interval={0} />
                  <YAxis domain={[0, 100]} tick={TICK}
                    label={{ value: 'Solve Rate (%)', angle: -90, position: 'insideLeft', style: LBL }} />
                  <Tooltip contentStyle={TT_STYLE} />
                  {revealed[7] && (
                    <Bar dataKey="value" name="Solve Rate" fill="#fbbf24" radius={[4, 4, 0, 0]}>
                      <LabelList dataKey="solution" position="top"
                        style={{ fill: '#fbbf24', fontSize: 10, fontWeight: 'bold', fontFamily: 'monospace' }} />
                    </Bar>
                  )}
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* RAT: RT × Solved scatter */}
            <ChartCard title="Individual: Solved × Mean RT"
              subtitle="Each dot = one participant. X = triplets solved, Y = mean RT on correct answers."
              revealed={!!revealed[8]} onReveal={() => reveal(8)}>
              {ratCharts.rtScatter.length === 0 ? (
                <div className="h-[260px] flex items-center justify-center text-gray-500 text-sm">No data</div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis type="number" dataKey="x" tick={TICK} domain={[0, 15]}
                      label={{ value: 'Triplets solved', position: 'insideBottom', offset: -10, style: LBL }} />
                    <YAxis type="number" dataKey="y" tick={TICK}
                      label={{ value: 'Mean RT (ms)', angle: -90, position: 'insideLeft', style: LBL }} />
                    <ZAxis range={[80, 80]} />
                    <Tooltip
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      content={({ active, payload }: any) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload;
                        return (
                          <div className="px-3 py-2 text-xs shadow-xl rounded-lg" style={TT_STYLE}>
                            <p className="font-bold text-white">{d.name}</p>
                            <p className="text-gray-300">Solved: <span className="text-white font-semibold">{d.x}</span></p>
                            <p className="text-gray-300">Mean RT: <span className="text-white font-semibold">{d.y} ms</span></p>
                          </div>
                        );
                      }}
                    />
                    {revealed[8] && (
                      <Scatter name="Participants" data={ratCharts.rtScatter} fill="#fbbf24">
                        {ratCharts.rtScatter.map((_, i) => (
                          <Cell key={i} fill="#fbbf24" stroke="#fff" strokeWidth={1.5} r={6} opacity={0.85} />
                        ))}
                      </Scatter>
                    )}
                  </ScatterChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            {/* ═══════════════════ Combined Section ═══════════════════ */}
            <h2 className="text-lg font-bold text-white border-b border-gray-700 pb-2 mt-4">
              Combined: Divergent vs. Convergent
            </h2>

            <ChartCard title="AUT Fluency vs. RAT Solved"
              subtitle="Each dot = one participant. Divergent (x) vs. Convergent (y)."
              revealed={!!revealed[10]} onReveal={() => reveal(10)}>
              {scatterData.length === 0 ? (
                <div className="h-[260px] flex items-center justify-center text-gray-500 text-sm">No data</div>
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
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      content={({ active, payload }: any) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload;
                        return (
                          <div className="px-3 py-2 text-xs shadow-xl rounded-lg" style={TT_STYLE}>
                            <p className="font-bold text-white">{d.name}</p>
                            <p className="text-gray-300">AUT: {d.x} uses</p>
                            <p className="text-gray-300">RAT: {d.y} solved</p>
                          </div>
                        );
                      }}
                    />
                    <Legend verticalAlign="top" />
                    {revealed[10] && (
                      <Scatter name="Participants" data={scatterData} fill="#34d399">
                        {scatterData.map((_, i) => (
                          <Cell key={i} fill="#34d399" stroke="#fff" strokeWidth={1.5} r={6} opacity={0.85} />
                        ))}
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
