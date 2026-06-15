'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ErrorBar, Legend, ReferenceLine,
  Cell,
} from 'recharts';
import { Eye, Download, Home, RefreshCw } from 'lucide-react';
import { getSupabase } from '@/lib/supabase';
import { LogicsResponse } from '@/types/logics';

const PW_HASH = '5f63c8759a4968d6e814db98e85f7658554882b44213d85f3a3b15480f47e69f';

async function sha256(str: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

const BG = { background: '#111827', border: '1px solid #374151', borderRadius: 6 };
const TICK = { fill: '#9ca3af', fontSize: 11 };
const LBL = { fill: '#9ca3af', fontSize: 11 };

function mean(vals: number[]) { return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0; }
function median(vals: number[]) {
  if (!vals.length) return 0;
  const sorted = [...vals].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
function sem(vals: number[]) {
  if (vals.length < 2) return 0;
  const m = mean(vals);
  const v = vals.reduce((a, x) => a + (x - m) ** 2, 0) / (vals.length - 1);
  return Math.sqrt(v / vals.length);
}
function round1(n: number) { return Math.round(n * 10) / 10; }
function q25(vals: number[]) {
  const sorted = [...vals].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * 0.25)] ?? 0;
}
function q75(vals: number[]) {
  const sorted = [...vals].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * 0.75)] ?? 0;
}

// ── Exclusion functions ────────────────────────────────────────────────────

function sdCleanRows(rows: LogicsResponse[]): LogicsResponse[] {
  const sessions = Array.from(new Set(rows.map(r => r.session_id)));
  const cleaned: LogicsResponse[] = [];
  for (const sid of sessions) {
    const sRows = rows.filter(r => r.session_id === sid);
    const rts = sRows.filter(r => r.reaction_time_ms != null).map(r => r.reaction_time_ms);
    if (rts.length < 2) { cleaned.push(...sRows); continue; }
    const m = mean(rts);
    const sd = Math.sqrt(rts.reduce((a, b) => a + (b - m) ** 2, 0) / (rts.length - 1));
    const lo = m - 2.5 * sd, hi = m + 2.5 * sd;
    cleaned.push(...sRows.filter(r => r.reaction_time_ms == null || (r.reaction_time_ms >= lo && r.reaction_time_ms <= hi)));
  }
  return cleaned;
}

function excludeParticipants(rows: LogicsResponse[]): { kept: LogicsResponse[]; excludedIds: Set<string> } {
  const sessions = Array.from(new Set(rows.map(r => r.session_id)));
  if (sessions.length < 2) return { kept: rows, excludedIds: new Set() };
  const pStats = sessions.map(sid => {
    const sRows = rows.filter(r => r.session_id === sid);
    const rt = mean(sRows.map(r => r.reaction_time_ms));
    return { sid, rt };
  });
  const rts = pStats.map(p => p.rt);
  const rtM = mean(rts);
  const rtSd = Math.sqrt(rts.reduce((a, b) => a + (b - rtM) ** 2, 0) / (rts.length - 1));
  const excludedIds = new Set<string>();
  for (const p of pStats) {
    if (p.rt < rtM - 2.5 * rtSd || p.rt > rtM + 2.5 * rtSd) excludedIds.add(p.sid);
  }
  return { kept: rows.filter(r => !excludedIds.has(r.session_id)), excludedIds };
}

// ── ChartCard ──────────────────────────────────────────────────────────────

function ChartCard({ title, subtitle, children }: {
  title: string; subtitle?: string; children: (revealed: boolean) => React.ReactNode;
}) {
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6">
      <div className="flex items-start justify-between mb-1 gap-4">
        <div>
          <h2 className="text-base font-bold">{title}</h2>
          {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
        <button
          onClick={() => setRevealed(r => !r)}
          className="flex-shrink-0 px-4 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-semibold rounded-lg transition-colors"
        >
          {revealed ? 'Hide' : 'Reveal'}
        </button>
      </div>
      <div className="mt-4">{children(revealed)}</div>
    </div>
  );
}

// ── Data helpers ────────────────────────────────────────────────────────────

type BySession = Record<string, LogicsResponse[]>;

