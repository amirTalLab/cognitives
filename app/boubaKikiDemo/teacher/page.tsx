'use client';

import { useCallback, useEffect, useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Shapes } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ErrorBar,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { getSupabase } from '@/lib/supabase';
import { verifyPassword } from '@/lib/auth';
import { TrialResult } from '@/types/bouba-kiki-demo';
import { generateMockData } from '@/lib/bouba-kiki-demo/mock-data';

const BTN = 'px-4 py-2 text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg border border-gray-600';

function sem(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance / values.length);
}

function ChartCard({ title, children }: { title: string; children: (revealed: boolean) => React.ReactNode }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-semibold text-gray-200">{title}</h3>
        <button onClick={() => setRevealed(r => !r)}
          className="text-xs px-3 py-1 rounded-full border border-gray-600 text-gray-400 hover:border-purple-400 hover:text-purple-400 transition-colors">
          {revealed ? 'Hide' : 'Reveal'}
        </button>
      </div>
      {children(revealed)}
    </div>
  );
}

export default function TeacherPage() {
  const router = useRouter();
  const [authed, setAuthed] = useState(false);
  const [pwInput, setPwInput] = useState('');
  const [pwError, setPwError] = useState(false);
  const [rows, setRows] = useState<TrialResult[]>([]);
  const [useMock, setUseMock] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem('ss_teacher_authed') === '1') setAuthed(true);
  }, []);

  const loadRows = useCallback(async () => {
    const sb = getSupabase();
    if (!sb) return;
    const all: TrialResult[] = [];
    let from = 0;
    // The server caps a select at 1000 rows regardless of .limit(), so page through.
    for (;;) {
      const { data, error } = await sb.from('bouba_kiki_demo_results').select('*')
        .eq('is_practice', false).order('created_at', { ascending: true }).range(from, from + 999);
      if (error || !data || data.length === 0) break;
      all.push(...(data as TrialResult[]));
      if (data.length < 1000) break;
      from += 1000;
    }
    setRows(all);
  }, []);

  useEffect(() => {
    if (!authed) return;
    if (useMock) setRows(generateMockData());
    else void loadRows();
  }, [authed, useMock, loadRows]);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    if (await verifyPassword(pwInput)) {
      sessionStorage.setItem('ss_teacher_authed', '1');
      setAuthed(true);
    } else {
      setPwError(true);
      setPwInput('');
    }
  };

  function downloadCsv() {
    if (rows.length === 0) return;
    const cols = Object.keys(rows[0]);
    const body = rows.map(r =>
      cols.map(c => JSON.stringify((r as unknown as Record<string, unknown>)[c] ?? '')).join(','),
    );
    const csv = [cols.join(','), ...body].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bouba-kiki-demo.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!authed) {
    return (
      <main className="min-h-screen bg-[#0f172a] flex items-center justify-center px-6">
        <div className="bg-gray-900 border border-gray-700 rounded-2xl p-10 w-full max-w-sm flex flex-col items-center gap-6">
          <Shapes className="w-10 h-10 text-purple-400" />
          <h1 className="text-xl font-bold text-gray-100">Teacher Dashboard</h1>
          <form onSubmit={handleLogin} className="w-full flex flex-col gap-3">
            <input type="password" value={pwInput} autoFocus placeholder="Password"
              onChange={e => { setPwInput(e.target.value); setPwError(false); }}
              className={'w-full px-4 py-3 rounded-lg border bg-gray-800 text-white outline-none ' +
                (pwError ? 'border-red-500' : 'border-gray-600 focus:border-purple-400')} />
            {pwError && <p className="text-red-400 text-sm text-center">Incorrect password</p>}
            <button type="submit" className="w-full py-3 bg-purple-500 hover:bg-purple-400 text-white font-bold rounded-lg">
              Enter
            </button>
          </form>
        </div>
      </main>
    );
  }

  const participants = new Set(rows.map(r => r.session_id)).size;
  const byParticipant = new Map<string, { main: TrialResult[]; control: TrialResult[] }>();
  for (const r of rows) {
    const entry = byParticipant.get(r.session_id) ?? { main: [], control: [] };
    (r.is_control ? entry.control : entry.main).push(r);
    byParticipant.set(r.session_id, entry);
  }

  // Per-participant rates first, then SEM across participants — never across raw trials.
  const mainRates = [...byParticipant.values()].filter(e => e.main.length)
    .map(e => (e.main.filter(r => r.is_conventional).length / e.main.length) * 100);
  const controlRates = [...byParticipant.values()].filter(e => e.control.length)
    .map(e => (e.control.filter(r => r.is_conventional).length / e.control.length) * 100);
  const mean = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;

  const conditionData = [
    { condition: 'Main (rounded vs spiky)', rate: mean(mainRates), sem: sem(mainRates) },
    { condition: 'Control (same class)', rate: mean(controlRates), sem: sem(controlRates) },
  ];

  const participantData = [...byParticipant.entries()]
    .filter(([, e]) => e.main.length)
    .map(([sid, e]) => ({
      name: e.main[0]?.participant_name ?? sid.slice(0, 6),
      rate: (e.main.filter(r => r.is_conventional).length / e.main.length) * 100,
    }))
    .sort((a, b) => b.rate - a.rate);

  return (
    <main className="min-h-screen bg-[#0f172a] px-6 py-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-start gap-3 flex-wrap mb-6">
          <Shapes className="w-7 h-7 text-purple-400 flex-shrink-0 mt-0.5" />
          <div>
            <h1 className="text-2xl font-bold text-gray-100">Bouba-Kiki Effect</h1>
            <p className="text-sm text-purple-400 mt-0.5">
              {participants} participants · {rows.length} trials
              {useMock && (
                <span className="ml-2 text-xs px-2 py-0.5 rounded-full border border-amber-400 bg-amber-500/20 text-amber-400">
                  mock data
                </span>
              )}
            </p>
          </div>
          <div className="flex gap-3 flex-wrap ml-auto">
            <button onClick={() => setUseMock(m => !m)}
              className={useMock
                ? 'px-4 py-2 text-sm rounded-lg border bg-amber-500/20 border-amber-400 text-amber-400'
                : BTN}>
              Mock Data
            </button>
            <button onClick={() => { if (useMock) setRows(generateMockData()); else void loadRows(); }} className={BTN}>
              Refresh
            </button>
            <button onClick={downloadCsv} className={BTN}>Download CSV</button>
            <button onClick={() => router.push('/')} className={BTN}>Home</button>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-10 text-center">
            <p className="text-gray-400">No data yet.</p>
            <p className="text-sm text-gray-600 mt-1">
              Turn on <span className="text-amber-400">Mock Data</span> to demo the effect with no participants.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <ChartCard title="Conventional mapping by trial type">
              {(revealed) => (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={conditionData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="condition" stroke="#9ca3af" />
                    <YAxis stroke="#9ca3af" domain={[0, 100]}
                      label={{ value: 'Chose rounded = bouba (%)', angle: -90, position: 'insideLeft', fill: '#9ca3af' }} />
                    <Tooltip contentStyle={{ background: '#111827', border: '1px solid #374151' }} />
                    <Legend verticalAlign="top" />
                    <ReferenceLine y={50} stroke="#6b7280" strokeDasharray="6 4" />
                    {revealed && (
                      <Bar dataKey="rate" fill="#a78bfa" name="Conventional (%)">
                        <ErrorBar dataKey="sem" width={4} strokeWidth={1.5} stroke="#6b7280" direction="y" />
                      </Bar>
                    )}
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard title="Individual participants">
              {(revealed) => (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={participantData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="name" stroke="#9ca3af" />
                    <YAxis stroke="#9ca3af" domain={[0, 100]}
                      label={{ value: 'Conventional (%)', angle: -90, position: 'insideLeft', fill: '#9ca3af' }} />
                    <Tooltip contentStyle={{ background: '#111827', border: '1px solid #374151' }} />
                    <Legend verticalAlign="top" />
                    <ReferenceLine y={50} stroke="#6b7280" strokeDasharray="6 4" />
                    {revealed && <Bar dataKey="rate" fill="#a78bfa" name="Conventional (%)" />}
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </div>
        )}
      </div>
    </main>
  );
}
