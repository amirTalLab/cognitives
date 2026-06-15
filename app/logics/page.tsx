'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { assignGroup } from '@/lib/logics/questions';

const KEY = 'logics';

export default function LogicsLanding() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [language, setLanguage] = useState<'en' | 'he'>('he');
  const isHe = language === 'he';

  const t = isHe
    ? {
        title: 'שאלון חשיבה',
        subtitle: 'תהליכים קוגניטיביים — הרצאה 9',
        inst: [
          'לפניכם שאלון המכיל שאלות חשיבה וסברה.',
          'אין תשובות נכונות או לא נכונות — ענו לפי האינטואיציה שלכם.',
          'קראו כל שאלה בעיון וענו בקצב שלכם.',
        ],
        nameLabel: 'שמכם',
        namePH: 'הזינו את שמכם',
        start: 'התחילו',
        toggle: 'English',
      }
    : {
        title: 'Reasoning Questionnaire',
        subtitle: 'Cognitive Processes — Lecture 9',
        inst: [
          'This questionnaire contains reasoning and judgment questions.',
          'There are no right or wrong answers — respond based on your intuition.',
          'Read each question carefully and answer at your own pace.',
        ],
        nameLabel: 'Your name',
        namePH: 'Enter your name',
        start: 'Start',
        toggle: 'עברית',
      };

  const handleStart = () => {
    if (!name.trim()) {
      alert(isHe ? 'אנא הזינו את שמכם' : 'Please enter your name');
      return;
    }
    const group = assignGroup();
    sessionStorage.setItem(`${KEY}_session_id`, crypto.randomUUID());
    sessionStorage.setItem(`${KEY}_participant_name`, name.trim());
    sessionStorage.setItem(`${KEY}_language`, language);
    sessionStorage.setItem(`${KEY}_group`, group);
    router.push('/logics/experiment');
  };

  return (
    <div
      className="min-h-screen bg-[#0f172a] flex items-center justify-center px-4 py-8"
      dir={isHe ? 'rtl' : 'ltr'}
    >
      <div className="w-full max-w-md">
        <div className="flex justify-end mb-6">
          <button
            onClick={() => setLanguage(l => (l === 'en' ? 'he' : 'en'))}
            className="px-3 py-1.5 text-sm text-emerald-400 border border-emerald-400/40 rounded-lg hover:bg-emerald-400/10 transition-colors"
          >
            {t.toggle}
          </button>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gray-900 border border-gray-700 rounded-2xl p-8 flex flex-col gap-6"
        >
          <div className="text-center">
            <h1 className="text-2xl font-bold text-white">{t.title}</h1>
            <p className="text-sm text-gray-400 mt-1">{t.subtitle}</p>
          </div>

          <ul className="flex flex-col gap-2">
            {t.inst.map((line, i) => (
              <li key={i} className="flex gap-2 text-gray-300 text-sm leading-relaxed">
                <span className="text-emerald-400 font-bold mt-0.5 flex-shrink-0">•</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>

          <div className="flex flex-col gap-1">
            <label className="text-gray-400 text-sm">{t.nameLabel}</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleStart()}
              placeholder={t.namePH}
              className="px-4 py-3 bg-gray-800 border border-gray-600 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-emerald-400 transition-colors"
            />
          </div>

          <button
            onPointerDown={e => {
              e.preventDefault();
              handleStart();
            }}
            className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 text-white font-bold rounded-xl text-lg transition-colors touch-manipulation shadow-lg"
          >
            {t.start}
          </button>
        </motion.div>
      </div>
    </div>
  );
}
