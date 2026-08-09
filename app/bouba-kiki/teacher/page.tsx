'use client';

import React, { useState, useEffect, FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import { motion } from 'framer-motion';
import { Shapes, Download, Home, RefreshCw } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
} from 'recharts';
import { TrialResult } from '@/types/bouba-kiki';
import { getSupabase } from '@/lib/supabase';
import { generateMockData } from '@/lib/bouba-kiki/mock-data';
import { verifyPassword } from '@/lib/auth';

interface ParticipantSummary {
  sessionId: string;
  participantName: string;
  totalTrials: number;
  accuracy: number;
  boubaAccuracy: number;
  kikiAccuracy: number;
  controlAccuracy: number;
  meanRT: number;
}

export default function BoubaKikiTeacher() {
  const router = useRouter();
  const [language, setLanguage] = useState<'en' | 'he'>('en');
  const [allResults, setAllResults] = useState<TrialResult[]>([]);
  const [participants, setParticipants] = useState<ParticipantSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [useMock, setUseMock] = useState(false);

  // ── Password gate ──────────────────────────────────────────────────────────
  const [authed, setAuthed]   = useState(false);
  const [pwInput, setPwInput] = useState('');
  const [pwError, setPwError] = useState(false);

  useEffect(() => {
    const storedLanguage = sessionStorage.getItem('bouba_kiki_language') as 'en' | 'he' | null;
    setLanguage(storedLanguage || 'en');
    if (sessionStorage.getItem('ss_teacher_authed') === '1') setAuthed(true);
  }, []);

  useEffect(() => {
    if (!authed) return;
    if (useMock) loadMockData();
    else loadAllResults();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed, useMock]);

  const loadMockData = () => {
    const mock = generateMockData();
    setAllResults(mock);
    processParticipants(mock);
    setLoading(false);
  };

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

  const loadAllResults = async () => {
    const supabase = getSupabase();
    if (!supabase) {
      console.error('Supabase not initialized');
      setLoading(false);
      return;
    }

    const allData: unknown[] = [];
    let from = 0;
    while (true) {
      const { data: page, error } = await supabase
        .from('bouba_kiki_results')
        .select('*')
        .order('created_at', { ascending: true })
        .range(from, from + 999);
      if (error) { console.error('Error loading results:', error); break; }
      if (!page || page.length === 0) break;
      allData.push(...page);
      if (page.length < 1000) break;
      from += 1000;
    }

    if (allData.length > 0) {
      setAllResults(allData as TrialResult[]);
      processParticipants(allData as TrialResult[]);
    }

    setLoading(false);
  };

  const processParticipants = (data: TrialResult[]) => {
    const sessionMap = new Map<string, TrialResult[]>();

    data.forEach((result) => {
      if (!sessionMap.has(result.session_id)) {
        sessionMap.set(result.session_id, []);
      }
      sessionMap.get(result.session_id)!.push(result);
    });

    const summaries: ParticipantSummary[] = [];

    sessionMap.forEach((results, sessionId) => {
      const mainTrials = results.filter((r) => !r.is_control);
      const controlTrials = results.filter((r) => r.is_control);
      const boubaTrials = mainTrials.filter((r) => r.word_type === 'rounded');
      const kikiTrials = mainTrials.filter((r) => r.word_type === 'spiky');

      summaries.push({
        sessionId,
        participantName: results[0]?.participant_name || 'Anonymous',
        totalTrials: results.length,
        accuracy: (results.filter((r) => r.is_correct).length / results.length) * 100,
        boubaAccuracy: boubaTrials.length > 0
          ? (boubaTrials.filter((r) => r.is_correct).length / boubaTrials.length) * 100
          : 0,
        kikiAccuracy: kikiTrials.length > 0
          ? (kikiTrials.filter((r) => r.is_correct).length / kikiTrials.length) * 100
          : 0,
        controlAccuracy: controlTrials.length > 0
          ? (controlTrials.filter((r) => r.is_correct).length / controlTrials.length) * 100
          : 0,
        meanRT: results.reduce((sum, r) => sum + r.reaction_time_ms, 0) / results.length,
      });
    });

    setParticipants(summaries);
  };

  const downloadAllData = () => {
    const csv = [
      [
        'Session ID',
        'Participant',
        'Trial',
        'Word',
        'Word Type',
        'Response',
        'Correct',
        'RT (ms)',
        'Is Control',
      ].join(','),
      ...allResults.map((r) =>
        [
          r.session_id,
          r.participant_name || 'Anonymous',
          r.trial_number,
          r.word,
          r.word_type,
          r.response,
          r.is_correct,
          r.reaction_time_ms.toFixed(0),
          r.is_control,
        ].join(',')
      ),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bouba-kiki-class-results.csv`;
    a.click();
  };

  if (!authed) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="bg-gray-900 border border-gray-700 rounded-2xl p-10 w-full max-w-sm flex flex-col items-center gap-6"
        >
          <Shapes className="w-10 h-10 text-purple-400" />
          <div className="text-center">
            <h1 className="text-2xl font-bold text-white">Teacher Dashboard</h1>
            <p className="text-gray-400 text-sm mt-1">Bouba-Kiki Effect</p>
          </div>
          <form onSubmit={handleLogin} className="w-full flex flex-col gap-3">
            <input
              type="password"
              value={pwInput}
              onChange={e => { setPwInput(e.target.value); setPwError(false); }}
              placeholder="Password"
              autoFocus
              className={`w-full px-4 py-3 rounded-xl border text-white bg-gray-800 outline-none transition-colors
                ${pwError ? 'border-red-500' : 'border-gray-600 focus:border-purple-400'}`}
            />
            {pwError && <p className="text-red-400 text-sm text-center">Incorrect password</p>}
            <button type="submit"
              className="w-full py-3 bg-purple-500 hover:bg-purple-400 text-white font-bold rounded-xl transition-colors">
              Enter
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
        <div className="text-xl text-gray-400">Loading class data...</div>
      </div>
    );
  }

  const content = {
    en: {
      title: 'Teacher Dashboard',
      subtitle: 'Bouba-Kiki Effect - Class Results',
      participants: 'Participants',
      trials: 'Total Trials',
      avgAccuracy: 'Average Accuracy',
      downloadButton: 'Download All Data (CSV)',
      backButton: 'Back to Results',
      chartTitle1: 'Accuracy by Word Type (Average)',
      chartTitle2: 'Individual Participant Accuracy',
      noData: 'No participant data yet',
      languageToggle: 'עברית',
    },
    he: {
      title: 'לוח המורה',
      subtitle: 'אפקט בובה-קיקי - תוצאות הכיתה',
      participants: 'משתתפים',
      trials: 'סך הניסויים',
      avgAccuracy: 'דיוק ממוצע',
      downloadButton: 'הורד את כל הנתונים (CSV)',
      backButton: 'חזרה לתוצאות',
      chartTitle1: 'דיוק לפי סוג מילה (ממוצע)',
      chartTitle2: 'דיוק משתתפים בודדים',
      noData: 'אין עדיין נתוני משתתפים',
      languageToggle: 'English',
    },
  };

  const t = content[language];

  if (participants.length === 0) {
    return (
      <div className={`min-h-screen bg-[#0f172a] text-white ${language === 'he' ? 'rtl' : 'ltr'}`}>
        <div className="container mx-auto px-4 py-8">
          <div className="text-center">
            <Shapes className="w-16 h-16 text-purple-400 mx-auto mb-4" />
            <h1 className="text-3xl font-bold text-white mb-2">{t.title}</h1>
            <p className="text-gray-400 mb-6">{t.noData}</p>
            <button
              onClick={() => setUseMock((v) => !v)}
              className={`px-4 py-2 text-sm rounded-lg border transition-colors ${
                useMock
                  ? 'bg-amber-500/20 border-amber-400 text-amber-400'
                  : 'bg-gray-800 border-gray-600 text-gray-300 hover:bg-gray-700'
              }`}
            >
              {useMock ? 'Mock Data ON' : 'Show Mock Data'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Calculate aggregate stats
  const totalParticipants = participants.length;
  const totalTrials = allResults.length;
  const avgBoubaAccuracy =
    participants.reduce((sum, p) => sum + p.boubaAccuracy, 0) / participants.length;
  const avgKikiAccuracy =
    participants.reduce((sum, p) => sum + p.kikiAccuracy, 0) / participants.length;
  const avgControlAccuracy =
    participants.reduce((sum, p) => sum + p.controlAccuracy, 0) / participants.length;

  // Chart data
  const avgChartData = [
    { name: 'Bouba (Rounded)', accuracy: avgBoubaAccuracy },
    { name: 'Kiki (Spiky)', accuracy: avgKikiAccuracy },
    { name: 'Control', accuracy: avgControlAccuracy },
  ];

  const scatterData = participants.map((p, index) => ({
    participant: index + 1,
    boubaAccuracy: p.boubaAccuracy,
    kikiAccuracy: p.kikiAccuracy,
  }));

  return (
    <div className={`min-h-screen bg-[#0f172a] text-white ${language === 'he' ? 'rtl' : 'ltr'}`}>
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Shapes className="w-7 h-7 text-purple-400" />
              <h1 className="text-2xl font-bold">{t.title} — Bouba-Kiki</h1>
            </div>
            <p className="text-purple-400 font-medium">
              {totalParticipants} {t.participants.toLowerCase()} · {totalTrials} {t.trials.toLowerCase()}
              {useMock && <span className="text-amber-400 ml-2">(mock data)</span>}
            </p>
          </div>
          <div className="flex gap-3 flex-wrap">
            <button
              onClick={() => setUseMock((v) => !v)}
              className={`px-4 py-2 text-sm rounded-lg border transition-colors ${
                useMock
                  ? 'bg-amber-500/20 border-amber-400 text-amber-400'
                  : 'bg-gray-800 border-gray-600 text-gray-300 hover:bg-gray-700'
              }`}
            >
              {useMock ? 'Mock Data ON' : 'Mock Data'}
            </button>
            <button onClick={loadAllResults} disabled={useMock}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg border border-gray-600 disabled:opacity-40">
              <RefreshCw className="w-4 h-4" /> Refresh
            </button>
            <button onClick={downloadAllData}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg border border-gray-600">
              <Download className="w-4 h-4" /> Download CSV
            </button>
            <button onClick={() => router.push('/')}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg border border-gray-600">
              <Home className="w-4 h-4" /> Home
            </button>
          </div>
        </div>

        {/* Chart 1: Average Accuracy by Word Type */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-gray-900 border border-gray-700 rounded-2xl p-6 mb-8"
        >
          <h2 className="text-xl font-semibold text-white mb-4">{t.chartTitle1}</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={avgChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 11 }} />
              <YAxis domain={[0, 100]} tick={{ fill: '#9ca3af', fontSize: 11 }} />
              <Tooltip contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 6 }} formatter={(value) => `${Number(value).toFixed(1)}%`} />
              <Legend wrapperStyle={{ color: '#9ca3af' }} />
              <Bar dataKey="accuracy" fill="#a78bfa" name="Accuracy (%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </motion.div>

        {/* Chart 2: Individual Scatter Plot */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-gray-900 border border-gray-700 rounded-2xl p-6 mb-8"
        >
          <h2 className="text-xl font-semibold text-white mb-4">{t.chartTitle2}</h2>
          <ResponsiveContainer width="100%" height={300}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis type="number" dataKey="participant" name="Participant" tick={{ fill: '#9ca3af', fontSize: 11 }} />
              <YAxis type="number" domain={[0, 100]} name="Accuracy (%)" tick={{ fill: '#9ca3af', fontSize: 11 }} />
              <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 6 }} />
              <Legend wrapperStyle={{ color: '#9ca3af' }} />
              <Scatter name="Bouba Accuracy" data={scatterData} fill="#a78bfa" dataKey="boubaAccuracy" />
              <Scatter name="Kiki Accuracy" data={scatterData} fill="#34d399" dataKey="kikiAccuracy" />
            </ScatterChart>
          </ResponsiveContainer>
        </motion.div>

        {/* Participant Table */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-gray-900 border border-gray-700 rounded-2xl p-6 mb-8 overflow-x-auto"
        >
          <h2 className="text-xl font-semibold text-white mb-4">Participant Details</h2>
          <table className="w-full text-gray-300">
            <thead>
              <tr className="border-b border-gray-700 text-gray-400">
                <th className="text-left py-2 px-4">Name</th>
                <th className="text-left py-2 px-4">Accuracy</th>
                <th className="text-left py-2 px-4">Bouba</th>
                <th className="text-left py-2 px-4">Kiki</th>
                <th className="text-left py-2 px-4">Control</th>
                <th className="text-left py-2 px-4">Mean RT</th>
              </tr>
            </thead>
            <tbody>
              {participants.map((p) => (
                <tr key={p.sessionId} className="border-b border-gray-800 hover:bg-gray-800/50">
                  <td className="py-2 px-4">{p.participantName}</td>
                  <td className="py-2 px-4">{p.accuracy.toFixed(1)}%</td>
                  <td className="py-2 px-4">{p.boubaAccuracy.toFixed(1)}%</td>
                  <td className="py-2 px-4">{p.kikiAccuracy.toFixed(1)}%</td>
                  <td className="py-2 px-4">{p.controlAccuracy.toFixed(1)}%</td>
                  <td className="py-2 px-4">{p.meanRT.toFixed(0)}ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </motion.div>

      </div>
    </div>
  );
}
