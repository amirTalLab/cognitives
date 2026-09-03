'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend,
} from 'recharts';
import { Target, Clock, TrendingUp, CheckCircle } from 'lucide-react';
import { PosnerResult } from '@/types/posner-cueing';

interface Stats {
  validRT: number;
  invalidRT: number;
  validityEffect: number;
  accuracy: number;
  catchFalseAlarmRate: number;
  validRT_300: number;
  validRT_500: number;
  invalidRT_300: number;
  invalidRT_500: number;
  totalTrials: number;
  catchTotal: number;
  catchFalseAlarms: number;
}

function computeStats(results: PosnerResult[]): Stats {
  const mainResults = results.filter((r) => !r.is_practice);

  const validHits = mainResults.filter((r) => r.validity === 'valid' && r.response === 'hit' && r.rt_ms != null);
  const invalidHits = mainResults.filter((r) => r.validity === 'invalid' && r.response === 'hit' && r.rt_ms != null);

  const mean = (arr: PosnerResult[]) =>
    arr.length > 0 ? arr.reduce((s, r) => s + (r.rt_ms ?? 0), 0) / arr.length : 0;

  const validRT = Math.round(mean(validHits));
  const invalidRT = Math.round(mean(invalidHits));
  const validityEffect = invalidRT - validRT;

  const nonCatch = mainResults.filter((r) => r.validity !== 'catch');
  const correct = nonCatch.filter((r) => r.correct).length;
  const accuracy = nonCatch.length > 0 ? Math.round((correct / nonCatch.length) * 100) : 0;

  const catchTrials = mainResults.filter((r) => r.validity === 'catch');
  const catchFalseAlarms = catchTrials.filter((r) => r.response === 'false_alarm').length;
  const catchFalseAlarmRate = catchTrials.length > 0
    ? Math.round((catchFalseAlarms / catchTrials.length) * 100)
    : 0;

  // By SOA
  const validHits300 = validHits.filter((r) => r.soa === 300);
  const validHits500 = validHits.filter((r) => r.soa === 500);
  const invalidHits300 = invalidHits.filter((r) => r.soa === 300);
  const invalidHits500 = invalidHits.filter((r) => r.soa === 500);

  return {
    validRT,
    invalidRT,
    validityEffect,
    accuracy,
    catchFalseAlarmRate,
    validRT_300: Math.round(mean(validHits300)),
    validRT_500: Math.round(mean(validHits500)),
    invalidRT_300: Math.round(mean(invalidHits300)),
    invalidRT_500: Math.round(mean(invalidHits500)),
    totalTrials: nonCatch.length,
    catchTotal: catchTrials.length,
    catchFalseAlarms,
  };
}

