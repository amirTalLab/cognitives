'use client';

import { useEffect, useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { GraduationCap, RefreshCw, Download, Home } from 'lucide-react';
import { getSupabase } from '@/lib/supabase';
import { RecallResponse, DistractorResult } from '@/types/serial-order';
import { generateMockData } from '@/lib/serial-order/mock-data';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, BarChart, Bar, ScatterChart, Scatter, ZAxis,
  ErrorBar, ReferenceLine,
} from 'recharts';
import { verifyPassword } from '@/lib/auth';

function ChartCard({ title, children }: { title: string; children: (revealed: boolean) => React.ReactNode }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="bg-card border border-border rounded-xl p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-semibold text-gray-200">{title}</h3>
        <button
          onClick={() => setRevealed(r => !r)}
          className="text-xs px-3 py-1 rounded-full border border-gray-600 text-gray-400 hover:border-purple-400 hover:text-purple-400 transition-colors"
        >
          {revealed ? 'Hide' : 'Reveal'}
        </button>
      </div>
      {children(revealed)}
    </div>
  );
}

interface ParticipantData {
  sessionId: string;
  name: string | null;
  recallsS1: RecallResponse[];
  recallsS2: RecallResponse[];
  distractor: DistractorResult[];
}

const COLORS = [
  '#34d399', '#f472b6', '#60a5fa', '#fbbf24', '#a78bfa',
  '#fb923c', '#2dd4bf', '#e879f9', '#84cc16', '#f87171',
  '#38bdf8', '#c084fc', '#4ade80', '#fb7185', '#facc15',
];

function groupIntoParticipants(allRecalls: RecallResponse[], allDistractor: DistractorResult[]): ParticipantData[] {
  const bySession = new Map<string, ParticipantData>();
  allRecalls.forEach(r => {
    if (!bySession.has(r.session_id)) {
      bySession.set(r.session_id, { sessionId: r.session_id, name: r.participant_name, recallsS1: [], recallsS2: [], distractor: [] });
    }
    const p = bySession.get(r.session_id)!;
    if (r.session_number === 2) p.recallsS2.push(r);
    else p.recallsS1.push(r);
  });
  allDistractor.forEach(d => {
    const p = bySession.get(d.session_id);
    if (p) p.distractor.push(d);
  });
  return Array.from(bySession.values());
}

