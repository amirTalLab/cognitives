'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { BrainCog, Home, BarChart3 } from 'lucide-react';

export default function MentalRepThanks() {
  const router = useRouter();
  const [language, setLanguage] = useState<'en' | 'he'>('en');

  useEffect(() => {
    const storedLanguage = sessionStorage.getItem('mental_rep_language') as 'en' | 'he' | null;
    setLanguage(storedLanguage || 'en');
  }, []);

  const content = {
    en: {
      title: 'Thank You!',
      message: 'You have completed the Mental Representation experiments.',
      description:
        'Your responses help demonstrate two fundamental principles of cognitive psychology: 1) Mental images preserve spatial relationships (Mental Scanning), and 2) We mentally rotate images to compare orientations (Mental Rotation). These classic experiments by Kosslyn and Shepard & Metzler revolutionized our understanding of how we represent and manipulate mental imagery.',
      viewResults: 'View Your Results',
      homeButton: 'Back to Home',
    },
    he: {
      title: 'תודה רבה!',
      message: 'השלמת את ניסויי הייצוג המנטלי.',
      description:
        'התשובות שלך עוזרות להדגים שני עקרונות יסודיים בפסיכולוגיה קוגניטיבית: 1) דימויים מנטליים משמרים יחסים מרחביים (סריקה מנטלית), ו-2) אנו מסובבים דימויים מנטלית כדי להשוות כיוונים (סיבוב מנטלי). ניסויים קלאסיים אלה של קוסלין ושפרד ומצלר חוללו מהפכה בהבנתנו את האופן שבו אנו מייצגים ומתמרנים דימויים מנטליים.',
      viewResults: 'צפה בתוצאות שלך',
      homeButton: 'חזרה לדף הבית',
    },
  };

  const t = content[language];

  return (
    <div className={`min-h-screen bg-[#0f172a] flex items-center justify-center ${language === 'he' ? 'rtl' : 'ltr'}`}>
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="max-w-2xl mx-auto px-4"
      >
        <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl p-8 md:p-12">
          {/* Icon */}
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
            className="flex justify-center mb-6"
          >
            <div className="w-20 h-20 bg-gray-800 rounded-full flex items-center justify-center">
              <BrainCog className="w-10 h-10 text-cyan-400" />
            </div>
          </motion.div>

          {/* Title */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="text-4xl font-bold text-gray-100 text-center mb-4"
          >
            {t.title}
          </motion.h1>

          {/* Message */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="text-xl text-cyan-400 text-center mb-6 font-medium"
          >
            {t.message}
          </motion.p>

          {/* Description */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="text-gray-300 text-center leading-relaxed mb-8"
          >
            {t.description}
          </motion.p>

          {/* Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="flex flex-col sm:flex-row gap-4 justify-center"
          >
            <button
              onClick={() => router.push('/mentalRep/results')}
              className="flex items-center justify-center gap-2 px-6 py-3 bg-cyan-500 text-white rounded-lg hover:bg-cyan-400 transition-colors shadow-lg hover:shadow-xl"
            >
              <BarChart3 className="w-5 h-5" />
              {t.viewResults}
            </button>

            <button
              onClick={() => router.push('/')}
              className="flex items-center justify-center gap-2 px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors shadow-lg hover:shadow-xl"
            >
              <Home className="w-5 h-5" />
              {t.homeButton}
            </button>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}
