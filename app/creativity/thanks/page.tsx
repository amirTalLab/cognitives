'use client';

import React, { useEffect, useState } from 'react';
import { CheckCircle } from 'lucide-react';
import { getSupabase } from '@/lib/supabase';

const KEY = 'crt';

interface Summary {
  autTotal: number;
  autObjects: number;
  circlesCompleted: number;
  ratSolved: number;
  ratTotal: number;
}

export default function ThanksPage() {
  const [language, setLanguage] = useState<'en' | 'he'>('he');
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    const lang = sessionStorage.getItem(`${KEY}_language`) as 'en' | 'he' | null;
    if (lang) setLanguage(lang);

    const sessionId = sessionStorage.getItem(`${KEY}_session_id`);
    if (!sessionId) return;

    (async () => {
      const sb = getSupabase();
      if (!sb) return;

      const [autRes, circlesRes, ratRes] = await Promise.all([
        sb.from('creativity_aut_results').select('object_index').eq('session_id', sessionId).eq('is_practice', false),
        sb.from('creativity_circles_results').select('circle_index').eq('session_id', sessionId).eq('is_practice', false),
        sb.from('creativity_rat_results').select('is_correct').eq('session_id', sessionId).eq('is_practice', false),
      ]);

      const autRows = autRes.data || [];
      const circleRows = circlesRes.data || [];
      const ratRows = ratRes.data || [];

      const uniqueObjects = new Set(autRows.map((r: { object_index: number }) => r.object_index));

      setSummary({
        autTotal: autRows.length,
        autObjects: uniqueObjects.size,
        circlesCompleted: circleRows.length,
        ratSolved: ratRows.filter((r: { is_correct: boolean }) => r.is_correct).length,
        ratTotal: ratRows.length,
      });
    })();
  }, []);

  const isHe = language === 'he';

  const t = isHe ? {
    thanks: '!תודה רבה',
    subtitle: 'סיימתם את סוללת היצירתיות',
    autLabel: 'שימושים חלופיים',
    autStat: (s: Summary) => `${s.autTotal} שימושים עבור ${s.autObjects} חפצים`,
    circlesLabel: 'עיגולים',
    circlesStat: (s: Summary) => `${s.circlesCompleted} ציורים`,
    ratLabel: 'מילה מקשרת',
    ratStat: (s: Summary) => `${s.ratSolved} מתוך ${s.ratTotal} נפתרו`,
  } : {
    thanks: 'Thank You!',
    subtitle: 'You completed the Creativity Battery',
    autLabel: 'Alternative Uses',
    autStat: (s: Summary) => `${s.autTotal} uses across ${s.autObjects} objects`,
    circlesLabel: 'Circles',
    circlesStat: (s: Summary) => `${s.circlesCompleted} drawings`,
    ratLabel: 'Remote Associates',
    ratStat: (s: Summary) => `${s.ratSolved} of ${s.ratTotal} solved`,
  };

  return (
    <div
      className="min-h-screen bg-[#0f172a] flex items-center justify-center px-4"
      dir={isHe ? 'rtl' : 'ltr'}
    >
      <div className="flex flex-col items-center gap-6 text-center max-w-sm w-full">
        <CheckCircle className="w-16 h-16 text-emerald-400" />
        <div>
          <h1 className="text-3xl font-bold text-white">{t.thanks}</h1>
          <p className="text-gray-400 text-sm mt-1">{t.subtitle}</p>
        </div>

        {summary && (
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full flex flex-col gap-4">
            <StatRow label={t.autLabel} value={t.autStat(summary)} accent="emerald" />
            <StatRow label={t.circlesLabel} value={t.circlesStat(summary)} accent="sky" />
            <StatRow label={t.ratLabel} value={t.ratStat(summary)} accent="amber" />
          </div>
        )}
      </div>
    </div>
  );
}

function StatRow({ label, value, accent }: { label: string; value: string; accent: string }) {
  const colorMap: Record<string, string> = {
    emerald: 'text-emerald-400',
    sky: 'text-sky-400',
    amber: 'text-amber-400',
  };
  return (
    <div className="flex flex-col gap-0.5">
      <span className={`text-xs font-medium ${colorMap[accent] || 'text-gray-400'}`}>{label}</span>
      <span className="text-white font-bold text-lg">{value}</span>
    </div>
  );
}
