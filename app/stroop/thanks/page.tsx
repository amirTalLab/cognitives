'use client';

import { motion } from 'framer-motion';
import { CheckCircle } from 'lucide-react';

export default function ThanksPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
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

        <h1 className="text-5xl md:text-6xl font-bold tracking-tight mb-6">
          !תודה
        </h1>

        <p className="text-sm text-muted">
          ניתן כעת לסגור את החלון
        </p>
      </motion.div>
    </main>
  );
}
