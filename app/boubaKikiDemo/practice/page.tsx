'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Trial, ShapeKind, TrialResult } from '@/types/bouba-kiki-demo';
import { BLOB_PATH, starPoints, generateTrials, KEY, FIXATION_MS, ITI_MS } from '@/lib/bouba-kiki-demo/stimuli';

type Phase = 'fixation' | 'response' | 'feedback';

function Shape({ kind, size }: { kind: ShapeKind; size: number }) {
  return (
    <svg viewBox="0 0 200 200" width={size} height={size} aria-hidden>
      {kind === 'rounded'
        ? <path d={BLOB_PATH} fill="#a78bfa" />
        : <polygon points={starPoints(100, 100, 92, 38)} fill="#a78bfa" />}
    </svg>
  );
}

export default function PracticePage() {
  const router = useRouter();
  const [trials] = useState<Trial[]>(() => generateTrials(true));
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>('fixation');
  const [language, setLanguage] = useState<'he' | 'en'>('he');
  const [chosen, setChosen] = useState<ShapeKind | null>(null);
  const results = useRef<TrialResult[]>([]);
  const shownAt = useRef(0);

  const trial = trials[idx];
  const rtl = language === 'he';

  useEffect(() => {
    setLanguage((sessionStorage.getItem(KEY + '_language') as 'he' | 'en') || 'he');
  }, []);

  // Timed phases are driven by plain setTimeout and are never wrapped in AnimatePresence,
  // whose exit animation would eat a brief display.
  useEffect(() => {
    if (phase !== 'fixation') return;
    const timer = setTimeout(() => { setPhase('response'); shownAt.current = performance.now(); }, FIXATION_MS);
    return () => clearTimeout(timer);
  }, [phase, idx]);

  function choose(side: 'left' | 'right') {
    if (phase !== 'response' || !trial) return;
    const kind = side === 'left' ? trial.leftShape : trial.rightShape;
    setChosen(kind);

    results.current.push({
      session_id: sessionStorage.getItem(KEY + '_session_id') || 'unknown',
      participant_name: sessionStorage.getItem(KEY + '_name') || 'anonymous',
      trial_index: trial.index,
      left_shape: trial.leftShape,
      right_shape: trial.rightShape,
      chosen_shape: kind,
      is_conventional: kind === 'rounded',
      is_control: trial.isControl,
      reaction_time_ms: Math.round(performance.now() - shownAt.current),
      is_practice: true,
    });

    setPhase('feedback');
  }

  function advance() {
    if (idx + 1 >= trials.length) {
      router.push('./experiment');
      return;
    }
    setChosen(null);
    setPhase('fixation');
    setTimeout(() => setIdx(i => i + 1), ITI_MS);
  }

  if (!trial) return null;

  return (
    <main style={{ height: '100dvh' }} className="bg-[#0f172a] flex flex-col">
      <div className="flex-shrink-0 h-6">
        <div className="h-1.5 bg-gray-800">
          <motion.div className="h-full bg-purple-500"
            animate={{ width: String((idx / trials.length) * 100) + '%' }}
            transition={{ duration: 0.4 }} />
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center gap-10 px-6">
        {phase === 'fixation' && <div className="text-4xl text-gray-500">+</div>}

        {phase !== 'fixation' && (
          <>
            <p className="text-lg text-gray-300" dir={rtl ? 'rtl' : 'ltr'}>
              {rtl ? 'איזו צורה היא "בובה"?' : 'Which shape is "bouba"?'}
            </p>

            <div className="flex items-center gap-10" style={{ flexDirection: 'row', direction: rtl ? 'rtl' : 'ltr' }}>
              {(['left', 'right'] as const).map(side => {
                const kind = side === 'left' ? trial.leftShape : trial.rightShape;
                const picked = chosen === kind && phase === 'feedback';
                return (
                  <button key={side} onClick={() => choose(side)}
                    disabled={phase !== 'response'}
                    className={'rounded-2xl border-2 p-4 transition-colors touch-manipulation ' +
                      (picked ? 'border-purple-400 bg-purple-500/10' : 'border-gray-700 hover:border-gray-500')}>
                    <Shape kind={kind} size={140} />
                  </button>
                );
              })}
            </div>
          </>
        )}

        {phase === 'feedback' && (
          <div className="flex flex-col items-center gap-4" dir={rtl ? 'rtl' : 'ltr'}>
            <p className="text-sm text-gray-400">
              {rtl ? 'נרשם. אין תשובה נכונה כאן.' : 'Recorded. There is no correct answer here.'}
            </p>
            <button onClick={advance}
              className="px-6 py-3 bg-purple-500 hover:bg-purple-400 text-white font-semibold rounded-lg touch-manipulation">
              {rtl ? 'המשך' : 'Next'}
            </button>
          </div>
        )}
      </div>

      <p className="flex-shrink-0 text-center text-xs text-gray-600 pb-4">
        {rtl ? 'תרגול' : 'Practice'} {idx + 1} / {trials.length}
      </p>
    </main>
  );
}
