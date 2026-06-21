'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';

const KEY = 'crt';

export default function CreativityLanding() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [language, setLanguage] = useState<'en' | 'he'>('he');
  const isHe = language === 'he';

  const t = isHe ? {
    title: 'סוללת יצירתיות',
    subtitle: 'שלוש משימות קצרות שבודקות חשיבה יצירתית',
    inst: [
      'תבצעו שלוש משימות, אחת אחרי השנייה.',
      'חלק 1: רשימת שימושים לחפצי יומיום (2 דקות לכל חפץ).',
      'חלק 2: הפיכת עיגולים ריקים לציורים (6 דקות).',
      'חלק 3: מציאת מילה מקשרת לשלישיות מילים (5 דקות).',
      'כל חלק מתוזמן — עבדו מהר ככל האפשר!',
    ],
    nameLabel: 'שמכם',
    namePH: 'הזינו את שמכם',
    start: 'התחילו',
    toggle: 'English',
  } : {
    title: 'Creativity Battery',
    subtitle: 'Three short tasks measuring creative thinking',
    inst: [
      'You will complete three tasks, one after another.',
      'Part 1: List uses for everyday objects (2 minutes each).',
      'Part 2: Turn empty circles into drawings (6 minutes).',
      'Part 3: Find the word linking three-word sets (5 minutes).',
      'Each part is timed — work as quickly as you can!',
    ],
    nameLabel: 'Your name',
    namePH: 'Enter your name',
    start: 'Begin',
    toggle: 'עברית',
  };

  const handleStart = () => {
    if (!name.trim()) {
      alert(isHe ? 'אנא הזינו את שמכם' : 'Please enter your name');
      return;
    }
    sessionStorage.setItem(`${KEY}_session_id`, crypto.randomUUID());
    sessionStorage.setItem(`${KEY}_participant_name`, name.trim());
    sessionStorage.setItem(`${KEY}_language`, language);
    router.push('/creativity/experiment');
  };

  return (
    <div
      className="min-h-screen bg-[#0f172a] flex items-center justify-center px-4 py-8"
      dir={isHe ? 'rtl' : 'ltr'}
    >
      <div className="w-full max-w-md">
        <div className="flex justify-end mb-6">
          <button
            onClick={() => setLanguage(l => l === 'en' ? 'he' : 'en')}
            className="px-3 py-1.5 text-sm text-orange-400 border border-orange-400/40 rounded-lg hover:bg-orange-400/10 transition-colors"
          >
            {t.toggle}
          </button>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="bg-gray-900 border border-gray-700 rounded-2xl p-8 flex flex-col gap-6"
        >
          <div className="text-center">
            <h1 className="text-2xl font-bold text-white">{t.title}</h1>
            <p className="text-gray-400 text-sm mt-1">{t.subtitle}</p>
          </div>

          <ul className="flex flex-col gap-2">
            {t.inst.map((line, i) => (
              <li key={i} className="flex gap-2 text-gray-300 text-sm leading-relaxed">
                <span className="text-emerald-400 font-bold mt-0.5">{i === 0 ? '•' : `${i}.`}</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>

          <div className="flex flex-col gap-1">
            <label className="text-gray-400 text-sm">{t.nameLabel}</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={t.namePH}
              className="bg-gray-800 border border-gray-600 rounded-lg px-4 py-2.5 text-white placeholder:text-gray-500 focus:outline-none focus:border-emerald-400"
              onKeyDown={e => e.key === 'Enter' && handleStart()}
            />
          </div>

          <button
            onClick={handleStart}
            className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-white font-bold rounded-lg transition-colors touch-manipulation"
          >
            {t.start}
          </button>
        </motion.div>
      </div>
    </div>
  );
}
