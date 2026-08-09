'use client';

import React, { useState, useEffect, useMemo, FormEvent, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ErrorBar, ScatterChart, Scatter, Cell, Legend,
  LineChart, Line,
} from 'recharts';
import { GraduationCap, RefreshCw, Download } from 'lucide-react';
import { getSupabase } from '@/lib/supabase';
import { generateMockData } from '@/lib/two-step-task/mock-data';
import { verifyPassword } from '@/lib/auth';

function mean(vals: number[]): number {
  if (vals.length === 0) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function sem(vals: number[]): number {
  if (vals.length < 2) return 0;
  const m = mean(vals);
  const v = vals.reduce((a, x) => a + (x - m) ** 2, 0) / (vals.length - 1);
  return Math.sqrt(v / vals.length);
}

// ── Correlation helpers ──────────────────────────────────────────────────────

function lgamma(x: number): number {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.001208650973866179, -0.000005395239384953];
  let y = x, tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (const coef of c) ser += coef / ++y;
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}

function betacf(a: number, b: number, x: number): number {
  const qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 - qab * x / qap;
  if (Math.abs(d) < 1e-30) d = 1e-30;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 200; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < 1e-30) d = 1e-30; d = 1 / d;
    c = 1 + aa / c; if (Math.abs(c) < 1e-30) c = 1e-30;
    h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < 1e-30) d = 1e-30; d = 1 / d;
    c = 1 + aa / c; if (Math.abs(c) < 1e-30) c = 1e-30;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 3e-12) break;
  }
  return h;
}

function ibeta(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  if (x < (a + 1) / (a + b + 2)) return bt * betacf(a, b, x) / a;
  return 1 - bt * betacf(b, a, 1 - x) / b;
}

function pearsonCorr(xs: number[], ys: number[]): { r: number; df: number; p: number } | null {
  const n = xs.length;
  if (n < 3) return null;
  const mx = mean(xs), my = mean(ys);
  let sxy = 0, sx2 = 0, sy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    sxy += dx * dy; sx2 += dx * dx; sy2 += dy * dy;
  }
  if (sx2 === 0 || sy2 === 0) return null;
  const r = sxy / Math.sqrt(sx2 * sy2);
  const df = n - 2;
  if (Math.abs(r) >= 0.9999) return { r, df, p: 0 };
  const t2 = r * r * df / (1 - r * r);
  const p = ibeta(df / 2, 0.5, df / (df + t2));
  return { r, df, p };
}

function fmtCorr(c: { r: number; df: number; p: number } | null): string {
  if (!c) return '';
  const pStr = c.p < 0.001 ? 'p<.001' : `p=${c.p.toFixed(3)}`;
  return ` — r=${c.r.toFixed(2)}, df=${c.df}, ${pStr}`;
}

// ── Types ────────────────────────────────────────────────────────────────────

type Row = {
  session_id: string;
  participant_name: string | null;
  trial_index: number;
  is_practice: boolean;
  stage1_choice: string;
  stage1_stimulus: string;
  stage1_rt_ms: number | null;
  transition_type: string;
  stage2_state: string;
  stage2_choice: string;
  stage2_stimulus: string;
  stage2_rt_ms: number | null;
  rewarded: boolean;
  reward_prob_s2a_left: number;
  reward_prob_s2a_right: number;
  reward_prob_s2b_left: number;
  reward_prob_s2b_right: number;
  missed_stage1: boolean;
  missed_stage2: boolean;
  created_at: string;
};

// ── Analysis helpers ─────────────────────────────────────────────────────────

