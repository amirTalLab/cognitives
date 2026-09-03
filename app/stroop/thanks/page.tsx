'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle } from 'lucide-react';

export default function ThanksPage() {
  // Whatever language the participant chose on the landing page, so the run ends in the
  // language it started in.
  const [isHe, setIsHe] = useState(true);
  useEffect(() => {
    setIsHe(sessionStorage.getItem('stroop_language') !== 'en');
  }, []);

  return (
    <main
      className="min-h-screen bg-[#0f172a] flex flex-col items-center justify-center p-8"
      dir={isHe ? 'rtl' : 'ltr'}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="text-center max-w-2xl"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
          className="flex justify-center mb-6"
        >
          <CheckCircle className="w-24 h-24 text-emerald-400" />
        </motion.div>

        <h1 className="text-5xl md:text-6xl font-bold tracking-tight mb-6 text-gray-100">
          {isHe ? 'תודה!' : 'Thank you!'}
        </h1>

        <p className="text-sm text-gray-400">
          {isHe ? 'ניתן כעת לסגור את החלון' : 'You can now close this window'}
        </p>
      </motion.div>
    </main>
  );
}
