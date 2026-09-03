'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Trial, TrialResult } from '@/types/bouba-kiki';
import { generateAllTrials, isResponseCorrect } from '@/lib/bouba-kiki/experiment';
import ShapeDisplay from '@/components/bouba-kiki/ShapeDisplay';
import { getSupabase } from '@/lib/supabase';

export default function BoubaKikiExperiment() {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [participantName, setParticipantName] = useState<string | null>(null);
  const [language, setLanguage] = useState<'en' | 'he'>('en');

  const [trials, setTrials] = useState<Trial[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [results, setResults] = useState<TrialResult[]>([]);
  const [startTime, setStartTime] = useState<number>(Date.now());
  const [showFixation, setShowFixation] = useState(true);

  // Load session data
  useEffect(() => {
    const storedSessionId = sessionStorage.getItem('bouba_kiki_session_id');
    const storedName = sessionStorage.getItem('bouba_kiki_participant_name');
    const storedLanguage = sessionStorage.getItem('bouba_kiki_language') as 'en' | 'he' | null;

    if (!storedSessionId) {
      router.push('/bouba-kiki');
      return;
    }

    setSessionId(storedSessionId);
    setParticipantName(storedName);
    setLanguage(storedLanguage || 'en');

    // Generate trials
    const generatedTrials = generateAllTrials();
    setTrials(generatedTrials);
    setStartTime(Date.now());
  }, [router]);

  // Handle fixation cross timing
  useEffect(() => {
    if (showFixation && trials.length > 0) {
      const timer = setTimeout(() => {
        setShowFixation(false);
        setStartTime(Date.now()); // Reset start time after fixation
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [showFixation, currentIndex, trials.length]);

  const handleResponse = async (response: 'left' | 'right' | 'bouba' | 'kiki') => {
    if (!sessionId || trials.length === 0) return;

    const trial = trials[currentIndex];
    const reactionTime = Date.now() - startTime;

    let isCorrect: boolean;
    let normalizedResponse: 'left' | 'right';

    if (trial.isControl) {
      // Control trial: "Is this bouba or kiki?"
      // Expected: rounded → bouba, spiky → kiki
      const expectedAnswer = trial.wordType === 'rounded' ? 'bouba' : 'kiki';
      isCorrect = response === expectedAnswer;
      // Store as left/right for consistency
      normalizedResponse = response === 'bouba' ? 'left' : 'right';
    } else {
      // Main trial: which shape matches the word?
      normalizedResponse = response as 'left' | 'right';
      isCorrect = isResponseCorrect(trial, normalizedResponse);
    }

    const result: TrialResult = {
      session_id: sessionId,
      participant_name: participantName || undefined,
      trial_number: currentIndex + 1,
      word: trial.word,
      word_type: trial.wordType,
      left_shape: trial.leftShape,
      right_shape: trial.rightShape,
      response: normalizedResponse,
      is_correct: isCorrect,
      reaction_time_ms: reactionTime,
      is_control: trial.isControl,
    };

    const updatedResults = [...results, result];
    setResults(updatedResults);

    // Move to next trial
    if (currentIndex < trials.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setShowFixation(true);
    } else {
      // Experiment complete - save to Supabase
      await saveResults(updatedResults);
      router.push('/bouba-kiki/results');
    }
  };

  const saveResults = async (resultsToSave: TrialResult[]) => {
    const supabase = getSupabase();
    if (!supabase) {
      console.error('Supabase not initialized');
      return;
    }

    const { error } = await supabase.from('bouba_kiki_results').insert(resultsToSave);

    if (error) {
      console.error('Error saving results:', error);
      alert('There was an error saving your results. Please contact the researcher.');
    }
  };

  if (!sessionId || trials.length === 0) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
        <div className="text-xl text-gray-400">Loading experiment...</div>
      </div>
    );
  }

  const trial = trials[currentIndex];
  const progress = ((currentIndex + 1) / trials.length) * 100;

  const content = {
    en: {
      fixation: '+',
      question: trial.isControl ? 'Is this more BOUBA or KIKI?' : `Which shape is ${trial.word}?`,
      boubaButton: 'BOUBA',
      kikiButton: 'KIKI',
      leftButton: 'Left',
      rightButton: 'Right',
    },
    he: {
      fixation: '+',
      question: trial.isControl ? 'האם זה יותר בובה או קיקי?' : `איזו צורה היא ${trial.word}?`,
      boubaButton: 'בובה',
      kikiButton: 'קיקי',
      leftButton: 'שמאל',
      rightButton: 'ימין',
    },
  };

  const t = content[language];

  return (
    <div className={`min-h-screen bg-[#0f172a] flex flex-col ${language === 'he' ? 'rtl' : 'ltr'}`}>
      {/* Progress Bar */}
      <div className="w-full bg-gray-200 h-2">
        <motion.div
          className="h-2 bg-indigo-500"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>

      {/* Trial Counter */}
      <div className="text-center py-4 text-gray-400">
        Trial {currentIndex + 1} / {trials.length}
      </div>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center p-8">
        <AnimatePresence mode="wait">
          {showFixation ? (
            <motion.div
              key="fixation"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-6xl font-bold text-gray-400"
            >
              {t.fixation}
            </motion.div>
          ) : (
            <motion.div
              key={`trial-${currentIndex}`}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="w-full max-w-4xl"
            >
              {/* Question */}
              <div className="text-center mb-8">
                <h2 className="text-3xl font-bold text-gray-100 mb-4">{t.question}</h2>
                {!trial.isControl && (
                  <div className="text-6xl font-bold text-indigo-400 mb-8">{trial.word}</div>
                )}
              </div>

              {/* Shapes */}
              <div className="flex items-center justify-center gap-12 mb-8">
                {trial.isControl ? (
                  // Control trial: single shape
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="p-8 bg-white rounded-2xl shadow-lg"
                  >
                    <ShapeDisplay shapeId={trial.leftShape} size={250} />
                  </motion.button>
                ) : (
                  // Main trial: two shapes
                  <>
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleResponse('left')}
                      className="p-8 bg-white rounded-2xl shadow-lg hover:shadow-xl transition-shadow"
                    >
                      <ShapeDisplay shapeId={trial.leftShape} size={200} />
                    </motion.button>

                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleResponse('right')}
                      className="p-8 bg-white rounded-2xl shadow-lg hover:shadow-xl transition-shadow"
                    >
                      <ShapeDisplay shapeId={trial.rightShape} size={200} />
                    </motion.button>
                  </>
                )}
              </div>

              {/* Response Buttons */}
              <div className="flex items-center justify-center gap-6">
                {trial.isControl ? (
                  <>
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleResponse('bouba')}
                      className="px-12 py-4 bg-indigo-500 text-white text-xl font-semibold rounded-lg hover:bg-indigo-400 transition-colors shadow-lg"
                    >
                      {t.boubaButton}
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleResponse('kiki')}
                      className="px-12 py-4 bg-purple-500 text-white text-xl font-semibold rounded-lg hover:bg-purple-400 transition-colors shadow-lg"
                    >
                      {t.kikiButton}
                    </motion.button>
                  </>
                ) : (
                  <>
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleResponse('left')}
                      className="px-12 py-4 bg-indigo-500 text-white text-xl font-semibold rounded-lg hover:bg-indigo-400 transition-colors shadow-lg"
                    >
                      {t.leftButton}
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleResponse('right')}
                      className="px-12 py-4 bg-purple-500 text-white text-xl font-semibold rounded-lg hover:bg-purple-400 transition-colors shadow-lg"
                    >
                      {t.rightButton}
                    </motion.button>
                  </>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