function computeStaySwitch(rows: Row[]): { rewCommon: number[]; rewRare: number[]; unrCommon: number[]; unrRare: number[] } {
  const bySession: Record<string, Row[]> = {};
  for (const r of rows) {
    if (r.missed_stage1 || r.missed_stage2) continue;
    (bySession[r.session_id] ??= []).push(r);
  }

  const rewCommon: number[] = [];
  const rewRare: number[] = [];
  const unrCommon: number[] = [];
  const unrRare: number[] = [];

  for (const trials of Object.values(bySession)) {
    const sorted = trials.sort((a, b) => a.trial_index - b.trial_index);
    let rc = 0, rcN = 0, rr = 0, rrN = 0, uc = 0, ucN = 0, ur = 0, urN = 0;

    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      const stayed = curr.stage1_choice === prev.stage1_choice ? 1 : 0;
      const wasRewarded = prev.rewarded;
      const wasCommon = prev.transition_type === 'common';

      if (wasRewarded && wasCommon) { rc += stayed; rcN++; }
      else if (wasRewarded && !wasCommon) { rr += stayed; rrN++; }
      else if (!wasRewarded && wasCommon) { uc += stayed; ucN++; }
      else { ur += stayed; urN++; }
    }

    if (rcN > 0) rewCommon.push((rc / rcN) * 100);
    if (rrN > 0) rewRare.push((rr / rrN) * 100);
    if (ucN > 0) unrCommon.push((uc / ucN) * 100);
    if (urN > 0) unrRare.push((ur / urN) * 100);
  }

  return { rewCommon, rewRare, unrCommon, unrRare };
}

interface ParticipantRL {
  name: string;
  sessionId: string;
  mbIndex: number;
  mfIndex: number;
  meanRt: number;
  coins: number;
  totalTrials: number;
}

function computeRLIndices(rows: Row[]): ParticipantRL[] {
  const bySession: Record<string, Row[]> = {};
  for (const r of rows) {
    if (r.missed_stage1 || r.missed_stage2) continue;
    (bySession[r.session_id] ??= []).push(r);
  }

  const results: ParticipantRL[] = [];

  for (const [sessionId, trials] of Object.entries(bySession)) {
    const sorted = trials.sort((a, b) => a.trial_index - b.trial_index);
    const name = sorted[0]?.participant_name ?? sessionId.slice(0, 8);

    let rcStay = 0, rcN = 0, rrStay = 0, rrN = 0;
    let ucStay = 0, ucN = 0, urStay = 0, urN = 0;

    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      const stayed = curr.stage1_choice === prev.stage1_choice ? 1 : 0;
      const wasRewarded = prev.rewarded;
      const wasCommon = prev.transition_type === 'common';

      if (wasRewarded && wasCommon) { rcStay += stayed; rcN++; }
      else if (wasRewarded && !wasCommon) { rrStay += stayed; rrN++; }
      else if (!wasRewarded && wasCommon) { ucStay += stayed; ucN++; }
      else { urStay += stayed; urN++; }
    }

    if (rcN + rrN + ucN + urN < 2) continue;

    const pRC = rcN > 0 ? rcStay / rcN : 0.5;
    const pRR = rrN > 0 ? rrStay / rrN : 0.5;
    const pUC = ucN > 0 ? ucStay / ucN : 0.5;
    const pUR = urN > 0 ? urStay / urN : 0.5;

    // MF index: main effect of reward on stay = P(stay|rew) - P(stay|unrew)
    const mfIndex = ((pRC + pRR) / 2) - ((pUC + pUR) / 2);
    // MB index: reward × transition interaction
    const mbIndex = (pRC - pRR) - (pUC - pUR);

    const rts = sorted.filter(r => r.stage1_rt_ms != null).map(r => r.stage1_rt_ms!);
    const meanRt = rts.length > 0 ? mean(rts) : 0;
    const totalCoins = sorted.filter(r => r.rewarded).length;

    results.push({ name, sessionId, mbIndex, mfIndex, meanRt, coins: totalCoins, totalTrials: sorted.length });
  }

  return results;
}

// ── Trial exclusion ──────────────────────────────────────────────────────────

function sdCleanTrials(rows: Row[]): Row[] {
  const sessions = Array.from(new Set(rows.map(r => r.session_id)));
  const cleaned: Row[] = [];
  for (const sid of sessions) {
    const sRows = rows.filter(r => r.session_id === sid);
    const rts = sRows.filter(r => r.stage1_rt_ms != null && !r.missed_stage1).map(r => r.stage1_rt_ms!);
    if (rts.length < 2) { cleaned.push(...sRows); continue; }
    const m = mean(rts);
    const sd = Math.sqrt(rts.reduce((a, b) => a + (b - m) ** 2, 0) / (rts.length - 1));
    const lo = m - 2.5 * sd, hi = m + 2.5 * sd;
    cleaned.push(...sRows.filter(r =>
      r.stage1_rt_ms == null || r.missed_stage1 || (r.stage1_rt_ms >= lo && r.stage1_rt_ms <= hi)
    ));
  }
  return cleaned;
}

