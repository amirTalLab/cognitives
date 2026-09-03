'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { v4 as uuidv4 } from 'uuid';
import { Target, ArrowRight, ArrowLeft } from 'lucide-react';

export default function PosnerCueingIntroPage() {
  const router = useRouter();
  const [participantName, setParticipantName] = useState('');
  const [language, setLanguage] = useState<'en' | 'he'>('he');
  const isHe = language === 'he';

  const t = isHe ? {
    back: 'חזרה לרשימת הניסויים',
    title: 'ניסוי הכוונת תשומת לב',
    subtitle: 'אפקט פוזנר',
    how: 'הוראות',
    steps: [
      'בניסוי זה תראו שתי תיבות על המסך — אחת משמאל ואחת מימין — ו-+ במרכז.',
      'בכל ניסיון, חץ יופיע במרכז ויצביע שמאלה (←) או ימינה (→).',
      'זמן קצר לאחר מכן, יופיע ● בתוך אחת התיבות.',
      'המשימה שלכם: לחצו על מקש הרווח מהר ככל האפשר כשאתם רואים את ה-●.',
      'החץ לרוב מצביע לכיוון הנכון — אך לא תמיד!',
      'שמרו על עיניכם על ה-+ במרכז המסך — אל תביטו אל התיבות.',
      'בחלק מהניסיונות לא יופיע יעד כלל. אל תלחצו דבר במקרה זה.',
    ],
    keys: 'לחצו רווח כשרואים ●',
    nameLabel: 'שם מלא',
    namePH: 'הזן שם מלא',
    start: 'התחל ניסוי',
    duration: 'כ-6–8 דקות • 8 ניסיונות תרגול + 112 ניסיונות',
    toggle: 'English',
  } : {
    back: 'Back to experiments',
    title: 'Spatial Cueing',
    subtitle: 'The Posner effect',
    how: 'Instructions',
    steps: [
      'You will see two boxes on screen — one on the left, one on the right — and a + in the middle.',
      'On each trial an arrow appears in the middle, pointing left (←) or right (→).',
      'Shortly afterwards, a ● appears inside one of the boxes.',
      'Your task: press the spacebar as fast as you can when you see the ●.',
      'The arrow usually points the right way — but not always!',
      'Keep your eyes on the + in the centre — do not look at the boxes.',
      'On some trials no target appears at all. Press nothing in that case.',
    ],
    keys: 'Press space when you see ●',
    nameLabel: 'Full name',
    namePH: 'Enter your full name',
    start: 'Start experiment',
    duration: 'About 6–8 minutes • 8 practice + 112 trials',
    toggle: 'עברית',
  };

  const handleStart = () => {
    sessionStorage.setItem('posner_session_id', uuidv4());
    sessionStorage.setItem('posner_participant_name', participantName.trim());
    // Read by the experiment, results and thanks pages so the run stays in one language.
    sessionStorage.setItem('posner_language', language);
    router.push('/posnerCueing/experiment');
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
            className="px-3 py-1.5 text-sm text-amber-400 border border-amber-400/40 rounded-lg hover:bg-amber-400/10 transition-colors"
          >
            {t.toggle}
          </button>
        </div>

        <div className="bg-gray-900 border border-gray-700 rounded-2xl p-8 flex flex-col gap-6">
          <div className="flex items-center justify-center gap-3">
            <Target className="w-9 h-9 text-amber-400" />
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-gray-100">
              {t.title}
            </h1>
          </div>
          <p className="text-center text-gray-500 -mt-4">{t.subtitle}</p>

          <div>
            <h2 className="text-lg font-semibold mb-3 text-gray-200">{t.how}</h2>
            <ol className="flex flex-col gap-2 list-decimal list-inside">
              {t.steps.map((line, i) => (
                <li key={i} className="text-gray-300 text-sm leading-relaxed">{line}</li>
              ))}
            </ol>

            <div className="mt-5 pt-4 border-t border-gray-700 text-sm text-gray-400">
              {t.keys}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="participantName" className="text-gray-400 text-sm">{t.nameLabel}</label>
            <input
              id="participantName"
              type="text"
              value={participantName}
              onChange={e => setParticipantName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleStart()}
              placeholder={t.namePH}
              className="px-4 py-3 bg-gray-800 border border-gray-600 rounded-xl text-gray-200 placeholder-gray-500 outline-none focus:border-amber-400 transition-colors"
            />
          </div>

          <button
            onPointerDown={e => { e.preventDefault(); handleStart(); }}
            className="w-full py-4 bg-amber-500 hover:bg-amber-400 text-white font-bold rounded-xl text-lg transition-colors touch-manipulation"
          >
            {t.start}
          </button>

          <p className="text-center text-xs text-gray-600">{t.duration}</p>
        </div>
      </motion.div>
    </main>
  );
}
