'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { RotateCw } from 'lucide-react';
import { RotationTrial, RotationTrialResult } from '@/types/mental-rep';
import { generatePracticeTrials, ROTATION_CONTENT } from '@/lib/mental-rep/rotation';
import BlockFigure from '@/components/mental-rep/BlockFigure';

export default function RotationPractice() {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [participantName, setParticipantName] = useState<string | null>(null);
  const [language, setLanguage] = useState<'en' | 'he'>('en');

  const [trials, setTrials] = useState<RotationTrial[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [results, setResults] = useState<RotationTrialResult[]>([]);
  const [startTime, setStartTime] = useState<number>(Date.now());
  const [phase, setPhase] = useState<'instructions' | 'fixation' | 'trial' | 'feedback'>('instructions');
  const [lastResponse, setLastResponse] = useState<{ correct: boolean; isCorrectAnswer: boolean } | null>(null);

  // Load session data
  useEffect(() => {
    const storedSessionId = sessionStorage.getItem('mental_rep_session_id');
    const storedName = sessionStorage.getItem('mental_rep_participant_name');
    const storedLanguage = sessionStorage.getItem('mental_rep_language') as 'en' | 'he' | null;

    if (!storedSessionId) {
      router.push('/mentalRep');
      return;
    }

    setSessionId(storedSessionId);
    setParticipantName(storedName);
    setLanguage(storedLanguage || 'en');

    // Generate practice trials
    const generatedTrials = generatePracticeTrials();
    setTrials(generatedTrials);
  }, [router]);

  // Handle phase transitions
  useEffect(() => {
    if (trials.length === 0 || phase === 'instructions') return;

    if (phase === 'fixation') {
      const timer = setTimeout(() => {
        setPhase('trial');
        setStartTime(Date.now());
      }, 500);
      return () => clearTimeout(timer);
    }

    if (phase === 'feedback') {
      const timer = setTimeout(() => {
        // Move to next trial or finish
        if (currentIndex < trials.length - 1) {
          setCurrentIndex(currentIndex + 1);
          setPhase('fixation');
        } else {
          // Move to main rotation experiment
          router.push('/mentalRep/rotation-main');
        }
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [phase, currentIndex, trials.length, router]);

  // Handle keyboard input
  const handleKeyPress = useCallback(
    (event: KeyboardEvent) => {
      if (phase !== 'trial' || !sessionId || trials.length === 0) return;

      const key = event.key.toLowerCase();
      if (key !== 's' && key !== 'd') return;

      const trial = trials[currentIndex];
      const reactionTime = Date.now() - startTime;
      const response = key === 's' ? 'same' : 'different';
      const isCorrect = (response === 'same') === trial.isSame;

      const result: RotationTrialResult = {
        session_id: sessionId,
        participant_name: participantName || undefined,
        experiment_type: 'rotation',
        trial_number: currentIndex + 1,
        figure_id: trial.figureId,
        left_angle: trial.leftAngle,
        right_angle: trial.rightAngle,
        is_same: trial.isSame,
        rotation_difference: trial.rotationDifference,
        response,
        is_correct: isCorrect,
        reaction_time_ms: reactionTime,
        is_practice: true,
      };

      const updatedResults = [...results, result];
      setResults(updatedResults);

      // Show feedback
      setLastResponse({ correct: isCorrect, isCorrectAnswer: trial.isSame });
      setPhase('feedback');
    },
    [phase, sessionId, trials, currentIndex, startTime, participantName, results]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [handleKeyPress]);

  const handleStartPractice = () => {
    setPhase('fixation');
  };

  if (!sessionId || trials.length === 0) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
        <div className="text-xl text-gray-400">Loading...</div>
      </div>
    );
  }

  const trial = trials[currentIndex];
  const progress = ((currentIndex + 1) / trials.length) * 100;
  const t = ROTATION_CONTENT[language];

  return (
    <div className={`min-h-screen bg-[#0f172a] flex flex-col ${language === 'he' ? 'rtl' : 'ltr'}`}>
      {phase !== 'instructions' && (
        <>
          {/* Progress Bar */}
          <div className="w-full bg-gray-200 h-2">
            <motion.div
              className="h-2 bg-blue-500"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>

          {/* Trial Counter */}
          <div className="text-center py-4 text-gray-400">
            {t.trial} {currentIndex + 1} {t.of} {trials.length} ({language === 'en' ? 'Practice' : 'תרגול'})
          </div>
        </>
      )}

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center p-8">
        <AnimatePresence mode="wait">
          {phase === 'instructions' && (
            <motion.div
              key="instructions"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-2xl"
            >
              <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-xl p-8">
                <div className="flex items-center justify-center gap-3 mb-6">
                  <RotateCw className="w-12 h-12 text-blue-400" />
                  <h1 className="text-3xl font-bold text-gray-100">{t.practiceTitle}</h1>
                </div>

                <div className="bg-gray-800 rounded-xl p-6 mb-6">
                  <ul className="space-y-3">
                    {t.practiceInstructions.map((instruction, index) => (
                      <li key={index} className="flex items-start gap-2">
                        <span className="text-blue-400 font-bold mt-0.5">•</span>
                        <span className="text-gray-300">{instruction}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="flex justify-center gap-8 mb-6">
                  <div className="bg-gray-800 px-6 py-3 rounded-lg">
                    <span className="font-bold text-green-400">{t.sameKey}</span>
                  </div>
                  <div className="bg-gray-800 px-6 py-3 rounded-lg">
                    <span className="font-bold text-red-700">{t.diffKey}</span>
                  </div>
                </div>

                <button
                  onClick={handleStartPractice}
                  className="w-full bg-blue-500 text-white py-4 rounded-lg font-semibold hover:bg-blue-400 transition-colors"
                >
                  {language === 'en' ? 'Start Practice' : 'התחל תרגול'}
                </button>
              </div>
            </motion.div>
          )}

          {phase === 'fixation' && (
            <motion.div
              key="fixation"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-6xl font-bold text-gray-400"
            >
              +
            </motion.div>
          )}

          {phase === 'trial' && (
            <motion.div
              key={`trial-${currentIndex}`}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="text-center"
            >
              <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-xl p-8">
                {/* Figures side by side */}
                <div className="flex items-center justify-center gap-12 mb-8">
                  <div className="bg-gray-100 rounded-xl p-4">
                    <BlockFigure
                      figureId={trial.figureId}
                      rotation={trial.leftAngle}
                      isMirror={false}
                      size={200}
                    />
                  </div>

                  <div className="text-4xl text-gray-300">?</div>

                  <div className="bg-gray-100 rounded-xl p-4">
                    <BlockFigure
                      figureId={trial.figureId}
                      rotation={trial.rightAngle}
                      isMirror={!trial.isSame}
                      size={200}
                    />
                  </div>
                </div>

                {/* Response keys */}
                <div className="flex justify-center gap-8">
                  <div className="bg-gray-800 px-8 py-4 rounded-lg">
                    <span className="font-bold text-green-400 text-xl">{t.sameKey}</span>
                  </div>
                  <div className="bg-gray-800 px-8 py-4 rounded-lg">
                    <span className="font-bold text-red-700 text-xl">{t.diffKey}</span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {phase === 'feedback' && lastResponse && (
            <motion.div
              key="feedback"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="text-center"
            >
              <div className={`text-5xl font-bold mb-4 ${lastResponse.correct ? 'text-green-500' : 'text-red-500'}`}>
                {lastResponse.correct ? t.correct : t.incorrect}
              </div>
              {!lastResponse.correct && (
                <div className="text-xl text-gray-400">
                  {language === 'en'
                    ? `The correct answer was: ${lastResponse.isCorrectAnswer ? 'SAME' : 'DIFFERENT'}`
                    : `התשובה הנכונה הייתה: ${lastResponse.isCorrectAnswer ? 'זהה' : 'שונה'}`}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
