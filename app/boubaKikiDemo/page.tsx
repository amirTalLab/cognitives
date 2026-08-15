'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Shapes } from 'lucide-react';
import { KEY } from '@/lib/bouba-kiki-demo/stimuli';

const TEXT = {
  he: {
    title: 'אפקט בובה-קיקי',
    intro: 'תראו שתי צורות. אחת נקראת "בובה" והשנייה "קיקי". המשימה: לבחור איזו צורה היא "בובה".',
    note: 'אין תשובה נכונה או שגויה — פשוט בחרו מה שמרגיש נכון.',
    name: 'שם',
    begin: 'התחלה',
  },
  en: {
    title: 'Bouba-Kiki Effect',
    intro: 'You will see two shapes. One is called "bouba" and the other "kiki". Your task: choose which shape is "bouba".',
    note: 'There is no right or wrong answer — just pick whichever feels right.',
    name: 'Name',
    begin: 'Begin',
  },
};

export default function LandingPage() {
  const router = useRouter();
  const [language, setLanguage] = useState<'he' | 'en'>('he');
  const [name, setName] = useState('');
  const t = TEXT[language];

  function begin(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    sessionStorage.setItem(KEY + '_name', name.trim());
    sessionStorage.setItem(KEY + '_language', language);
    sessionStorage.setItem(KEY + '_session_id', crypto.randomUUID());
    router.push('./practice');
  }

  return (
    <main className="min-h-screen bg-[#0f172a] flex items-center justify-center px-6 py-10">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="bg-gray-900 border border-gray-700 rounded-2xl p-8 w-full max-w-lg">
        <div className="flex items-center gap-3 mb-6">
          <Shapes className="w-7 h-7 text-purple-400" />
          <h1 className="text-2xl font-bold text-gray-100">{t.title}</h1>
          <button onClick={() => setLanguage(language === 'he' ? 'en' : 'he')}
            className="ml-auto px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg border border-gray-600">
            {language === 'he' ? 'English' : 'עברית'}
          </button>
        </div>

        <div dir={language === 'he' ? 'rtl' : 'ltr'} className="mb-6">
          <p className="text-gray-300 leading-relaxed">{t.intro}</p>
          <p className="text-gray-500 text-sm mt-2">{t.note}</p>
        </div>

        <form onSubmit={begin} dir={language === 'he' ? 'rtl' : 'ltr'} className="flex flex-col gap-3">
          <input type="text" required value={name} onChange={e => setName(e.target.value)}
            placeholder={t.name}
            className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-gray-200 outline-none focus:border-purple-400" />
          <button type="submit"
            className="w-full py-3 bg-purple-500 hover:bg-purple-400 text-white font-bold rounded-lg transition-colors touch-manipulation">
            {t.begin}
          </button>
        </form>
      </motion.div>
    </main>
  );
}
