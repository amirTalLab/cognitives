'use client';

import React, { useEffect, useState } from 'react';
import { CheckCircle } from 'lucide-react';

const KEY = 'logics';

export default function LogicsThanks() {
  const [language, setLanguage] = useState<'en' | 'he'>('he');
  const [count, setCount] = useState(0);

  useEffect(() => {
    const lang = sessionStorage.getItem(`${KEY}_language`) as 'en' | 'he' | null;
    if (lang) setLanguage(lang);
    try {
      const raw = sessionStorage.getItem(`${KEY}_responses`);
      if (raw) {
        const data = JSON.parse(raw);
        setCount(Array.isArray(data) ? data.length : 0);
      }
    } catch { /* ignore */ }
  }, []);

  const isHe = language === 'he';

  return (
    <div
      className="min-h-screen bg-[#0f172a] flex items-center justify-center px-4"
      dir={isHe ? 'rtl' : 'ltr'}
    >
      <div className="flex flex-col items-center gap-6 text-center max-w-sm w-full">
        <CheckCircle className="w-16 h-16 text-emerald-400" />
        <h1 className="text-3xl font-bold text-white">
          {isHe ? '!תודה רבה' : 'Thank You!'}
        </h1>
        <p className="text-gray-300 text-base leading-relaxed">
          {isHe
            ? 'תשובותיכם נקלטו. אנא המתינו — התוצאות יוצגו בכיתה.'
            : 'Your responses have been recorded. Please wait — results will be shown in class.'}
        </p>
        {count > 0 && (
          <p className="text-gray-500 text-sm">
            {isHe ? `${count} תשובות נשמרו` : `${count} responses saved`}
          </p>
        )}
      </div>
    </div>
  );
}
