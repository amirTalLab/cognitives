'use client';

import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { ColorKey } from '@/types/stroop';
import { getColorFromKey } from '@/lib/stroop/experiment';

interface ResponseButtonsProps {
  onResponse: (color: ColorKey) => void;
  disabled: boolean;
  highlightCorrect?: ColorKey | null;
}

const buttonConfig: { key: ColorKey; label: string; shortcut: string }[] = [
  { key: 'yellow', label: 'Y', shortcut: 'y' },
  { key: 'green', label: 'G', shortcut: 'g' },
  { key: 'red', label: 'R', shortcut: 'r' },
];

export function ResponseButtons({ onResponse, disabled, highlightCorrect }: ResponseButtonsProps) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (disabled) return;
      const color = getColorFromKey(event.key);
      if (color) {
        onResponse(color);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onResponse, disabled]);

  return (
    <div className="flex gap-4 md:gap-6">
      {buttonConfig.map(({ key, label }) => {
        const isHighlighted = highlightCorrect === key;
        return (
          <motion.button
            key={key}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            animate={isHighlighted ? { scale: [1, 1.1, 1] } : { scale: 1 }}
            transition={isHighlighted ? { duration: 0.6, repeat: Infinity } : { duration: 0.2 }}
            onClick={() => onResponse(key)}
            disabled={disabled}
            style={{
              borderColor: isHighlighted ? '#10b981' : '#d4d4d8',
            }}
            className={`w-16 h-16 md:w-20 md:h-20 rounded-xl font-bold text-2xl md:text-3xl
                       bg-white text-zinc-900 border-4
                       transition-shadow disabled:opacity-50 disabled:cursor-not-allowed
                       shadow-lg hover:border-zinc-400
                       ${isHighlighted ? 'ring-4 ring-emerald-400/50' : ''}`}
          >
            {label}
          </motion.button>
        );
      })}
    </div>
  );
}
