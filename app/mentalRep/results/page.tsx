'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { BrainCog, Download, Trash2, Home } from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { ScanningTrialResult, RotationTrialResult, MentalRepSummary } from '@/types/mental-rep';
import { calculateCorrelation as calcScanningCorr, groupByDistanceBins } from '@/lib/mental-rep/scanning';
import { calculateCorrelation as calcRotationCorr, groupByAngle } from '@/lib/mental-rep/rotation';
import { getSupabase } from '@/lib/supabase';

export default function MentalRepResults() {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [participantName, setParticipantName] = useState<string | null>(null);
  const [language, setLanguage] = useState<'en' | 'he'>('en');
  const [scanningResults, setScanningResults] = useState<ScanningTrialResult[]>([]);
  const [rotationResults, setRotationResults] = useState<RotationTrialResult[]>([]);
  const [summary, setSummary] = useState<MentalRepSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedSessionId = sessionStorage.getItem('mental_rep_session_id');
    const storedName = sessionStorage.getItem('mental_rep_participant_name');
    const storedLanguage = sessionStorage.getItem('mental_rep_language') as 'en' | 'he' | null;

    if (!storedSessionId) {
      router.push('/mentalRep');
      return;
    }

    setSessionId(storedSessionId);
    setParticipantName(storedName);
    setLanguage(storedLanguage || 'en');

    loadResults(storedSessionId);
  }, [router]);

  const loadResults = async (sessionId: string) => {
    // First try session storage
    const scanningStr = sessionStorage.getItem('mental_rep_scanning_results');
    const rotationStr = sessionStorage.getItem('mental_rep_rotation_results');

    let scanningData: ScanningTrialResult[] = scanningStr ? JSON.parse(scanningStr) : [];
    let rotationData: RotationTrialResult[] = rotationStr ? JSON.parse(rotationStr) : [];

    // If not in session storage, try Supabase
    if (scanningData.length === 0 || rotationData.length === 0) {
      const supabase = getSupabase();
      if (supabase) {
        const { data, error } = await supabase
          .from('mental_rep_results')
          .select('*')
          .eq('session_id', sessionId)
          .order('trial_number', { ascending: true });

        if (!error && data) {
          scanningData = (data as (ScanningTrialResult | RotationTrialResult)[])
            .filter((r): r is ScanningTrialResult => r.experiment_type === 'scanning');
          rotationData = (data as (ScanningTrialResult | RotationTrialResult)[])
            .filter((r): r is RotationTrialResult => r.experiment_type === 'rotation' && !r.is_practice);
        }
      }
    }

    setScanningResults(scanningData);
    setRotationResults(rotationData);
    calculateSummary(scanningData, rotationData);
    setLoading(false);
  };

  const calculateSummary = (
    scanningData: ScanningTrialResult[],
    rotationData: RotationTrialResult[]
  ) => {
    // Scanning stats
    const scanningCorrect = scanningData.filter((r) => r.found_target).length;
    const scanningMeanRT = scanningData.length > 0
      ? scanningData.reduce((sum, r) => sum + r.reaction_time_ms, 0) / scanningData.length
      : 0;

    const scanningRTData = scanningData.map((r) => ({
      distance: r.distance,
      rt: r.reaction_time_ms,
    }));

    const scanningCorr = calcScanningCorr(scanningRTData);
    const scanningRTByDistance = groupByDistanceBins(scanningRTData, 5);

    // Rotation stats
    const rotationCorrect = rotationData.filter((r) => r.is_correct).length;
    const rotationMeanRT = rotationData.length > 0
      ? rotationData.reduce((sum, r) => sum + r.reaction_time_ms, 0) / rotationData.length
      : 0;

    // Only use correct trials for RT analysis
    const correctRotationData = rotationData.filter((r) => r.is_correct);
    const rotationRTData = correctRotationData.map((r) => ({
      angle: r.rotation_difference,
      rt: r.reaction_time_ms,
    }));

    const rotationCorr = calcRotationCorr(rotationRTData);
    const rotationRTByAngle = groupByAngle(rotationRTData);

    setSummary({
      scanning: {
        totalTrials: scanningData.length,
        correctTrials: scanningCorrect,
        accuracy: scanningData.length > 0 ? (scanningCorrect / scanningData.length) * 100 : 0,
        meanRT: scanningMeanRT,
        rtByDistance: scanningRTByDistance,
        correlation: scanningCorr,
      },
      rotation: {
        totalTrials: rotationData.length,
        correctTrials: rotationCorrect,
        accuracy: rotationData.length > 0 ? (rotationCorrect / rotationData.length) * 100 : 0,
        meanRT: rotationMeanRT,
        rtByAngle: rotationRTByAngle,
        correlation: rotationCorr,
      },
    });
  };

  const downloadData = () => {
    // Create CSV for scanning
    const scanningCSV = [
      ['Trial', 'From', 'To', 'Distance', 'RT (ms)'].join(','),
      ...scanningResults.map((r) =>
        [r.trial_number, r.from_landmark, r.to_landmark, r.distance.toFixed(2), r.reaction_time_ms.toFixed(0)].join(',')
      ),
    ].join('\n');

    // Create CSV for rotation
    const rotationCSV = [
      ['Trial', 'Figure', 'Left Angle', 'Right Angle', 'Rotation Diff', 'Is Same', 'Response', 'Correct', 'RT (ms)'].join(','),
      ...rotationResults.map((r) =>
        [
          r.trial_number,
          r.figure_id,
          r.left_angle,
          r.right_angle,
          r.rotation_difference,
          r.is_same,
          r.response,
          r.is_correct,
          r.reaction_time_ms.toFixed(0),
        ].join(',')
      ),
    ].join('\n');

    const fullCSV = `=== SCANNING RESULTS ===\n${scanningCSV}\n\n=== ROTATION RESULTS ===\n${rotationCSV}`;

    const blob = new Blob([fullCSV], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mental-rep-results-${participantName || 'anonymous'}.csv`;
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
    if (supabase) {
      await supabase.from('mental_rep_results').delete().eq('session_id', sessionId);
    }

    sessionStorage.removeItem('mental_rep_session_id');
    sessionStorage.removeItem('mental_rep_participant_name');
    sessionStorage.removeItem('mental_rep_language');
    sessionStorage.removeItem('mental_rep_scanning_results');
    sessionStorage.removeItem('mental_rep_rotation_results');

    router.push('/mentalRep');
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
      scanningTitle: 'Mental Scanning',
      rotationTitle: 'Mental Rotation',
      trials: 'Trials',
      accuracy: 'Accuracy',
      meanRT: 'Mean RT',
      correlation: 'Correlation',
      rtByDistance: 'RT by Distance',
      rtByAngle: 'RT by Rotation Angle',
      scanningInterpretation: 'The positive correlation shows that scanning time increases with distance, demonstrating that mental images preserve spatial relationships.',
      rotationInterpretation: 'The positive correlation shows that response time increases with rotation angle, suggesting we mentally rotate images to compare them.',
      downloadButton: 'Download Data (CSV)',
      clearButton: 'Clear My Data',
      homeButton: 'Back to Home',
      teacherButton: 'Teacher Dashboard',
    },
    he: {
      title: 'התוצאות שלך',
      scanningTitle: 'סריקה מנטלית',
      rotationTitle: 'סיבוב מנטלי',
      trials: 'ניסויים',
      accuracy: 'דיוק',
      meanRT: 'זמן תגובה ממוצע',
      correlation: 'מתאם',
      rtByDistance: 'זמן תגובה לפי מרחק',
      rtByAngle: 'זמן תגובה לפי זווית סיבוב',
      scanningInterpretation: 'המתאם החיובי מראה שזמן הסריקה עולה עם המרחק, מה שמדגים שדימויים מנטליים משמרים יחסים מרחביים.',
      rotationInterpretation: 'המתאם החיובי מראה שזמן התגובה עולה עם זווית הסיבוב, מה שמצביע על כך שאנו מסובבים דימויים מנטלית כדי להשוות ביניהם.',
      downloadButton: 'הורד נתונים (CSV)',
      clearButton: 'מחק את הנתונים שלי',
      homeButton: 'חזרה לדף הבית',
      teacherButton: 'לוח המורה',
    },
  };

  const t = content[language];

  return (
    <div className={`min-h-screen bg-[#0f172a] ${language === 'he' ? 'rtl' : 'ltr'}`}>
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <div className="flex items-center justify-center gap-3 mb-4">
            <BrainCog className="w-12 h-12 text-cyan-400" />
            <h1 className="text-4xl font-bold text-gray-100">{t.title}</h1>
          </div>
          {participantName && <p className="text-lg text-gray-400">{participantName}</p>}
        </motion.div>

        {/* Scanning Results */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-gray-900 border border-gray-700 rounded-2xl shadow-xl p-6 mb-8"
        >
          <h2 className="text-2xl font-bold text-cyan-400 mb-4">{t.scanningTitle}</h2>

          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-gray-800 rounded-xl p-4">
              <div className="text-sm text-gray-400">{t.trials}</div>
              <div className="text-2xl font-bold text-cyan-400">{summary.scanning.totalTrials}</div>
            </div>
            <div className="bg-gray-800 rounded-xl p-4">
              <div className="text-sm text-gray-400">{t.meanRT}</div>
              <div className="text-2xl font-bold text-cyan-400">{summary.scanning.meanRT.toFixed(0)}ms</div>
            </div>
            <div className="bg-gray-800 rounded-xl p-4 col-span-2">
              <div className="text-sm text-gray-400">{t.correlation} (Distance × RT)</div>
              <div className="text-2xl font-bold text-cyan-400">r = {summary.scanning.correlation.toFixed(3)}</div>
            </div>
          </div>

          {/* Chart */}
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-gray-300 mb-2">{t.rtByDistance}</h3>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={summary.scanning.rtByDistance}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="distance"
                  label={{ value: language === 'en' ? 'Distance' : 'מרחק', position: 'bottom', offset: -5 }}
                />
                <YAxis
                  label={{ value: 'RT (ms)', angle: -90, position: 'insideLeft' }}
                />
                <Tooltip formatter={(value) => `${Number(value).toFixed(0)}ms`} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="meanRT"
                  stroke="#0891b2"
                  strokeWidth={2}
                  dot={{ fill: '#0891b2' }}
                  name="Mean RT (ms)"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <p className="text-gray-400 text-sm bg-gray-800 rounded-lg p-4">{t.scanningInterpretation}</p>
        </motion.div>

        {/* Rotation Results */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-gray-900 border border-gray-700 rounded-2xl shadow-xl p-6 mb-8"
        >
          <h2 className="text-2xl font-bold text-blue-400 mb-4">{t.rotationTitle}</h2>

          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-gray-800 rounded-xl p-4">
              <div className="text-sm text-gray-400">{t.trials}</div>
              <div className="text-2xl font-bold text-blue-400">{summary.rotation.totalTrials}</div>
            </div>
            <div className="bg-gray-800 rounded-xl p-4">
              <div className="text-sm text-gray-400">{t.accuracy}</div>
              <div className="text-2xl font-bold text-blue-400">{summary.rotation.accuracy.toFixed(1)}%</div>
            </div>
            <div className="bg-gray-800 rounded-xl p-4">
              <div className="text-sm text-gray-400">{t.meanRT}</div>
              <div className="text-2xl font-bold text-blue-400">{summary.rotation.meanRT.toFixed(0)}ms</div>
            </div>
            <div className="bg-gray-800 rounded-xl p-4">
              <div className="text-sm text-gray-400">{t.correlation} (Angle × RT)</div>
              <div className="text-2xl font-bold text-blue-400">r = {summary.rotation.correlation.toFixed(3)}</div>
            </div>
          </div>

          {/* Chart */}
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-gray-300 mb-2">{t.rtByAngle}</h3>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={summary.rotation.rtByAngle}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="angle"
                  label={{ value: language === 'en' ? 'Rotation Angle (°)' : 'זווית סיבוב (°)', position: 'bottom', offset: -5 }}
                />
                <YAxis
                  label={{ value: 'RT (ms)', angle: -90, position: 'insideLeft' }}
                />
                <Tooltip formatter={(value) => `${Number(value).toFixed(0)}ms`} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="meanRT"
                  stroke="#2563eb"
                  strokeWidth={2}
                  dot={{ fill: '#2563eb' }}
                  name="Mean RT (ms)"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <p className="text-gray-400 text-sm bg-gray-800 rounded-lg p-4">{t.rotationInterpretation}</p>
        </motion.div>

        {/* Action Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="flex flex-wrap gap-4 justify-center mb-8"
        >
          <button
            onClick={downloadData}
            className="flex items-center gap-2 px-6 py-3 bg-cyan-500 text-white rounded-lg hover:bg-cyan-400 transition-colors shadow-lg"
          >
            <Download className="w-5 h-5" />
            {t.downloadButton}
          </button>

          <button
            onClick={() => router.push('/mentalRep/teacher')}
            className="flex items-center gap-2 px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-400 transition-colors shadow-lg"
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
