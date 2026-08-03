'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';

const KEY = 'drm';
const PRACTICE_WORDS = ['apple', 'banana', 'grape'];
const WORD_MS = 2000;
const ISI_MS = 250;

type Phase = 'intro' | 'word' | 'isi' | 'distractor' | 'recall' | 'feedback' | 'done';

export default function DRMPracticePage() {
  const router = useRouter();
  const [lang, setLang] = useState<'he' | 'en'>('he');
  const [phase, setPhase] = useState<Phase>('intro');
  const [wordIndex, setWordIndex] = useState(0);
  const [distractorTime, setDistractorTime] = useState(10);
  const [distractorNum, setDistractorNum] = useState(0);
  const [distractorAnswer, setDistractorAnswer] = useState<'odd' | 'even' | null>(null);
  const [recallText, setRecallText] = useState('');
  const [recallTime, setRecallTime] = useState(15);
  const [feedbackWords, setFeedbackWords] = useState<string[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const sid = sessionStorage.getItem(`${KEY}_session_id`);
    if (!sid) { router.push('/drm'); return; }
    const l = sessionStorage.getItem(`${KEY}_language`) as 'he' | 'en' | null;
    if (l) setLang(l);
  }, [router]);

  useEffect(() => {
    if (phase === 'word') {
      timerRef.current = setTimeout(() => setPhase('isi'), WORD_MS);
    } else if (phase === 'isi') {
      timerRef.current = setTimeout(() => {
        if (wordIndex + 1 < PRACTICE_WORDS.length) {
          setWordIndex(wordIndex + 1);
          setPhase('word');
        } else {
          setDistractorNum(Math.floor(Math.random() * 90) + 10);
          setPhase('distractor');
        }
      }, ISI_MS);
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [phase, wordIndex]);

  useEffect(() => {
    if (phase !== 'distractor') return;
    if (distractorTime <= 0) { setPhase('recall'); return; }
    timerRef.current = setTimeout(() => setDistractorTime(t => t - 1), 1000);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [phase, distractorTime]);

  useEffect(() => {
    if (phase !== 'recall') return;
    if (recallTime <= 0) { finishRecall(); return; }
    timerRef.current = setTimeout(() => setRecallTime(t => t - 1), 1000);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [phase, recallTime]);

  const handleDistractor = (answer: 'odd' | 'even') => {
    setDistractorAnswer(answer);
    setTimeout(() => {
      setDistractorAnswer(null);
      setDistractorNum(Math.floor(Math.random() * 90) + 10);
    }, 300);
  };

  const finishRecall = () => {
    const words = recallText.split(/[\s,;]+/).filter(w => w.trim().length > 0);
    setFeedbackWords(words);
    setPhase('feedback');
  };

  const he = lang === 'he';

  return (
    <main style={{ height: '100dvh' }} className="flex flex-col items-center justify-center p-8">
      <div className="text-center max-w-2xl w-full">
        <AnimatePresence mode="wait">
          {phase === 'intro' && (
            <motion.div key="intro" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <h2 className="text-3xl font-bold mb-6">{he ? 'תרגול' : 'Practice'}</h2>
              <div className="bg-card border border-border rounded-xl p-6 mb-8" dir={he ? 'rtl' : 'ltr'}>
                <p className="text-muted mb-4">
                  {he
                    ? 'כעת תראי רשימה קצרה של 3 מילים לתרגול. אחריה — משימת חשבון קצרה, ואז שחזור חופשי.'
                    : 'You will now see a short list of 3 practice words. After that — a brief math task, then free recall.'}
                </p>
                <p className="text-muted">
                  {he ? 'בניסוי יהיו 5 רשימות של 10 מילים כל אחת.' : 'The experiment has 5 lists of 10 words each.'}
                </p>
              </div>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setPhase('word')}
                className="px-8 py-4 bg-emerald-400 text-zinc-900 font-bold text-lg rounded-xl
                           shadow-lg shadow-emerald-400/20 transition-colors hover:bg-emerald-300"
              >
                {he ? 'התחילי תרגול' : 'Start Practice'}
              </motion.button>
            </motion.div>
          )}

          {phase === 'word' && (
            <motion.div key={`word-${wordIndex}`} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
              <p className="text-sm text-muted mb-4">{wordIndex + 1} / {PRACTICE_WORDS.length}</p>
              <div className="text-6xl md:text-8xl font-bold text-emerald-400" style={{ fontFamily: 'monospace' }}>
                {PRACTICE_WORDS[wordIndex]}
              </div>
            </motion.div>
          )}

          {phase === 'isi' && (
            <motion.div key="isi" initial={{ opacity: 0 }} animate={{ opacity: 0.3 }} exit={{ opacity: 0 }}>
              <div className="w-2 h-2 bg-emerald-400 rounded-full mx-auto" />
            </motion.div>
          )}

          {phase === 'distractor' && (
            <motion.div key="distractor" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <p className="text-sm text-muted mb-2">
                {he ? `חשבון — ${distractorTime} שניות` : `Math — ${distractorTime}s`}
              </p>
              <div className="text-6xl font-bold text-emerald-400 my-8" style={{ fontFamily: 'monospace' }}>
                {distractorNum}
              </div>
              <div className="flex gap-4 justify-center">
                <button
                  onClick={() => handleDistractor('even')}
                  disabled={distractorAnswer !== null}
                  className="px-8 py-4 bg-emerald-400 text-zinc-900 font-bold text-lg rounded-xl
                             hover:bg-emerald-300 transition-colors disabled:opacity-50 touch-manipulation"
                >
                  {he ? 'זוגי' : 'Even'}
                </button>
                <button
                  onClick={() => handleDistractor('odd')}
                  disabled={distractorAnswer !== null}
                  className="px-8 py-4 bg-zinc-700 text-foreground font-bold text-lg rounded-xl
                             hover:bg-zinc-600 transition-colors disabled:opacity-50 touch-manipulation"
                >
                  {he ? 'אי-זוגי' : 'Odd'}
                </button>
              </div>
            </motion.div>
          )}

          {phase === 'recall' && (
            <motion.div key="recall" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full">
              <h3 className="text-2xl font-bold mb-2 text-emerald-400">
                {he ? 'שחזור חופשי' : 'Free Recall'}
              </h3>
              <p className="text-muted mb-4" dir={he ? 'rtl' : 'ltr'}>
                {he
                  ? 'הקלידי כמה שיותר מילים שזכרת מהרשימה. הפרידי בפסיקים או רווחים.'
                  : 'Type as many words as you remember from the list. Separate with spaces or commas.'}
              </p>
              <p className="text-emerald-400 text-lg font-bold mb-4">{recallTime}s</p>
              <textarea
                autoFocus
                value={recallText}
                onChange={(e) => setRecallText(e.target.value)}
                className="w-full max-w-md mx-auto h-32 px-4 py-3 bg-card border border-border rounded-lg
                           text-foreground placeholder:text-muted focus:outline-none focus:ring-2
                           focus:ring-emerald-400 focus:border-transparent resize-none"
                placeholder={he ? 'הקלידי מילים כאן...' : 'Type words here...'}
                dir="ltr"
              />
              <div className="mt-4">
                <button
                  onClick={finishRecall}
                  className="px-6 py-2 bg-zinc-700 text-foreground rounded-lg hover:bg-zinc-600 transition-colors"
                >
                  {he ? 'סיימתי' : 'Done'}
                </button>
              </div>
            </motion.div>
          )}

          {phase === 'feedback' && (
            <motion.div key="feedback" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <h3 className="text-2xl font-bold mb-4">{he ? 'משוב' : 'Feedback'}</h3>
              <div className="bg-card border border-border rounded-xl p-6 mb-6" dir={he ? 'rtl' : 'ltr'}>
                <p className="mb-2">
                  {he ? 'המילים שהיו ברשימה:' : 'Words in the list:'}
                  {' '}<strong>{PRACTICE_WORDS.join(', ')}</strong>
                </p>
                <p className="mb-2">
                  {he ? 'המילים שזכרת:' : 'Words you recalled:'}
                  {' '}<strong>{feedbackWords.length > 0 ? feedbackWords.join(', ') : (he ? '(ריק)' : '(none)')}</strong>
                </p>
                <p className="text-muted mt-4">
                  {he
                    ? 'בניסוי לא תקבלי משוב — רק בתרגול.'
                    : 'In the experiment you will not receive feedback — only in practice.'}
                </p>
              </div>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setPhase('done')}
                className="px-8 py-4 bg-emerald-400 text-zinc-900 font-bold text-lg rounded-xl
                           shadow-lg shadow-emerald-400/20 transition-colors hover:bg-emerald-300"
              >
                {he ? 'המשיכי' : 'Continue'}
              </motion.button>
            </motion.div>
          )}

          {phase === 'done' && (
            <motion.div key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <h3 className="text-2xl font-bold mb-4">{he ? 'מוכנה לניסוי!' : 'Ready for the experiment!'}</h3>
              <div className="bg-card border border-border rounded-xl p-6 mb-6" dir={he ? 'rtl' : 'ltr'}>
                <p className="text-muted">
                  {he
                    ? 'בניסוי תראי 5 רשימות של 10 מילים. אחרי כל רשימה — משימת חשבון (30 שניות) ואז שחזור חופשי (90 שניות). בסוף — מבחן זיהוי.'
                    : 'The experiment has 5 lists of 10 words. After each — a math task (30s) then free recall (90s). Finally — a recognition test.'}
                </p>
              </div>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => router.push('/drm/study')}
                className="px-8 py-4 bg-emerald-400 text-zinc-900 font-bold text-lg rounded-xl
                           shadow-lg shadow-emerald-400/20 transition-colors hover:bg-emerald-300"
              >
                {he ? 'התחילי ניסוי' : 'Begin Experiment'}
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}
