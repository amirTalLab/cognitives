'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  buildPracticeList, getFaceUrl, generateMondrianPool, preloadAllImages,
  FIXATION_MS, CYCLE_FRAMES, MASK_FRAMES, RAMP_MS, MAX_CONTRAST,
  RESCUE_START_MS, RESCUE_END_MS, RESCUE_DUR_MS, ITI_MS,
  FACE_SIZE_MM,
} from '@/lib/brms-emotion/stimuli';
import { Trial } from '@/types/brms-emotion';

type Phase = 'fixation' | 'alternation' | 'feedback' | 'iti';

const TOTAL = 12;
const MONDRIAN_POOL_SIZE = 60;

export default function BRMSPracticePage() {
  const router = useRouter();
  const [language, setLanguage] = useState<'en' | 'he'>('he');
  const [trials, setTrials] = useState<Trial[]>([]);
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>('fixation');
  const [feedbackCorrect, setFeedbackCorrect] = useState<boolean | null>(null);
  const [feedbackSide, setFeedbackSide] = useState<string>('');
  const [faceSizePx, setFaceSizePx] = useState(100);

  const rafRef = useRef<number>(0);
  const frameCountRef = useRef(0);
  const startTimeRef = useRef(0);
  const mondrianPoolRef = useRef<HTMLCanvasElement[]>([]);
  const mondrianIdxRef = useRef(0);
  const respondedRef = useRef(false);

  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const faceImgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const isHe = language === 'he';

  useEffect(() => {
    const lang = sessionStorage.getItem('brms_language') as 'en' | 'he' | null;
    if (lang) setLanguage(lang);
    const pxPerMm = parseFloat(sessionStorage.getItem('brms_px_per_mm') || '4');
    setFaceSizePx(Math.round(FACE_SIZE_MM * pxPerMm));
    preloadAllImages();
    setTrials(buildPracticeList());
  }, []);

  useEffect(() => {
    if (faceSizePx > 0 && mondrianPoolRef.current.length === 0) {
      const sz = Math.round(faceSizePx * 1.3);
      mondrianPoolRef.current = generateMondrianPool(MONDRIAN_POOL_SIZE, sz, sz);
    }
  }, [faceSizePx]);

  const trial = trials[idx] as Trial | undefined;

  const stopAlternation = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
  }, []);

  const startAlternation = useCallback(() => {
    if (!trial) return;
    respondedRef.current = false;
    frameCountRef.current = 0;
    startTimeRef.current = performance.now();
    mondrianIdxRef.current = 0;

    const faceUrl = getFaceUrl(trial.identityId, trial.emotion, trial.orientation);
    const faceEl0 = faceImgRef.current;
    if (faceEl0) {
      faceEl0.src = faceUrl;
      faceEl0.style.opacity = '0';
    }

    function tick() {
      if (respondedRef.current) return;
      const elapsed = performance.now() - startTimeRef.current;

      if (elapsed >= RESCUE_END_MS) {
        respondedRef.current = true;
        stopAlternation();
        return;
      }

      const frame = frameCountRef.current;
      const cyclePos = frame % CYCLE_FRAMES;
      const showFace = cyclePos >= MASK_FRAMES;

      const maskEl = maskCanvasRef.current;
      const faceEl = faceImgRef.current;

      if (maskEl && faceEl) {
        let faceAlpha = Math.min(MAX_CONTRAST, (elapsed / RAMP_MS) * MAX_CONTRAST);
        let maskAlpha = 1;

        if (elapsed >= RESCUE_START_MS) {
          maskAlpha = Math.max(0, 1 - (elapsed - RESCUE_START_MS) / RESCUE_DUR_MS);
        }

        if (showFace) {
          maskEl.style.opacity = '0';
          faceEl.style.opacity = String(faceAlpha);
        } else {
          faceEl.style.opacity = '0';
          maskEl.style.opacity = String(maskAlpha);
          if (cyclePos === 0) {
            mondrianIdxRef.current = (mondrianIdxRef.current + 1) % mondrianPoolRef.current.length;
            const mondrian = mondrianPoolRef.current[mondrianIdxRef.current];
            const ctx = maskEl.getContext('2d');
            if (ctx) {
              ctx.drawImage(mondrian, 0, 0, maskEl.width, maskEl.height);
            }
          }
        }
      }

      frameCountRef.current++;
      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
  }, [trial, stopAlternation]);

  useEffect(() => {
    if (!trial) return;
    if (phase === 'fixation') {
      const timer = setTimeout(() => {
        setPhase('alternation');
        startAlternation();
      }, FIXATION_MS);
      return () => clearTimeout(timer);
    }
    if (phase === 'iti') {
      const timer = setTimeout(() => {
        if (idx + 1 >= TOTAL) {
          router.push('/bRMS/experiment');
        } else {
          setIdx(i => i + 1);
          setPhase('fixation');
          setFeedbackCorrect(null);
        }
      }, ITI_MS);
      return () => clearTimeout(timer);
    }
  }, [phase, trial, idx, startAlternation, router]);

  useEffect(() => {
    return () => stopAlternation();
  }, [stopAlternation]);

  const handleResponse = useCallback((side: 'left' | 'right') => {
    if (phase !== 'alternation' || !trial || respondedRef.current) return;
    respondedRef.current = true;
    stopAlternation();

    const correct = side === trial.side;
    setFeedbackCorrect(correct);
    setFeedbackSide(trial.side);
    setPhase('feedback');
  }, [phase, trial, stopAlternation]);

  const handleFeedbackNext = () => {
    setPhase('iti');
  };

  useEffect(() => {
    if (phase !== 'alternation') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') handleResponse('left');
      else if (e.key === 'ArrowRight') handleResponse('right');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, handleResponse]);

  const t = isHe ? {
    practice: 'תרגול',
    trialOf: `ניסוי ${idx + 1} מתוך ${TOTAL}`,
    correct: '✓ נכון!',
    incorrect: '✗ שגוי',
    answer: 'הפנים הופיעו ב:',
    left: 'שמאל', right: 'ימין',
    next: 'המשך',
    tapLeft: '◀ שמאל',
    tapRight: 'ימין ▶',
  } : {
    practice: 'Practice',
    trialOf: `Trial ${idx + 1} of ${TOTAL}`,
    correct: '✓ Correct!',
    incorrect: '✗ Incorrect',
    answer: 'The face was on the:',
    left: 'Left', right: 'Right',
    next: 'Next',
    tapLeft: '◀ Left',
    tapRight: 'Right ▶',
  };

  if (!trial) {
    return <div className="min-h-screen bg-[#0f172a] flex items-center justify-center"><p className="text-gray-400">Loading...</p></div>;
  }

  const maskSize = Math.round(faceSizePx * 1.3);
  const offset = Math.round(faceSizePx * 0.8);

  return (
    <div className="bg-[#0f172a] flex flex-col select-none" style={{ height: '100dvh' }}>
      {/* Progress */}
      <div className="flex-shrink-0 h-6">
        <div className="h-1.5 bg-gray-800">
          <motion.div className="h-full bg-purple-500" animate={{ width: `${(idx / TOTAL) * 100}%` }} transition={{ duration: 0.4 }} />
        </div>
        <div className="flex justify-between items-center px-4 pt-0.5">
          <span className="text-xs text-purple-400 font-medium">{t.practice}</span>
          <span className="text-xs text-gray-500">{t.trialOf}</span>
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col items-center justify-center overflow-hidden px-4">
        {(phase === 'fixation' || phase === 'iti') && (
          <div className="text-white text-6xl font-thin select-none">+</div>
        )}

        {phase === 'alternation' && (
          <div ref={containerRef} className="relative flex items-center justify-center" style={{ width: '100%', height: maskSize + 40 }}>
            {/* Fixation cross */}
            <div className="absolute text-white text-4xl font-thin" style={{ zIndex: 10 }}>+</div>
            {/* Stimulus container (offset left or right) */}
            <div className="absolute" style={{
              [trial.side === 'left' ? 'right' : 'left']: `calc(50% + ${offset}px)`,
              transform: trial.side === 'left' ? 'translateX(-50%)' : 'translateX(50%)',
              width: maskSize,
              height: maskSize,
            }}>
              <canvas ref={maskCanvasRef} width={maskSize} height={maskSize}
                style={{ position: 'absolute', top: 0, left: 0, width: maskSize, height: maskSize }} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img ref={faceImgRef} alt="" width={faceSizePx} height={faceSizePx}
                style={{
                  position: 'absolute',
                  top: (maskSize - faceSizePx) / 2,
                  left: (maskSize - faceSizePx) / 2,
                  opacity: 0,
                }} />
            </div>
          </div>
        )}

        <AnimatePresence>
          {phase === 'feedback' && (
            <motion.div key={`fb-${idx}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center gap-5"
            >
              <p className={`text-3xl font-bold ${feedbackCorrect ? 'text-green-400' : 'text-red-400'}`}>
                {feedbackCorrect ? t.correct : t.incorrect}
              </p>
              {!feedbackCorrect && (
                <p className="text-gray-400 text-sm">
                  {t.answer} <span className="text-white font-bold">{feedbackSide === 'left' ? t.left : t.right}</span>
                </p>
              )}
              <button
                onPointerDown={e => { e.preventDefault(); handleFeedbackNext(); }}
                className="mt-2 px-10 py-4 bg-purple-500 hover:bg-purple-400 text-white font-bold rounded-xl text-lg transition-colors touch-manipulation shadow-lg"
              >{t.next}</button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Response buttons (visible during alternation) */}
      {phase === 'alternation' && (
        <div className="flex-shrink-0 flex justify-between px-6 pb-8 pt-4">
          <button
            onPointerDown={e => { e.preventDefault(); handleResponse('left'); }}
            className="w-32 h-16 bg-gray-800 hover:bg-gray-700 border-2 border-gray-600 active:border-purple-400 text-white font-bold rounded-2xl text-lg transition-colors touch-manipulation shadow-lg"
          >{t.tapLeft}</button>
          <button
            onPointerDown={e => { e.preventDefault(); handleResponse('right'); }}
            className="w-32 h-16 bg-gray-800 hover:bg-gray-700 border-2 border-gray-600 active:border-purple-400 text-white font-bold rounded-2xl text-lg transition-colors touch-manipulation shadow-lg"
          >{t.tapRight}</button>
        </div>
      )}
    </div>
  );
}