function groupBySession(rows: LogicsResponse[]): BySession {
  const m: BySession = {};
  for (const r of rows) (m[r.session_id] ??= []).push(r);
  return m;
}

function getAnswer(session: LogicsResponse[], code: string): string | undefined {
  return session.find(r => r.question_code === code)?.response;
}

function getNumeric(session: LogicsResponse[], code: string): number | undefined {
  const r = session.find(r => r.question_code === code);
  return r?.response_numeric ?? undefined;
}

function getRT(session: LogicsResponse[], code: string): number | undefined {
  return session.find(r => r.question_code === code)?.reaction_time_ms;
}

function getGroup(session: LogicsResponse[]): string {
  return session[0]?.group_assignment ?? 'A';
}

// ── Availability chart data ────────────────────────────────────────────────

interface OptionBar { question: string; option: string; pct: number; isCorrect: boolean; }

function availabilityData(bySession: BySession): OptionBar[][] {
  const questions = [
    { code: 'Q-A1', label: 'Q1: Committee', options: ['more-2', 'more-8', 'same'], labels: ['More 2', 'More 8', 'Same'], correct: 'same' },
    { code: 'Q-A2', label: 'Q2: Death cause', options: ['murder', 'suicide'], labels: ['Murder', 'Suicide'], correct: 'suicide' },
    { code: 'Q-A3', label: 'Q3: Dog vs Shark', options: ['dogs', 'sharks'], labels: ['Dogs', 'Sharks'], correct: 'dogs' },
    { code: 'Q-A4', label: 'Q4: Letter K', options: ['start-k', 'third-k'], labels: ['Start K', '3rd K'], correct: 'third-k' },
  ];
  const sessions = Object.values(bySession);
  const n = sessions.length;
  return questions.map(q => {
    return q.options.map((opt, i) => {
      const count = sessions.filter(s => getAnswer(s, q.code) === opt).length;
      return { question: q.label, option: q.labels[i], pct: n > 0 ? round1((count / n) * 100) : 0, isCorrect: opt === q.correct };
    });
  });
}

// ── Representativeness chart data ──────────────────────────────────────────

function representativenessData(bySession: BySession): OptionBar[][] {
  const questions = [
    { code: 'Q-R1', label: 'Q1: Coin seq', options: ['mixed', 'blocky', 'equal'], labels: ['Mixed', 'Blocky', 'Equal'], correct: 'equal' },
    { code: 'Q-R2', label: 'Q2: Linda', options: ['teller', 'teller-feminist'], labels: ['Teller', 'Teller+Feminist'], correct: 'teller' },
    { code: 'Q-R3', label: 'Q3: Gambler', options: ['heads', 'tails', 'equal'], labels: ['Heads', 'Tails', 'Equal'], correct: 'equal' },
  ];
  const sessions = Object.values(bySession);
  const n = sessions.length;
  return questions.map(q => {
    return q.options.map((opt, i) => {
      const count = sessions.filter(s => getAnswer(s, q.code) === opt).length;
      return { question: q.label, option: q.labels[i], pct: n > 0 ? round1((count / n) * 100) : 0, isCorrect: opt === q.correct };
    });
  });
}

// ── Anchoring chart data ───────────────────────────────────────────────────

interface AnchorPoint { question: string; medianA: number; medianB: number; q25A: number; q75A: number; q25B: number; q75B: number; trueValue: number; }

function anchoringData(bySession: BySession): AnchorPoint[] {
  const items = [
    { code: 'Q-ANCH-1-s2', label: 'Turkey pop. (M)', trueValue: 85 },
    { code: 'Q-ANCH-2-s2', label: 'African UN (%)', trueValue: 28 },
    { code: 'Q-ANCH-3-s2', label: 'Multiplication', trueValue: 40320 },
  ];
  const sessions = Object.values(bySession);
  return items.map(item => {
    const groupA = sessions.filter(s => getGroup(s) === 'A').map(s => getNumeric(s, item.code)).filter((v): v is number => v != null);
    const groupB = sessions.filter(s => getGroup(s) === 'B').map(s => getNumeric(s, item.code)).filter((v): v is number => v != null);
    return {
      question: item.label,
      medianA: round1(median(groupA)),
      medianB: round1(median(groupB)),
      q25A: round1(q25(groupA)), q75A: round1(q75(groupA)),
      q25B: round1(q25(groupB)), q75B: round1(q75(groupB)),
      trueValue: item.trueValue,
    };
  });
}

