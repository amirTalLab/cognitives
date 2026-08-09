'use client';

import React, { useState, useEffect, FormEvent, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ErrorBar, LineChart, Line, Cell,
  ScatterChart, Scatter, ZAxis, ComposedChart,
} from 'recharts';
import { GraduationCap, RefreshCw, Download } from 'lucide-react';
import { getSupabase } from '@/lib/supabase';
import { DRMResult, DRMRecallResult } from '@/types/drm';
import { generateMockData } from '@/lib/drm/mock-data';
import { verifyPassword } from '@/lib/auth';

const TICK = { fill: '#9ca3af', fontSize: 11 };
const BG = { background: '#111827', border: '1px solid #374151', borderRadius: 6, color: '#e5e7eb' };

function mean(vals: number[]) { return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0; }
function sem(vals: number[]) {
  if (vals.length < 2) return 0;
  const m = mean(vals);
  const v = vals.reduce((a, x) => a + (x - m) ** 2, 0) / (vals.length - 1);
  return Math.sqrt(v / vals.length);
}
function round1(n: number) { return Math.round(n * 10) / 10; }

function sdCleanRows(rows: DRMResult[]): DRMResult[] {
  const sessions = Array.from(new Set(rows.map(r => r.session_id)));
  const cleaned: DRMResult[] = [];
  for (const sid of sessions) {
    const sRows = rows.filter(r => r.session_id === sid);
    const rts = sRows.filter(r => r.reaction_time_ms != null).map(r => r.reaction_time_ms);
    if (rts.length < 2) { cleaned.push(...sRows); continue; }
    const m = mean(rts);
    const sd = Math.sqrt(rts.reduce((a, b) => a + (b - m) ** 2, 0) / (rts.length - 1));
    const lo = m - 2.5 * sd, hi = m + 2.5 * sd;
    cleaned.push(...sRows.filter(r => r.reaction_time_ms >= lo && r.reaction_time_ms <= hi));
  }
  return cleaned;
}

function excludeParticipants(rows: DRMResult[]): { kept: DRMResult[]; excludedIds: Set<string> } {
  const sessions = Array.from(new Set(rows.map(r => r.session_id)));
  if (sessions.length < 2) return { kept: rows, excludedIds: new Set() };
  const pStats = sessions.map(sid => {
    const sRows = rows.filter(r => r.session_id === sid);
    const correct = sRows.filter(r => r.is_correct);
    const acc = sRows.length > 0 ? correct.length / sRows.length : 0;
    const rt = correct.length > 0 ? mean(correct.map(r => r.reaction_time_ms)) : 0;
    return { sid, acc, rt };
  });
  const rts = pStats.map(p => p.rt);
  const accs = pStats.map(p => p.acc);
  const rtM = mean(rts), accM = mean(accs);
  const rtSd = Math.sqrt(rts.reduce((a, b) => a + (b - rtM) ** 2, 0) / (rts.length - 1));
  const accSd = Math.sqrt(accs.reduce((a, b) => a + (b - accM) ** 2, 0) / (accs.length - 1));

  const excludedIds = new Set<string>();
  for (const p of pStats) {
    if (p.rt < rtM - 2.5 * rtSd || p.rt > rtM + 2.5 * rtSd) excludedIds.add(p.sid);
    if (p.acc < accM - 2.5 * accSd) excludedIds.add(p.sid);
  }
  return { kept: rows.filter(r => !excludedIds.has(r.session_id)), excludedIds };
}

