'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { v4 as uuidv4 } from 'uuid';
import { Search, ArrowRight } from 'lucide-react';

const ITEM_COLOR: Record<string, string> = { red: '#ef4444', blue: '#3b82f6' };

const T = {
  he: {
    back: 'חזרה לרשימת הניסויים',
    title: 'ניסוי חיפוש חזותי',
    subtitle: 'חיפוש צירוף – אפקט גודל המערך',
    yourTarget: 'היעד שלך:',
    redT: 'T אדומה',
    blueT: 'T כחולה',
    instructions: 'הוראות',
    i1: 'בניסוי זה תחפשו את האות T בצבע שמוצג למעלה בין אותיות אחרות על המסך.',
    i2: <>לחצו על כפתור <strong className="text-foreground">נמצא ✓</strong> אם T בצבע היעד נמצאת על המסך.</>,
    i3: <>לחצו על כפתור <strong className="text-foreground">לא נמצא ✗</strong> אם T בצבע היעד אינה נמצאת.</>,
    i4: 'נסו להיות מהירים ומדויקים ככל האפשר.',
    nameLabel: 'שם מלא',
    namePlaceholder: 'הזן שם מלא',
    start: 'התחל ניסוי',
    footer: 'כ-8–10 דקות • 8 ניסיונות תרגול + 128 ניסיונות',
  },
  en: {
    back: 'Back to experiments',
    title: 'Visual Search Experiment',
    subtitle: 'Conjunction Search – Set Size Effect',
    yourTarget: 'Your target:',
    redT: 'Red T',
    blueT: 'Blue T',
    instructions: 'Instructions',
    i1: 'Search for the letter T in the color shown above among other letters on the screen.',
    i2: <>Press the <strong className="text-foreground">Present ✓</strong> button if the target-colored T is on the screen.</>,
    i3: <>Press the <strong className="text-foreground">Absent ✗</strong> button if the target-colored T is not on the screen.</>,
    i4: 'Try to be as fast and accurate as possible.',
    nameLabel: 'Full name',
    namePlaceholder: 'Enter full name',
    start: 'Start Experiment',
    footer: '~8–10 minutes • 8 practice trials + 128 trials',
  },
} as const;

type Lang = 'he' | 'en';

export default function VisualSearchIntroPage() {
  const router = useRouter();
  const [participantName, setParticipantName] = useState('');
  const [targetColor, setTargetColor] = useState<'red' | 'blue'>('red');
  const [lang, setLang] = useState<Lang>('he');

  useEffect(() => {
    let tc = sessionStorage.getItem('vs_target_color') as 'red' | 'blue' | null;
    if (!tc) {
      tc = Math.random() < 0.5 ? 'red' : 'blue';
      sessionStorage.setItem('vs_target_color', tc);
    }
    setTargetColor(tc);

    const savedLang = sessionStorage.getItem('vs_language') as Lang | null;
     
    if (savedLang) setLang(savedLang);
  }, []);

  const toggleLang = () => {
    const next: Lang = lang === 'he' ? 'en' : 'he';
    setLang(next);
    sessionStorage.setItem('vs_language', next);
  };

  const handleStart = () => {
    const sessionId = uuidv4();
    sessionStorage.setItem('vs_session_id', sessionId);
    sessionStorage.setItem('vs_participant_name', participantName.trim());
    sessionStorage.setItem('vs_language', lang);
    router.push('/visualSearch/experiment');
  };

  const tx = T[lang];
  const isHe = lang === 'he';

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center max-w-2xl w-full"
      >
        {/* Top row: back + language toggle */}
        <div className="flex items-center justify-between mb-8">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => router.push('/')}
            className="flex items-center gap-2 text-muted hover:text-foreground transition-colors"
            dir={isHe ? 'rtl' : 'ltr'}
          >
            <ArrowRight className="w-4 h-4" />
            <span>{tx.back}</span>
          </motion.button>

          <button
            onClick={toggleLang}
            className="text-sm px-3 py-1 rounded-full border border-gray-600 text-gray-400
                       hover:border-rose-400 hover:text-rose-400 transition-colors"
          >
            {lang === 'he' ? 'EN' : 'עב'}
          </button>
        </div>

        <div className="flex items-center justify-center gap-3 mb-4">
          <Search className="w-10 h-10 text-rose-400" />
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight" dir={isHe ? 'rtl' : 'ltr'}>
            {tx.title}
          </h1>
        </div>

        <p className="text-xl text-muted mb-8" dir={isHe ? 'rtl' : 'ltr'}>{tx.subtitle}</p>

        {/* Target example */}
        <div className="bg-card border border-border rounded-xl p-5 mb-6 flex items-center justify-center gap-6">
          <span className="text-sm text-muted" dir={isHe ? 'rtl' : 'ltr'}>{tx.yourTarget}</span>
          <span style={{ color: ITEM_COLOR[targetColor], fontSize: 42, fontFamily: 'monospace', fontWeight: 'bold', lineHeight: 1 }}>
            T
          </span>
          <span className="text-sm text-muted">
            ({targetColor === 'red' ? tx.redT : tx.blueT})
          </span>
        </div>

        <div className="bg-card border border-border rounded-xl p-6 mb-8 text-right" dir={isHe ? 'rtl' : 'ltr'}>
          <h2 className="text-lg font-semibold mb-4">{tx.instructions}</h2>
          <ol className="space-y-3 text-muted list-decimal list-inside">
            <li>{tx.i1}</li>
            <li>{tx.i2}</li>
            <li>{tx.i3}</li>
            <li>{tx.i4}</li>
          </ol>
        </div>

        <div className="w-full max-w-md mb-6 mx-auto" dir={isHe ? 'rtl' : 'ltr'}>
          <label htmlFor="participantName" className="block text-sm font-medium mb-2 text-right">
            {tx.nameLabel}
          </label>
          <input
            id="participantName"
            type="text"
            value={participantName}
            onChange={(e) => setParticipantName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleStart()}
            placeholder={tx.namePlaceholder}
            className="w-full px-4 py-3 bg-card border border-border rounded-lg
                       text-foreground placeholder:text-muted
                       focus:outline-none focus:ring-2 focus:ring-rose-400 focus:border-transparent
                       text-right"
            dir={isHe ? 'rtl' : 'ltr'}
          />
        </div>

        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleStart}
          className="px-8 py-4 bg-rose-500 text-white font-bold text-lg rounded-xl
                     shadow-lg shadow-rose-500/20 transition-colors hover:bg-rose-400"
        >
          {tx.start}
        </motion.button>

        <p className="mt-6 text-sm text-muted" dir={isHe ? 'rtl' : 'ltr'}>
          {tx.footer}
        </p>
      </motion.div>
    </main>
  );
}
