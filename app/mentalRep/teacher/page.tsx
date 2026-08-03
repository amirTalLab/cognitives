'use client';

import React, { useState, useEffect, FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import { motion } from 'framer-motion';
import { BrainCog, Download, Users, ChevronLeft } from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { ScanningTrialResult, RotationTrialResult } from '@/types/mental-rep';
import { calculateCorrelation as calcScanningCorr, groupByDistanceBins } from '@/lib/mental-rep/scanning';
import { calculateCorrelation as calcRotationCorr, groupByAngle } from '@/lib/mental-rep/rotation';
import { getSupabase } from '@/lib/supabase';
import { verifyPassword } from '@/lib/auth';

interface ParticipantSummary {
  sessionId: string;
  participantName: string;
  scanningTrials: number;
  scanningMeanRT: number;
  scanningCorrelation: number;
  rotationTrials: number;
  rotationAccuracy: number;
  rotationMeanRT: number;
  rotationCorrelation: number;
}

export default function MentalRepTeacher() {
  const router = useRouter();
  const [language, setLanguage] = useState<'en' | 'he'>('en');
  const [allResults, setAllResults] = useState<(ScanningTrialResult | RotationTrialResult)[]>([]);
  const [participants, setParticipants] = useState<ParticipantSummary[]>([]);
  const [aggregateScanningData, setAggregateScanningData] = useState<{ distance: number; meanRT: number }[]>([]);
  const [aggregateRotationData, setAggregateRotationData] = useState<{ angle: number; meanRT: number }[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Password gate ──────────────────────────────────────────────────────────
  const [authed, setAuthed]   = useState(false);
  const [pwInput, setPwInput] = useState('');
  const [pwError, setPwError] = useState(false);

  useEffect(() => {
    const storedLanguage = sessionStorage.getItem('mental_rep_language') as 'en' | 'he' | null;
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
      setLoading(false);
      return;
    }

    const allData: unknown[] = [];
    let from = 0;
    while (true) {
      const { data: page, error } = await supabase
        .from('mental_rep_results')
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
      const rows = allData as (ScanningTrialResult | RotationTrialResult)[];
      setAllResults(rows);
      processParticipants(rows);
      processAggregateData(rows);
    }

    setLoading(false);
  };

  const processParticipants = (data: (ScanningTrialResult | RotationTrialResult)[]) => {
    const sessionMap = new Map<string, (ScanningTrialResult | RotationTrialResult)[]>();

    data.forEach((result) => {
      if (!sessionMap.has(result.session_id)) {
        sessionMap.set(result.session_id, []);
      }
      sessionMap.get(result.session_id)!.push(result);
    });

    const summaries: ParticipantSummary[] = [];

    sessionMap.forEach((results, sessionId) => {
      const scanningResults = results.filter((r): r is ScanningTrialResult => r.experiment_type === 'scanning');
      const rotationResults = results.filter((r): r is RotationTrialResult => r.experiment_type === 'rotation' && !r.is_practice);

      // Calculate scanning stats
      const scanningRTData = scanningResults.map((r: ScanningTrialResult) => ({
        distance: r.distance,
        rt: r.reaction_time_ms,
      }));
      const scanningCorr = calcScanningCorr(scanningRTData);

      // Calculate rotation stats
      const correctRotation = rotationResults.filter((r: RotationTrialResult) => r.is_correct);
      const rotationRTData = correctRotation.map((r: RotationTrialResult) => ({
        angle: r.rotation_difference,
        rt: r.reaction_time_ms,
      }));
      const rotationCorr = calcRotationCorr(rotationRTData);

      summaries.push({
        sessionId,
        participantName: results[0]?.participant_name || 'Anonymous',
        scanningTrials: scanningResults.length,
        scanningMeanRT: scanningResults.length > 0
          ? scanningResults.reduce((sum: number, r: ScanningTrialResult) => sum + r.reaction_time_ms, 0) / scanningResults.length
          : 0,
        scanningCorrelation: scanningCorr,
        rotationTrials: rotationResults.length,
        rotationAccuracy: rotationResults.length > 0
          ? (rotationResults.filter((r: RotationTrialResult) => r.is_correct).length / rotationResults.length) * 100
          : 0,
        rotationMeanRT: rotationResults.length > 0
          ? rotationResults.reduce((sum: number, r: RotationTrialResult) => sum + r.reaction_time_ms, 0) / rotationResults.length
          : 0,
        rotationCorrelation: rotationCorr,
      });
    });

    setParticipants(summaries);
  };

  const processAggregateData = (data: (ScanningTrialResult | RotationTrialResult)[]) => {
    // Aggregate scanning data
    const scanningResults = data.filter((r): r is ScanningTrialResult => r.experiment_type === 'scanning');
    const scanningRTData = scanningResults.map((r: ScanningTrialResult) => ({
      distance: r.distance,
      rt: r.reaction_time_ms,
    }));
    setAggregateScanningData(groupByDistanceBins(scanningRTData, 5));

    // Aggregate rotation data
    const rotationResults = data.filter((r): r is RotationTrialResult => r.experiment_type === 'rotation' && !r.is_practice && r.is_correct);
    const rotationRTData = rotationResults.map((r: RotationTrialResult) => ({
      angle: r.rotation_difference,
      rt: r.reaction_time_ms,
    }));
    setAggregateRotationData(groupByAngle(rotationRTData));
  };

  const downloadAllData = () => {
    const scanningResults = allResults.filter((r): r is ScanningTrialResult => r.experiment_type === 'scanning');
    const rotationResults = allResults.filter((r): r is RotationTrialResult => r.experiment_type === 'rotation');

    const scanningCSV = [
      ['Session ID', 'Participant', 'Trial', 'From', 'To', 'Distance', 'RT (ms)'].join(','),
      ...scanningResults.map((r) =>
        [
          r.session_id,
          r.participant_name || 'Anonymous',
          r.trial_number,
          r.from_landmark,
          r.to_landmark,
          r.distance.toFixed(2),
          r.reaction_time_ms.toFixed(0),
        ].join(',')
      ),
    ].join('\n');

    const rotationCSV = [
      ['Session ID', 'Participant', 'Trial', 'Figure', 'Rotation Diff', 'Is Same', 'Response', 'Correct', 'RT (ms)', 'Practice'].join(','),
      ...rotationResults.map((r) =>
        [
          r.session_id,
          r.participant_name || 'Anonymous',
          r.trial_number,
          r.figure_id,
          r.rotation_difference,
          r.is_same,
          r.response,
          r.is_correct,
          r.reaction_time_ms.toFixed(0),
          r.is_practice,
        ].join(',')
      ),
    ].join('\n');

    const fullCSV = `=== SCANNING RESULTS ===\n${scanningCSV}\n\n=== ROTATION RESULTS ===\n${rotationCSV}`;

    const blob = new Blob([fullCSV], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mental-rep-class-results.csv';
    a.click();
  };

  if (!authed) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-cyan-50 to-blue-50 flex items-center justify-center">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-xl shadow-xl p-10 w-full max-w-sm flex flex-col items-center gap-6"
        >
          <BrainCog className="w-10 h-10 text-cyan-600" />
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900">Teacher Dashboard</h1>
            <p className="text-gray-500 text-sm mt-1">Mental Representation</p>
          </div>
          <form onSubmit={handleLogin} className="w-full flex flex-col gap-3">
            <input
              type="password"
              value={pwInput}
              onChange={e => { setPwInput(e.target.value); setPwError(false); }}
              placeholder="Password"
              autoFocus
              className={`w-full px-4 py-3 rounded-lg border text-gray-900 outline-none transition-colors
                ${pwError ? 'border-red-400 bg-red-50' : 'border-gray-300 focus:border-cyan-500'}`}
            />
            {pwError && <p className="text-red-500 text-sm text-center">Incorrect password</p>}
            <button type="submit"
              className="w-full py-3 bg-cyan-600 hover:bg-cyan-700 text-white font-bold rounded-lg transition-colors">
              Enter
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-cyan-50 to-blue-50 flex items-center justify-center">
        <div className="text-xl text-gray-600">Loading class data...</div>
      </div>
    );
  }

  const content = {
    en: {
      title: 'Teacher Dashboard',
      subtitle: 'Mental Representation - Class Results',
      participants: 'Participants',
      scanningTitle: 'Mental Scanning (Aggregate)',
      rotationTitle: 'Mental Rotation (Aggregate)',
      rtByDistance: 'RT by Distance (All Participants)',
      rtByAngle: 'RT by Rotation Angle (All Participants)',
      downloadButton: 'Download All Data (CSV)',
      backButton: 'Back to Results',
      noData: 'No participant data yet',
      languageToggle: 'עברית',
      tableHeaders: {
        name: 'Name',
        scanTrials: 'Scan Trials',
        scanRT: 'Scan RT',
        scanCorr: 'Scan r',
        rotTrials: 'Rot Trials',
        rotAcc: 'Rot Acc',
        rotRT: 'Rot RT',
        rotCorr: 'Rot r',
      },
    },
    he: {
      title: 'לוח המורה',
      subtitle: 'ייצוג מנטלי - תוצאות הכיתה',
      participants: 'משתתפים',
      scanningTitle: 'סריקה מנטלית (מצרפי)',
      rotationTitle: 'סיבוב מנטלי (מצרפי)',
      rtByDistance: 'זמן תגובה לפי מרחק (כל המשתתפים)',
      rtByAngle: 'זמן תגובה לפי זווית סיבוב (כל המשתתפים)',
      downloadButton: 'הורד את כל הנתונים (CSV)',
      backButton: 'חזרה לתוצאות',
      noData: 'אין עדיין נתוני משתתפים',
      languageToggle: 'English',
      tableHeaders: {
        name: 'שם',
        scanTrials: 'ניסויי סריקה',
        scanRT: 'זמן סריקה',
        scanCorr: 'מתאם סריקה',
        rotTrials: 'ניסויי סיבוב',
        rotAcc: 'דיוק סיבוב',
        rotRT: 'זמן סיבוב',
        rotCorr: 'מתאם סיבוב',
      },
    },
  };

  const t = content[language];

  if (participants.length === 0) {
    return (
      <div className={`min-h-screen bg-gradient-to-br from-cyan-50 to-blue-50 ${language === 'he' ? 'rtl' : 'ltr'}`}>
        <div className="container mx-auto px-4 py-8 text-center">
          <BrainCog className="w-16 h-16 text-cyan-600 mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-gray-900 mb-2">{t.title}</h1>
          <p className="text-gray-600">{t.noData}</p>
        </div>
      </div>
    );
  }

  // Calculate aggregate stats
  const avgScanningCorr = participants.reduce((sum, p) => sum + p.scanningCorrelation, 0) / participants.length;
  const avgRotationCorr = participants.reduce((sum, p) => sum + p.rotationCorrelation, 0) / participants.length;
  const avgRotationAcc = participants.reduce((sum, p) => sum + p.rotationAccuracy, 0) / participants.length;

  return (
    <div className={`min-h-screen bg-gradient-to-br from-cyan-50 to-blue-50 ${language === 'he' ? 'rtl' : 'ltr'}`}>
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <div className="flex items-center justify-center gap-3 mb-4">
            <BrainCog className="w-12 h-12 text-cyan-600" />
            <h1 className="text-4xl font-bold text-gray-900">{t.title}</h1>
          </div>
          <p className="text-lg text-cyan-600 font-medium">{t.subtitle}</p>
        </motion.div>

        {/* Language Toggle */}
        <div className="flex justify-end mb-6">
          <button
            onClick={() => setLanguage(language === 'en' ? 'he' : 'en')}
            className="px-4 py-2 text-sm font-medium text-cyan-600 hover:text-cyan-700 hover:bg-cyan-50 rounded-lg transition-colors"
          >
            {t.languageToggle}
          </button>
        </div>

        {/* Summary Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8"
        >
          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-5 h-5 text-cyan-600" />
              <div className="text-sm text-gray-600">{t.participants}</div>
            </div>
            <div className="text-3xl font-bold text-cyan-600">{participants.length}</div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="text-sm text-gray-600 mb-2">Avg Scanning r</div>
            <div className="text-3xl font-bold text-cyan-600">{avgScanningCorr.toFixed(3)}</div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="text-sm text-gray-600 mb-2">Avg Rotation Accuracy</div>
            <div className="text-3xl font-bold text-blue-600">{avgRotationAcc.toFixed(1)}%</div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="text-sm text-gray-600 mb-2">Avg Rotation r</div>
            <div className="text-3xl font-bold text-blue-600">{avgRotationCorr.toFixed(3)}</div>
          </div>
        </motion.div>

        {/* Aggregate Charts */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
          {/* Scanning Chart */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white rounded-xl shadow-lg p-6"
          >
            <h2 className="text-xl font-semibold text-cyan-700 mb-4">{t.rtByDistance}</h2>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={aggregateScanningData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="distance" label={{ value: 'Distance', position: 'bottom', offset: -5 }} />
                <YAxis label={{ value: 'RT (ms)', angle: -90, position: 'insideLeft' }} />
                <Tooltip formatter={(value) => `${Number(value).toFixed(0)}ms`} />
                <Line type="monotone" dataKey="meanRT" stroke="#0891b2" strokeWidth={2} dot={{ fill: '#0891b2' }} />
              </LineChart>
            </ResponsiveContainer>
          </motion.div>

          {/* Rotation Chart */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-white rounded-xl shadow-lg p-6"
          >
            <h2 className="text-xl font-semibold text-blue-700 mb-4">{t.rtByAngle}</h2>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={aggregateRotationData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="angle" label={{ value: 'Rotation (°)', position: 'bottom', offset: -5 }} />
                <YAxis label={{ value: 'RT (ms)', angle: -90, position: 'insideLeft' }} />
                <Tooltip formatter={(value) => `${Number(value).toFixed(0)}ms`} />
                <Line type="monotone" dataKey="meanRT" stroke="#2563eb" strokeWidth={2} dot={{ fill: '#2563eb' }} />
              </LineChart>
            </ResponsiveContainer>
          </motion.div>
        </div>

        {/* Participant Table */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-white rounded-xl shadow-lg p-6 mb-8 overflow-x-auto"
        >
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Participant Details</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-3">{t.tableHeaders.name}</th>
                <th className="text-left py-2 px-3">{t.tableHeaders.scanTrials}</th>
                <th className="text-left py-2 px-3">{t.tableHeaders.scanRT}</th>
                <th className="text-left py-2 px-3">{t.tableHeaders.scanCorr}</th>
                <th className="text-left py-2 px-3">{t.tableHeaders.rotTrials}</th>
                <th className="text-left py-2 px-3">{t.tableHeaders.rotAcc}</th>
                <th className="text-left py-2 px-3">{t.tableHeaders.rotRT}</th>
                <th className="text-left py-2 px-3">{t.tableHeaders.rotCorr}</th>
              </tr>
            </thead>
            <tbody>
              {participants.map((p) => (
                <tr key={p.sessionId} className="border-b hover:bg-gray-50">
                  <td className="py-2 px-3">{p.participantName}</td>
                  <td className="py-2 px-3">{p.scanningTrials}</td>
                  <td className="py-2 px-3">{p.scanningMeanRT.toFixed(0)}ms</td>
                  <td className="py-2 px-3">{p.scanningCorrelation.toFixed(3)}</td>
                  <td className="py-2 px-3">{p.rotationTrials}</td>
                  <td className="py-2 px-3">{p.rotationAccuracy.toFixed(1)}%</td>
                  <td className="py-2 px-3">{p.rotationMeanRT.toFixed(0)}ms</td>
                  <td className="py-2 px-3">{p.rotationCorrelation.toFixed(3)}</td>
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
            className="flex items-center gap-2 px-6 py-3 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors shadow-lg"
          >
            <Download className="w-5 h-5" />
            {t.downloadButton}
          </button>

          <button
            onClick={() => router.push('/mentalRep/results')}
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
