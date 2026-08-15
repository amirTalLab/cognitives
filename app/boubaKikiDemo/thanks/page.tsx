'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { TrialResult } from '@/types/bouba-kiki-demo';
import { KEY } from '@/lib/bouba-kiki-demo/stimuli';

export default function ThanksPage() {
  const router = useRouter();
  const [rows, setRows] = useState<TrialResult[]>([]);
  const [rtl, setRtl] = useState(true);

  useEffect(() => {
    setRtl((sessionStorage.getItem(KEY + '_language') || 'he') === 'he');
    try {
      setRows(JSON.parse(sessionStorage.getItem(KEY + '_results') || '[]') as TrialResult[]);
    } catch {
      setRows([]);
    }
  }, []);

  const main = rows.filter(r => !r.is_control);
  const rate = main.length ? Math.round((main.filter(r => r.is_conventional).length / main.length) * 100) : 0;
  const meanRt = rows.length ? Math.round(rows.reduce((a, r) => a + r.reaction_time_ms, 0) / rows.length) : 0;

  return (
    <main className="min-h-screen bg-[#0f172a] flex items-center justify-center px-6 py-10">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="bg-gray-900 border border-gray-700 rounded-2xl p-8 w-full max-w-lg text-center">
        <Check className="w-10 h-10 text-purple-400 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-gray-100 mb-6" dir={rtl ? 'rtl' : 'ltr'}>
          {rtl ? 'תודה!' : 'Thank you!'}
        </h1>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
            <p className="text-3xl font-bold text-purple-400">{rate}%</p>
            <p className="text-xs text-gray-500 mt-1">
              {rtl ? 'מיפוי מוסכם' : 'conventional mapping'}
            </p>
          </div>
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
            <p className="text-3xl font-bold text-purple-400">{meanRt}</p>
            <p className="text-xs text-gray-500 mt-1">{rtl ? 'זמן תגובה ממוצע (מ״ש)' : 'mean RT (ms)'}</p>
          </div>
        </div>

        <p className="text-sm text-gray-400 mb-6" dir={rtl ? 'rtl' : 'ltr'}>
          {rtl
            ? 'רוב האנשים בוחרים בצורה המעוגלת כ"בובה" — הקשר בין צליל לצורה אינו שרירותי.'
            : 'Most people pick the rounded shape as "bouba" — the link between sound and shape is not arbitrary.'}
        </p>

        <button onClick={() => router.push('/')}
          className="px-4 py-2 text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg border border-gray-600">
          {rtl ? 'סיום' : 'Done'}
        </button>
      </motion.div>
    </main>
  );
}