// ── Confirmation chart data (Wason) ────────────────────────────────────────

interface WasonBar { task: string; pctCorrect: number; sem: number; }

function wasonData(bySession: BySession): WasonBar[] {
  const sessions = Object.values(bySession);
  const correctA = sessions.map(s => {
    const ans = getAnswer(s, 'Q-WASON-A');
    if (!ans) return 0;
    const selected = new Set(ans.split(','));
    return selected.size === 2 && selected.has('E') && selected.has('7') ? 1 : 0;
  });
  const correctB = sessions.map(s => {
    const ans = getAnswer(s, 'Q-WASON-B');
    if (!ans) return 0;
    const selected = new Set(ans.split(','));
    return selected.size === 2 && selected.has('beer') && selected.has('16yo') ? 1 : 0;
  });
  return [
    { task: 'Abstract (Wason)', pctCorrect: round1(mean(correctA) * 100), sem: round1(sem(correctA.map(v => v * 100))) },
    { task: 'Social (Bar)', pctCorrect: round1(mean(correctB) * 100), sem: round1(sem(correctB.map(v => v * 100))) },
  ];
}

// ── Rule discovery data ────────────────────────────────────────────────────

interface RuleData { totalGuesses: number; confirming: number; disconfirming: number; topGuesses: { guess: string; count: number }[]; }

function ruleDiscoveryData(bySession: BySession): RuleData {
  const sessions = Object.values(bySession);
  let confirming = 0;
  let disconfirming = 0;
  let totalGuesses = 0;
  const guessCounts: Record<string, number> = {};

  for (const s of sessions) {
    const row = s.find(r => r.question_code === 'Q-RULE');
    if (!row) continue;
    totalGuesses++;
    if (row.rule_guess) {
      const g = row.rule_guess.toLowerCase().trim();
      guessCounts[g] = (guessCounts[g] || 0) + 1;
    }
    if (row.rule_triples_json) {
      try {
        const triples = JSON.parse(row.rule_triples_json) as { numbers: number[]; fits: boolean }[];
        const hasDisconfirming = triples.some(t => !t.fits) || triples.some(t => {
          const [a, b, c] = t.numbers;
          const isEvenlySpaced = (b - a) === (c - b);
          return !isEvenlySpaced && t.fits;
        });
        if (hasDisconfirming) disconfirming++;
        else confirming++;
      } catch { confirming++; }
    }
  }

  const topGuesses = Object.entries(guessCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([guess, count]) => ({ guess, count }));

  return { totalGuesses, confirming, disconfirming, topGuesses };
}

// ── Framing chart data ─────────────────────────────────────────────────────

interface FramingLikert { question: string; meanA: number; semA: number; meanB: number; semB: number; }
interface FramingChoice { question: string; certainA: number; certainB: number; }

function framingData(bySession: BySession): { likert: FramingLikert[]; choice: FramingChoice[] } {
  const sessions = Object.values(bySession);
  const likertItems = [
    { code: 'Q-FRAME-1', label: 'Medical treatment' },
    { code: 'Q-FRAME-3', label: 'Exam performance' },
    { code: 'Q-FRAME-4', label: 'Tax policy' },
  ];
  const likert = likertItems.map(item => {
    const valsA = sessions.filter(s => getGroup(s) === 'A').map(s => getNumeric(s, item.code)).filter((v): v is number => v != null);
    const valsB = sessions.filter(s => getGroup(s) === 'B').map(s => getNumeric(s, item.code)).filter((v): v is number => v != null);
    return {
      question: item.label,
      meanA: round1(mean(valsA)), semA: round1(sem(valsA)),
      meanB: round1(mean(valsB)), semB: round1(sem(valsB)),
    };
  });

  const choiceA = sessions.filter(s => getGroup(s) === 'A');
  const choiceB = sessions.filter(s => getGroup(s) === 'B');
  const certainACount = choiceA.filter(s => getAnswer(s, 'Q-FRAME-2') === 'certain').length;
  const certainBCount = choiceB.filter(s => getAnswer(s, 'Q-FRAME-2') === 'certain').length;
  const choice = [{
    question: 'Disease program',
    certainA: choiceA.length > 0 ? round1((certainACount / choiceA.length) * 100) : 0,
    certainB: choiceB.length > 0 ? round1((certainBCount / choiceB.length) * 100) : 0,
  }];

  return { likert, choice };
}

