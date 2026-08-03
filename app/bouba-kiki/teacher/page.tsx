'use client';

import React, { useState, useEffect, FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import { motion } from 'framer-motion';
import { Shapes, Download, Users, ChevronLeft } from 'lucide-react';
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
    if (authed) loadAllResults();
  }, [authed]);

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
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 flex items-center justify-center">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-xl shadow-xl p-10 w-full max-w-sm flex flex-col items-center gap-6"
        >
          <Shapes className="w-10 h-10 text-indigo-600" />
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900">Teacher Dashboard</h1>
            <p className="text-gray-500 text-sm mt-1">Bouba-Kiki Effect</p>
          </div>
          <form onSubmit={handleLogin} className="w-full flex flex-col gap-3">
            <input
              type="password"
              value={pwInput}
              onChange={e => { setPwInput(e.target.value); setPwError(false); }}
              placeholder="Password"
              autoFocus
              className={`w-full px-4 py-3 rounded-lg border text-gray-900 outline-none transition-colors
                ${pwError ? 'border-red-400 bg-red-50' : 'border-gray-300 focus:border-indigo-500'}`}
            />
            {pwError && <p className="text-red-500 text-sm text-center">Incorrect password</p>}
            <button type="submit"
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg transition-colors">
              Enter
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 flex items-center justify-center">
        <div className="text-xl text-gray-600">Loading class data...</div>
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
      <div className={`min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 ${language === 'he' ? 'rtl' : 'ltr'}`}>
        <div className="container mx-auto px-4 py-8">
          <div className="text-center">
            <Shapes className="w-16 h-16 text-indigo-600 mx-auto mb-4" />
            <h1 className="text-3xl font-bold text-gray-900 mb-2">{t.title}</h1>
            <p className="text-gray-600">{t.noData}</p>
          </div>
        </div>
      </div>
    );
  }

  // Calculate aggregate stats
  const totalParticipants = participants.length;
  const totalTrials = allResults.length;
  const avgAccuracy =
    participants.reduce((sum, p) => sum + p.accuracy, 0) / participants.length;
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
    <div className={`min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 ${language === 'he' ? 'rtl' : 'ltr'}`}>
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <div className="flex items-center justify-center gap-3 mb-4">
            <Shapes className="w-12 h-12 text-indigo-600" />
            <h1 className="text-4xl font-bold text-gray-900">{t.title}</h1>
          </div>
          <p className="text-lg text-indigo-600 font-medium">{t.subtitle}</p>
        </motion.div>

        {/* Language Toggle */}
        <div className="flex justify-end mb-6">
          <button
            onClick={() => setLanguage(language === 'en' ? 'he' : 'en')}
            className="px-4 py-2 text-sm font-medium text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition-colors"
          >
            {t.languageToggle}
          </button>
        </div>

        {/* Summary Cards */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8"
        >
          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-5 h-5 text-indigo-600" />
              <div className="text-sm text-gray-600">{t.participants}</div>
            </div>
            <div className="text-3xl font-bold text-indigo-600">{totalParticipants}</div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="text-sm text-gray-600 mb-2">{t.trials}</div>
            <div className="text-3xl font-bold text-gray-700">{totalTrials}</div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="text-sm text-gray-600 mb-2">{t.avgAccuracy}</div>
            <div className="text-3xl font-bold text-purple-600">{avgAccuracy.toFixed(1)}%</div>
          </div>
        </motion.div>

        {/* Chart 1: Average Accuracy by Word Type */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-xl shadow-lg p-6 mb-8"
        >
          <h2 className="text-xl font-semibold text-gray-900 mb-4">{t.chartTitle1}</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={avgChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis domain={[0, 100]} />
              <Tooltip formatter={(value) => `${Number(value).toFixed(1)}%`} />
              <Legend />
              <Bar dataKey="accuracy" fill="#6366f1" name="Accuracy (%)" />
            </BarChart>
          </ResponsiveContainer>
        </motion.div>

        {/* Chart 2: Individual Scatter Plot */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-xl shadow-lg p-6 mb-8"
        >
          <h2 className="text-xl font-semibold text-gray-900 mb-4">{t.chartTitle2}</h2>
          <ResponsiveContainer width="100%" height={300}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" dataKey="participant" name="Participant" />
              <YAxis type="number" domain={[0, 100]} name="Accuracy (%)" />
              <Tooltip cursor={{ strokeDasharray: '3 3' }} />
              <Legend />
              <Scatter name="Bouba Accuracy" data={scatterData} fill="#6366f1" dataKey="boubaAccuracy" />
              <Scatter name="Kiki Accuracy" data={scatterData} fill="#a855f7" dataKey="kikiAccuracy" />
            </ScatterChart>
          </ResponsiveContainer>
        </motion.div>

        {/* Participant Table */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-white rounded-xl shadow-lg p-6 mb-8 overflow-x-auto"
        >
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Participant Details</h2>
          <table className="w-full">
            <thead>
              <tr className="border-b">
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
                <tr key={p.sessionId} className="border-b hover:bg-gray-50">
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

        {/* Action Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="flex flex-wrap gap-4 justify-center"
        >
          <button
            onClick={downloadAllData}
            className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-lg"
          >
            <Download className="w-5 h-5" />
            {t.downloadButton}
          </button>

          <button
            onClick={() => router.push('/bouba-kiki/results')}
            className="flex items-center gap-2 px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors shadow-lg"
          >
            <ChevronLeft className="w-5 h-5" />
            {t.backButton}
          </button>
        </motion.div>
      </div>
    </div>
  );
}