function ChartCard({ title, children }: { title: string; children: (revealed: boolean) => React.ReactNode }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="bg-card border border-border rounded-xl p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-semibold text-gray-200">{title}</h3>
        <button
          onClick={() => setRevealed(r => !r)}
          className={`text-xs px-3 py-1 rounded-full border transition-colors ${
            revealed ? 'border-emerald-400 text-emerald-400' : 'border-gray-600 text-gray-400 hover:border-gray-400'
          }`}
        >
          {revealed ? 'Hide' : 'Reveal'}
        </button>
      </div>
      {children(revealed)}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pctFmt = (v: any): any => v != null ? [`${Number(v).toFixed(1)}%`, ''] : ['', ''];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ScatterTooltip({ active, payload, xLabel, yLabel, yFmt }: any) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{ ...BG, padding: '8px 12px', fontSize: 12 }}>
      <p style={{ fontWeight: 700, marginBottom: 4 }}>{d.name}</p>
      <p>{xLabel}: {d.x}{typeof d.x === 'number' && xLabel.includes('%') ? '%' : ''}</p>
      <p>{yLabel}: {yFmt ? yFmt(d.y) : d.y}{typeof d.y === 'number' && yLabel.includes('%') ? '%' : ''}</p>
    </div>
  );
}

export default function DRMTeacherDashboard() {
  const [authed, setAuthed] = useState(false);
  const [pwInput, setPwInput] = useState('');
  const [pwError, setPwError] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recognitionData, setRecognitionData] = useState<DRMResult[]>([]);
  const [recallData, setRecallData] = useState<DRMRecallResult[]>([]);

  const [sdClean, setSdClean] = useState(false);
  const [excludeSubs, setExcludeSubs] = useState(false);
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

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = getSupabase();
      if (!supabase) throw new Error('Supabase not available');

      const recogRows: DRMResult[] = [];
      let from = 0;
      while (true) {
        const { data, error: e } = await supabase
          .from('drm_results')
          .select('*')
          .order('created_at', { ascending: true })
          .range(from, from + 999);
        if (e || !data || data.length === 0) break;
        recogRows.push(...(data as DRMResult[]));
        if (data.length < 1000) break;
        from += 1000;
      }

      const recRows: DRMRecallResult[] = [];
      from = 0;
      while (true) {
        const { data, error: e } = await supabase
          .from('drm_recall_results')
          .select('*')
          .order('created_at', { ascending: true })
          .range(from, from + 999);
        if (e || !data || data.length === 0) break;
        recRows.push(...(data as DRMRecallResult[]));
        if (data.length < 1000) break;
        from += 1000;
      }

      if (recogRows.length === 0 && recRows.length === 0) {
        setError('No data available yet. Waiting for participants.');
      }

      setRecognitionData(recogRows);
      setRecallData(recRows);
    } catch (err) {
      console.error(err);
      setError('Failed to load data.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMockData = useCallback(() => {
    const { recognition, recall } = generateMockData();
    setRecognitionData(recognition);
    setRecallData(recall);
    setError(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!authed) return;
    if (useMock) loadMockData();
    else fetchData();
  }, [authed, useMock, fetchData, loadMockData]);

  const trialCleanedRows = sdClean ? sdCleanRows(recognitionData) : recognitionData;
  const trialExcludedCount = recognitionData.length - trialCleanedRows.length;
  const { kept, excludedIds } = excludeSubs
    ? excludeParticipants(trialCleanedRows)
    : { kept: trialCleanedRows, excludedIds: new Set<string>() };
  const displayRows = kept;

  const nParticipants = new Set(displayRows.map(r => r.session_id)).size;

  const computeRecognitionChart = () => {
    const sessions = Array.from(new Set(displayRows.map(r => r.session_id)));
    const types = ['studied', 'critical_lure', 'unrelated_foil'] as const;
    const labels = ['Studied Words', 'Critical Lures', 'Unrelated Foils'];
    const colors = ['#34d399', '#f43f5e', '#71717a'];

    return types.map((type, i) => {
      const perParticipant = sessions.map(sid => {
        const items = displayRows.filter(r => r.session_id === sid && r.item_type === type);
        return items.length > 0
          ? (items.filter(r => r.response === 'old').length / items.length) * 100
          : 0;
      });
      return {
        name: labels[i],
        value: round1(mean(perParticipant)),
        sem: round1(sem(perParticipant)),
        fill: colors[i],
      };
    });
  };

  const computeSerialPositionChart = () => {
    const sessions = Array.from(new Set(displayRows.map(r => r.session_id)));
    const studied = displayRows.filter(r => r.item_type === 'studied');

    return Array.from({ length: 10 }, (_, i) => {
      const pos = i + 1;
      const perParticipant = sessions.map(sid => {
        const items = studied.filter(r => r.session_id === sid && r.serial_position === pos);
        return items.length > 0
          ? (items.filter(r => r.response === 'old').length / items.length) * 100
          : 0;
      });
      return {
        position: pos,
        value: round1(mean(perParticipant)),
        sem: round1(sem(perParticipant)),
      };
    });
  };

  const computeConfidenceChart = () => {
    const types = ['studied', 'critical_lure', 'unrelated_foil'] as const;
    const labels = ['Studied', 'Lures', 'Foils'];
    return labels.map((label, i) => {
      const items = displayRows.filter(r => r.item_type === types[i] && r.response === 'old' && r.confidence != null);
      const total = items.length || 1;
      return {
        name: label,
        'Sure old (4)': round1((items.filter(r => r.confidence === 4).length / total) * 100),
        'Probably old (3)': round1((items.filter(r => r.confidence === 3).length / total) * 100),
        'Probably new (2)': round1((items.filter(r => r.confidence === 2).length / total) * 100),
        'Sure new (1)': round1((items.filter(r => r.confidence === 1).length / total) * 100),
      };
    });
  };

  const computeRecallChart = () => {
    const filteredRecall = excludeSubs
      ? recallData.filter(r => !excludedIds.has(r.session_id))
      : recallData;
    const sessions = Array.from(new Set(filteredRecall.map(r => r.session_id)));

    const participantData = sessions.map((sid, i) => {
      const rows = filteredRecall.filter(r => r.session_id === sid);
      const correctPct = rows.length > 0 ? round1(mean(rows.map(r => (r.correct_count / 10) * 100))) : 0;
      const lurePct = rows.length > 0 ? round1((rows.filter(r => r.critical_lure_recalled).length / rows.length) * 100) : 0;
      return { key: `p${i}`, correctPct, lurePct };
    });

    const correctVals = participantData.map(p => p.correctPct);
    const lureVals = participantData.map(p => p.lurePct);

    // Embed per-participant values into each row so Lines share the same X-axis
    const pCorrect: Record<string, number> = {};
    const pLure: Record<string, number> = {};
    participantData.forEach(p => { pCorrect[p.key] = p.correctPct; pLure[p.key] = p.lurePct; });

    const bars = [
      { name: 'Correct Recall', value: round1(mean(correctVals)), sem: round1(sem(correctVals)), fill: '#34d399', ...pCorrect },
      { name: 'False Recall (Lure)', value: round1(mean(lureVals)), sem: round1(sem(lureVals)), fill: '#f43f5e', ...pLure },
    ];

    const pKeys = participantData.map(p => p.key);
    return { bars, pKeys };
  };

  const computeRecallVsRecognitionScatter = () => {
    const filteredRecall = excludeSubs
      ? recallData.filter(r => !excludedIds.has(r.session_id))
      : recallData;
    const recallSessions = Array.from(new Set(filteredRecall.map(r => r.session_id)));
    const recogSessions = new Set(displayRows.map(r => r.session_id));

    return recallSessions
      .filter(sid => recogSessions.has(sid))
      .map(sid => {
        const rRows = filteredRecall.filter(r => r.session_id === sid);
        const recallPct = rRows.length > 0 ? mean(rRows.map(r => (r.correct_count / 12) * 100)) : 0;
        const studied = displayRows.filter(r => r.session_id === sid && r.item_type === 'studied');
        const recogPct = studied.length > 0
          ? (studied.filter(r => r.response === 'old').length / studied.length) * 100 : 0;
        const name = rRows[0]?.participant_name || sid.slice(0, 6);
        return { x: round1(recallPct), y: round1(recogPct), name };
      });
  };

  const computeRecognitionVsConfidenceScatter = () => {
    const sessions = Array.from(new Set(displayRows.map(r => r.session_id)));
    return sessions.map(sid => {
      const sRows = displayRows.filter(r => r.session_id === sid);
      const acc = sRows.length > 0 ? (sRows.filter(r => r.is_correct).length / sRows.length) * 100 : 0;
      const withConf = sRows.filter(r => r.confidence != null);
      const avgConf = withConf.length > 0 ? mean(withConf.map(r => r.confidence!)) : 0;
      const name = sRows[0]?.participant_name || sid.slice(0, 6);
      return { x: round1(acc), y: round1(avgConf), name };
    });
  };

  const computeDistractorScatter = () => {
    const filteredRecall = excludeSubs
      ? recallData.filter(r => !excludedIds.has(r.session_id))
      : recallData;
    const sessions = Array.from(new Set(filteredRecall.map(r => r.session_id)));
    return sessions
      .map(sid => {
        const rRows = filteredRecall.filter(r => r.session_id === sid);
        const totalQ = rRows.reduce((s, r) => s + (r.distractor_total ?? 0), 0);
        const totalC = rRows.reduce((s, r) => s + (r.distractor_correct ?? 0), 0);
        if (totalQ === 0) return null;
        const acc = (totalC / totalQ) * 100;
        const name = rRows[0]?.participant_name || sid.slice(0, 6);
        return { x: totalQ, y: round1(acc), name };
      })
      .filter((d): d is { x: number; y: number; name: string } => d !== null);
  };

  const downloadCSV = () => {
    if (displayRows.length === 0) return;
    const headers = Object.keys(displayRows[0]);
    const csv = [
      headers.join(','),
      ...displayRows.map(r => headers.map(h => JSON.stringify((r as unknown as Record<string, unknown>)[h] ?? '')).join(',')),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'drm_recognition_data.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!authed) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-border rounded-xl p-10 w-full max-w-sm flex flex-col items-center gap-6"
        >
          <GraduationCap className="w-10 h-10 text-emerald-400" />
          <h1 className="text-xl font-bold">Teacher Dashboard</h1>
          <form onSubmit={handleLogin} className="w-full flex flex-col gap-3">
            <input
              type="password" value={pwInput}
              onChange={e => { setPwInput(e.target.value); setPwError(false); }}
              placeholder="Password" autoFocus
              className={`w-full px-4 py-3 rounded-lg border bg-zinc-800 text-white outline-none transition-colors
                ${pwError ? 'border-red-500' : 'border-border focus:border-emerald-400'}`}
            />
            {pwError && <p className="text-red-400 text-sm text-center">Incorrect password</p>}
            <button type="submit"
              className="w-full py-3 bg-emerald-400 hover:bg-emerald-300 text-zinc-900 font-bold rounded-lg transition-colors">
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
            <RefreshCw className="w-8 h-8 text-emerald-400" />
          </motion.div>
          <p className="text-muted">Loading data...</p>
        </div>
      </main>
    );
  }

  const recogChart = computeRecognitionChart();
  const serialChart = computeSerialPositionChart();
  const confChart = computeConfidenceChart();
  const { bars: recallChart, pKeys: recallPKeys } = computeRecallChart();
  const recallVsRecogScatter = computeRecallVsRecognitionScatter();
  const recogVsConfScatter = computeRecognitionVsConfidenceScatter();
  const distractorScatter = computeDistractorScatter();

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto flex flex-col gap-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <GraduationCap className="w-10 h-10 text-emerald-400" />
            <h1 className="text-3xl font-bold tracking-tight">DRM Teacher Dashboard</h1>
          </div>
          <div className="flex gap-2 items-center">
            {useMock && <span className="text-xs text-amber-400 mr-1">(mock data)</span>}
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
            <button onClick={downloadCSV} className="p-2 rounded-lg border border-gray-600 text-gray-400 hover:text-emerald-400 hover:border-emerald-400 transition-colors">
              <Download className="w-4 h-4" />
            </button>
            <button onClick={fetchData} disabled={useMock} className="p-2 rounded-lg border border-gray-600 text-gray-400 hover:text-emerald-400 hover:border-emerald-400 transition-colors disabled:opacity-40">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        <div className="flex gap-4 flex-wrap">
          <StatBox label="Participants" value={nParticipants} />
          <StatBox label="Recognition Trials" value={displayRows.length} />
          <StatBox label="Recall Entries" value={recallData.length} />
        </div>

        {recognitionData.length > 0 && (
          <div className="flex flex-col items-center gap-3">
            <div className="flex rounded-xl border border-border bg-card overflow-hidden">
              <button onClick={() => setSdClean(false)} className={`px-5 py-2 text-sm font-medium transition-colors ${!sdClean ? 'bg-rose-500 text-white' : 'text-muted hover:text-foreground'}`}>
                Raw Data
              </button>
              <button onClick={() => setSdClean(true)} className={`px-5 py-2 text-sm font-medium transition-colors ${sdClean ? 'bg-rose-500 text-white' : 'text-muted hover:text-foreground'}`}>
                SD-Clean (±2.5)
              </button>
            </div>
            <p className="text-xs text-muted h-4">
              {sdClean
                ? trialExcludedCount > 0
                  ? `${trialExcludedCount} trial${trialExcludedCount > 1 ? 's' : ''} excluded (${trialCleanedRows.length} of ${recognitionData.length} kept)`
                  : 'No trials excluded'
                : `${recognitionData.length} trials`}
            </p>
            <div className="flex rounded-xl border border-border bg-card overflow-hidden">
              <button onClick={() => setExcludeSubs(false)} className={`px-5 py-2 text-sm font-medium transition-colors ${!excludeSubs ? 'bg-rose-500 text-white' : 'text-muted hover:text-foreground'}`}>
                All Participants
              </button>
              <button onClick={() => setExcludeSubs(true)} className={`px-5 py-2 text-sm font-medium transition-colors ${excludeSubs ? 'bg-rose-500 text-white' : 'text-muted hover:text-foreground'}`}>
                Exclude Outliers (±2.5 SD)
              </button>
            </div>
            <p className="text-xs text-muted h-4">
              {excludeSubs
                ? excludedIds.size > 0
                  ? `${excludedIds.size} participant${excludedIds.size > 1 ? 's' : ''} excluded (RT ±2.5 SD or accuracy −2.5 SD)`
                  : 'No participants excluded'
                : `${nParticipants} participants`}
            </p>
          </div>
        )}

        {error && (
          <div className="bg-card border border-yellow-500/50 rounded-xl p-8 text-center">
            <p className="text-yellow-400">{error}</p>
          </div>
        )}

        {!error && (
          <div className="grid gap-8">
            <ChartCard title="Figure 1: Recognition Rates by Item Type (DRM Classic Contrast)">
              {(revealed) => (
                <div>
                  <p className="text-xs text-muted mb-4">
                    Percentage of &quot;OLD&quot; responses per item type. The gap between studied words and critical lures reflects the DRM illusion strength.
                  </p>
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={recogChart} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="name" stroke="#9ca3af" tick={TICK} />
                      <YAxis stroke="#9ca3af" tick={TICK} domain={[0, 100]}
                        label={{ value: '"OLD" Response Rate (%)', angle: -90, position: 'insideLeft', ...TICK }} />
                      <Tooltip contentStyle={BG} itemStyle={{ color: '#e5e7eb' }} formatter={pctFmt} />
                      {revealed && (
                        <Bar dataKey="value" name="Rate (%)">
                          <ErrorBar dataKey="sem" width={4} strokeWidth={1.5} stroke="#6b7280" direction="y" />
                          {recogChart.map((entry, i) => (
                            <Cell key={i} fill={entry.fill} />
                          ))}
                        </Bar>
                      )}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ChartCard>

            <ChartCard title="Figure 2: Free Recall — Correct vs False Recall">
              {(revealed) => (
                <div>
                  <p className="text-xs text-muted mb-4">
                    Proportion of studied words correctly recalled vs critical lures falsely recalled. Lines show individual participants.
                  </p>
                  <ResponsiveContainer width="100%" height={320}>
                    <ComposedChart data={recallChart} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="name" stroke="#9ca3af" tick={TICK} />
                      <YAxis stroke="#9ca3af" tick={TICK} domain={[0, 100]}
                        label={{ value: 'Rate (%)', angle: -90, position: 'insideLeft', ...TICK }} />
                      <Tooltip contentStyle={BG} itemStyle={{ color: '#e5e7eb' }} formatter={pctFmt} />
                      {revealed && (
                        <>
                          {recallPKeys.map((key) => (
                            <Line
                              key={key}
                              dataKey={key}
                              stroke="#9ca3af"
                              strokeWidth={1}
                              strokeOpacity={0.35}
                              dot={{ r: 2.5, fill: '#9ca3af', fillOpacity: 0.5 }}
                              activeDot={false}
                              legendType="none"
                              isAnimationActive={false}
                              tooltipType="none"
                            />
                          ))}
                          <Bar dataKey="value" name="Mean (%)">
                            <ErrorBar dataKey="sem" width={4} strokeWidth={1.5} stroke="#6b7280" direction="y" />
                            {recallChart.map((entry, i) => (
                              <Cell key={i} fill={entry.fill} />
                            ))}
                          </Bar>
                        </>
                      )}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ChartCard>

            <ChartCard title="Figure 3: Confidence Distribution for 'OLD' Responses">
              {(revealed) => (
                <div>
                  <p className="text-xs text-muted mb-4">
                    Distribution of confidence ratings (1–4) among &quot;OLD&quot; responses by item type.
                  </p>
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={confChart} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="name" stroke="#9ca3af" tick={TICK} />
                      <YAxis stroke="#9ca3af" tick={TICK} domain={[0, 100]}
                        label={{ value: 'Proportion (%)', angle: -90, position: 'insideLeft', ...TICK }} />
                      <Tooltip contentStyle={BG} itemStyle={{ color: '#e5e7eb' }} />
                      <Legend verticalAlign="top" />
                      {revealed && (
                        <>
                          <Bar dataKey="Sure old (4)" stackId="a" fill="#34d399" />
                          <Bar dataKey="Probably old (3)" stackId="a" fill="#6ee7b7" />
                          <Bar dataKey="Probably new (2)" stackId="a" fill="#fbbf24" />
                          <Bar dataKey="Sure new (1)" stackId="a" fill="#71717a" />
                        </>
                      )}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ChartCard>

            <ChartCard title="Figure 4: Serial Position Curve (Recognition)">
              {(revealed) => (
                <div>
                  <p className="text-xs text-muted mb-4">
                    Hit rate by position in the original study list (1–10). Shows primacy and recency effects.
                  </p>
                  <ResponsiveContainer width="100%" height={320}>
                    <LineChart data={serialChart} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="position" stroke="#9ca3af" tick={TICK}
                        label={{ value: 'Serial Position', position: 'insideBottom', offset: -5, ...TICK }} />
                      <YAxis stroke="#9ca3af" tick={TICK} domain={[0, 100]}
                        label={{ value: 'Hit Rate (%)', angle: -90, position: 'insideLeft', ...TICK }} />
                      <Tooltip contentStyle={BG} itemStyle={{ color: '#e5e7eb' }} formatter={pctFmt} />
                      {revealed && (
                        <Line type="monotone" dataKey="value" stroke="#34d399" strokeWidth={2.5}
                          dot={{ fill: '#34d399', r: 4 }} activeDot={{ r: 6 }} name="Hit Rate">
                          <ErrorBar dataKey="sem" width={4} strokeWidth={1.5} stroke="#6b7280" direction="y" />
                        </Line>
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ChartCard>

            <ChartCard title="Figure 5: Free Recall vs Recognition (Individual)">
              {(revealed) => (
                <div>
                  <p className="text-xs text-muted mb-4">
                    Each dot is one participant. X = correct free recall rate, Y = hit rate (% of studied words called &quot;old&quot;).
                  </p>
                  <ResponsiveContainer width="100%" height={320}>
                    <ScatterChart margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis type="number" dataKey="x" stroke="#9ca3af" tick={TICK} domain={[0, 100]}
                        label={{ value: 'Free Recall (%)', position: 'insideBottom', offset: -5, ...TICK }} />
                      <YAxis type="number" dataKey="y" stroke="#9ca3af" tick={TICK} domain={[0, 100]}
                        label={{ value: 'Hit Rate (% studied called "old")', angle: -90, position: 'insideLeft', ...TICK }} />
                      <ZAxis range={[60, 60]} />
                      <Tooltip content={<ScatterTooltip xLabel="Free Recall" yLabel="Hit Rate (% studied called &quot;old&quot;)" />} />
                      {revealed && (
                        <Scatter data={recallVsRecogScatter} fill="#34d399" name="Participant" />
                      )}
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ChartCard>

            <ChartCard title="Figure 6: Recognition Accuracy vs Confidence (Individual)">
              {(revealed) => (
                <div>
                  <p className="text-xs text-muted mb-4">
                    Each dot is one participant. X = overall accuracy (% correct across all items), Y = mean confidence (1–4).
                  </p>
                  <ResponsiveContainer width="100%" height={320}>
                    <ScatterChart margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis type="number" dataKey="x" stroke="#9ca3af" tick={TICK} domain={[0, 100]}
                        label={{ value: 'Overall Accuracy (% correct across all items)', position: 'insideBottom', offset: -5, ...TICK }} />
                      <YAxis type="number" dataKey="y" stroke="#9ca3af" tick={TICK} domain={[1, 4]}
                        label={{ value: 'Mean Confidence', angle: -90, position: 'insideLeft', ...TICK }} />
                      <ZAxis range={[60, 60]} />
                      <Tooltip content={<ScatterTooltip xLabel="Overall Accuracy (% correct)" yLabel="Confidence" />} />
                      {revealed && (
                        <Scatter data={recogVsConfScatter} fill="#fbbf24" name="Participant" />
                      )}
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ChartCard>

            <ChartCard title="Figure 7: Math Task Performance (Individual)">
              {(revealed) => (
                <div>
                  <p className="text-xs text-muted mb-4">
                    Each dot is one participant. X = total questions answered (across all lists), Y = accuracy.
                  </p>
                  <ResponsiveContainer width="100%" height={320}>
                    <ScatterChart margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis type="number" dataKey="x" stroke="#9ca3af" tick={TICK}
                        label={{ value: 'Total Questions', position: 'insideBottom', offset: -5, ...TICK }} />
                      <YAxis type="number" dataKey="y" stroke="#9ca3af" tick={TICK} domain={[0, 100]}
                        label={{ value: 'Accuracy (%)', angle: -90, position: 'insideLeft', ...TICK }} />
                      <ZAxis range={[60, 60]} />
                      <Tooltip content={<ScatterTooltip xLabel="Questions" yLabel="Accuracy (%)" />} />
                      {revealed && (
                        <Scatter data={distractorScatter} fill="#a78bfa" name="Participant" />
                      )}
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ChartCard>
          </div>
        )}
      </div>
    </main>
  );
}

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-card border border-border rounded-xl px-5 py-3">
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-xl font-bold text-white">{value}</p>
    </div>
  );
}

