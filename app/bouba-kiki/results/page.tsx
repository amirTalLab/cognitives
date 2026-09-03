'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Shapes, Download, Trash2, Home } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrialResult, Summary } from '@/types/bouba-kiki';
import { getSupabase } from '@/lib/supabase';

export default function BoubaKikiResults() {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [participantName, setParticipantName] = useState<string | null>(null);
  const [language, setLanguage] = useState<'en' | 'he'>('en');
  const [results, setResults] = useState<TrialResult[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedSessionId = sessionStorage.getItem('bouba_kiki_session_id');
    const storedName = sessionStorage.getItem('bouba_kiki_participant_name');
    const storedLanguage = sessionStorage.getItem('bouba_kiki_language') as 'en' | 'he' | null;

    if (!storedSessionId) {
      router.push('/bouba-kiki');
      return;
    }

    setSessionId(storedSessionId);
    setParticipantName(storedName);
    setLanguage(storedLanguage || 'en');

    loadResults(storedSessionId);
  }, [router]);

  const loadResults = async (sessionId: string) => {
    const supabase = getSupabase();
    if (!supabase) {
      console.error('Supabase not initialized');
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('bouba_kiki_results')
      .select('*')
      .eq('session_id', sessionId)
      .order('trial_number', { ascending: true });

    if (error) {
      console.error('Error loading results:', error);
      setLoading(false);
      return;
    }

    if (data) {
      setResults(data);
      calculateSummary(data);
    }

    setLoading(false);
  };

  const calculateSummary = (data: TrialResult[]) => {
    const mainTrials = data.filter((r) => !r.is_control);
    const controlTrials = data.filter((r) => r.is_control);

    const boubaTrials = mainTrials.filter((r) => r.word_type === 'rounded');
    const kikiTrials = mainTrials.filter((r) => r.word_type === 'spiky');

    const summary: Summary = {
      totalTrials: data.length,
      correctTrials: data.filter((r) => r.is_correct).length,
      accuracy: (data.filter((r) => r.is_correct).length / data.length) * 100,
      boubaAccuracy: boubaTrials.length > 0
        ? (boubaTrials.filter((r) => r.is_correct).length / boubaTrials.length) * 100
        : 0,
      kikiAccuracy: kikiTrials.length > 0
        ? (kikiTrials.filter((r) => r.is_correct).length / kikiTrials.length) * 100
        : 0,
      meanRT: data.reduce((sum, r) => sum + r.reaction_time_ms, 0) / data.length,
      controlAccuracy: controlTrials.length > 0
        ? (controlTrials.filter((r) => r.is_correct).length / controlTrials.length) * 100
        : 0,
    };

    setSummary(summary);
  };

  const downloadData = () => {
    const csv = [
      ['Trial', 'Word', 'Word Type', 'Response', 'Correct', 'RT (ms)', 'Is Control'].join(','),
      ...results.map((r) =>
        [
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
    a.download = `bouba-kiki-results-${participantName || 'anonymous'}.csv`;
    a.click();
  };

  const clearData = async () => {
    if (!sessionId) return;

    const confirmed = window.confirm(
      language === 'en'
        ? 'Are you sure you want to delete your results?'
        : 'האם אתה בטוח שברצונך למחוק את התוצאות?'
    );

    if (!confirmed) return;

    const supabase = getSupabase();
    if (!supabase) return;

    const { error } = await supabase.from('bouba_kiki_results').delete().eq('session_id', sessionId);

    if (error) {
      console.error('Error deleting results:', error);
      return;
    }

    sessionStorage.removeItem('bouba_kiki_session_id');
    sessionStorage.removeItem('bouba_kiki_participant_name');
    sessionStorage.removeItem('bouba_kiki_language');

    router.push('/bouba-kiki');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
        <div className="text-xl text-gray-400">Loading results...</div>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
        <div className="text-xl text-gray-400">No results found</div>
      </div>
    );
  }

  const content = {
    en: {
      title: 'Your Results',
      overallAccuracy: 'Overall Accuracy',
      boubaAccuracy: 'Bouba (Rounded) Accuracy',
      kikiAccuracy: 'Kiki (Spiky) Accuracy',
      controlAccuracy: 'Control Trial Accuracy',
      meanRT: 'Mean Reaction Time',
      chartTitle: 'Accuracy by Word Type',
      downloadButton: 'Download Data (CSV)',
      clearButton: 'Clear My Data',
      homeButton: 'Back to Home',
      teacherButton: 'View Teacher Dashboard',
      interpretation: 'Interpretation',
      interpretationText:
        'The Bouba-Kiki effect demonstrates cross-modal sound symbolism. Most people associate rounded shapes with smooth-sounding words like "bouba" and spiky shapes with sharp-sounding words like "kiki". Your results show how strongly you exhibit this pattern.',
    },
    he: {
      title: 'התוצאות שלך',
      overallAccuracy: 'דיוק כללי',
      boubaAccuracy: 'דיוק בובה (עגולות)',
      kikiAccuracy: 'דיוק קיקי (זוויתיות)',
      controlAccuracy: 'דיוק בשאלות בקרה',
      meanRT: 'זמן תגובה ממוצע',
      chartTitle: 'דיוק לפי סוג מילה',
      downloadButton: 'הורד נתונים (CSV)',
      clearButton: 'מחק את הנתונים שלי',
      homeButton: 'חזרה לדף הבית',
      teacherButton: 'צפה בלוח המורה',
      interpretation: 'פרשנות',
      interpretationText:
        'אפקט בובה-קיקי מדגים סימבוליזם צלילי חוצה-מודאלי. רוב האנשים משייכים צורות עגולות למילים בעלות צליל חלק כמו "בובה" וצורות זוויתיות למילים בעלות צליל חד כמו "קיקי". התוצאות שלך מראות עד כמה אתה מציג דפוס זה.',
    },
  };

  const t = content[language];

  // Chart data
  const chartData = [
    { name: 'Bouba (Rounded)', accuracy: summary.boubaAccuracy },
    { name: 'Kiki (Spiky)', accuracy: summary.kikiAccuracy },
    { name: 'Control', accuracy: summary.controlAccuracy },
  ];

  return (
    <div className={`min-h-screen bg-[#0f172a] ${language === 'he' ? 'rtl' : 'ltr'}`}>
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <div className="flex items-center justify-center gap-3 mb-4">
            <Shapes className="w-12 h-12 text-indigo-400" />
            <h1 className="text-4xl font-bold text-gray-100">{t.title}</h1>
          </div>
          {participantName && (
            <p className="text-lg text-gray-400">
              {participantName}
            </p>
          )}
        </motion.div>

        {/* Summary Cards */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8"
        >
          <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-lg p-6">
            <div className="text-sm text-gray-400 mb-1">{t.overallAccuracy}</div>
            <div className="text-3xl font-bold text-indigo-400">{summary.accuracy.toFixed(1)}%</div>
          </div>
          <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-lg p-6">
            <div className="text-sm text-gray-400 mb-1">{t.boubaAccuracy}</div>
            <div className="text-3xl font-bold text-indigo-400">{summary.boubaAccuracy.toFixed(1)}%</div>
          </div>
          <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-lg p-6">
            <div className="text-sm text-gray-400 mb-1">{t.kikiAccuracy}</div>
            <div className="text-3xl font-bold text-purple-400">{summary.kikiAccuracy.toFixed(1)}%</div>
          </div>
          <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-lg p-6">
            <div className="text-sm text-gray-400 mb-1">{t.meanRT}</div>
            <div className="text-3xl font-bold text-gray-300">{summary.meanRT.toFixed(0)}ms</div>
          </div>
        </motion.div>

        {/* Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-gray-900 border border-gray-700 rounded-xl shadow-lg p-6 mb-8"
        >
          <h2 className="text-xl font-semibold text-gray-100 mb-4">{t.chartTitle}</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis domain={[0, 100]} />
              <Tooltip formatter={(value) => `${Number(value).toFixed(1)}%`} />
              <Legend />
              <Bar dataKey="accuracy" fill="#6366f1" name="Accuracy (%)" />
            </BarChart>
          </ResponsiveContainer>
        </motion.div>

        {/* Interpretation */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-gray-800 rounded-xl p-6 mb-8"
        >
          <h3 className="text-lg font-semibold text-gray-100 mb-2">{t.interpretation}</h3>
          <p className="text-gray-300 leading-relaxed">{t.interpretationText}</p>
        </motion.div>

        {/* Action Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="flex flex-wrap gap-4 justify-center mb-8"
        >
          <button
            onClick={downloadData}
            className="flex items-center gap-2 px-6 py-3 bg-indigo-500 text-white rounded-lg hover:bg-indigo-400 transition-colors shadow-lg"
          >
            <Download className="w-5 h-5" />
            {t.downloadButton}
          </button>

          <button
            onClick={() => router.push('/bouba-kiki/teacher')}
            className="flex items-center gap-2 px-6 py-3 bg-purple-500 text-white rounded-lg hover:bg-purple-400 transition-colors shadow-lg"
          >
            {t.teacherButton}
          </button>

          <button
            onClick={clearData}
            className="flex items-center gap-2 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors shadow-lg"
          >
            <Trash2 className="w-5 h-5" />
            {t.clearButton}
          </button>

          <button
            onClick={() => router.push('/')}
            className="flex items-center gap-2 px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors shadow-lg"
          >
            <Home className="w-5 h-5" />
            {t.homeButton}
          </button>
        </motion.div>
      </div>
    </div>
  );
}