// ── CRT chart data ─────────────────────────────────────────────────────────

const CRT_CORRECT: Record<string, string[]> = {
  'Q-CRT-1': ['5'],
  'Q-CRT-2': ['5'],
  'Q-CRT-3': ['47'],
  'Q-CRT-4': ['2', 'second', 'שני', 'שניה', 'שנייה'],
  'Q-CRT-5': ['8'],
  'Q-CRT-6': ['3'],
};

const CRT_TEMPTING: Record<string, string[]> = {
  'Q-CRT-1': ['10'],
  'Q-CRT-2': ['100'],
  'Q-CRT-3': ['24'],
  'Q-CRT-4': ['1', 'first', 'ראשון', 'ראשונה'],
  'Q-CRT-5': ['7'],
  'Q-CRT-6': ['6'],
};

function classifyCRT(code: string, answer: string | undefined): 'correct' | 'tempting' | 'other' {
  if (!answer) return 'other';
  const clean = answer.trim().toLowerCase();
  const numVal = parseFloat(clean);
  if (CRT_CORRECT[code]?.some(c => c === clean || parseFloat(c) === numVal)) return 'correct';
  if (CRT_TEMPTING[code]?.some(c => c === clean || parseFloat(c) === numVal)) return 'tempting';
  return 'other';
}

interface CRTPerQ { question: string; correct: number; tempting: number; other: number; }
interface CRTDistribution { score: number; count: number; }

function crtData(bySession: BySession): { perQ: CRTPerQ[]; distribution: CRTDistribution[]; } {
  const sessions = Object.values(bySession);
  const n = sessions.length;
  const codes = ['Q-CRT-1', 'Q-CRT-2', 'Q-CRT-3', 'Q-CRT-4', 'Q-CRT-5', 'Q-CRT-6'];
  const labels = ['Bat & Ball', 'Machines', 'Grass', 'Race', 'Sheep', 'Socks'];

  const perQ = codes.map((code, i) => {
    let correct = 0, tempting = 0, other = 0;
    for (const s of sessions) {
      const cat = classifyCRT(code, getAnswer(s, code));
      if (cat === 'correct') correct++;
      else if (cat === 'tempting') tempting++;
      else other++;
    }
    return {
      question: labels[i],
      correct: n > 0 ? round1((correct / n) * 100) : 0,
      tempting: n > 0 ? round1((tempting / n) * 100) : 0,
      other: n > 0 ? round1((other / n) * 100) : 0,
    };
  });

  const scoreCounts: Record<number, number> = {};
  for (let i = 0; i <= 6; i++) scoreCounts[i] = 0;
  for (const s of sessions) {
    let score = 0;
    for (const code of codes) {
      if (classifyCRT(code, getAnswer(s, code)) === 'correct') score++;
    }
    scoreCounts[score]++;
  }
  const distribution = Object.entries(scoreCounts).map(([score, count]) => ({
    score: parseInt(score), count,
  }));

  return { perQ, distribution };
}

// ── RT analysis data ───────────────────────────────────────────────────────

interface RTComparison { category: string; correctRT: number; correctSEM: number; wrongRT: number; wrongSEM: number; }