function excludeParticipants(rows: Row[]): { kept: Row[]; excludedIds: Set<string> } {
  const sessions = Array.from(new Set(rows.map(r => r.session_id)));
  if (sessions.length < 2) return { kept: rows, excludedIds: new Set() };

  const pStats = sessions.map(sid => {
    const sRows = rows.filter(r => r.session_id === sid);
    const nonMissed = sRows.filter(r => !r.missed_stage1 && !r.missed_stage2);
    const completionRate = sRows.length > 0 ? nonMissed.length / sRows.length : 0;
    const rts = nonMissed.filter(r => r.stage1_rt_ms != null).map(r => r.stage1_rt_ms!);
    const rt = rts.length > 0 ? mean(rts) : 0;
    return { sid, completionRate, rt };
  });

  const rts = pStats.map(p => p.rt);
  const comps = pStats.map(p => p.completionRate);
  const rtM = mean(rts);
  const rtSd = Math.sqrt(rts.reduce((a, b) => a + (b - rtM) ** 2, 0) / (rts.length - 1));
  const compM = mean(comps);
  const compSd = Math.sqrt(comps.reduce((a, b) => a + (b - compM) ** 2, 0) / (comps.length - 1));

  const excludedIds = new Set<string>();
  for (const p of pStats) {
    if (p.rt < rtM - 2.5 * rtSd || p.rt > rtM + 2.5 * rtSd) excludedIds.add(p.sid);
    if (p.completionRate < compM - 2.5 * compSd) excludedIds.add(p.sid);
  }

  return { kept: rows.filter(r => !excludedIds.has(r.session_id)), excludedIds };
}

// ── Components ───────────────────────────────────────────────────────────────

