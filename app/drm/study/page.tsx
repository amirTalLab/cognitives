'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  WORD_LISTS,
  WORD_DISPLAY_MS,
  ISI_MS,
  LIST_INTRO_MS,
  DISTRACTOR_DURATION_MS,
  RECALL_DURATION_MS,
  BREAK_DURATION_MS,
  getStudyWordsForList,
  scoreRecall,
  shuffleArray,
} from '@/lib/drm/word-lists';
import { getSupabase } from '@/lib/supabase';

const KEY = 'drm';
const TOTAL_LISTS = WORD_LISTS.length;

type Phase =
  | 'list-intro'
  | 'word'
  | 'isi'
  | 'distractor'
  | 'recall'
  | 'break'
  | 'complete';

export default function DRMStudyPage() {
  const router = useRouter();
  const [lang, setLang] = useState<'he' | 'en'>('he');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [participantName, setParticipantName] = useState<string | null>(null);

  const [listIndex, setListIndex] = useState(0);
  const [listOrder, setListOrder] = useState<number[]>([]);
  const [phase, setPhase] = useState<Phase>('list-intro');
  const [wordIndex, setWordIndex] = useState(0);

  const [distractorTimeLeft, setDistractorTimeLeft] = useState(0);
  const [distractorNum, setDistractorNum] = useState(0);
  const [distractorCorrect, setDistractorCorrect] = useState(0);
  const [distractorTotal, setDistractorTotal] = useState(0);
  const [distractorAnswered, setDistractorAnswered] = useState(false);

  const [recallTimeLeft, setRecallTimeLeft] = useState(0);
  const [recallText, setRecallText] = useState('');

  const [breakTimeLeft, setBreakTimeLeft] = useState(0);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const recallRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const sid = sessionStorage.getItem(`${KEY}_session_id`);
    const name = sessionStorage.getItem(`${KEY}_participant_name`);
    const l = sessionStorage.getItem(`${KEY}_language`) as 'he' | 'en' | null;
    if (!sid) { router.push('/drm'); return; }
    setSessionId(sid);
    setParticipantName(name);
    if (l) setLang(l);

    const order = shuffleArray([...Array(WORD_LISTS.length).keys()]);
    setListOrder(order);
    sessionStorage.setItem(`${KEY}_list_order`, JSON.stringify(order));
  }, [router]);

  const currentListIdx = listOrder[listIndex] ?? 0;
  const studyWords = getStudyWordsForList(currentListIdx);

  useEffect(() => {
    if (phase === 'list-intro') {
      timerRef.current = setTimeout(() => {
        setWordIndex(0);
        setPhase('word');
      }, LIST_INTRO_MS);
    } else if (phase === 'word') {
      timerRef.current = setTimeout(() => setPhase('isi'), WORD_DISPLAY_MS);
    } else if (phase === 'isi') {
      timerRef.current = setTimeout(() => {
        if (wordIndex + 1 < studyWords.length) {
          setWordIndex(wordIndex + 1);
          setPhase('word');
        } else {
          setDistractorTimeLeft(Math.ceil(DISTRACTOR_DURATION_MS / 1000));
          setDistractorNum(Math.floor(Math.random() * 90) + 10);
          setDistractorCorrect(0);
          setDistractorTotal(0);
          setDistractorAnswered(false);
          setPhase('distractor');
        }
      }, ISI_MS);
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [phase, wordIndex, studyWords.length]);

  useEffect(() => {
    if (phase !== 'distractor') return;
    if (distractorTimeLeft <= 0) {
      setRecallTimeLeft(Math.ceil(RECALL_DURATION_MS / 1000));
      setRecallText('');
      setPhase('recall');
      return;
    }
    timerRef.current = setTimeout(() => setDistractorTimeLeft(t => t - 1), 1000);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [phase, distractorTimeLeft]);

  useEffect(() => {
    if (phase === 'recall' && recallRef.current) {
      recallRef.current.focus();
    }
  }, [phase]);

  useEffect(() => {
    if (phase !== 'recall') return;
    if (recallTimeLeft <= 0) { saveRecall(); return; }
    timerRef.current = setTimeout(() => setRecallTimeLeft(t => t - 1), 1000);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [phase, recallTimeLeft]);

  useEffect(() => {
    if (phase !== 'break') return;
    if (breakTimeLeft <= 0) {
      setListIndex(i => i + 1);
      setWordIndex(0);
      setPhase('list-intro');
      return;
    }
    timerRef.current = setTimeout(() => setBreakTimeLeft(t => t - 1), 1000);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [phase, breakTimeLeft]);

  const handleDistractor = useCallback((answer: 'odd' | 'even') => {
    if (distractorAnswered) return;
    const correct = distractorNum % 2 === 0 ? 'even' : 'odd';
    setDistractorTotal(t => t + 1);
    if (answer === correct) setDistractorCorrect(c => c + 1);
    setDistractorAnswered(true);
    setTimeout(() => {
      setDistractorAnswered(false);
      setDistractorNum(Math.floor(Math.random() * 90) + 10);
    }, 300);
  }, [distractorNum, distractorAnswered]);

  const saveRecall = async () => {
    if (!sessionId) return;

    const recalledWords = recallText
      .split(/[\s,;]+/)
      .map(w => w.trim().toLowerCase())
      .filter(w => w.length > 0);

    const previousIndices = listOrder.slice(0, listIndex);
    const scores = scoreRecall(recalledWords, currentListIdx, previousIndices);

    try {
      const supabase = getSupabase();
      if (supabase) {
        await supabase.from('drm_recall_results').insert({
          session_id: sessionId,
          participant_name: participantName,
          list_index: listIndex,
          list_theme: WORD_LISTS[currentListIdx].theme,
          recalled_words: recalledWords.join(','),
          critical_lure_recalled: scores.criticalLureRecalled,
          correct_count: scores.correctCount,
          intrusion_count: scores.intrusionCount,
          prior_list_intrusion_count: scores.priorListIntrusionCount,
          distractor_correct: distractorCorrect,
          distractor_total: distractorTotal,
        });
      }
    } catch (err) {
      console.error('Error saving recall:', err);
    }

    if (listIndex + 1 >= TOTAL_LISTS) {
      setPhase('complete');
    } else {
      setBreakTimeLeft(Math.ceil(BREAK_DURATION_MS / 1000));
      setPhase('break');
    }
  };

  const he = lang === 'he';

  if (!sessionId || listOrder.length === 0) return null;

  const overallProgress = (listIndex * 4 + (
    phase === 'list-intro' ? 0 :
    phase === 'word' || phase === 'isi' ? 1 :
    phase === 'distractor' ? 2 :
    phase === 'recall' ? 3 : 4
  )) / (TOTAL_LISTS * 4);

  return (
    <main style={{ height: '100dvh' }} className="flex flex-col p-8">
      <div className="flex-shrink-0 mb-4">
        <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-emerald-500"
            animate={{ width: `${overallProgress * 100}%` }}
            transition={{ duration: 0.4 }}
          />
        </div>
        <p className="text-xs text-muted mt-1 text-center">
          {he ? `רשימה ${listIndex + 1} מתוך ${TOTAL_LISTS}` : `List ${listIndex + 1} of ${TOTAL_LISTS}`}
        </p>
      </div>

      <div className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-2xl w-full">
          {phase === 'list-intro' && (
            <motion.div key={`intro-${listIndex}`} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}>
              <p className="text-2xl text-muted mb-2">
                {he ? `רשימה ${listIndex + 1}` : `List ${listIndex + 1}`}
              </p>
              <p className="text-lg text-emerald-400" dir={he ? 'rtl' : 'ltr'}>
                {he ? 'התכונני...' : 'Get ready...'}
              </p>
            </motion.div>
          )}

          {phase === 'word' && (
            <motion.div
              key={`word-${listIndex}-${wordIndex}`}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.15 }}
            >
              <p className="text-sm text-muted mb-4">
                {wordIndex + 1} / {studyWords.length}
              </p>
              <div className="text-6xl md:text-8xl font-bold text-emerald-400" style={{ fontFamily: 'monospace' }}>
                {studyWords[wordIndex].word}
              </div>
            </motion.div>
          )}

          {phase === 'isi' && (
            <div className="min-h-[200px]" />
          )}

          {phase === 'distractor' && (
            <motion.div key={`distractor-${listIndex}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <p className="text-sm text-muted mb-1" dir={he ? 'rtl' : 'ltr'}>
                {he ? 'זוגי או אי-זוגי?' : 'Odd or Even?'}
              </p>
              <p className="text-emerald-400 text-lg font-bold mb-6">{distractorTimeLeft}s</p>
              <div className="text-6xl font-bold text-emerald-400 mb-8" style={{ fontFamily: 'monospace' }}>
                {distractorNum}
              </div>
              <div className="flex gap-4 justify-center">
                <button
                  onClick={() => handleDistractor('even')}
                  disabled={distractorAnswered}
                  className="w-24 h-16 bg-emerald-400 text-zinc-900 font-bold text-lg rounded-xl
                             hover:bg-emerald-300 transition-colors disabled:opacity-50 touch-manipulation"
                >
                  {he ? 'זוגי' : 'Even'}
                </button>
                <button
                  onClick={() => handleDistractor('odd')}
                  disabled={distractorAnswered}
                  className="w-24 h-16 bg-zinc-700 text-foreground font-bold text-lg rounded-xl
                             hover:bg-zinc-600 transition-colors disabled:opacity-50 touch-manipulation"
                >
                  {he ? 'אי-זוגי' : 'Odd'}
                </button>
              </div>
              <p className="text-xs text-muted mt-4">
                {distractorCorrect}/{distractorTotal}
              </p>
            </motion.div>
          )}

          {phase === 'recall' && (
            <motion.div key={`recall-${listIndex}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full">
              <h3 className="text-2xl font-bold mb-2 text-emerald-400">
                {he ? 'שחזור חופשי' : 'Free Recall'}
              </h3>
              <p className="text-muted mb-2" dir={he ? 'rtl' : 'ltr'}>
                {he
                  ? 'הקלידי כמה שיותר מילים שזכרת מהרשימה שראית. הפרידי בפסיקים או רווחים. דווחי רק על מילים שאת בטוחה שהוצגו.'
                  : 'Type as many words as you remember from the list you just saw. Separate with spaces or commas. Only report words you believe were actually shown.'}
              </p>
              <p className="text-emerald-400 text-2xl font-bold mb-4">{recallTimeLeft}s</p>
              <textarea
                ref={recallRef}
                value={recallText}
                onChange={(e) => setRecallText(e.target.value)}
                className="w-full max-w-lg mx-auto h-36 px-4 py-3 bg-card border border-border rounded-lg
                           text-foreground placeholder:text-muted focus:outline-none focus:ring-2
                           focus:ring-emerald-400 focus:border-transparent resize-none text-lg"
                placeholder={he ? 'הקלידי מילים כאן...' : 'Type words here...'}
                dir="ltr"
              />
              <div className="mt-4">
                <button
                  onClick={saveRecall}
                  className="px-6 py-2 bg-zinc-700 text-foreground rounded-lg hover:bg-zinc-600 transition-colors"
                >
                  {he ? 'סיימתי' : 'Done'}
                </button>
              </div>
            </motion.div>
          )}

          {phase === 'break' && (
            <motion.div key={`break-${listIndex}`} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}>
              <p className="text-2xl text-muted mb-4" dir={he ? 'rtl' : 'ltr'}>
                {he ? 'התכונני לרשימה הבאה' : 'Prepare for the next list'}
              </p>
              <p className="text-5xl font-bold text-emerald-300">{breakTimeLeft}</p>
            </motion.div>
          )}

          {phase === 'complete' && (
            <motion.div key="complete" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
              <h2 className="text-3xl font-bold mb-6">
                {he ? 'שלב הלמידה והשחזור הסתיימו!' : 'Study and recall phases complete!'}
              </h2>
              <div className="bg-card border border-border rounded-xl p-6 mb-8" dir={he ? 'rtl' : 'ltr'}>
                <p className="text-lg mb-4">
                  {he ? 'כעת תעברי לשלב הזיהוי.' : 'Now you will proceed to the recognition test.'}
                </p>
                <p className="text-muted">
                  {he
                    ? 'תראי מילים ותצטרכי להחליט האם ראית אותן בשלב הלמידה או לא.'
                    : 'You will see words and decide whether you saw them during the study phase.'}
                </p>
              </div>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => router.push('/drm/test')}
                className="px-8 py-4 bg-emerald-400 text-zinc-900 font-bold text-lg rounded-xl
                           shadow-lg shadow-emerald-400/20 transition-colors hover:bg-emerald-300"
              >
                {he ? 'המשיכי לזיהוי' : 'Continue to Recognition'}
              </motion.button>
            </motion.div>
          )}
        </div>
      </div>
    </main>
  );
}
