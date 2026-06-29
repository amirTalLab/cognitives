'use client';

import React, { useEffect, useState } from 'react';
import { CheckCircle } from 'lucide-react';
import { TrialResult } from '@/types/brms-emotion';

interface CellStats { label: string; medianBT: number; }

function median(vals: number[]): number {
  if (!vals.length) return 0;
  const sorted = [...vals].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export default function BRMSThanksPage() {
  const [language, setLanguage] = useState<'en' | 'he'>('he');
  const [stats, setStats] = useState<CellStats[] | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);

  useEffect(() => {
    const lang = sessionStorage.getItem('brms_language') as 'en' | 'he' | null;
    if (lang) setLanguage(lang);
    try {
      const raw = sessionStorage.getItem('brms_results');
      if (!raw) return;
      const results: TrialResult[] = JSON.parse(raw);
      const correct = results.filter(r => r.is_correct);
      setAccuracy(results.length ? Math.round((correct.length / results.length) * 100) : 0);

      const uprightBTs = correct.filter(r => r.orientation === 'upright' && r.reaction_time_ms >= 200 && r.reaction_time_ms <= 15000).map(r => r.reaction_time_ms);
      const invertedBTs = correct.filter(r => r.orientation === 'inverted' && r.reaction_time_ms >= 200 && r.reaction_time_ms <= 15000).map(r => r.reaction_time_ms);

      const emotions = ['fearful', 'happy', 'neutral'] as const;
      const cellStats: CellStats[] = [
        { label: lang === 'he' ? 'זקוף' : 'Upright', medianBT: Math.round(median(uprightBTs)) },
        { label: lang === 'he' ? 'הפוך' : 'Inverted', medianBT: Math.round(median(invertedBTs)) },
      ];

      for (const em of emotions) {
        const bts = correct.filter(r => r.emotion === em && r.reaction_time_ms >= 200 && r.reaction_time_ms <= 15000).map(r => r.reaction_time_ms);
        const label = lang === 'he'
          ? (em === 'fearful' ? 'פחד' : em === 'happy' ? 'שמח' : 'ניטרלי')
          : (em === 'fearful' ? 'Fearful' : em === 'happy' ? 'Happy' : 'Neutral');
        cellStats.push({ label, medianBT: Math.round(median(bts)) });
      }

      setStats(cellStats);
    } catch { /* ignore */ }
  }, []);

  const isHe = language === 'he';
  const t = isHe ? {
    thanks: '!תודה רבה',
    subtitle: 'הנה הסיכום שלך',
    accuracy: 'דיוק',
    medBT: 'זמן פריצה חציוני (ms)',
  } : {
    thanks: 'Thank You!',
    subtitle: 'Here are your results',
    accuracy: 'Accuracy',
    medBT: 'Median Breaking Time (ms)',
  };

  return (
    <div className="min-h-screen bg-[#0f172a] flex items-center justify-center px-4" dir={isHe ? 'rtl' : 'ltr'}>
      <div className="flex flex-col items-center gap-6 text-center max-w-sm w-full">
        <CheckCircle className="w-16 h-16 text-green-400" />
        <h1 className="text-3xl font-bold text-white">{t.thanks}</h1>
        <p className="text-gray-400 text-sm">{t.subtitle}</p>

        {accuracy !== null && (
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-4 w-full">
            <div className="flex justify-between items-center">
              <span className="text-gray-400 text-sm">{t.accuracy}</span>
              <span className="text-white font-bold text-lg">{accuracy}%</span>
            </div>
          </div>
        )}

        {stats && (
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full flex flex-col gap-3">
            <p className="text-xs text-gray-500 mb-1">{t.medBT}</p>
            {stats.map((s, i) => (
              <div key={i} className={`flex justify-between items-center ${i === 1 ? 'mb-2 pb-2 border-b border-gray-700' : ''}`}>
                <span className="text-gray-400 text-sm">{s.label}</span>
                <span className="text-white font-bold text-lg">{s.medianBT > 0 ? s.medianBT : '—'}</span>
              </div>
            ))}
          </div>
        )}

        <a
          href="https://www.huji.ac.il/seker/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-emerald-400 underline text-sm mt-2 hover:text-emerald-300 transition-colors"
        >
          {isHe ? 'סיימת מוקדם? נא להקיש כאן' : 'Finished early? Please click here'}
        </a>
      </div>
    </div>
  );
}
