'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { v4 as uuidv4 } from 'uuid';
import { RotateCcw } from 'lucide-react';
import { TrialDisplay } from '@/components/stroop/trial-display';
import { ResponseButtons } from '@/components/stroop/response-buttons';
import { ProgressBar } from '@/components/stroop/progress-bar';
import { generateTrials, generatePracticeTrials, isCorrectResponse } from '@/lib/stroop/experiment';
import { getTimestamp, calculateReactionTime } from '@/lib/stroop/timing';
import { supabase } from '@/lib/supabase';
import { Trial, TrialResult, ColorKey } from '@/types/stroop';

const PRACTICE_TRIALS_COUNT = 5;
const TOTAL_TRIALS = 36;
const INTER_TRIAL_DELAY = 500; // ms between trials

export default function ExperimentPage() {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [participantName, setParticipantName] = useState<string | null>(null);
  const [practiceTrials, setPracticeTrials] = useState<Trial[]>([]);
  const [trials, setTrials] = useState<Trial[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPractice, setIsPractice] = useState(true);
  const [isWaiting, setIsWaiting] = useState(false);
  const [results, setResults] = useState<TrialResult[]>([]);
  const [practiceError, setPracticeError] = useState<ColorKey | null>(null);
  // Chosen on the landing page. The stimuli themselves are Latin script in every condition
  // (red / adom / rojo / flurg), so only the surrounding instructions change.
  const [isHe, setIsHe] = useState(true);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    const storedSessionId = sessionStorage.getItem('stroop_session_id');
    const storedName = sessionStorage.getItem('stroop_participant_name');
    if (!storedSessionId) {
      router.push('/');
      return;
    }
    setSessionId(storedSessionId);
    setParticipantName(storedName);
    setIsHe(sessionStorage.getItem('stroop_language') !== 'en');
    setPracticeTrials(generatePracticeTrials());
    setTrials(generateTrials());
  }, [router]);

  useEffect(() => {
    const currentTrials = isPractice ? practiceTrials : trials;
    if (currentTrials.length > 0 && currentIndex < currentTrials.length && !isWaiting) {
      startTimeRef.current = getTimestamp();
    }
  }, [currentIndex, isPractice, practiceTrials.length, trials.length, isWaiting]);

  const handleRestart = useCallback(() => {
    const newSessionId = uuidv4();
    sessionStorage.setItem('stroop_session_id', newSessionId);
    setSessionId(newSessionId);
    setPracticeTrials(generatePracticeTrials());
    setTrials(generateTrials());
    setCurrentIndex(0);
    setIsPractice(true);
    setResults([]);
    setIsWaiting(false);
  }, []);

  const handleResponse = useCallback(
    async (response: ColorKey) => {
      if (isWaiting || !sessionId) return;

      const currentTrials = isPractice ? practiceTrials : trials;
      if (currentIndex >= currentTrials.length) return;

      const reactionTime = calculateReactionTime(startTimeRef.current);
      const currentTrial = currentTrials[currentIndex];
      const correct = isCorrectResponse(currentTrial, response);

      // If in practice mode, handle errors
      if (isPractice) {
        if (!correct) {
          // Show error feedback - highlight the correct button
          setPracticeError(currentTrial.colorName as ColorKey);
          // Reset time for new attempt
          startTimeRef.current = getTimestamp();
          return;
        }

        // Clear any error state
        setPracticeError(null);

        // Show inter-trial blank
        setIsWaiting(true);

        if (currentIndex + 1 >= PRACTICE_TRIALS_COUNT) {
          // Practice complete - move to real experiment
          setTimeout(() => {
            setIsPractice(false);
            setCurrentIndex(0);
            setIsWaiting(false);
          }, INTER_TRIAL_DELAY);
        } else {
          // Move to next practice trial
          setTimeout(() => {
            setCurrentIndex((prev) => prev + 1);
            setIsWaiting(false);
          }, INTER_TRIAL_DELAY);
        }
        return;
      }

      // Show inter-trial blank for real trials
      setIsWaiting(true);

      // Real experiment - save results
      const result: TrialResult = {
        session_id: sessionId,
        participant_name: participantName || undefined,
        word_text: currentTrial.wordText,
        font_color: currentTrial.fontColor,
        is_congruent: currentTrial.isCongruent,
        reaction_time_ms: reactionTime,
        user_response: response,
        is_correct: correct,
      };

      // Store result locally
      const newResults = [...results, result];
      setResults(newResults);

      // Save to Supabase (non-blocking)
      supabase.from('stroop_results').insert(result).then((response: { error: unknown }) => {
        if (response.error) {
          console.error('Failed to save result:', response.error);
        }
      });

      if (currentIndex + 1 >= TOTAL_TRIALS) {
        // Experiment complete - navigate to thank you page
        setTimeout(() => {
          router.push('/stroop/thanks');
        }, INTER_TRIAL_DELAY);
      } else {
        // Move to next trial after delay
        setTimeout(() => {
          setCurrentIndex((prev) => prev + 1);
          setIsWaiting(false);
        }, INTER_TRIAL_DELAY);
      }
    },
    [currentIndex, isPractice, isWaiting, practiceTrials, results, router, sessionId, trials]
  );

  if (!sessionId || trials.length === 0 || practiceTrials.length === 0) {
    return (
      <main className="min-h-screen bg-[#0f172a] flex items-center justify-center">
        <div className="text-gray-400">{isHe ? 'טוען…' : 'Loading…'}</div>
      </main>
    );
  }

  const currentTrials = isPractice ? practiceTrials : trials;
  const currentTrial = currentTrials[currentIndex];
  const totalForProgress = isPractice ? PRACTICE_TRIALS_COUNT : TOTAL_TRIALS;

  return (
    <main className="min-h-screen bg-[#0f172a] flex flex-col items-center justify-center p-8">
      <div className="fixed top-8 left-1/2 -translate-x-1/2 w-full max-w-md px-4">
        {isPractice ? (
          <div className="text-center">
            <p className="text-sm font-medium text-emerald-400 mb-2">
              {isHe ? 'ניסוי אימון' : 'Practice Trial'}
            </p>
            <ProgressBar current={currentIndex + 1} total={totalForProgress} />
          </div>
        ) : (
          <ProgressBar current={currentIndex + 1} total={totalForProgress} />
        )}
      </div>

      <div className="flex-1 flex flex-col items-center justify-center gap-16 w-full">
        <div className="h-32 flex items-center justify-center">
          <AnimatePresence mode="wait">
            {!isWaiting && currentTrial && (
              <TrialDisplay key={currentTrial.id} trial={currentTrial} />
            )}
          </AnimatePresence>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <ResponseButtons
            onResponse={handleResponse}
            disabled={isWaiting}
            highlightCorrect={isPractice ? practiceError : null}
          />
        </motion.div>
      </div>

      <div className="fixed bottom-8 flex flex-col items-center gap-4">
        <span className="text-sm text-gray-400">
          {isHe ? (
            <>לחצו על הכפתור שמתאים ל<strong>צבע האותיות</strong></>
          ) : (
            <>Press the button matching the <strong>font colour</strong></>
          )}
        </span>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={handleRestart}
          className="flex items-center gap-2 px-4 py-2 text-sm text-gray-400
                     hover:text-gray-200 transition-colors"
        >
          <RotateCcw className="w-4 h-4" />
          {isHe ? 'התחלה מחדש' : 'Restart'}
        </motion.button>
      </div>
    </main>
  );
}
