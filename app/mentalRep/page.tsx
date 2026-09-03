'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { v4 as uuidv4 } from 'uuid';
import { motion } from 'framer-motion';
import { BrainCog, ChevronLeft } from 'lucide-react';

export default function MentalRepIntro() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [language, setLanguage] = useState<'en' | 'he'>('en');

  const handleStart = () => {
    if (!name.trim()) {
      alert(language === 'en' ? 'Please enter your name' : 'אנא הזן את שמך');
      return;
    }

    const sessionId = uuidv4();
    sessionStorage.setItem('mental_rep_session_id', sessionId);
    sessionStorage.setItem('mental_rep_participant_name', name.trim());
    sessionStorage.setItem('mental_rep_language', language);

    // Start with the scanning study phase
    router.push('/mentalRep/scanning-study');
  };

  const content = {
    en: {
      title: 'Mental Representation',
      subtitle: 'Mental Scanning & Mental Rotation',
      welcome: 'Welcome to the Mental Representation Experiments',
      intro: 'This session includes two classic experiments that explore how we create and manipulate mental images.',
      experiment1Title: 'Part 1: Mental Scanning',
      experiment1Desc: 'You will memorize an island map with 7 landmarks. Then you will mentally scan from one location to another. Research shows that scanning time increases with distance, suggesting mental images preserve spatial relationships.',
      experiment2Title: 'Part 2: Mental Rotation',
      experiment2Desc: 'You will see pairs of 3D objects and decide if they are the same (just rotated) or different (mirror images). Research shows that response time increases with rotation angle, suggesting we mentally rotate images.',
      instructions: [
        'The entire session takes about 10-15 minutes.',
        'Part 1 (Scanning): Memorize map, then 21 scanning trials.',
        'Part 2 (Rotation): 5 practice trials with feedback, then 40 main trials.',
        'Please respond as quickly and accurately as possible.',
      ],
      nameLabel: 'Your Name',
      namePlaceholder: 'Enter your name',
      startButton: 'Start Experiment',
      backButton: 'Back to Home',
      languageToggle: 'עברית',
    },
    he: {
      title: 'ייצוג מנטלי',
      subtitle: 'סריקה מנטלית וסיבוב מנטלי',
      welcome: 'ברוכים הבאים לניסויי הייצוג המנטלי',
      intro: 'מפגש זה כולל שני ניסויים קלאסיים החוקרים כיצד אנו יוצרים ומתמרנים דימויים מנטליים.',
      experiment1Title: 'חלק 1: סריקה מנטלית',
      experiment1Desc: 'תשננו מפת אי עם 7 ציוני דרך. לאחר מכן תסרקו מנטלית ממיקום אחד לאחר. מחקרים מראים שזמן הסריקה עולה עם המרחק, מה שמצביע על כך שדימויים מנטליים משמרים יחסים מרחביים.',
      experiment2Title: 'חלק 2: סיבוב מנטלי',
      experiment2Desc: 'תראו זוגות של אובייקטים תלת-ממדיים ותחליטו אם הם זהים (רק מסובבים) או שונים (תמונות מראה). מחקרים מראים שזמן התגובה עולה עם זווית הסיבוב, מה שמצביע על כך שאנו מסובבים דימויים מנטלית.',
      instructions: [
        'כל המפגש אורך כ-10-15 דקות.',
        'חלק 1 (סריקה): שינון מפה, ואז 21 ניסויי סריקה.',
        'חלק 2 (סיבוב): 5 ניסויי תרגול עם משוב, ואז 40 ניסויים עיקריים.',
        'אנא הגיבו מהר ככל האפשר ובדיוק מרבי.',
      ],
      nameLabel: 'שמך',
      namePlaceholder: 'הזן את שמך',
      startButton: 'התחל ניסוי',
      backButton: 'חזרה לדף הבית',
      languageToggle: 'English',
    },
  };

  const t = content[language];

  return (
    <div className={`min-h-screen bg-[#0f172a] ${language === 'he' ? 'rtl' : 'ltr'}`}>
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <div className="flex items-center justify-center gap-3 mb-4">
            <BrainCog className="w-12 h-12 text-cyan-400" />
            <h1 className="text-4xl font-bold text-gray-100">{t.title}</h1>
          </div>
          <p className="text-lg text-cyan-400 font-medium">{t.subtitle}</p>
        </motion.div>

        {/* Language Toggle */}
        <div className="flex justify-end mb-6">
          <button
            onClick={() => setLanguage(language === 'en' ? 'he' : 'en')}
            className="px-4 py-2 text-sm font-medium text-cyan-400 hover:text-cyan-300 hover:bg-gray-800 rounded-lg transition-colors"
          >
            {t.languageToggle}
          </button>
        </div>

        {/* Main Content */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-gray-900 border border-gray-700 rounded-2xl shadow-xl p-8 mb-6"
        >
          <h2 className="text-2xl font-semibold text-gray-100 mb-4">{t.welcome}</h2>
          <p className="text-gray-300 mb-6 leading-relaxed">{t.intro}</p>

          {/* Experiment 1 Description */}
          <div className="bg-gray-800 rounded-xl p-6 mb-4">
            <h3 className="font-semibold text-cyan-400 mb-2">{t.experiment1Title}</h3>
            <p className="text-gray-300 text-sm leading-relaxed">{t.experiment1Desc}</p>
          </div>

          {/* Experiment 2 Description */}
          <div className="bg-gray-800 rounded-xl p-6 mb-6">
            <h3 className="font-semibold text-blue-400 mb-2">{t.experiment2Title}</h3>
            <p className="text-gray-300 text-sm leading-relaxed">{t.experiment2Desc}</p>
          </div>

          {/* Instructions */}
          <div className="bg-gray-50 rounded-xl p-6 mb-6">
            <h3 className="font-semibold text-gray-100 mb-3">
              {language === 'en' ? 'Instructions:' : 'הוראות:'}
            </h3>
            <ul className="space-y-2">
              {t.instructions.map((instruction, index) => (
                <li key={index} className="flex items-start gap-2">
                  <span className="text-cyan-400 font-bold mt-0.5">•</span>
                  <span className="text-gray-300">{instruction}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Name Input */}
          <div className="mb-6">
            <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-2">
              {t.nameLabel}
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t.namePlaceholder}
              className="w-full px-4 py-3 border border-gray-600 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none transition-all"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleStart();
                }
              }}
            />
          </div>

          {/* Start Button */}
          <button
            onClick={handleStart}
            className="w-full bg-cyan-500 text-white py-4 rounded-lg font-semibold hover:bg-cyan-400 transition-colors shadow-lg hover:shadow-xl"
          >
            {t.startButton}
          </button>
        </motion.div>

        {/* Back Button */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          <button
            onClick={() => router.push('/')}
            className="flex items-center gap-2 text-gray-400 hover:text-gray-200 transition-colors mx-auto"
          >
            <ChevronLeft className="w-5 h-5" />
            {t.backButton}
          </button>
        </motion.div>
      </div>
    </div>
  );
}
