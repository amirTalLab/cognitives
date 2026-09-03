'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin } from 'lucide-react';
import { ScanningTrial, ScanningTrialResult } from '@/types/mental-rep';
import { generateScanningTrials, SCANNING_CONTENT } from '@/lib/mental-rep/scanning';

export default function ScanningTest() {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [participantName, setParticipantName] = useState<string | null>(null);
  const [language, setLanguage] = useState<'en' | 'he'>('en');

  const [trials, setTrials] = useState<ScanningTrial[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [results, setResults] = useState<ScanningTrialResult[]>([]);
  const [startTime, setStartTime] = useState<number>(Date.now());
  const [phase, setPhase] = useState<'fixation' | 'ready' | 'scanning'>('fixation');
  const [showFeedback, setShowFeedback] = useState(false);

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

    // Generate trials
    const generatedTrials = generateScanningTrials();
    setTrials(generatedTrials);
  }, [router]);

  // Handle phase transitions
  useEffect(() => {
    if (trials.length === 0) return;

    if (phase === 'fixation') {
      const timer = setTimeout(() => {
        setPhase('ready');
      }, 500);
      return () => clearTimeout(timer);
    }

    if (phase === 'ready') {
      const timer = setTimeout(() => {
        setPhase('scanning');
        setStartTime(Date.now());
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [phase, currentIndex, trials.length]);

  // Handle keyboard input
  const handleKeyPress = useCallback(
    (event: KeyboardEvent) => {
      if (phase !== 'scanning' || !sessionId || trials.length === 0) return;

      if (event.code === 'Space') {
        event.preventDefault();

        const trial = trials[currentIndex];
        const reactionTime = Date.now() - startTime;

        const result: ScanningTrialResult = {
          session_id: sessionId,
          participant_name: participantName || undefined,
          experiment_type: 'scanning',
          trial_number: currentIndex + 1,
          from_landmark: trial.fromLandmark.id,
          to_landmark: trial.toLandmark.id,
          distance: trial.distance,
          found_target: true,
          reaction_time_ms: reactionTime,
        };

        const updatedResults = [...results, result];
        setResults(updatedResults);

        // Store results in session storage for later
        sessionStorage.setItem('mental_rep_scanning_results', JSON.stringify(updatedResults));

        // Show brief feedback
        setShowFeedback(true);
        setTimeout(() => {
          setShowFeedback(false);

          // Move to next trial or finish
          if (currentIndex < trials.length - 1) {
            setCurrentIndex(currentIndex + 1);
            setPhase('fixation');
          } else {
            // Move to rotation practice
            router.push('/mentalRep/rotation-practice');
          }
        }, 300);
      }
    },
    [phase, sessionId, trials, currentIndex, startTime, participantName, results, router]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [handleKeyPress]);

  if (!sessionId || trials.length === 0) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
        <div className="text-xl text-gray-400">Loading...</div>
      </div>
    );
  }

  const trial = trials[currentIndex];
  const progress = ((currentIndex + 1) / trials.length) * 100;
  const t = SCANNING_CONTENT[language];

  // Get landmark names in current language
  const fromName = language === 'he' ? trial.fromLandmark.nameHe : trial.fromLandmark.name;
  const toName = language === 'he' ? trial.toLandmark.nameHe : trial.toLandmark.name;

  return (
    <div className={`min-h-screen bg-[#0f172a] flex flex-col ${language === 'he' ? 'rtl' : 'ltr'}`}>
      {/* Progress Bar */}
      <div className="w-full bg-gray-200 h-2">
        <motion.div
          className="h-2 bg-cyan-500"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>

      {/* Trial Counter */}
      <div className="text-center py-4 text-gray-400">
        {language === 'en' ? 'Trial' : 'ניסוי'} {currentIndex + 1} / {trials.length}
      </div>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center p-8">
        <AnimatePresence mode="wait">
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

          {phase === 'ready' && (
            <motion.div
              key="ready"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="text-center"
            >
              <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-xl p-8 max-w-md">
                <MapPin className="w-16 h-16 text-cyan-400 mx-auto mb-4" />

                <div className="mb-6">
                  <div className="text-gray-400 mb-1">{t.startLabel}</div>
                  <div className="text-3xl font-bold text-cyan-400">{fromName}</div>
                </div>

                <div className="text-4xl text-gray-400 mb-6">↓</div>

                <div>
                  <div className="text-gray-400 mb-1">{t.targetLabel}</div>
                  <div className="text-3xl font-bold text-blue-400">{toName}</div>
                </div>
              </div>
            </motion.div>
          )}

          {phase === 'scanning' && (
            <motion.div
              key="scanning"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="text-center"
            >
              {showFeedback ? (
                <motion.div
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="text-4xl font-bold text-green-500"
                >
                  {t.foundIt}
                </motion.div>
              ) : (
                <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-xl p-8 max-w-lg">
                  <div className="flex items-center justify-center gap-4 mb-8">
                    <div className="text-center">
                      <div className="text-sm text-gray-500 mb-1">{t.startLabel}</div>
                      <div className="text-2xl font-bold text-cyan-400">{fromName}</div>
                    </div>

                    <div className="text-3xl text-gray-300">→</div>

                    <div className="text-center">
                      <div className="text-sm text-gray-500 mb-1">{t.targetLabel}</div>
                      <div className="text-2xl font-bold text-blue-400">{toName}</div>
                    </div>
                  </div>

                  <div className="bg-gray-800 rounded-xl p-6 mb-6">
                    <p className="text-lg text-gray-300">{t.testInstructions}</p>
                  </div>

                  <div className="animate-pulse">
                    <div className="bg-cyan-500 text-white px-8 py-4 rounded-lg text-xl font-semibold inline-block">
                      {t.pressSpace}
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