export default function SerialOrderTeacher() {
  const router = useRouter();
  const [authed, setAuthed] = useState(false);
  const [pwInput, setPwInput] = useState('');
  const [pwError, setPwError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [participants, setParticipants] = useState<ParticipantData[]>([]);
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

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = getSupabase();
      if (!supabase) throw new Error('Supabase not available');

      // Fetch recall data
      const allRecalls: RecallResponse[] = [];
      let from = 0;
      while (true) {
        const { data, error: fetchError } = await supabase
          .from('serial_order_recall')
          .select('*')
          .order('created_at', { ascending: true })
          .range(from, from + 999);
        if (fetchError) throw fetchError;
        if (!data || data.length === 0) break;
        allRecalls.push(...(data as RecallResponse[]));
        if (data.length < 1000) break;
        from += 1000;
      }

      // Fetch distractor data
      const allDistractor: DistractorResult[] = [];
      from = 0;
      while (true) {
        const { data, error: fetchError } = await supabase
          .from('serial_order_distractor')
          .select('*')
          .order('created_at', { ascending: true })
          .range(from, from + 999);
        if (fetchError) throw fetchError;
        if (!data || data.length === 0) break;
        allDistractor.push(...(data as DistractorResult[]));
        if (data.length < 1000) break;
        from += 1000;
      }

      if (allRecalls.length === 0) {
        setError('No data available yet.');
        setLoading(false);
        return;
      }

      setParticipants(groupIntoParticipants(allRecalls, allDistractor));
    } catch (err) {
      console.error(err);
      setError('Failed to load data.');
    } finally {
      setLoading(false);
    }
  };

  const loadMockData = () => {
    const { recalls, distractor } = generateMockData();
    setError(null);
    setParticipants(groupIntoParticipants(recalls, distractor));
    setLoading(false);
  };

  const downloadCsv = () => {
    if (participants.length === 0) return;
    const header = ['participant', 'session', 'output_position', 'serial_position', 'word', 'correct'];
    const lines = participants.flatMap(p =>
      [...p.recallsS1, ...p.recallsS2].map(r =>
        [p.name ?? p.sessionId.slice(0, 6), r.session_number, r.output_position, r.matched_serial_position ?? '', r.matched_word ?? '', r.is_correct_recall].join(',')
      )
    );
    const csv = [header.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'serial-order-data.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    if (!authed) return;
    if (useMock) loadMockData();
    else fetchData();
  }, [authed, useMock]);

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function getRecalledPositions(recalls: RecallResponse[]): Set<number> {
    const set = new Set<number>();
    recalls.forEach(r => {
      if (r.is_correct_recall && r.matched_serial_position !== null) set.add(r.matched_serial_position);
    });
    return set;
  }

  function calcSem(values: number[]): number {
    if (values.length < 2) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1);
    return Math.sqrt(variance / values.length);
  }

  // ── Serial position curve ─────────────────────────────────────────────────
  function computeSerialPositionCurve(sessionNum: 1 | 2) {
    const nWords = 20;
    const participantRecalls: number[][] = [];
    participants.forEach(p => {
      const recalls = sessionNum === 1 ? p.recallsS1 : p.recallsS2;
      const recalled = getRecalledPositions(recalls);
      participantRecalls.push(Array.from({ length: nWords }, (_, i) => recalled.has(i + 1) ? 1 : 0));
    });
    return Array.from({ length: nWords }, (_, i) => {
      const values = participantRecalls.map(row => row[i]);
      const mean = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
      return { position: i + 1, probability: mean, sem: calcSem(values) };
    });
  }

  // ── Per-participant thirds ────────────────────────────────────────────────
  function computeParticipantThirds(sessionNum: 1 | 2) {
    return participants.map(p => {
      const recalls = sessionNum === 1 ? p.recallsS1 : p.recallsS2;
      const recalled = getRecalledPositions(recalls);
      const primacy = Array.from({ length: 7 }, (_, i): number => recalled.has(i + 1) ? 1 : 0).reduce((a, b) => a + b, 0) / 7;
      const middle = Array.from({ length: 6 }, (_, i): number => recalled.has(i + 8) ? 1 : 0).reduce((a, b) => a + b, 0) / 6;
      const recency = Array.from({ length: 7 }, (_, i): number => recalled.has(i + 14) ? 1 : 0).reduce((a, b) => a + b, 0) / 7;
      return { name: p.name ?? p.sessionId.slice(0, 6), primacy, middle, recency };
    });
  }

  // ── Lag computation (for a given session) ─────────────────────────────────
  function computeLagDistribution(sessionNum: 1 | 2) {
    const bins = ['≤-7', '-6', '-5', '-4', '-3', '-2', '-1', '0', '+1', '+2', '+3', '+4', '+5', '+6', '≥+7'];
    const participantProps: Record<string, number>[] = [];

    participants.forEach(p => {
      const recalls = sessionNum === 1 ? p.recallsS1 : p.recallsS2;
      const correctRecalls = recalls
        .filter(r => r.is_correct_recall && r.matched_serial_position !== null && !r.is_repetition)
        .sort((a, b) => a.output_position - b.output_position);
      const lagCounts: Record<string, number> = {};
      bins.forEach(b => { lagCounts[b] = 0; });
      let total = 0;

      for (let i = 0; i < correctRecalls.length - 1; i++) {
        const lag = correctRecalls[i + 1].matched_serial_position! - correctRecalls[i].matched_serial_position!;
        if (lag === 0) continue;
        total++;
        if (lag <= -7) lagCounts['≤-7']++;
        else if (lag >= 7) lagCounts['≥+7']++;
        else {
          const key = lag > 0 ? `+${lag}` : `${lag}`;
          if (lagCounts[key] !== undefined) lagCounts[key]++;
        }
      }

      if (total > 0) {
        const props: Record<string, number> = {};
        bins.forEach(b => { props[b] = lagCounts[b] / total; });
        participantProps.push(props);
      }
    });

    return bins.map(bin => {
      if (bin === '0') return { lag: bin, proportion: null as number | null, sem: null as number | null };
      const values = participantProps.map(pp => pp[bin]);
      const mean = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
      return { lag: bin, proportion: mean, sem: calcSem(values) };
    });
  }

  function computeLagCRP(sessionNum: 1 | 2) {
    const nWords = 20;
    const bins = ['≤-7', '-6', '-5', '-4', '-3', '-2', '-1', '0', '+1', '+2', '+3', '+4', '+5', '+6', '≥+7'];
    const participantCRPs: Record<string, number>[] = [];

    participants.forEach(p => {
      const recalls = sessionNum === 1 ? p.recallsS1 : p.recallsS2;
      const correctRecalls = recalls
        .filter(r => r.is_correct_recall && r.matched_serial_position !== null && !r.is_repetition)
        .sort((a, b) => a.output_position - b.output_position);
      const recalledPositions = correctRecalls.map(r => r.matched_serial_position!);
      if (recalledPositions.length < 2) return;
      const allPositions = new Set(Array.from({ length: nWords }, (_, i) => i + 1));

      const actualByLag: Record<number, number> = {};
      const possibleByLag: Record<number, number> = {};

      for (let i = 0; i < recalledPositions.length - 1; i++) {
        const currentPos = recalledPositions[i];
        const nextPos = recalledPositions[i + 1];
        const lag = nextPos - currentPos;

        const alreadyRecalled = new Set(recalledPositions.slice(0, i + 1));
        const available = [...allPositions].filter(pos => !alreadyRecalled.has(pos));

        if (!actualByLag[lag]) actualByLag[lag] = 0;
        actualByLag[lag]++;

        available.forEach(pos => {
          const possibleLag = pos - currentPos;
          if (!possibleByLag[possibleLag]) possibleByLag[possibleLag] = 0;
          possibleByLag[possibleLag]++;
        });
      }

      const crps: Record<string, number> = {};
      bins.forEach(bin => {
        if (bin === '0') { crps[bin] = 0; return; }
        let actual = 0, possible = 0;
        if (bin === '≤-7') {
          for (const l in actualByLag) if (parseInt(l) <= -7) actual += actualByLag[l];
          for (const l in possibleByLag) if (parseInt(l) <= -7) possible += possibleByLag[l];
        } else if (bin === '≥+7') {
          for (const l in actualByLag) if (parseInt(l) >= 7) actual += actualByLag[l];
          for (const l in possibleByLag) if (parseInt(l) >= 7) possible += possibleByLag[l];
        } else {
          const lagNum = parseInt(bin);
          actual = actualByLag[lagNum] ?? 0;
          possible = possibleByLag[lagNum] ?? 0;
        }
        crps[bin] = possible > 0 ? actual / possible : 0;
      });
      participantCRPs.push(crps);
    });

    return bins.map(bin => {
      if (bin === '0') return { lag: bin, crp: null as number | null, sem: null as number | null };
      const values = participantCRPs.map(pp => pp[bin]);
      const mean = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
      return { lag: bin, crp: mean, sem: calcSem(values) };
    });
  }

  // ── Summary stats ─────────────────────────────────────────────────────────
  function computeSummaryStats() {
    if (participants.length === 0) return null;
    const nP = participants.length;
    let totalAdjacentTransitions = 0, totalForwardAdjacent = 0, totalBackwardAdjacent = 0, totalTransitions = 0;

    const primacyRates: number[] = [];
    const middleRates: number[] = [];
    const recencyRates: number[] = [];

    participants.forEach(p => {
      const recalled = getRecalledPositions(p.recallsS1);
      primacyRates.push([1, 2, 3, 4].filter(pos => recalled.has(pos)).length / 4);
      middleRates.push(Array.from({ length: 8 }, (_, i) => i + 7).filter(pos => recalled.has(pos)).length / 8);
      recencyRates.push([17, 18, 19, 20].filter(pos => recalled.has(pos)).length / 4);

      const correctRecalls = p.recallsS1
        .filter(r => r.is_correct_recall && r.matched_serial_position !== null && !r.is_repetition)
        .sort((a, b) => a.output_position - b.output_position);
      for (let i = 0; i < correctRecalls.length - 1; i++) {
        const lag = correctRecalls[i + 1].matched_serial_position! - correctRecalls[i].matched_serial_position!;
        if (lag === 0) continue;
        totalTransitions++;
        if (Math.abs(lag) === 1) totalAdjacentTransitions++;
        if (lag === 1) totalForwardAdjacent++;
        if (lag === -1) totalBackwardAdjacent++;
      }
    });

    const mean = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

    return {
      primacy: mean(primacyRates),
      middle: mean(middleRates),
      recency: mean(recencyRates),
      adjacentRate: totalTransitions > 0 ? totalAdjacentTransitions / totalTransitions : 0,
      forwardAdjacentRate: totalTransitions > 0 ? totalForwardAdjacent / totalTransitions : 0,
      backwardAdjacentRate: totalTransitions > 0 ? totalBackwardAdjacent / totalTransitions : 0,
      nParticipants: nP,
    };
  }

  // ── Scatter: session 1 recall vs session 2 recall ─────────────────────────
  function computeRecallScatter() {
    return participants.map(p => {
      const s1correct = p.recallsS1.filter(r => r.is_correct_recall).length;
      const s2correct = p.recallsS2.filter(r => r.is_correct_recall).length;
      return { x: (s1correct / 20) * 100, y: (s2correct / 20) * 100, name: p.name ?? p.sessionId.slice(0, 6) };
    });
  }

  // ── Scatter: arithmetic count vs accuracy ─────────────────────────────────
  function computeArithmeticScatter() {
    return participants.filter(p => p.distractor.length > 0).map(p => {
      const total = p.distractor.length;
      const correct = p.distractor.filter(d => d.accuracy).length;
      return { x: total, y: total > 0 ? (correct / total) * 100 : 0, name: p.name ?? p.sessionId.slice(0, 6) };
    });
  }

  // ── Auth gate ─────────────────────────────────────────────────────────────
  if (!authed) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-border rounded-xl p-10 w-full max-w-sm flex flex-col items-center gap-6"
        >
          <GraduationCap className="w-10 h-10 text-purple-400" />
          <h1 className="text-xl font-bold">Teacher Dashboard</h1>
          <form onSubmit={handleLogin} className="w-full flex flex-col gap-3">
            <input
              type="password"
              value={pwInput}
              onChange={e => { setPwInput(e.target.value); setPwError(false); }}
              placeholder="Password"
              autoFocus
              className={`w-full px-4 py-3 rounded-lg border bg-zinc-800 text-white outline-none transition-colors
                ${pwError ? 'border-red-500' : 'border-border focus:border-purple-400'}`}
            />
            {pwError && <p className="text-red-400 text-sm text-center">Incorrect password</p>}
            <button type="submit"
              className="w-full py-3 bg-purple-400 hover:bg-purple-300 text-zinc-900 font-bold rounded-lg transition-colors">
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
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} className="inline-block mb-4">
            <RefreshCw className="w-8 h-8 text-purple-400" />
          </motion.div>
          <p className="text-muted">Loading data...</p>
        </div>
      </main>
    );
  }

  const summaryStats = computeSummaryStats();
  const spcS1 = computeSerialPositionCurve(1);
  const spcS2 = computeSerialPositionCurve(2);
  const thirdsS1 = computeParticipantThirds(1);
  const thirdsS2 = computeParticipantThirds(2);
  const lagS1 = computeLagDistribution(1);
  const lagS2 = computeLagDistribution(2);
  const lagCRPS1 = computeLagCRP(1);
  const lagCRPS2 = computeLagCRP(2);
  const recallScatter = computeRecallScatter();
  const arithmeticScatter = computeArithmeticScatter();

  // Merge serial position curves for dual-line chart
  const spcCombined = spcS1.map((d, i) => ({
    position: d.position,
    session1: d.probability, session2: spcS2[i].probability,
    sem1: d.sem, sem2: spcS2[i].sem,
  }));

  // Aggregated thirds with SEM
  const thirdsCombined = ([
    { label: 'Primacy (1-7)', key: 'primacy' as const },
    { label: 'Middle (8-13)', key: 'middle' as const },
    { label: 'Recency (14-20)', key: 'recency' as const },
  ]).map(({ label, key }) => {
    const s1Vals = thirdsS1.map(p => p[key]);
    const s2Vals = thirdsS2.map(p => p[key]);
    const mean = (a: number[]) => a.length > 0 ? a.reduce((x, y) => x + y, 0) / a.length : 0;
    return { third: label, session1: mean(s1Vals), session2: mean(s2Vals), sem1: calcSem(s1Vals), sem2: calcSem(s2Vals) };
  });

  // Merge lag data for dual-line charts
  const lagCombined = lagS1.map((d, i) => ({ lag: d.lag, session1: d.proportion, session2: lagS2[i].proportion, sem1: d.sem, sem2: lagS2[i].sem }));
  const lagCRPCombined = lagCRPS1.map((d, i) => ({ lag: d.lag, session1: d.crp, session2: lagCRPS2[i].crp, sem1: d.sem, sem2: lagCRPS2[i].sem }));

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <GraduationCap className="w-7 h-7 text-purple-400" />
              <h1 className="text-2xl font-bold tracking-tight">Teacher Dashboard — Serial Order</h1>
            </div>
            <p className="text-purple-400 font-medium">
              Serial Position &amp; Temporal Contiguity
              {useMock && <span className="text-amber-400 ml-2">(mock data)</span>}
            </p>
          </div>
          <div className="flex gap-3 flex-wrap ml-auto">
            <button
              onClick={() => setUseMock(v => !v)}
              className={`px-4 py-2 text-sm rounded-lg border transition-colors ${
                useMock
                  ? 'bg-amber-500/20 border-amber-400 text-amber-400'
                  : 'bg-gray-800 border-gray-600 text-gray-300 hover:bg-gray-700'
              }`}
            >
              {useMock ? 'Mock Data ON' : 'Mock Data'}
            </button>
            <button onClick={fetchData} disabled={useMock}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg border border-gray-600 disabled:opacity-40">
              <RefreshCw className="w-4 h-4" /> Refresh
            </button>
            <button onClick={downloadCsv}
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
          <div className="bg-card border border-yellow-500/50 rounded-xl p-8 mb-8 text-center">
            <p className="text-yellow-400">{error}</p>
          </div>
        )}

        {summaryStats && (
          <>
            {/* Summary stats */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
              <div className="bg-card border border-border rounded-xl p-4 text-center">
                <p className="text-xs text-gray-400">Participants</p>
                <p className="text-2xl font-bold text-purple-400">{summaryStats.nParticipants}</p>
              </div>
              <div className="bg-card border border-border rounded-xl p-4 text-center">
                <p className="text-xs text-gray-400">Primacy (1-4)</p>
                <p className="text-2xl font-bold">{(summaryStats.primacy * 100).toFixed(0)}%</p>
              </div>
              <div className="bg-card border border-border rounded-xl p-4 text-center">
                <p className="text-xs text-gray-400">Middle (7-14)</p>
                <p className="text-2xl font-bold">{(summaryStats.middle * 100).toFixed(0)}%</p>
              </div>
              <div className="bg-card border border-border rounded-xl p-4 text-center">
                <p className="text-xs text-gray-400">Recency (17-20)</p>
                <p className="text-2xl font-bold">{(summaryStats.recency * 100).toFixed(0)}%</p>
              </div>
              <div className="bg-card border border-border rounded-xl p-4 text-center">
                <p className="text-xs text-gray-400">|Lag|=1 Rate</p>
                <p className="text-2xl font-bold">{(summaryStats.adjacentRate * 100).toFixed(0)}%</p>
              </div>
              <div className="bg-card border border-border rounded-xl p-4 text-center">
                <p className="text-xs text-gray-400">+1 / -1</p>
                <p className="text-2xl font-bold">
                  {(summaryStats.forwardAdjacentRate * 100).toFixed(0)}% / {(summaryStats.backwardAdjacentRate * 100).toFixed(0)}%
                </p>
              </div>
            </div>

            {/* Row 1: Combined Serial Position Curve (full width) */}
            <h2 className="text-lg font-bold text-gray-300 mb-3">Serial Position Curve</h2>
            <div className="mb-8">
              <ChartCard title="P(Recall) by Serial Position (± SEM)">
                {(revealed) => (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={spcCombined} margin={{ top: 10, right: 20, left: 10, bottom: 30 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="position" stroke="#9ca3af" label={{ value: 'Serial Position', position: 'insideBottom', offset: -10, fill: '#9ca3af' }} />
                      <YAxis stroke="#9ca3af" domain={[0, 1]} tickFormatter={v => `${(Number(v) * 100).toFixed(0)}%`}
                        label={{ value: 'P(Recall)', angle: -90, position: 'insideLeft', fill: '#9ca3af' }} />
                      <Tooltip contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px' }}
                        formatter={(v) => [`${(Number(v) * 100).toFixed(1)}%`]} />
                      <Legend verticalAlign="top" />
                      {revealed && (
                        <>
                          <Line type="monotone" dataKey="session1" stroke="#34d399" strokeWidth={2.5} dot={{ fill: '#34d399', r: 3 }} name="S1 (delayed)">
                            <ErrorBar dataKey="sem1" width={4} strokeWidth={1.5} stroke="#34d399" direction="y" />
                          </Line>
                          <Line type="monotone" dataKey="session2" stroke="#60a5fa" strokeWidth={2.5} dot={{ fill: '#60a5fa', r: 3 }} name="S2 (immediate)">
                            <ErrorBar dataKey="sem2" width={4} strokeWidth={1.5} stroke="#60a5fa" direction="y" />
                          </Line>
                        </>
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>
            </div>

            {/* Row 2: Aggregated thirds (mean ± SEM, both sessions) */}
            <h2 className="text-lg font-bold text-gray-300 mb-3">Recall by Position Third</h2>
            <div className="mb-8">
              <ChartCard title="Mean Recall by Third (± SEM)">
                {(revealed) => (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={thirdsCombined} margin={{ top: 10, right: 20, left: 10, bottom: 10 }} barCategoryGap="25%">
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="third" stroke="#9ca3af" />
                      <YAxis stroke="#9ca3af" domain={[0, 1]} tickFormatter={v => `${(Number(v) * 100).toFixed(0)}%`}
                        label={{ value: 'P(Recall)', angle: -90, position: 'insideLeft', fill: '#9ca3af' }} />
                      <Tooltip contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px' }}
                        formatter={(v) => [`${(Number(v) * 100).toFixed(1)}%`]} />
                      <Legend verticalAlign="top" />
                      {revealed && (
                        <>
                          <Bar dataKey="session1" fill="#34d399" name="S1 (delayed)" radius={[4, 4, 0, 0]}>
                            <ErrorBar dataKey="sem1" width={4} strokeWidth={1.5} stroke="#6b7280" direction="y" />
                          </Bar>
                          <Bar dataKey="session2" fill="#60a5fa" name="S2 (immediate)" radius={[4, 4, 0, 0]}>
                            <ErrorBar dataKey="sem2" width={4} strokeWidth={1.5} stroke="#6b7280" direction="y" />
                          </Bar>
                        </>
                      )}
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>
            </div>

            {/* Row 3: Per-participant thirds side by side */}
            <h2 className="text-lg font-bold text-gray-300 mb-3">Per-Participant Thirds</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              <ChartCard title="Per-Participant Thirds (S1 — delayed)">
                {(revealed) => (
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart
                      data={[
                        { third: 'Primacy (1-7)', ...Object.fromEntries(thirdsS1.map((p, i) => [`p${i}`, p.primacy])) },
                        { third: 'Middle (8-13)', ...Object.fromEntries(thirdsS1.map((p, i) => [`p${i}`, p.middle])) },
                        { third: 'Recency (14-20)', ...Object.fromEntries(thirdsS1.map((p, i) => [`p${i}`, p.recency])) },
                      ]}
                      margin={{ top: 10, right: 20, left: 10, bottom: 10 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="third" stroke="#9ca3af" />
                      <YAxis stroke="#9ca3af" domain={[0, 1]} tickFormatter={v => `${(Number(v) * 100).toFixed(0)}%`} />
                      <Tooltip contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px' }}
                        formatter={(v) => [`${(Number(v) * 100).toFixed(1)}%`]} />
                      {revealed && thirdsS1.map((p, i) => (
                        <Line key={i} type="monotone" dataKey={`p${i}`} stroke={COLORS[i % COLORS.length]}
                          strokeWidth={1.5} dot={{ r: 3 }} name={p.name} />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>

              <ChartCard title="Per-Participant Thirds (S2 — immediate)">
                {(revealed) => (
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart
                      data={[
                        { third: 'Primacy (1-7)', ...Object.fromEntries(thirdsS2.map((p, i) => [`p${i}`, p.primacy])) },
                        { third: 'Middle (8-13)', ...Object.fromEntries(thirdsS2.map((p, i) => [`p${i}`, p.middle])) },
                        { third: 'Recency (14-20)', ...Object.fromEntries(thirdsS2.map((p, i) => [`p${i}`, p.recency])) },
                      ]}
                      margin={{ top: 10, right: 20, left: 10, bottom: 10 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="third" stroke="#9ca3af" />
                      <YAxis stroke="#9ca3af" domain={[0, 1]} tickFormatter={v => `${(Number(v) * 100).toFixed(0)}%`} />
                      <Tooltip contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px' }}
                        formatter={(v) => [`${(Number(v) * 100).toFixed(1)}%`]} />
                      {revealed && thirdsS2.map((p, i) => (
                        <Line key={i} type="monotone" dataKey={`p${i}`} stroke={COLORS[i % COLORS.length]}
                          strokeWidth={1.5} dot={{ r: 3 }} name={p.name} />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>
            </div>

            {/* Row 4: Lag plots with both sessions */}
            <h2 className="text-lg font-bold text-gray-300 mb-3">Temporal Contiguity</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              <ChartCard title="Lag Transition (Simple Proportion)">
                {(revealed) => (
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={lagCombined} margin={{ top: 10, right: 20, left: 10, bottom: 30 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="lag" stroke="#9ca3af" label={{ value: 'Lag', position: 'insideBottom', offset: -10, fill: '#9ca3af' }} />
                      <YAxis stroke="#9ca3af" label={{ value: 'Proportion', angle: -90, position: 'insideLeft', fill: '#9ca3af' }} />
                      <Tooltip contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px' }}
                        formatter={(v) => v != null ? [Number(v).toFixed(3)] : ['']} />
                      <Legend verticalAlign="top" />
                      <ReferenceLine x="0" stroke="#6b7280" strokeDasharray="4 4" />
                      {revealed && (
                        <>
                          <Line type="monotone" dataKey="session1" stroke="#34d399" strokeWidth={2} dot={{ r: 3 }} name="S1 (delayed)" connectNulls={false}>
                            <ErrorBar dataKey="sem1" width={4} strokeWidth={1.5} stroke="#34d399" direction="y" />
                          </Line>
                          <Line type="monotone" dataKey="session2" stroke="#60a5fa" strokeWidth={2} dot={{ r: 3 }} name="S2 (immediate)" connectNulls={false}>
                            <ErrorBar dataKey="sem2" width={4} strokeWidth={1.5} stroke="#60a5fa" direction="y" />
                          </Line>
                        </>
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>

              <ChartCard title="Lag-CRP (Conditional Response Probability)">
                {(revealed) => (
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={lagCRPCombined} margin={{ top: 10, right: 20, left: 10, bottom: 30 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="lag" stroke="#9ca3af" label={{ value: 'Lag', position: 'insideBottom', offset: -10, fill: '#9ca3af' }} />
                      <YAxis stroke="#9ca3af" domain={[0, 'auto']} label={{ value: 'CRP', angle: -90, position: 'insideLeft', fill: '#9ca3af' }} />
                      <Tooltip contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px' }}
                        formatter={(v) => v != null ? [Number(v).toFixed(3)] : ['']} />
                      <Legend verticalAlign="top" />
                      <ReferenceLine x="0" stroke="#6b7280" strokeDasharray="4 4" />
                      {revealed && (
                        <>
                          <Line type="monotone" dataKey="session1" stroke="#34d399" strokeWidth={2} dot={{ r: 3 }} name="S1 (delayed)" connectNulls={false}>
                            <ErrorBar dataKey="sem1" width={4} strokeWidth={1.5} stroke="#34d399" direction="y" />
                          </Line>
                          <Line type="monotone" dataKey="session2" stroke="#60a5fa" strokeWidth={2} dot={{ r: 3 }} name="S2 (immediate)" connectNulls={false}>
                            <ErrorBar dataKey="sem2" width={4} strokeWidth={1.5} stroke="#60a5fa" direction="y" />
                          </Line>
                        </>
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>
            </div>

            {/* Row 6: Scatter plots */}
            <h2 className="text-lg font-bold text-gray-300 mb-3">Individual Differences</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ChartCard title="Recall: Session 1 vs Session 2">
                {(revealed) => (
                  <ResponsiveContainer width="100%" height={280}>
                    <ScatterChart margin={{ top: 10, right: 20, left: 10, bottom: 30 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis type="number" dataKey="x" stroke="#9ca3af" domain={[0, 100]}
                        label={{ value: 'S1 Recall %', position: 'insideBottom', offset: -10, fill: '#9ca3af' }} />
                      <YAxis type="number" dataKey="y" stroke="#9ca3af" domain={[0, 100]}
                        label={{ value: 'S2 Recall %', angle: -90, position: 'insideLeft', fill: '#9ca3af' }} />
                      <ZAxis range={[60, 60]} />
                      <Tooltip content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload;
                        return (
                          <div style={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: 8, padding: '8px 12px' }}>
                            <p style={{ color: '#e5e7eb', fontWeight: 600, marginBottom: 4 }}>{d.name}</p>
                            <p style={{ color: '#9ca3af', fontSize: 12 }}>S1: {d.x.toFixed(0)}% · S2: {d.y.toFixed(0)}%</p>
                          </div>
                        );
                      }} />
                      {revealed && (
                        <>
                          { }
                          <Scatter data={[{ x: 0, y: 0 }, { x: 100, y: 100 }]}
                            line={{ stroke: '#6b7280', strokeWidth: 1.5, strokeDasharray: '6 4' }}
                            shape={() => <g />}
                            legendType="none" />
                          <Scatter data={recallScatter} fill="#34d399" />
                        </>
                      )}
                    </ScatterChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>

              <ChartCard title="Arithmetic: # Questions vs Accuracy">
                {(revealed) => (
                  <ResponsiveContainer width="100%" height={280}>
                    <ScatterChart margin={{ top: 10, right: 20, left: 10, bottom: 30 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis type="number" dataKey="x" stroke="#9ca3af"
                        label={{ value: '# Questions Attempted', position: 'insideBottom', offset: -10, fill: '#9ca3af' }} />
                      <YAxis type="number" dataKey="y" stroke="#9ca3af" domain={[0, 100]}
                        label={{ value: 'Accuracy %', angle: -90, position: 'insideLeft', fill: '#9ca3af' }} />
                      <ZAxis range={[60, 60]} />
                      <Tooltip content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload;
                        return (
                          <div style={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: 8, padding: '8px 12px' }}>
                            <p style={{ color: '#e5e7eb', fontWeight: 600, marginBottom: 4 }}>{d.name}</p>
                            <p style={{ color: '#9ca3af', fontSize: 12 }}>Questions: {d.x} · Accuracy: {d.y.toFixed(0)}%</p>
                          </div>
                        );
                      }} />
                      {revealed && <Scatter data={arithmeticScatter} fill="#fbbf24" />}
                    </ScatterChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
