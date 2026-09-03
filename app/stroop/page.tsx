'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { v4 as uuidv4 } from 'uuid';
import { Beaker, Keyboard, ArrowRight, ArrowLeft } from 'lucide-react';

export default function StroopHomePage() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [language, setLanguage] = useState<'en' | 'he'>('he');
  const isHe = language === 'he';

  const t = isHe ? {
    back: 'חזרה לרשימת הניסויים',
    title: 'ניסוי סטרופ',
    subtitle: 'Stroop Effect Experiment',
    how: 'איך זה עובד?',
    steps: [
      'על המסך יופיעו מילים בשלושה צבעים שונים: אדום, ירוק או צהוב.',
      'המשימה שלכם: לזהות את צבע האותיות — לא את המילה עצמה!',
      'נתחיל ב-5 ניסויי אימון ואחר כך נמשיך ל-36 ניסויים אמיתיים.',
      'נסו להגיב מהר ככל האפשר, אבל גם בדיוק — השתמשו בכפתורים או במקשי המקלדת.',
    ],
    keys: 'מקשי קיצור: R אדום, G ירוק, Y צהוב',
    nameLabel: 'שם מלא',
    namePH: 'הזן שם מלא',
    start: 'התחל ניסוי',
    nameRequired: 'נא להזין שם מלא',
    duration: '5 אימון + 36 ניסויים • לוקח כ-3-4 דקות',
    toggle: 'English',
  } : {
    back: 'Back to experiments',
    title: 'Stroop Experiment',
    subtitle: 'ניסוי סטרופ',
    how: 'How it works',
    steps: [
      'Words will appear on screen in one of three colours: red, green or yellow.',
      'Your task: identify the colour of the letters — not the word itself!',
      'You will start with 5 practice trials, then continue to 36 real trials.',
      'Respond as fast as you can while staying accurate — use the buttons or the keyboard.',
    ],
    keys: 'Shortcuts: R red, G green, Y yellow',
    nameLabel: 'Full name',
    namePH: 'Enter your full name',
    start: 'Start experiment',
    nameRequired: 'Please enter your full name',
    duration: '5 practice + 36 trials • takes about 3-4 minutes',
    toggle: 'עברית',
  };

  const handleStart = () => {
    if (!fullName.trim()) {
      alert(t.nameRequired);
      return;
    }
    sessionStorage.setItem('stroop_session_id', uuidv4());
    sessionStorage.setItem('stroop_participant_name', fullName.trim());
    // Read by the experiment and thanks pages so the whole run stays in one language.
    sessionStorage.setItem('stroop_language', language);
    router.push('/stroop/experiment');
  };

  return (
    <main
      className="min-h-screen bg-[#0f172a] flex flex-col items-center justify-center px-4 py-8"
      dir={isHe ? 'rtl' : 'ltr'}
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-2xl"
      >
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => router.push('/')}
            className="flex items-center gap-2 text-gray-400 hover:text-gray-200 transition-colors"
          >
            {isHe ? <ArrowRight className="w-4 h-4" /> : <ArrowLeft className="w-4 h-4" />}
            <span className="text-sm">{t.back}</span>
          </button>

          <button
            onClick={() => setLanguage(l => (l === 'en' ? 'he' : 'en'))}
            className="px-3 py-1.5 text-sm text-emerald-400 border border-emerald-400/40 rounded-lg hover:bg-emerald-400/10 transition-colors"
          >
            {t.toggle}
          </button>
        </div>

        <div className="bg-gray-900 border border-gray-700 rounded-2xl p-8 flex flex-col gap-6">
          <div className="flex items-center justify-center gap-3">
            <Beaker className="w-9 h-9 text-emerald-400" />
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-gray-100">
              {t.title}
            </h1>
          </div>
          <p className="text-center text-gray-500 -mt-4">{t.subtitle}</p>

          <div>
            <h2 className="text-lg font-semibold mb-3 text-gray-200">{t.how}</h2>
            <ul className="flex flex-col gap-2">
              {t.steps.map((line, i) => (
                <li key={i} className="flex gap-2 text-gray-300 text-sm leading-relaxed">
                  <span className="text-emerald-400 font-bold mt-0.5">•</span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>

            <div className="flex items-center gap-2 mt-5 pt-4 border-t border-gray-700 text-sm text-gray-400">
              <Keyboard className="w-4 h-4 flex-shrink-0" />
              <span>{t.keys}</span>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="fullName" className="text-gray-400 text-sm">{t.nameLabel}</label>
            <input
              id="fullName"
              type="text"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleStart()}
              placeholder={t.namePH}
              className="px-4 py-3 bg-gray-800 border border-gray-600 rounded-xl text-gray-200 placeholder-gray-500 outline-none focus:border-emerald-400 transition-colors"
            />
          </div>

          <button
            onPointerDown={e => { e.preventDefault(); handleStart(); }}
            className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 text-white font-bold rounded-xl text-lg transition-colors touch-manipulation"
          >
            {t.start}
          </button>

          <p className="text-center text-xs text-gray-600">{t.duration}</p>
        </div>
      </motion.div>
    </main>
  );
}