export default function PosnerResultsPage() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  // Whatever language the participant chose on the landing page.
  const [isHe, setIsHe] = useState(true);

  useEffect(() => {
    setIsHe(sessionStorage.getItem('posner_language') !== 'en');
    const raw = sessionStorage.getItem('posner_results');
    if (!raw) {
      router.push('/posnerCueing');
      return;
    }
    try {
      const results: PosnerResult[] = JSON.parse(raw);
      setStats(computeStats(results));
    } catch {
      router.push('/posnerCueing');
    }
  }, [router]);

  if (!stats) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-muted">{isHe ? 'טוען תוצאות…' : 'Loading results…'}</p>
      </main>
    );
  }

  const validityBarData = [
    { name: isHe ? 'תקף' : 'Valid', rt: stats.validRT },
    { name: isHe ? 'לא תקף' : 'Invalid', rt: stats.invalidRT },
  ];

  const soaGroupedData = [
    { soa: 'SOA 300ms', valid: stats.validRT_300, invalid: stats.invalidRT_300 },
    { soa: 'SOA 500ms', valid: stats.validRT_500, invalid: stats.invalidRT_500 },
  ];

  const interpretationText =
    stats.validityEffect > 20
      ? (isHe
          ? `אפקט ההכוונה שלך הוא ${stats.validityEffect} מ"ש. הרמז שיפר משמעותית את מהירות התגובה כשהצביע לכיוון הנכון, בהשוואה לכיוון הלא נכון. זהו אפקט פוזנר הקלאסי!`
          : `Your cueing effect is ${stats.validityEffect} ms. The cue markedly sped up your response when it pointed the right way, compared with the wrong way. That is the classic Posner effect!`)
      : (isHe
          ? `אפקט ההכוונה שלך קטן יחסית (${stats.validityEffect} מ"ש). ייתכן שלא הושפעת מהרמז, או שנדרשים יותר ניסיונות לתוצאה יציבה.`
          : `Your cueing effect is relatively small (${stats.validityEffect} ms). You may not have been influenced by the cue, or more trials may be needed for a stable estimate.`);

  return (
    <main className="min-h-screen flex flex-col items-center py-8 px-4 md:px-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-4xl"
      >
        <div className="flex items-center justify-center gap-3 mb-2">
          <Target className="w-8 h-8 text-amber-400" />
          <h1 className="text-4xl md:text-5xl font-bold text-center">{isHe ? 'התוצאות שלך' : 'Your results'}</h1>
        </div>
        <p className="text-muted text-center mb-8">{isHe ? 'ניסוי הכוונת תשומת לב — אפקט פוזנר' : 'Spatial cueing — the Posner effect'}</p>

        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 text-muted text-sm mb-1">
              <Clock className="w-4 h-4 text-emerald-400" />
              <span>Valid RT</span>
            </div>
            <div className="text-2xl font-bold text-emerald-400">{stats.validRT}ms</div>
          </div>

          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 text-muted text-sm mb-1">
              <Clock className="w-4 h-4 text-rose-400" />
              <span>Invalid RT</span>
            </div>
            <div className="text-2xl font-bold text-rose-400">{stats.invalidRT}ms</div>
          </div>

          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 text-muted text-sm mb-1">
              <TrendingUp className="w-4 h-4 text-amber-400" />
              <span>Validity Effect</span>
            </div>
            <div className="text-2xl font-bold text-amber-400">+{stats.validityEffect}ms</div>
          </div>

          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 text-muted text-sm mb-1">
              <CheckCircle className="w-4 h-4 text-blue-400" />
              <span>Accuracy</span>
            </div>
            <div className="text-2xl font-bold text-blue-400">{stats.accuracy}%</div>
          </div>
        </div>

        {/* Bar chart: RT by validity */}
        <div className="bg-card border border-border rounded-xl p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">{isHe ? 'זמן תגובה לפי תקפות הרמז' : 'Reaction time by cue validity'}</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={validityBarData} margin={{ left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
              <XAxis dataKey="name" tick={{ fill: '#a1a1aa', fontSize: 13 }} />
              <YAxis
                tick={{ fill: '#a1a1aa', fontSize: 12 }}
                label={{ value: 'RT (ms)', angle: -90, position: 'insideLeft', style: { fill: '#a1a1aa', fontSize: 12 } }}
              />
              <Tooltip
                contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8 }}
                labelStyle={{ color: '#fff' }}
                formatter={(v) => [`${v}ms`, 'RT']}
              />
              <Bar dataKey="rt" fill="#fbbf24" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Grouped bar chart: RT by validity × SOA */}
        <div className="bg-card border border-border rounded-xl p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">{isHe ? 'זמן תגובה לפי תקפות × SOA' : 'Reaction time by validity × SOA'}</h2>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={soaGroupedData} margin={{ left: 10, bottom: 5 }} barCategoryGap="25%">
              <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
              <XAxis dataKey="soa" tick={{ fill: '#a1a1aa', fontSize: 13 }} />
              <YAxis
                tick={{ fill: '#a1a1aa', fontSize: 12 }}
                label={{ value: 'RT (ms)', angle: -90, position: 'insideLeft', style: { fill: '#a1a1aa', fontSize: 12 } }}
              />
              <Tooltip
                contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8 }}
                labelStyle={{ color: '#fff' }}
                formatter={(v, name) => [`${v}ms`, name === 'valid' ? 'Valid' : 'Invalid']}
              />
              <Legend
                formatter={(value) => (value === 'valid' ? 'Valid' : 'Invalid')}
                wrapperStyle={{ color: '#a1a1aa' }}
              />
              <Bar dataKey="valid" name="valid" fill="#34d399" radius={[4, 4, 0, 0]} />
              <Bar dataKey="invalid" name="invalid" fill="#fb7185" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Catch stats */}
        <div className="bg-card border border-border rounded-xl p-6 mb-6">
          <h2 className="text-lg font-semibold mb-3">{isHe ? 'ניסיונות Catch' : 'Catch trials'}</h2>
          <div className="flex gap-6 text-sm text-muted" dir={isHe ? 'rtl' : 'ltr'}>
            <span>
              {isHe ? 'סה"כ ניסיונות catch: ' : 'Catch trials: '}<strong className="text-foreground">{stats.catchTotal}</strong>
            </span>
            <span>
              {isHe ? 'אזעקות שווא: ' : 'False alarms: '}<strong className="text-rose-400">{stats.catchFalseAlarms}</strong>
              {' '}({stats.catchFalseAlarmRate}%)
            </span>
          </div>
        </div>

        {/* Interpretation */}
        <div className="bg-card border border-amber-400/20 rounded-xl p-6 mb-8">
          <h2 className="text-lg font-semibold mb-3">{isHe ? 'מה המשמעות?' : 'What does this mean?'}</h2>
          <p className="text-muted leading-relaxed text-sm" dir={isHe ? 'rtl' : 'ltr'}>{interpretationText}</p>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap justify-center gap-4">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => router.push('/')}
            className="px-6 py-3 bg-card border border-border rounded-xl font-medium
                       transition-colors hover:bg-border"
          >
            {isHe ? 'חזרה לדף הבית' : 'Back to home'}
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => router.push('/posnerCueing/teacher')}
            className="px-6 py-3 bg-amber-400 text-zinc-900 rounded-xl font-medium
                       transition-colors hover:bg-amber-300"
          >
            Teacher Dashboard
          </motion.button>
        </div>
      </motion.div>
    </main>
  );
}
