'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Map } from 'lucide-react';
import IslandMap from '@/components/mental-rep/IslandMap';
import { SCANNING_CONTENT } from '@/lib/mental-rep/scanning';

export default function ScanningStudy() {
  const router = useRouter();
  const [language, setLanguage] = useState<'en' | 'he'>('en');
  const [timeLeft, setTimeLeft] = useState(30);
  const [studyComplete, setStudyComplete] = useState(false);

  useEffect(() => {
    // Check session
    const sessionId = sessionStorage.getItem('mental_rep_session_id');
    if (!sessionId) {
      router.push('/mentalRep');
      return;
    }

    const storedLanguage = sessionStorage.getItem('mental_rep_language') as 'en' | 'he' | null;
    setLanguage(storedLanguage || 'en');
  }, [router]);

  // Countdown timer
  useEffect(() => {
    if (timeLeft <= 0) {
      setStudyComplete(true);
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft]);

  const handleContinue = () => {
    router.push('/mentalRep/scanning-test');
  };

  const t = SCANNING_CONTENT[language];

  const timerContent = {
    en: {
      timeRemaining: 'Time remaining:',
      seconds: 'seconds',
      studyComplete: 'Study Complete!',
      continueButton: 'Continue to Test',
      memorize: 'Memorize the locations of all 7 landmarks',
    },
    he: {
      timeRemaining: 'זמן שנותר:',
      seconds: 'שניות',
      studyComplete: 'הלימוד הסתיים!',
      continueButton: 'המשך למבחן',
      memorize: 'שנן את המיקומים של כל 7 ציוני הדרך',
    },
  };

  const tc = timerContent[language];

  return (
    <div className={`min-h-screen bg-[#0f172a] ${language === 'he' ? 'rtl' : 'ltr'}`}>
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-6"
        >
          <div className="flex items-center justify-center gap-3 mb-2">
            <Map className="w-10 h-10 text-cyan-400" />
            <h1 className="text-3xl font-bold text-gray-100">{t.studyTitle}</h1>
          </div>
        </motion.div>

        {/* Instructions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-gray-800 rounded-xl p-4 mb-6 text-center"
        >
          <ul className="space-y-1 text-gray-300">
            {t.studyInstructions.map((instruction, index) => (
              <li key={index}>{instruction}</li>
            ))}
          </ul>
        </motion.div>

        {/* Timer / Complete Message */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="text-center mb-6"
        >
          {!studyComplete ? (
            <div className="inline-flex items-center gap-3 bg-gray-900 border border-gray-700 rounded-full px-6 py-3 shadow-lg">
              <span className="text-gray-400">{tc.timeRemaining}</span>
              <span className={`text-3xl font-bold ${timeLeft <= 10 ? 'text-red-500' : 'text-cyan-400'}`}>
                {timeLeft}
              </span>
              <span className="text-gray-400">{tc.seconds}</span>
            </div>
          ) : (
            <div className="inline-flex flex-col items-center gap-4">
              <span className="text-2xl font-bold text-green-400">{tc.studyComplete}</span>
              <button
                onClick={handleContinue}
                className="bg-cyan-500 text-white px-8 py-3 rounded-lg font-semibold hover:bg-cyan-400 transition-colors shadow-lg"
              >
                {tc.continueButton}
              </button>
            </div>
          )}
        </motion.div>

        {/* Map */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3 }}
          className="bg-gray-900 border border-gray-700 rounded-2xl shadow-xl p-6 mb-6"
        >
          <IslandMap
            width={700}
            height={525}
            showLabels={true}
            language={language}
          />
        </motion.div>

        {/* Reminder */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="text-center text-gray-400"
        >
          {tc.memorize}
        </motion.div>
      </div>
    </div>
  );
}