function ChartCard({ title, children, headerExtra }: { title: string; children: (revealed: boolean) => React.ReactNode; headerExtra?: React.ReactNode }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="bg-card border border-border rounded-xl p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-semibold text-gray-200">{title}</h3>
        <div className="flex items-center gap-3">
          {headerExtra}
          <button
            onClick={() => setRevealed(r => !r)}
            className="text-xs px-3 py-1 rounded-full border border-gray-600 text-gray-400 hover:border-emerald-400 hover:text-emerald-400 transition-colors"
          >
            {revealed ? 'Hide' : 'Reveal'}
          </button>
        </div>
      </div>
      {children(revealed)}
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-card border border-border rounded-xl px-5 py-3">
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-xl font-bold text-white">{value}</p>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function TwoStepTeacher() {
  const [authed, setAuthed] = useState(false);
  const [pw, setPw] = useState('');
  const [pwError, setPwError] = useState(false);
  const [rawRows, setRawRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [trialMode, setTrialMode] = useState<'raw' | 'sdclean'>('raw');
  const [excludeEnabled, setExcludeEnabled] = useState(false);
  const [selectedParticipant, setSelectedParticipant] = useState<string>('');
  const [useMock, setUseMock] = useState(false);

  const trialCleaned = useMemo(
    () => trialMode === 'sdclean' ? sdCleanTrials(rawRows) : rawRows,
    [rawRows, trialMode],
  );

  const { activeRows, excludedSessions } = useMemo(() => {
    if (!excludeEnabled) return { activeRows: trialCleaned, excludedSessions: new Set<string>() };
    const { kept, excludedIds } = excludeParticipants(trialCleaned);
    return { activeRows: kept, excludedSessions: excludedIds };
  }, [trialCleaned, excludeEnabled]);

  const trialExcludedCount = rawRows.length - trialCleaned.length;
  const nParticipants = new Set(activeRows.map(r => r.session_id)).size;

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    if (await verifyPassword(pw)) setAuthed(true);
    else setPwError(true);
  }

  const fetchData = useCallback(async () => {
    setLoading(true);
    const supabase = getSupabase();
    if (!supabase) { setLoading(false); return; }
    const rows: Row[] = [];
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from('two_step_results')
        .select('*')
        .eq('is_practice', false)
        .order('created_at', { ascending: true })
        .range(from, from + 999);
      if (error || !data || data.length === 0) break;
      rows.push(...(data as Row[]));
      if (data.length < 1000) break;
      from += 1000;
    }
    setRawRows(rows);
    setLoading(false);
  }, []);

  const loadMockData = useCallback(() => {
    setRawRows(generateMockData() as unknown as Row[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!authed) return;
    if (useMock) loadMockData();
    else fetchData();
  }, [authed, useMock, fetchData, loadMockData]);

  // ── Participant list for dropdown ───────────────────────────────────────────
  const participantList = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of activeRows) {
      if (!map.has(r.session_id)) {
        map.set(r.session_id, r.participant_name ?? r.session_id.slice(0, 8));
      }
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [activeRows]);

  useEffect(() => {
    if (participantList.length > 0 && !selectedParticipant) {
      setSelectedParticipant(participantList[0].id);
    }
  }, [participantList, selectedParticipant]);

  // ── Chart 1: Stay probability bar plot ─────────────────────────────────────
  const stayData = useMemo(() => {
    if (activeRows.length === 0) return [];
    const ss = computeStaySwitch(activeRows);
    return [
      { name: 'Rewarded + Common', value: Math.round(mean(ss.rewCommon) * 10) / 10, sem: Math.round(sem(ss.rewCommon) * 10) / 10 },
      { name: 'Rewarded + Rare', value: Math.round(mean(ss.rewRare) * 10) / 10, sem: Math.round(sem(ss.rewRare) * 10) / 10 },
      { name: 'Unrewarded + Common', value: Math.round(mean(ss.unrCommon) * 10) / 10, sem: Math.round(sem(ss.unrCommon) * 10) / 10 },
      { name: 'Unrewarded + Rare', value: Math.round(mean(ss.unrRare) * 10) / 10, sem: Math.round(sem(ss.unrRare) * 10) / 10 },
    ];
  }, [activeRows]);

  const stayYDomain = useMemo((): [number, number] => {
    if (stayData.length === 0) return [0, 100];
    const lo = Math.min(...stayData.map(d => d.value - d.sem));
    const hi = Math.max(...stayData.map(d => d.value + d.sem));
    return [Math.max(0, Math.floor(lo / 5) * 5 - 5), Math.min(100, Math.ceil(hi / 5) * 5 + 5)];
  }, [stayData]);

  // ── Chart 2: RL indices ───────────────────────────────────────────────────
  const rlData = useMemo(() => computeRLIndices(activeRows), [activeRows]);

  const rlBarData = useMemo(() => {
    if (rlData.length === 0) return [];
    const mbVals = rlData.map(p => p.mbIndex);
    const mfVals = rlData.map(p => p.mfIndex);
    return [
      { name: 'Model-Based', value: Math.round(mean(mbVals) * 1000) / 1000, sem: Math.round(sem(mbVals) * 1000) / 1000 },
      { name: 'Model-Free', value: Math.round(mean(mfVals) * 1000) / 1000, sem: Math.round(sem(mfVals) * 1000) / 1000 },
    ];
  }, [rlData]);

  // ── Chart 3: Reward probability walk ──────────────────────────────────────
  const rewardWalkData = useMemo(() => {
    if (!selectedParticipant || activeRows.length === 0) return [];
    return activeRows
      .filter(r => r.session_id === selectedParticipant)
      .sort((a, b) => a.trial_index - b.trial_index)
      .map(r => ({
        trial: r.trial_index + 1,
        'State A Left': Math.round(r.reward_prob_s2a_left * 100),
        'State A Right': Math.round(r.reward_prob_s2a_right * 100),
        'State B Left': Math.round(r.reward_prob_s2b_left * 100),
        'State B Right': Math.round(r.reward_prob_s2b_right * 100),
      }));
  }, [activeRows, selectedParticipant]);

  // ── Chart 4: Coins per participant (jittered scatter) ───────────────────
  const coinsScatterData = useMemo(() => {
    return rlData.map((p, i) => ({
      name: p.name,
      coins: p.coins,
      totalTrials: p.totalTrials,
      jitter: Math.sin(i * 7919 + 0.5) * 0.4,
    }));
  }, [rlData]);

  // ── Diagonal line range for chart (c) ───────────────────────────────────
  const mbMfDiag = useMemo(() => {
    if (rlData.length === 0) return [{ x: -1, y: -1 }, { x: 1, y: 1 }];
    const all = [...rlData.map(d => d.mbIndex), ...rlData.map(d => d.mfIndex)];
    const lo = Math.min(...all), hi = Math.max(...all);
    const pad = (hi - lo) * 0.15 || 0.1;
    return [{ mfIndex: lo - pad, mbIndex: lo - pad }, { mfIndex: hi + pad, mbIndex: hi + pad }];
  }, [rlData]);

  // ── Correlations for charts (f) and (g) ────────────────────────────────
  const corrMB = useMemo(() => {
    if (rlData.length < 3) return null;
    return pearsonCorr(rlData.map(d => d.mbIndex), rlData.map(d => d.meanRt));
  }, [rlData]);

  const corrMF = useMemo(() => {
    if (rlData.length < 3) return null;
    return pearsonCorr(rlData.map(d => d.mfIndex), rlData.map(d => d.meanRt));
  }, [rlData]);

  const downloadCsv = useCallback(async () => {
    if (activeRows.length === 0) return;
    const headers = Object.keys(activeRows[0]).join(',');
    const csv = [headers, ...activeRows.map(r => Object.values(r as unknown as Record<string, unknown>).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `two_step_results_${trialMode}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [activeRows, trialMode]);

  if (!authed) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center px-4">
        <form onSubmit={handleLogin} className="bg-gray-900 border border-gray-700 rounded-2xl p-8 w-full max-w-sm flex flex-col gap-4">
          <div className="flex items-center gap-2 text-emerald-400 mb-2">
            <GraduationCap className="w-6 h-6" />
            <h1 className="text-lg font-bold">Two-Step Task — Teacher Dashboard</h1>
          </div>
          <input
            type="password" value={pw}
            onChange={e => { setPw(e.target.value); setPwError(false); }}
            placeholder="Password"
            className="w-full px-4 py-2 rounded-lg bg-gray-800 border border-gray-600 text-white placeholder-gray-500 focus:outline-none focus:border-emerald-400"
          />
          {pwError && <p className="text-red-400 text-xs">Incorrect password</p>}
          <button type="submit" className="py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-semibold transition-colors">Enter</button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f172a] px-4 py-8">
      <div className="max-w-5xl mx-auto flex flex-col gap-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-emerald-400">
            <GraduationCap className="w-6 h-6" />
            <h1 className="text-xl font-bold">Two-Step Task — Teacher Dashboard</h1>
            {useMock && <span className="text-xs text-amber-400 ml-1">(mock data)</span>}
          </div>
          <div className="flex gap-2 items-center">
            <button
              onClick={() => setUseMock(v => !v)}
              className={`px-3 py-2 text-sm rounded-lg border transition-colors ${
                useMock
                  ? 'bg-amber-500/20 border-amber-400 text-amber-400'
                  : 'border-gray-600 text-gray-400 hover:text-emerald-400 hover:border-emerald-400'
              }`}
            >
              {useMock ? 'Mock Data ON' : 'Mock Data'}
            </button>
            <button onClick={downloadCsv} className="p-2 rounded-lg border border-gray-600 text-gray-400 hover:text-emerald-400 hover:border-emerald-400 transition-colors">
              <Download className="w-4 h-4" />
            </button>
            <button onClick={fetchData} disabled={useMock} className="p-2 rounded-lg border border-gray-600 text-gray-400 hover:text-emerald-400 hover:border-emerald-400 transition-colors disabled:opacity-40">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="flex gap-4 flex-wrap">
          <StatBox label="Participants" value={nParticipants} />
          <StatBox label="Total Trials" value={activeRows.length} />
        </div>

        {/* Toggles */}
        {rawRows.length > 0 && (
          <div className="flex flex-col items-center gap-3">
            <div className="flex rounded-xl border border-border bg-card overflow-hidden">
              <button onClick={() => setTrialMode('raw')} className={`px-5 py-2 text-sm font-medium transition-colors ${trialMode === 'raw' ? 'bg-emerald-500 text-white' : 'text-muted hover:text-foreground'}`}>
                Raw Data
              </button>
              <button onClick={() => setTrialMode('sdclean')} className={`px-5 py-2 text-sm font-medium transition-colors ${trialMode === 'sdclean' ? 'bg-emerald-500 text-white' : 'text-muted hover:text-foreground'}`}>
                SD-Clean (±2.5)
              </button>
            </div>
            <p className="text-xs text-muted h-4">
              {trialMode === 'sdclean'
                ? trialExcludedCount > 0
                  ? `${trialExcludedCount} trial${trialExcludedCount > 1 ? 's' : ''} excluded (${trialCleaned.length} of ${rawRows.length} kept)`
                  : 'No trials excluded'
                : `${rawRows.length} trials`}
            </p>
            <div className="flex rounded-xl border border-border bg-card overflow-hidden">
              <button onClick={() => setExcludeEnabled(false)} className={`px-5 py-2 text-sm font-medium transition-colors ${!excludeEnabled ? 'bg-emerald-500 text-white' : 'text-muted hover:text-foreground'}`}>
                All Participants
              </button>
              <button onClick={() => setExcludeEnabled(true)} className={`px-5 py-2 text-sm font-medium transition-colors ${excludeEnabled ? 'bg-emerald-500 text-white' : 'text-muted hover:text-foreground'}`}>
                Exclude Outliers (±2.5 SD)
              </button>
            </div>
            <p className="text-xs text-muted h-4">
              {excludeEnabled
                ? excludedSessions.size > 0
                  ? `${excludedSessions.size} participant${excludedSessions.size > 1 ? 's' : ''} excluded`
                  : 'No participants excluded'
                : `${nParticipants} participants`}
            </p>
          </div>
        )}

        {loading ? (
          <p className="text-center text-gray-400 py-20">Loading…</p>
        ) : activeRows.length === 0 ? (
          <p className="text-center text-gray-500 py-20">No data yet</p>
        ) : (
          <div className="flex flex-col gap-6">

            {/* Chart 1: Stay probability — the classic Two-Step plot */}
            <ChartCard title="(a) Stay Probability by Reward × Transition">
              {(revealed) => (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={stayData} barCategoryGap="25%">
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="name" stroke="#9ca3af" tick={{ fontSize: 11 }} />
                    <YAxis stroke="#9ca3af" domain={stayYDomain}
                      label={{ value: 'Stay Probability (%)', angle: -90, position: 'insideLeft', fill: '#9ca3af', fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #374151' }} />
                    <Legend verticalAlign="top" />
                    {revealed && (
                      <Bar dataKey="value" fill="#34d399" name="Stay %" radius={[4, 4, 0, 0]}>
                        <ErrorBar dataKey="sem" width={4} strokeWidth={1.5} stroke="#6b7280" direction="y" />
                        <Cell fill="#34d399" />
                        <Cell fill="#34d399" />
                        <Cell fill="#f97316" />
                        <Cell fill="#f97316" />
                      </Bar>
                    )}
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            {/* Chart 2: RL model indices — bar chart */}
            <ChartCard title="(b) Mean Model-Based & Model-Free Indices">
              {(revealed) => (
                <div>
                  <p className="text-xs text-gray-500 mb-3">
                    MF = P(stay|rewarded) − P(stay|unrewarded) · MB = reward × transition interaction
                  </p>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={rlBarData} barCategoryGap="40%">
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="name" stroke="#9ca3af" tick={{ fontSize: 11 }} />
                      <YAxis stroke="#9ca3af"
                        label={{ value: 'Index', angle: -90, position: 'insideLeft', fill: '#9ca3af', fontSize: 11 }} />
                      <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #374151' }} />
                      <Legend verticalAlign="top" />
                      {revealed && (
                        <Bar dataKey="value" name="Index" fill="#34d399" radius={[4, 4, 0, 0]}>
                          <ErrorBar dataKey="sem" width={4} strokeWidth={1.5} stroke="#6b7280" direction="y" />
                          <Cell fill="#8b5cf6" />
                          <Cell fill="#f97316" />
                        </Bar>
                      )}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ChartCard>

            {/* Chart (c): Individual MB vs MF scatter */}
            <ChartCard title="(c) Individual Model-Based vs. Model-Free Indices">
              {(revealed) => (
                <ResponsiveContainer width="100%" height={300}>
                  <ScatterChart margin={{ bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis type="number" dataKey="mfIndex" stroke="#9ca3af" name="MF Index"
                      label={{ value: 'Model-Free Index', position: 'insideBottom', offset: -12, fill: '#9ca3af', fontSize: 11 }} />
                    <YAxis type="number" dataKey="mbIndex" stroke="#9ca3af" name="MB Index"
                      label={{ value: 'Model-Based Index', angle: -90, position: 'insideLeft', fill: '#9ca3af', fontSize: 11 }} />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload as ParticipantRL;
                        return (
                          <div className="bg-[#1e293b] border border-gray-600 rounded px-3 py-2 text-xs">
                            <p className="text-white font-semibold">{d.name}</p>
                            <p className="text-gray-300">MB: {d.mbIndex.toFixed(3)}</p>
                            <p className="text-gray-300">MF: {d.mfIndex.toFixed(3)}</p>
                          </div>
                        );
                      }}
                    />
                    <Scatter
                      data={mbMfDiag}
                      line={{ stroke: '#6b7280', strokeWidth: 1.5, strokeDasharray: '6 4' }}
                      shape={(() => <></>) as unknown as undefined}
                      legendType="none"
                    />
                    {revealed && (
                      <Scatter data={rlData} fill="#34d399" name="Participants">
                        {rlData.map((_, i) => <Cell key={i} fill="#34d399" />)}
                      </Scatter>
                    )}
                  </ScatterChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            {/* Chart (d): Reward probability walk for one participant */}
            <ChartCard
              title="(d) Reward Probability Walk"
              headerExtra={
                participantList.length > 0 ? (
                  <select
                    value={selectedParticipant}
                    onChange={e => setSelectedParticipant(e.target.value)}
                    className="text-xs bg-gray-800 border border-gray-600 text-gray-300 rounded-lg px-2 py-1 focus:outline-none focus:border-emerald-400"
                  >
                    {participantList.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                ) : undefined
              }
            >
              {(revealed) => (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={rewardWalkData} margin={{ bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="trial" stroke="#9ca3af" tick={{ fontSize: 10 }}
                      label={{ value: 'Trial', position: 'insideBottom', offset: -12, fill: '#9ca3af', fontSize: 11 }} />
                    <YAxis stroke="#9ca3af" domain={[20, 80]}
                      label={{ value: 'Reward Prob (%)', angle: -90, position: 'insideLeft', fill: '#9ca3af', fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #374151' }} />
                    <Legend verticalAlign="top" />
                    {revealed && (
                      <>
                        <Line type="monotone" dataKey="State A Left" stroke="#ec4899" strokeWidth={1.5} dot={false} />
                        <Line type="monotone" dataKey="State A Right" stroke="#f472b6" strokeWidth={1.5} dot={false} strokeDasharray="6 3" />
                        <Line type="monotone" dataKey="State B Left" stroke="#3b82f6" strokeWidth={1.5} dot={false} />
                        <Line type="monotone" dataKey="State B Right" stroke="#60a5fa" strokeWidth={1.5} dot={false} strokeDasharray="6 3" />
                      </>
                    )}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            {/* Chart (e): Coins per participant — jittered scatter */}
            <ChartCard title="(e) Coins Collected per Participant">
              {(revealed) => (
                <ResponsiveContainer width="100%" height={300}>
                  <ScatterChart margin={{ bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" horizontal vertical={false} />
                    <XAxis type="number" dataKey="jitter" stroke="#9ca3af" domain={[-1, 1]}
                      tick={false} axisLine={false} />
                    <YAxis type="number" dataKey="coins" stroke="#9ca3af"
                      label={{ value: 'Coins Collected', angle: -90, position: 'insideLeft', fill: '#9ca3af', fontSize: 11 }} />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload as { name: string; coins: number; totalTrials: number };
                        return (
                          <div className="bg-[#1e293b] border border-gray-600 rounded px-3 py-2 text-xs">
                            <p className="text-white font-semibold">{d.name}</p>
                            <p className="text-yellow-400">Coins: {d.coins}</p>
                            <p className="text-gray-300">Trials: {d.totalTrials}</p>
                            <p className="text-gray-300">Rate: {d.totalTrials > 0 ? Math.round((d.coins / d.totalTrials) * 100) : 0}%</p>
                          </div>
                        );
                      }}
                    />
                    {revealed && (
                      <Scatter data={coinsScatterData} fill="#facc15" name="Participants">
                        {coinsScatterData.map((_, i) => <Cell key={i} fill="#facc15" />)}
                      </Scatter>
                    )}
                  </ScatterChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            {/* Charts (e) and (f) side by side: RT vs MB and RT vs MF */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <ChartCard title={`(f) RT vs. Model-Based Index${fmtCorr(corrMB)}`}>
                {(revealed) => (
                  <ResponsiveContainer width="100%" height={300}>
                    <ScatterChart margin={{ bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis type="number" dataKey="mbIndex" stroke="#9ca3af" name="MB Index"
                        label={{ value: 'Model-Based Index', position: 'insideBottom', offset: -12, fill: '#9ca3af', fontSize: 11 }} />
                      <YAxis type="number" dataKey="meanRt" stroke="#9ca3af" name="Mean RT"
                        label={{ value: 'Mean RT (ms)', angle: -90, position: 'insideLeft', fill: '#9ca3af', fontSize: 11 }} />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const d = payload[0].payload as ParticipantRL;
                          return (
                            <div className="bg-[#1e293b] border border-gray-600 rounded px-3 py-2 text-xs">
                              <p className="text-white font-semibold">{d.name}</p>
                              <p className="text-gray-300">MB: {d.mbIndex.toFixed(3)}</p>
                              <p className="text-gray-300">RT: {Math.round(d.meanRt)} ms</p>
                            </div>
                          );
                        }}
                      />
                      {revealed && (
                        <Scatter data={rlData} fill="#8b5cf6" name="Participants">
                          {rlData.map((_, i) => <Cell key={i} fill="#8b5cf6" />)}
                        </Scatter>
                      )}
                    </ScatterChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>

              <ChartCard title={`(g) RT vs. Model-Free Index${fmtCorr(corrMF)}`}>
                {(revealed) => (
                  <ResponsiveContainer width="100%" height={300}>
                    <ScatterChart margin={{ bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis type="number" dataKey="mfIndex" stroke="#9ca3af" name="MF Index"
                        label={{ value: 'Model-Free Index', position: 'insideBottom', offset: -12, fill: '#9ca3af', fontSize: 11 }} />
                      <YAxis type="number" dataKey="meanRt" stroke="#9ca3af" name="Mean RT"
                        label={{ value: 'Mean RT (ms)', angle: -90, position: 'insideLeft', fill: '#9ca3af', fontSize: 11 }} />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const d = payload[0].payload as ParticipantRL;
                          return (
                            <div className="bg-[#1e293b] border border-gray-600 rounded px-3 py-2 text-xs">
                              <p className="text-white font-semibold">{d.name}</p>
                              <p className="text-gray-300">MF: {d.mfIndex.toFixed(3)}</p>
                              <p className="text-gray-300">RT: {Math.round(d.meanRt)} ms</p>
                            </div>
                          );
                        }}
                      />
                      {revealed && (
                        <Scatter data={rlData} fill="#f97316" name="Participants">
                          {rlData.map((_, i) => <Cell key={i} fill="#f97316" />)}
                        </Scatter>
                      )}
                    </ScatterChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