function rtAnalysisData(bySession: BySession): RTComparison[] {
  const sessions = Object.values(bySession);
  const crtCodes = ['Q-CRT-1', 'Q-CRT-2', 'Q-CRT-3', 'Q-CRT-4', 'Q-CRT-5', 'Q-CRT-6'];

  const correctRTs: number[] = [];
  const temptingRTs: number[] = [];
  for (const s of sessions) {
    for (const code of crtCodes) {
      const cat = classifyCRT(code, getAnswer(s, code));
      const rt = getRT(s, code);
      if (rt == null) continue;
      if (cat === 'correct') correctRTs.push(rt);
      else if (cat === 'tempting') temptingRTs.push(rt);
    }
  }

  const wasonCorrectRTs: number[] = [];
  const wasonWrongRTs: number[] = [];
  for (const s of sessions) {
    const ansA = getAnswer(s, 'Q-WASON-A');
    const rtA = getRT(s, 'Q-WASON-A');
    if (ansA && rtA != null) {
      const sel = new Set(ansA.split(','));
      if (sel.size === 2 && sel.has('E') && sel.has('7')) wasonCorrectRTs.push(rtA);
      else wasonWrongRTs.push(rtA);
    }
  }

  return [
    { category: 'CRT', correctRT: round1(mean(correctRTs)), correctSEM: round1(sem(correctRTs)), wrongRT: round1(mean(temptingRTs)), wrongSEM: round1(sem(temptingRTs)) },
    { category: 'Wason Abstract', correctRT: round1(mean(wasonCorrectRTs)), correctSEM: round1(sem(wasonCorrectRTs)), wrongRT: round1(mean(wasonWrongRTs)), wrongSEM: round1(sem(wasonWrongRTs)) },
  ];
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function TeacherPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [allRows, setAllRows] = useState<LogicsResponse[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [authed, setAuthed] = useState(false);
  const [pwInput, setPwInput] = useState('');
  const [pwError, setPwError] = useState(false);
  const [sdClean, setSdClean] = useState(false);
  const [excludeSubs, setExcludeSubs] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem('logics_teacher_authed') === '1') setAuthed(true);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await sha256(pwInput) === PW_HASH) {
      sessionStorage.setItem('logics_teacher_authed', '1');
      setAuthed(true);
    } else { setPwError(true); setPwInput(''); }
  };

  const fetchAllRows = useCallback(async (): Promise<LogicsResponse[]> => {
    const supabase = getSupabase();
    if (!supabase) throw new Error('Supabase not available.');
    const rows: LogicsResponse[] = [];
    let from = 0;
    while (true) {
      const { data, error: err } = await supabase
        .from('logics_results').select('*')
        .order('created_at', { ascending: true })
        .range(from, from + 999);
      if (err) throw new Error(`Database error: ${err.message}`);
      if (!data || data.length === 0) break;
      rows.push(...(data as LogicsResponse[]));
      if (data.length < 1000) break;
      from += 1000;
    }
    return rows;
  }, []);

  const fetchData = useCallback(async () => {
    setRefreshing(true); setError(null);
    try {
      const rows = await fetchAllRows();
      setAllRows(rows);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); setRefreshing(false); }
  }, [fetchAllRows]);

  useEffect(() => { if (authed) fetchData(); }, [authed, fetchData]);

  // Apply exclusion pipeline
  let displayRows = allRows;
  if (sdClean) displayRows = sdCleanRows(displayRows);
  const { kept, excludedIds } = excludeSubs
    ? excludeParticipants(displayRows)
    : { kept: displayRows, excludedIds: new Set<string>() };
  displayRows = kept;

  const bySession = groupBySession(displayRows);
  const nParticipants = Object.keys(bySession).length;

  const handleDownloadCSV = async () => {
    try {
      const rows = await fetchAllRows();
      if (!rows.length) return;
      const headers = Object.keys(rows[0]).join(',');
      const csv = [headers, ...rows.map(r =>
        Object.values(r as unknown as Record<string, unknown>).map(v =>
          typeof v === 'string' && v.includes(',') ? `"${v}"` : (v ?? '')
        ).join(',')
      )].join('\n');
      const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'logics-data.csv'; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { console.error(e); }
  };

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

  return (
    <div className="min-h-screen bg-[#0f172a] text-white">
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Eye className="w-7 h-7 text-emerald-400" />
              <h1 className="text-2xl font-bold">Teacher Dashboard — Reasoning</h1>
            </div>
            {!loading && <p className="text-emerald-400 font-medium">{nParticipants} participant{nParticipants !== 1 ? 's' : ''}</p>}
          </div>
          <div className="flex gap-3 flex-wrap">
            <button onClick={fetchData} disabled={refreshing}
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

        {/* Exclusion toggles */}
        <div className="flex gap-3 mb-6">
          <button onClick={() => setSdClean(v => !v)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              sdClean ? 'border-emerald-400 text-emerald-400' : 'border-gray-600 text-gray-400 hover:border-gray-400'
            }`}>
            {sdClean ? '✓ SD-Clean (±2.5)' : 'Raw Trials'}
          </button>
          <button onClick={() => setExcludeSubs(v => !v)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              excludeSubs ? 'border-emerald-400 text-emerald-400' : 'border-gray-600 text-gray-400 hover:border-gray-400'
            }`}>
            {excludeSubs ? `✓ Excl. Participants (${excludedIds.size})` : 'All Participants'}
          </button>
        </div>

        {error && (
          <div className="bg-red-900/40 border border-red-700 rounded-xl p-4 mb-6">
            <p className="text-red-300 text-sm font-semibold mb-1">Error loading data</p>
            <p className="text-red-400 text-xs font-mono">{error}</p>
          </div>
        )}

        {loading ? (
          <p className="text-center text-gray-400 py-20 text-lg">Loading…</p>
        ) : nParticipants === 0 ? (
          <p className="text-center text-gray-500 py-20 text-lg">No data yet</p>
        ) : (
          <div className="flex flex-col gap-6">

            {/* 7.1 Availability */}
            <ChartCard title="7.1 Availability Heuristic" subtitle="% choosing each option. ★ = correct answer.">
              {(revealed) => {
                const data = availabilityData(bySession);
                return (
                  <div className="flex flex-col gap-4">
                    {data.map((qData, qi) => (
                      <div key={qi}>
                        <p className="text-xs text-gray-400 mb-1">{qData[0]?.question}</p>
                        <ResponsiveContainer width="100%" height={100}>
                          <BarChart data={qData} layout="vertical" margin={{ left: 80, right: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                            <XAxis type="number" domain={[0, 100]} tick={TICK} />
                            <YAxis type="category" dataKey="option" tick={TICK} width={70} />
                            <Tooltip contentStyle={BG} />
                            {revealed && (
                              <Bar dataKey="pct" name="%" radius={[0, 4, 4, 0]}>
                                {qData.map((d, i) => (
                                  <Cell key={i} fill={d.isCorrect ? '#34d399' : '#f97316'} />
                                ))}
                              </Bar>
                            )}
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    ))}
                  </div>
                );
              }}
            </ChartCard>

            {/* 7.2 Representativeness */}
            <ChartCard title="7.2 Representativeness Heuristic" subtitle="% choosing each option. ★ = correct answer.">
              {(revealed) => {
                const data = representativenessData(bySession);
                return (
                  <div className="flex flex-col gap-4">
                    {data.map((qData, qi) => (
                      <div key={qi}>
                        <p className="text-xs text-gray-400 mb-1">{qData[0]?.question}</p>
                        <ResponsiveContainer width="100%" height={100}>
                          <BarChart data={qData} layout="vertical" margin={{ left: 120, right: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                            <XAxis type="number" domain={[0, 100]} tick={TICK} />
                            <YAxis type="category" dataKey="option" tick={TICK} width={110} />
                            <Tooltip contentStyle={BG} />
                            {revealed && (
                              <Bar dataKey="pct" name="%" radius={[0, 4, 4, 0]}>
                                {qData.map((d, i) => (
                                  <Cell key={i} fill={d.isCorrect ? '#34d399' : '#f97316'} />
                                ))}
                              </Bar>
                            )}
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    ))}
                  </div>
                );
              }}
            </ChartCard>

            {/* 7.3 Anchoring */}
            <ChartCard title="7.3 Anchoring Effect" subtitle="Median estimates: low-anchor group (A) vs high-anchor group (B). Line = true value.">
              {(revealed) => {
                const data = anchoringData(bySession);
                return (
                  <div className="flex flex-col gap-4">
                    {data.map((item, i) => (
                      <div key={i}>
                        <p className="text-xs text-gray-400 mb-1">{item.question} (true: {item.trueValue.toLocaleString()})</p>
                        <ResponsiveContainer width="100%" height={120}>
                          <BarChart data={[
                            { name: 'Low anchor (A)', value: item.medianA },
                            { name: 'High anchor (B)', value: item.medianB },
                          ]} margin={{ left: 20, right: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                            <XAxis dataKey="name" tick={TICK} />
                            <YAxis tick={TICK} />
                            <Tooltip contentStyle={BG} />
                            <ReferenceLine y={item.trueValue} stroke="#ef4444" strokeDasharray="4 4" label={{ value: 'True', fill: '#ef4444', fontSize: 10 }} />
                            {revealed && (
                              <Bar dataKey="value" name="Median estimate" radius={[4, 4, 0, 0]}>
                                <Cell fill="#60a5fa" />
                                <Cell fill="#f472b6" />
                              </Bar>
                            )}
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    ))}
                  </div>
                );
              }}
            </ChartCard>

            {/* 7.4 Confirmation Bias */}
            <ChartCard title="7.4 Confirmation Bias — Wason Selection" subtitle="% answering correctly on abstract vs social version.">
              {(revealed) => {
                const data = wasonData(bySession);
                return (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={data} margin={{ left: 10, right: 10 }} barCategoryGap="30%">
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="task" tick={TICK} />
                      <YAxis domain={[0, 100]} tick={TICK}
                        label={{ value: '% Correct', angle: -90, position: 'insideLeft', style: LBL }} />
                      <Tooltip contentStyle={BG} />
                      {revealed && (
                        <Bar dataKey="pctCorrect" name="% Correct" fill="#34d399" radius={[4, 4, 0, 0]}>
                          <ErrorBar dataKey="sem" width={4} strokeWidth={2} stroke="#059669" direction="y" />
                        </Bar>
                      )}
                    </BarChart>
                  </ResponsiveContainer>
                );
              }}
            </ChartCard>

            {/* 7.4b Rule Discovery */}
            <ChartCard title="7.4b Rule Discovery (2-4-6)" subtitle="Confirmation vs disconfirmation testing strategies.">
              {(revealed) => {
                const data = ruleDiscoveryData(bySession);
                if (!revealed) return <div className="h-40" />;
                const total = data.confirming + data.disconfirming;
                return (
                  <div className="flex flex-col gap-4">
                    <div className="flex gap-6">
                      <div className="text-center">
                        <p className="text-3xl font-bold text-orange-400">{total > 0 ? round1((data.confirming / total) * 100) : 0}%</p>
                        <p className="text-xs text-gray-400 mt-1">Confirming only</p>
                      </div>
                      <div className="text-center">
                        <p className="text-3xl font-bold text-emerald-400">{total > 0 ? round1((data.disconfirming / total) * 100) : 0}%</p>
                        <p className="text-xs text-gray-400 mt-1">Tried disconfirming</p>
                      </div>
                    </div>
                    {data.topGuesses.length > 0 && (
                      <div>
                        <p className="text-xs text-gray-400 mb-2">Top guessed rules:</p>
                        {data.topGuesses.map((g, i) => (
                          <p key={i} className="text-sm text-gray-300">
                            <span className="text-gray-500">{g.count}×</span> {g.guess}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                );
              }}
            </ChartCard>

            {/* 7.5 Framing */}
            <ChartCard title="7.5 Framing Effect" subtitle="Mean ratings (Likert 1-5) by frame group. Error bars = SEM.">
              {(revealed) => {
                const { likert, choice } = framingData(bySession);
                return (
                  <div className="flex flex-col gap-6">
                    {/* Likert items */}
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={likert} margin={{ left: 10, right: 10 }} barCategoryGap="20%">
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                        <XAxis dataKey="question" tick={TICK} />
                        <YAxis domain={[1, 5]} tick={TICK}
                          label={{ value: 'Mean rating', angle: -90, position: 'insideLeft', style: LBL }} />
                        <Tooltip contentStyle={BG} />
                        <Legend verticalAlign="top" />
                        {revealed && (
                          <>
                            <Bar dataKey="meanA" name="Group A (positive)" fill="#60a5fa" radius={[4, 4, 0, 0]}>
                              <ErrorBar dataKey="semA" width={4} strokeWidth={2} stroke="#3b82f6" direction="y" />
                            </Bar>
                            <Bar dataKey="meanB" name="Group B (negative)" fill="#f472b6" radius={[4, 4, 0, 0]}>
                              <ErrorBar dataKey="semB" width={4} strokeWidth={2} stroke="#ec4899" direction="y" />
                            </Bar>
                          </>
                        )}
                      </BarChart>
                    </ResponsiveContainer>
                    {/* Choice item */}
                    <div>
                      <p className="text-xs text-gray-400 mb-2">Disease program: % choosing certain option</p>
                      <ResponsiveContainer width="100%" height={120}>
                        <BarChart data={choice} margin={{ left: 10, right: 10 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                          <XAxis dataKey="question" tick={TICK} />
                          <YAxis domain={[0, 100]} tick={TICK} />
                          <Tooltip contentStyle={BG} />
                          <Legend verticalAlign="top" />
                          {revealed && (
                            <>
                              <Bar dataKey="certainA" name="Saved frame (A)" fill="#60a5fa" radius={[4, 4, 0, 0]} />
                              <Bar dataKey="certainB" name="Die frame (B)" fill="#f472b6" radius={[4, 4, 0, 0]} />
                            </>
                          )}
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                );
              }}
            </ChartCard>

            {/* 7.6 CRT / Miserliness */}
            <ChartCard title="7.6 Cognitive Reflection Test (CRT)" subtitle="Per question: correct vs tempting vs other. Distribution of total score.">
              {(revealed) => {
                const { perQ, distribution } = crtData(bySession);
                return (
                  <div className="flex flex-col gap-6">
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={perQ} margin={{ left: 10, right: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                        <XAxis dataKey="question" tick={TICK} />
                        <YAxis domain={[0, 100]} tick={TICK}
                          label={{ value: '%', angle: -90, position: 'insideLeft', style: LBL }} />
                        <Tooltip contentStyle={BG} />
                        <Legend verticalAlign="top" />
                        {revealed && (
                          <>
                            <Bar dataKey="correct" name="Correct" fill="#34d399" stackId="a" />
                            <Bar dataKey="tempting" name="Tempting wrong" fill="#f97316" stackId="a" />
                            <Bar dataKey="other" name="Other" fill="#6b7280" stackId="a" radius={[4, 4, 0, 0]} />
                          </>
                        )}
                      </BarChart>
                    </ResponsiveContainer>
                    <div>
                      <p className="text-xs text-gray-400 mb-2">Score distribution (0-6 correct)</p>
                      <ResponsiveContainer width="100%" height={150}>
                        <BarChart data={distribution} margin={{ left: 10, right: 10 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                          <XAxis dataKey="score" tick={TICK} label={{ value: 'Score', position: 'insideBottom', offset: -5, style: LBL }} />
                          <YAxis tick={TICK} label={{ value: 'Count', angle: -90, position: 'insideLeft', style: LBL }} />
                          <Tooltip contentStyle={BG} />
                          {revealed && (
                            <Bar dataKey="count" name="Participants" fill="#a78bfa" radius={[4, 4, 0, 0]} />
                          )}
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                );
              }}
            </ChartCard>

            {/* 7.7 RT Analysis */}
            <ChartCard title="7.7 Speed: Intuition vs Reflection" subtitle="Mean RT for correct vs tempting/wrong answers. Error bars = SEM.">
              {(revealed) => {
                const data = rtAnalysisData(bySession);
                return (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={data} margin={{ left: 10, right: 10 }} barCategoryGap="20%">
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="category" tick={TICK} />
                      <YAxis tick={TICK}
                        label={{ value: 'RT (ms)', angle: -90, position: 'insideLeft', style: LBL }} />
                      <Tooltip contentStyle={BG} />
                      <Legend verticalAlign="top" />
                      {revealed && (
                        <>
                          <Bar dataKey="correctRT" name="Correct" fill="#34d399" radius={[4, 4, 0, 0]}>
                            <ErrorBar dataKey="correctSEM" width={4} strokeWidth={2} stroke="#059669" direction="y" />
                          </Bar>
                          <Bar dataKey="wrongRT" name="Tempting/Wrong" fill="#f97316" radius={[4, 4, 0, 0]}>
                            <ErrorBar dataKey="wrongSEM" width={4} strokeWidth={2} stroke="#c2410c" direction="y" />
                          </Bar>
                        </>
                      )}
                    </BarChart>
                  </ResponsiveContainer>
                );
              }}
            </ChartCard>

          </div>
        )}
      </div>
    </div>
  );
}
