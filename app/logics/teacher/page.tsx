'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ErrorBar, Legend, ReferenceLine,
  Cell, ScatterChart, Scatter, ZAxis,
} from 'recharts';
import { Eye, Download, Home, RefreshCw } from 'lucide-react';
import { getSupabase } from '@/lib/supabase';
import { LogicsResponse } from '@/types/logics';
import { verifyPassword } from '@/lib/auth';

const BG = { background: '#1e293b', border: '1px solid #475569', borderRadius: 6, color: '#f1f5f9' };
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
function binomSem(p: number, n: number) { return n > 0 ? Math.sqrt(p * (1 - p) / n) : 0; }
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

function SectionCard({ title, subtitle, children }: {
  title: string; subtitle?: string; children: React.ReactNode;
}) {
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6">
      <div className="mb-4">
        <h2 className="text-base font-bold">{title}</h2>
        {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex flex-col gap-4">{children}</div>
    </div>
  );
}

function FigureCard({ label, children }: {
  label: string; children: (revealed: boolean) => React.ReactNode;
}) {
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="border border-gray-700/50 rounded-xl p-4 bg-gray-800/30">
      <div className="flex items-center justify-between mb-2 gap-3">
        <p className="text-xs text-gray-400 flex-1">{label}</p>
        <button
          onClick={() => setRevealed(r => !r)}
          className="flex-shrink-0 px-3 py-1 bg-purple-500 hover:bg-purple-400 text-white text-xs font-semibold rounded-lg transition-colors"
        >
          {revealed ? 'Hide' : 'Reveal'}
        </button>
      </div>
      {children(revealed)}
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

interface OptionBar { question: string; option: string; pct: number; sem: number; isCorrect: boolean; }

function availabilityData(bySession: BySession): OptionBar[][] {
  const questions = [
    { code: 'Q-A1', label: 'Committees: 2 vs 8 from 10 — which has more?', options: ['more-2', 'more-8', 'same'], labels: ['More 2', 'More 8', 'Same'], correct: 'same' },
    { code: 'Q-A2', label: 'Annual deaths: murder or suicide?', options: ['murder', 'suicide'], labels: ['Murder', 'Suicide'], correct: 'suicide' },
    { code: 'Q-A3', label: 'More deadly: dog or shark attacks?', options: ['dogs', 'sharks'], labels: ['Dogs', 'Sharks'], correct: 'dogs' },
    { code: 'Q-A4', label: 'English words: K as 1st vs 3rd letter?', options: ['start-k', 'third-k'], labels: ['Start K', '3rd K'], correct: 'third-k' },
  ];
  const sessions = Object.values(bySession);
  const n = sessions.length;
  return questions.map(q => {
    return q.options.map((opt, i) => {
      const count = sessions.filter(s => getAnswer(s, q.code) === opt).length;
      const p = n > 0 ? count / n : 0;
      return { question: q.label, option: q.labels[i], pct: round1(p * 100), sem: round1(binomSem(p, n) * 100), isCorrect: opt === q.correct };
    });
  });
}

// ── Representativeness chart data ──────────────────────────────────────────

function representativenessData(bySession: BySession): OptionBar[][] {
  const questions = [
    { code: 'Q-R1', label: 'Coin 6 flips: which sequence more likely?', options: ['mixed', 'blocky', 'equal'], labels: ['Mixed', 'Blocky', 'Equal'], correct: 'equal' },
    { code: 'Q-R2', label: 'Linda: bank teller or teller + feminist?', options: ['teller', 'teller-feminist'], labels: ['Teller', 'Teller+Feminist'], correct: 'teller' },
    { code: 'Q-R3', label: '5 heads in a row — next flip?', options: ['heads', 'tails', 'equal'], labels: ['Heads', 'Tails', 'Equal'], correct: 'equal' },
  ];
  const sessions = Object.values(bySession);
  const n = sessions.length;
  return questions.map(q => {
    return q.options.map((opt, i) => {
      const count = sessions.filter(s => getAnswer(s, q.code) === opt).length;
      const p = n > 0 ? count / n : 0;
      return { question: q.label, option: q.labels[i], pct: round1(p * 100), sem: round1(binomSem(p, n) * 100), isCorrect: opt === q.correct };
    });
  });
}

// ── Anchoring chart data ───────────────────────────────────────────────────

interface AnchorPoint { question: string; medianA: number; medianB: number; semA: number; semB: number; q25A: number; q75A: number; q25B: number; q75B: number; trueValue: number; }

function normalizeAnchoring(code: string, v: number): number {
  if (code === 'Q-ANCH-1-s2') {
    // Turkey population in millions: if > 1000, assume raw number
    return v > 1000 ? v / 1_000_000 : v;
  }
  return v;
}

function anchoringData(bySession: BySession): AnchorPoint[] {
  const items = [
    { code: 'Q-ANCH-1-s2', label: 'Turkey population (M) — anchor 20M vs 100M', trueValue: 85 },
    { code: 'Q-ANCH-2-s2', label: 'African UN members (%) — anchor 10% vs 65%', trueValue: 28 },
    { code: 'Q-ANCH-3-s2', label: '1×2×…×8 estimate — ascending vs descending', trueValue: 40320 },
  ];
  const sessions = Object.values(bySession);
  return items.map(item => {
    const groupA = sessions.filter(s => getGroup(s) === 'A').map(s => getNumeric(s, item.code)).filter((v): v is number => v != null).map(v => normalizeAnchoring(item.code, v));
    const groupB = sessions.filter(s => getGroup(s) === 'B').map(s => getNumeric(s, item.code)).filter((v): v is number => v != null).map(v => normalizeAnchoring(item.code, v));
    return {
      question: item.label,
      medianA: round1(median(groupA)),
      medianB: round1(median(groupB)),
      semA: round1(sem(groupA)),
      semB: round1(sem(groupB)),
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
    { task: 'Abstract: E K 4 7 — must flip E+7', pctCorrect: round1(mean(correctA) * 100), sem: round1(sem(correctA.map(v => v * 100))) },
    { task: 'Social: bar inspector — check beer+16yo', pctCorrect: round1(mean(correctB) * 100), sem: round1(sem(correctB.map(v => v * 100))) },
  ];
}

// ── Rule discovery data (per-triple classification) ───────────────────────

function isConfirmingTriple(triple: { numbers: number[]; fits: boolean }): boolean {
  const [a, b, c] = triple.numbers;
  return a < b && b < c && (b - a) === (c - b);
}

interface ParticipantRule {
  sid: string;
  name: string;
  confirmCount: number;
  disconfirmCount: number;
  biasScore: number;
  ruleGuess: string;
  ruleCorrect: boolean;
}

function isRuleGuessCorrect(guess: string): boolean {
  if (!guess) return false;
  const g = guess.toLowerCase().trim();
  const hasAscending = /ascend|increas|go.?up|each.*(?:larger|bigger|greater)|larger.*prev|bigger.*prev|עולה|הולך.*וגדל|כל.*מספר.*גדול|סדר.*עולה|מספרים.*עולים|גדול.*מ.*(?:הקודם|שלפניו)|שלושה.*עולים/i.test(g);
  if (!hasAscending) return false;
  const isRestricted = /\+\s*2|plus\s*2|by\s*2|gap\s*(?:of\s*)?2|increment|הפרש|קבוע|constant|equal.*gap|same.*diff|even|זוגי|כפולות/i.test(g);
  return !isRestricted;
}

function ruleDiscoveryData(bySession: BySession): { participants: ParticipantRule[]; topGuesses: { guess: string; count: number }[] } {
  const sessions = Object.values(bySession);
  const guessCounts: Record<string, number> = {};
  const participants: ParticipantRule[] = [];

  for (const s of sessions) {
    const row = s.find(r => r.question_code === 'Q-RULE');
    if (!row) continue;
    const guess = row.rule_guess || '';
    if (guess) {
      const g = guess.toLowerCase().trim();
      guessCounts[g] = (guessCounts[g] || 0) + 1;
    }
    let confirmCount = 0, disconfirmCount = 0;
    if (row.rule_triples_json) {
      try {
        const triples = JSON.parse(row.rule_triples_json) as { numbers: number[]; fits: boolean }[];
        for (const t of triples) {
          if (isConfirmingTriple(t)) confirmCount++;
          else disconfirmCount++;
        }
      } catch { /* ignore */ }
    }
    participants.push({
      sid: s[0].session_id,
      name: s[0].participant_name || s[0].session_id.slice(0, 6),
      confirmCount,
      disconfirmCount,
      biasScore: confirmCount - disconfirmCount,
      ruleGuess: guess,
      ruleCorrect: isRuleGuessCorrect(guess),
    });
  }

  const topGuesses = Object.entries(guessCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([guess, count]) => ({ guess, count }));

  return { participants, topGuesses };
}

// ── Paired strip chart (SVG) ──────────────────────────────────────────────

function PairedStripChart({ data }: { data: ParticipantRule[] }) {
  if (!data.length) return <p className="text-gray-500 text-sm">No data</p>;
  const W = 420, H = 260;
  const ml = 55, mr = 45, mt = 28, mb = 36;
  const pw = W - ml - mr, ph = H - mt - mb;
  const maxY = Math.max(5, ...data.flatMap(d => [d.confirmCount, d.disconfirmCount]));
  const yScale = (v: number) => mt + ph - (v / maxY) * ph;
  const x0 = ml + pw * 0.3;
  const x1 = ml + pw * 0.7;
  const meanC = mean(data.map(d => d.confirmCount));
  const meanD = mean(data.map(d => d.disconfirmCount));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-md">
      {Array.from({ length: maxY + 1 }, (_, i) => (
        <g key={i}>
          <line x1={ml} y1={yScale(i)} x2={W - mr} y2={yScale(i)} stroke="#374151" strokeDasharray="2 2" />
          <text x={ml - 8} y={yScale(i) + 4} textAnchor="end" fill="#9ca3af" fontSize={10}>{i}</text>
        </g>
      ))}
      <text x={x0} y={H - 6} textAnchor="middle" fill="#9ca3af" fontSize={11}>Confirming</text>
      <text x={x1} y={H - 6} textAnchor="middle" fill="#9ca3af" fontSize={11}>Disconfirming</text>
      <text x={14} y={mt + ph / 2} textAnchor="middle" fill="#9ca3af" fontSize={10}
        transform={`rotate(-90, 14, ${mt + ph / 2})`}># Triples</text>
      {data.map((d, i) => {
        const jx = ((i * 7 + 3) % 17 - 8) * 1.8;
        return (
          <g key={i} className="cursor-pointer">
            <line x1={x0 + jx} y1={yScale(d.confirmCount)} x2={x1 + jx} y2={yScale(d.disconfirmCount)}
              stroke="#6b7280" strokeWidth={0.7} opacity={0.35} />
            <circle cx={x0 + jx} cy={yScale(d.confirmCount)} r={4} fill="#f97316" opacity={0.75}>
              <title>{d.name}: {d.confirmCount} confirming</title>
            </circle>
            <circle cx={x1 + jx} cy={yScale(d.disconfirmCount)} r={4} fill="#34d399" opacity={0.75}>
              <title>{d.name}: {d.disconfirmCount} disconfirming</title>
            </circle>
          </g>
        );
      })}
      <line x1={x0 - 28} y1={yScale(meanC)} x2={x0 + 28} y2={yScale(meanC)} stroke="#f97316" strokeWidth={2.5} />
      <line x1={x1 - 28} y1={yScale(meanD)} x2={x1 + 28} y2={yScale(meanD)} stroke="#34d399" strokeWidth={2.5} />
      <text x={x0} y={yScale(meanC) - 8} textAnchor="middle" fill="#f97316" fontSize={10} fontWeight="bold">M={round1(meanC)}</text>
      <text x={x1} y={yScale(meanD) - 8} textAnchor="middle" fill="#34d399" fontSize={10} fontWeight="bold">M={round1(meanD)}</text>
    </svg>
  );
}

// ── Framing chart data ─────────────────────────────────────────────────────

interface FramingLikert { question: string; meanA: number; semA: number; meanB: number; semB: number; }
interface FramingChoice { question: string; certainA: number; semA: number; certainB: number; semB: number; }

function framingData(bySession: BySession): { likert: FramingLikert[]; choice: FramingChoice[] } {
  const sessions = Object.values(bySession);
  const likertItems = [
    { code: 'Q-FRAME-1', label: '90% survival vs 10% mortality' },
    { code: 'Q-FRAME-3', label: 'Most passed vs some failed' },
    { code: 'Q-FRAME-4', label: 'Tax break married vs extra tax single' },
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
  const pA = choiceA.length > 0 ? certainACount / choiceA.length : 0;
  const pB = choiceB.length > 0 ? certainBCount / choiceB.length : 0;
  const choice: FramingChoice[] = [{
    question: '600 die: 200 saved vs 400 die',
    certainA: round1(pA * 100),
    semA: round1(binomSem(pA, choiceA.length) * 100),
    certainB: round1(pB * 100),
    semB: round1(binomSem(pB, choiceB.length) * 100),
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

interface CRTPerQ { question: string; correct: number; tempting: number; other: number; semCorrect: number; semTempting: number; }
interface CRTDistribution { score: number; count: number; }

function crtData(bySession: BySession): { perQ: CRTPerQ[]; distribution: CRTDistribution[] } {
  const sessions = Object.values(bySession);
  const n = sessions.length;
  const codes = ['Q-CRT-1', 'Q-CRT-2', 'Q-CRT-3', 'Q-CRT-4', 'Q-CRT-5', 'Q-CRT-6'];
  const labels = [
    'Bat+ball ₪10.10, bat ₪10 more',
    '5 machines → 5 items in 5 min',
    'Grass doubles, 48d full → half?',
    'Pass 2nd place → your place?',
    '15 sheep, all but 8 died',
    '5+5 socks, dark → min pair?',
  ];

  const perQ = codes.map((code, i) => {
    let correct = 0, tempting = 0, other = 0;
    for (const s of sessions) {
      const cat = classifyCRT(code, getAnswer(s, code));
      if (cat === 'correct') correct++;
      else if (cat === 'tempting') tempting++;
      else other++;
    }
    const pC = n > 0 ? correct / n : 0;
    const pT = n > 0 ? tempting / n : 0;
    return {
      question: labels[i],
      correct: round1(pC * 100),
      tempting: round1(pT * 100),
      other: n > 0 ? round1((other / n) * 100) : 0,
      semCorrect: round1(binomSem(pC, n) * 100),
      semTempting: round1(binomSem(pT, n) * 100),
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

// ── CRT RT analysis (CRT only) ───────────────────────────────────────────

interface RTBar { label: string; rt: number; sem: number; }

function crtRtData(bySession: BySession): RTBar[] {
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
  return [
    { label: 'Correct', rt: round1(mean(correctRTs)), sem: round1(sem(correctRTs)) },
    { label: 'Tempting wrong', rt: round1(mean(temptingRTs)), sem: round1(sem(temptingRTs)) },
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
    if (await verifyPassword(pwInput)) {
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

  // Stable jitter seed for rule scatter
  const jitterMap = useMemo(() => {
    const m = new Map<string, number>();
    Object.keys(bySession).forEach((sid, i) => m.set(sid, ((i * 7 + 3) % 17 - 8) * 0.03));
    return m;
  }, [bySession]);

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
        <div className="flex items-center justify-between mb-4 flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Eye className="w-7 h-7 text-purple-400" />
              <h1 className="text-2xl font-bold">Teacher Dashboard — Reasoning</h1>
            </div>
            {!loading && <p className="text-purple-400 font-medium">{nParticipants} participant{nParticipants !== 1 ? 's' : ''}</p>}
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
              sdClean ? 'border-purple-400 text-purple-400' : 'border-gray-600 text-gray-400 hover:border-gray-400'
            }`}>
            {sdClean ? '✓ SD-Clean (±2.5)' : 'Raw Trials'}
          </button>
          <button onClick={() => setExcludeSubs(v => !v)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              excludeSubs ? 'border-purple-400 text-purple-400' : 'border-gray-600 text-gray-400 hover:border-gray-400'
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
            <SectionCard title="7.1 Availability Heuristic" subtitle="% choosing each option (±SEM). Green = correct answer.">
              {availabilityData(bySession).map((qData, qi) => (
                <FigureCard key={qi} label={qData[0]?.question ?? ''}>
                  {(revealed) => (
                    <ResponsiveContainer width="100%" height={100}>
                      <BarChart data={qData} layout="vertical" margin={{ left: 80, right: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                        <XAxis type="number" domain={[0, 'auto']} tick={TICK} />
                        <YAxis type="category" dataKey="option" tick={TICK} width={70} />
                        <Tooltip contentStyle={BG} />
                        {revealed && (
                          <Bar dataKey="pct" name="%" radius={[0, 4, 4, 0]}>
                            <ErrorBar dataKey="sem" width={4} strokeWidth={1.5} stroke="#9ca3af" direction="x" />
                            {qData.map((d, i) => (
                              <Cell key={i} fill={d.isCorrect ? '#34d399' : '#f97316'} />
                            ))}
                          </Bar>
                        )}
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </FigureCard>
              ))}
            </SectionCard>

            {/* 7.2 Representativeness */}
            <SectionCard title="7.2 Representativeness Heuristic" subtitle="% choosing each option (±SEM). Green = correct answer.">
              {representativenessData(bySession).map((qData, qi) => (
                <FigureCard key={qi} label={qData[0]?.question ?? ''}>
                  {(revealed) => (
                    <ResponsiveContainer width="100%" height={100}>
                      <BarChart data={qData} layout="vertical" margin={{ left: 120, right: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                        <XAxis type="number" domain={[0, 'auto']} tick={TICK} />
                        <YAxis type="category" dataKey="option" tick={TICK} width={110} />
                        <Tooltip contentStyle={BG} />
                        {revealed && (
                          <Bar dataKey="pct" name="%" radius={[0, 4, 4, 0]}>
                            <ErrorBar dataKey="sem" width={4} strokeWidth={1.5} stroke="#9ca3af" direction="x" />
                            {qData.map((d, i) => (
                              <Cell key={i} fill={d.isCorrect ? '#34d399' : '#f97316'} />
                            ))}
                          </Bar>
                        )}
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </FigureCard>
              ))}
            </SectionCard>

            {/* 7.3 Anchoring */}
            <SectionCard title="7.3 Anchoring Effect" subtitle="Median estimates: low-anchor (A) vs high-anchor (B). Error bars = SEM. Red line = true value.">
              {anchoringData(bySession).map((item, i) => (
                <FigureCard key={i} label={item.question}>
                  {(revealed) => (
                    <ResponsiveContainer width="100%" height={120}>
                      <BarChart data={[
                        { name: 'Low anchor (A)', value: item.medianA, sem: item.semA },
                        { name: 'High anchor (B)', value: item.medianB, sem: item.semB },
                      ]} margin={{ left: 20, right: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                        <XAxis dataKey="name" tick={TICK} />
                        <YAxis tick={TICK} domain={[0, 'auto']} />
                        <Tooltip contentStyle={BG} />
                        <ReferenceLine y={item.trueValue} stroke="#ef4444" strokeDasharray="4 4" label={{ value: `True: ${item.trueValue.toLocaleString()}`, fill: '#ef4444', fontSize: 10 }} />
                        {revealed && (
                          <Bar dataKey="value" name="Median estimate" radius={[4, 4, 0, 0]}>
                            <ErrorBar dataKey="sem" width={4} strokeWidth={2} stroke="#6b7280" direction="y" />
                            <Cell fill="#60a5fa" />
                            <Cell fill="#f472b6" />
                          </Bar>
                        )}
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </FigureCard>
              ))}
            </SectionCard>

            {/* 7.4 Wason + Rule Discovery */}
            <SectionCard title="7.4 Confirmation Bias" subtitle="Wason selection task + 2-4-6 rule discovery.">
              <FigureCard label="Wason: % correct (exactly the 2 right cards). Abstract: E+7. Social: beer+16yo. (±SEM)">
                {(revealed) => {
                  const data = wasonData(bySession);
                  return (
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={data} margin={{ left: 10, right: 10 }} barCategoryGap="30%">
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                        <XAxis dataKey="task" tick={TICK} />
                        <YAxis domain={[0, 'auto']} tick={TICK}
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
              </FigureCard>
              <FigureCard label="2-4-6: Confirming vs disconfirming triples per participant (connected dots). Line = mean.">
                {(revealed) => {
                  const { participants } = ruleDiscoveryData(bySession);
                  if (!revealed) return <div className="h-32" />;
                  if (!participants.length) return <p className="text-gray-500 text-sm">No data</p>;
                  return <PairedStripChart data={participants} />;
                }}
              </FigureCard>
              <FigureCard label="2-4-6: Confirmation bias score (#confirm − #disconfirm) by rule correctness. Diamonds = means.">
                {(revealed) => {
                  const { participants, topGuesses } = ruleDiscoveryData(bySession);
                  if (!revealed) return <div className="h-32" />;
                  if (!participants.length) return <p className="text-gray-500 text-sm">No data</p>;
                  const biasScatterData = participants.map(p => ({
                    x: (p.ruleCorrect ? 1 : 0) + (jitterMap.get(p.sid) ?? 0),
                    y: p.biasScore, name: p.name, ruleCorrect: p.ruleCorrect,
                  }));
                  const correctBias = participants.filter(p => p.ruleCorrect).map(p => p.biasScore);
                  const wrongBias = participants.filter(p => !p.ruleCorrect).map(p => p.biasScore);
                  const minBias = Math.min(0, ...participants.map(p => p.biasScore));
                  const maxBias = Math.max(0, ...participants.map(p => p.biasScore));
                  return (
                    <div className="flex flex-col gap-4">
                      <ResponsiveContainer width="100%" height={220}>
                        <ScatterChart margin={{ left: 10, right: 20, top: 10, bottom: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                          <XAxis type="number" dataKey="x" domain={[-0.4, 1.4]} tick={TICK}
                            ticks={[0, 1]}
                            tickFormatter={(v: number) => v === 0 ? 'Incorrect' : v === 1 ? 'Correct' : ''}
                            label={{ value: 'Rule guess', position: 'insideBottom', offset: -10, style: LBL }}
                          />
                          <YAxis dataKey="y" tick={TICK} domain={[minBias - 1, maxBias + 1]}
                            label={{ value: 'Bias score', angle: -90, position: 'insideLeft', style: LBL }} />
                          <ZAxis range={[50, 50]} />
                          <Tooltip contentStyle={BG} content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            const d = payload[0]?.payload;
                            if (!d?.name) return null;
                            return (
                              <div style={BG} className="px-3 py-2 text-sm">
                                <p className="font-semibold text-white">{d.name}</p>
                                <p style={{ color: '#c4b5fd' }}>Bias score: {d.y}</p>
                                <p style={{ color: '#9ca3af' }}>Rule: {d.ruleCorrect ? 'Correct' : 'Incorrect'}</p>
                              </div>
                            );
                          }} />
                          <ReferenceLine y={0} stroke="#6b7280" strokeDasharray="4 4" />
                          <Scatter data={biasScatterData} fill="#a78bfa" opacity={0.7} />
                          {wrongBias.length > 0 && (
                            <Scatter data={[{ x: 0, y: round1(mean(wrongBias)) }]} fill="#ef4444" shape="diamond" legendType="none">
                              <ZAxis range={[120, 120]} />
                            </Scatter>
                          )}
                          {correctBias.length > 0 && (
                            <Scatter data={[{ x: 1, y: round1(mean(correctBias)) }]} fill="#34d399" shape="diamond" legendType="none">
                              <ZAxis range={[120, 120]} />
                            </Scatter>
                          )}
                        </ScatterChart>
                      </ResponsiveContainer>
                      {topGuesses.length > 0 && (
                        <div>
                          <p className="text-xs text-gray-400 mb-1">Top guessed rules:</p>
                          {topGuesses.map((g, gi) => (
                            <p key={gi} className="text-sm text-gray-300">
                              <span className="text-gray-500">{g.count}×</span> {g.guess}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                }}
              </FigureCard>
            </SectionCard>

            {/* 7.5 Framing */}
            <SectionCard title="7.5 Framing Effect" subtitle="Group A = positive frame, Group B = negative frame.">
              <FigureCard label="Likert ratings (1-5) by frame group (±SEM)">
                {(revealed) => {
                  const { likert } = framingData(bySession);
                  return (
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
                  );
                }}
              </FigureCard>
              <FigureCard label="Disease problem: % choosing certain option by frame (±SEM)">
                {(revealed) => {
                  const { choice } = framingData(bySession);
                  return (
                    <ResponsiveContainer width="100%" height={120}>
                      <BarChart data={choice} margin={{ left: 10, right: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                        <XAxis dataKey="question" tick={TICK} />
                        <YAxis domain={[0, 'auto']} tick={TICK} />
                        <Tooltip contentStyle={BG} />
                        <Legend verticalAlign="top" />
                        {revealed && (
                          <>
                            <Bar dataKey="certainA" name="Saved frame (A)" fill="#60a5fa" radius={[4, 4, 0, 0]}>
                              <ErrorBar dataKey="semA" width={4} strokeWidth={2} stroke="#3b82f6" direction="y" />
                            </Bar>
                            <Bar dataKey="certainB" name="Die frame (B)" fill="#f472b6" radius={[4, 4, 0, 0]}>
                              <ErrorBar dataKey="semB" width={4} strokeWidth={2} stroke="#ec4899" direction="y" />
                            </Bar>
                          </>
                        )}
                      </BarChart>
                    </ResponsiveContainer>
                  );
                }}
              </FigureCard>
            </SectionCard>

            {/* 7.6 CRT + RT */}
            <SectionCard title="7.6 Cognitive Reflection Test (CRT)" subtitle="6 questions with tempting intuitive answers.">
              <FigureCard label="Per question: correct vs tempting vs other (% stacked)">
                {(revealed) => {
                  const { perQ } = crtData(bySession);
                  return (
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={perQ} margin={{ left: 10, right: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                        <XAxis dataKey="question" tick={TICK} interval={0} angle={-15} textAnchor="end" height={50} />
                        <YAxis domain={[0, 'auto']} tick={TICK}
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
                  );
                }}
              </FigureCard>
              <FigureCard label="Score distribution (0-6 correct)">
                {(revealed) => {
                  const { distribution } = crtData(bySession);
                  return (
                    <ResponsiveContainer width="100%" height={150}>
                      <BarChart data={distribution} margin={{ left: 10, right: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                        <XAxis dataKey="score" tick={TICK} label={{ value: 'Score', position: 'insideBottom', offset: -5, style: LBL }} />
                        <YAxis tick={TICK} domain={[0, 'auto']}
                          label={{ value: 'Count', angle: -90, position: 'insideLeft', style: LBL }} />
                        <Tooltip contentStyle={BG} />
                        {revealed && (
                          <Bar dataKey="count" name="Participants" fill="#a78bfa" radius={[4, 4, 0, 0]} />
                        )}
                      </BarChart>
                    </ResponsiveContainer>
                  );
                }}
              </FigureCard>
              <FigureCard label="CRT reaction time: correct vs tempting answers (±SEM)">
                {(revealed) => {
                  const rtData = crtRtData(bySession);
                  return (
                    <ResponsiveContainer width="100%" height={160}>
                      <BarChart data={rtData} margin={{ left: 10, right: 10 }} barCategoryGap="30%">
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                        <XAxis dataKey="label" tick={TICK} />
                        <YAxis tick={TICK} domain={[0, 'auto']}
                          label={{ value: 'RT (ms)', angle: -90, position: 'insideLeft', style: LBL }} />
                        <Tooltip contentStyle={BG} />
                        {revealed && (
                          <Bar dataKey="rt" name="Mean RT" radius={[4, 4, 0, 0]}>
                            <ErrorBar dataKey="sem" width={4} strokeWidth={2} stroke="#6b7280" direction="y" />
                            <Cell fill="#34d399" />
                            <Cell fill="#f97316" />
                          </Bar>
                        )}
                      </BarChart>
                    </ResponsiveContainer>
                  );
                }}
              </FigureCard>
            </SectionCard>

          </div>
        )}
      </div>
    </div>
  );
}
