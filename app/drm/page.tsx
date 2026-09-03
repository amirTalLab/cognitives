'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Brain, ArrowRight } from 'lucide-react';

const KEY = 'drm';

export default function DRMHomePage() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [lang, setLang] = useState<'he' | 'en'>('he');

  useEffect(() => {
    const saved = sessionStorage.getItem(`${KEY}_language`) as 'he' | 'en' | null;
    if (saved) setLang(saved);
    const savedName = sessionStorage.getItem(`${KEY}_participant_name`);
    if (savedName) setFullName(savedName);
  }, []);

  const toggleLang = () => {
    const next = lang === 'he' ? 'en' : 'he';
    setLang(next);
    sessionStorage.setItem(`${KEY}_language`, next);
  };

  const handleStart = () => {
    if (!fullName.trim()) {
      alert(lang === 'he' ? 'נא להזין שם מלא' : 'Please enter your full name');
      return;
    }
    sessionStorage.setItem(`${KEY}_session_id`, crypto.randomUUID());
    sessionStorage.setItem(`${KEY}_participant_name`, fullName.trim());
    sessionStorage.setItem(`${KEY}_language`, lang);
    router.push('/drm/practice');
  };

  const he = lang === 'he';

  return (
    <main className="min-h-screen bg-[#0f172a] flex flex-col items-center justify-center p-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center max-w-2xl w-full"
      >
        <div className="flex justify-between items-center mb-8">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => router.push('/')}
            className="flex items-center gap-2 text-muted hover:text-foreground transition-colors"
          >
            <ArrowRight className="w-4 h-4" />
            <span>{he ? 'חזרה לרשימת הניסויים' : 'Back to experiments'}</span>
          </motion.button>

          <button
            onClick={toggleLang}
            className="text-xs px-3 py-1.5 rounded-full border border-gray-600 text-gray-400 hover:border-emerald-400 hover:text-emerald-400 transition-colors"
          >
            {he ? 'EN' : 'עב'}
          </button>
        </div>

        <div className="flex items-center justify-center gap-3 mb-6">
          <Brain className="w-10 h-10 text-emerald-400" />
          <h1 className="text-5xl md:text-6xl font-bold tracking-tight">
            {he ? 'ניסוי זיכרון' : 'Memory Experiment'}
          </h1>
        </div>

        <p className="text-xl text-muted mb-8">
          {he ? 'ניסוי זיכרון — DRM' : 'DRM Memory Experiment'}
        </p>

        <div className="bg-card border border-border rounded-xl p-6 mb-8" dir={he ? 'rtl' : 'ltr'}>
          <h2 className="text-lg font-semibold mb-4">
            {he ? 'איך זה עובד?' : 'How does it work?'}
          </h2>
          <ol className="space-y-3 text-muted" style={{ listStylePosition: 'inside' }}>
            {he ? (
              <>
                <li>
                  <strong className="text-foreground">שלב 1: למידה</strong> — תראי רשימות של מילים באנגלית. נסי לזכור אותן.
                </li>
                <li>
                  <strong className="text-foreground">שלב 2: חשבון</strong> — לאחר כל רשימה תבצעי משימה קצרה של זוגי/אי-זוגי.
                </li>
                <li>
                  <strong className="text-foreground">שלב 3: שחזור חופשי</strong> — הקלידי כמה שיותר מילים שזכרת מהרשימה.
                </li>
                <li>
                  <strong className="text-foreground">שלב 4: זיהוי</strong> — תראי מילים ותחליטי: האם ראית את המילה קודם?
                </li>
              </>
            ) : (
              <>
                <li>
                  <strong className="text-foreground">Phase 1: Study</strong> — You will see lists of English words. Try to remember them.
                </li>
                <li>
                  <strong className="text-foreground">Phase 2: Math</strong> — After each list, complete a short odd/even task.
                </li>
                <li>
                  <strong className="text-foreground">Phase 3: Free recall</strong> — Type as many words as you remember from the list.
                </li>
                <li>
                  <strong className="text-foreground">Phase 4: Recognition</strong> — See words and decide: did you see this word before?
                </li>
              </>
            )}
          </ol>
        </div>

        <div className="w-full max-w-md mx-auto mb-6" dir={he ? 'rtl' : 'ltr'}>
          <label htmlFor="fullName" className="block text-sm font-medium mb-2">
            {he ? 'שם מלא' : 'Full name'}
          </label>
          <input
            id="fullName"
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleStart()}
            placeholder={he ? 'הזיני שם מלא' : 'Enter your full name'}
            className="w-full px-4 py-3 bg-card border border-border rounded-lg
                       text-foreground placeholder:text-muted
                       focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent"
            dir={he ? 'rtl' : 'ltr'}
          />
        </div>

        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleStart}
          className="px-8 py-4 bg-emerald-400 text-zinc-900 font-bold text-lg rounded-xl
                     shadow-lg shadow-emerald-400/20 transition-colors hover:bg-emerald-300"
        >
          {he ? 'התחילי ניסוי' : 'Start Experiment'}
        </motion.button>

        <p className="mt-6 text-sm text-muted" dir={he ? 'rtl' : 'ltr'}>
          {he ? 'למידה + שחזור (~12 דקות) + זיהוי (~3 דקות)' : 'Study + Recall (~12 min) + Recognition (~3 min)'}
        </p>
      </motion.div>
    </main>
  );
}
