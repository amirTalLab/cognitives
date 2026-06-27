'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  buildTrialList, getFaceUrl, generateMondrianPool, preloadAllImages,
  FIXATION_MS, CYCLE_FRAMES, MASK_FRAMES, RAMP_MS, MAX_CONTRAST,
  RESCUE_START_MS, RESCUE_END_MS, RESCUE_DUR_MS, ITI_MS,
  BREAK_EVERY, FACE_SIZE_MM, STIMULUS_SET,
} from '@/lib/brms-emotion/stimuli';
import { Trial, TrialResult } from '@/types/brms-emotion';
import { getSupabase } from '@/lib/supabase';

type Phase = 'fixation' | 'alternation' | 'iti' | 'break' | 'saving';

const TOTAL = 120;
const MONDRIAN_POOL_SIZE = 60;
const TIMING_TOLERANCE = 0.15;

export default function BRMSExperimentPage() {
  const router = useRouter();
  const [language, setLanguage] = useState<'en' | 'he'>('he');
  const [trials, setTrials] = useState<Trial[]>([]);
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>('fixation');
  const [faceSizePx, setFaceSizePx] = useState(100);

  const rafRef = useRef<number>(0);
  const frameCountRef = useRef(0);
  const startTimeRef = useRef(0);
  const mondrianPoolRef = useRef<HTMLCanvasElement[]>([]);
  const mondrianIdxRef = useRef(0);
  const respondedRef = useRef(false);
  const rescueTriggeredRef = useRef(false);
  const frameTimestampsRef = useRef<number[]>([]);
  const resultsRef = useRef<TrialResult[]>([]);

  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const faceImgRef = useRef<HTMLImageElement>(null);

  const isHe = language === 'he';

  useEffect(() => {
    const lang = sessionStorage.getItem('brms_language') as 'en' | 'he' | null;
    if (lang) setLanguage(lang);
    const pxPerMm = parseFloat(sessionStorage.getItem('brms_px_per_mm') || '4');
    setFaceSizePx(Math.round(FACE_SIZE_MM * pxPerMm));
    preloadAllImages();
    setTrials(buildTrialList());
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

  const checkTimingFlag = useCallback((): boolean => {
    const ts = frameTimestampsRef.current;
    if (ts.length < 10) return false;
    const intervals: number[] = [];
    for (let i = 1; i < ts.length; i++) intervals.push(ts[i] - ts[i - 1]);
    const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const badFrames = intervals.filter(d => Math.abs(d - mean) > mean * 0.5).length;
    return badFrames / intervals.length > TIMING_TOLERANCE;
  }, []);

  const saveTrial = useCallback(async (result: TrialResult) => {
    resultsRef.current.push(result);
    try {
      const supabase = getSupabase();
      if (supabase) {
        await supabase.from('brms_emotion_results').insert(result);
      }
    } catch (e) { console.error('Save error:', e); }
  }, []);

  const startAlternation = useCallback(() => {
    if (!trial) return;
    respondedRef.current = false;
    rescueTriggeredRef.current = false;
    frameCountRef.current = 0;
    startTimeRef.current = performance.now();
    mondrianIdxRef.current = 0;
    frameTimestampsRef.current = [];

    const faceUrl = getFaceUrl(trial.identityId, trial.emotion, trial.orientation);

    function tick(ts: number) {
      if (respondedRef.current) return;
      frameTimestampsRef.current.push(ts);
      const elapsed = performance.now() - startTimeRef.current;

      if (elapsed >= RESCUE_END_MS) {
        respondedRef.current = true;
        stopAlternation();
        return;
      }

      if (elapsed >= RESCUE_START_MS && !rescueTriggeredRef.current) {
        rescueTriggeredRef.current = true;
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
          faceAlpha = MAX_CONTRAST;
        }

        if (showFace) {
          maskEl.style.opacity = '0';
          faceEl.style.opacity = String(faceAlpha);
          faceEl.src = faceUrl;
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

  const finishExperiment = useCallback(async () => {
    setPhase('saving');
    sessionStorage.setItem('brms_results', JSON.stringify(resultsRef.current));
    router.push('/bRMS/thanks');
  }, [router]);

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
        const nextIdx = idx + 1;
        if (nextIdx >= TOTAL) {
          finishExperiment();
        } else if (nextIdx % BREAK_EVERY === 0) {
          setIdx(nextIdx);
          setPhase('break');
        } else {
          setIdx(nextIdx);
          setPhase('fixation');
        }
      }, ITI_MS);
      return () => clearTimeout(timer);
    }
  }, [phase, trial, idx, startAlternation, finishExperiment]);

  useEffect(() => {
    return () => stopAlternation();
  }, [stopAlternation]);

  const handleResponse = useCallback((side: 'left' | 'right') => {
    if (phase !== 'alternation' || !trial || respondedRef.current) return;
    respondedRef.current = true;
    const bt = Math.round(performance.now() - startTimeRef.current);
    stopAlternation();

    const result: TrialResult = {
      session_id: sessionStorage.getItem('brms_session_id') ?? '',
      participant_name: sessionStorage.getItem('brms_participant_name') ?? null,
      trial_index: idx,
      emotion: trial.emotion,
      orientation: trial.orientation,
      identity_id: trial.identityId,
      stimulus_set: STIMULUS_SET,
      side_shown: trial.side,
      side_response: side,
      is_correct: side === trial.side,
      reaction_time_ms: bt,
      max_contrast: 70,
      rescue_triggered: rescueTriggeredRef.current,
      timing_flag: checkTimingFlag(),
      is_practice: false,
    };

    saveTrial(result);
    setPhase('iti');
  }, [phase, trial, idx, stopAlternation, checkTimingFlag, saveTrial]);

  const handleBreakContinue = () => {
    setPhase('fixation');
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
    trialOf: `${idx + 1} / ${TOTAL}`,
    saving: 'שומר...',
    tapLeft: '◀ שמאל',
    tapRight: 'ימין ▶',
    breakTitle: 'הפסקה',
    breakMsg: (n: number) => `השלמת ${n} מתוך ${TOTAL} ניסויים. קח רגע ולחץ כשתהיה מוכן.`,
    breakContinue: 'המשך',
  } : {
    trialOf: `${idx + 1} / ${TOTAL}`,
    saving: 'Saving...',
    tapLeft: '◀ Left',
    tapRight: 'Right ▶',
    breakTitle: 'Break',
    breakMsg: (n: number) => `You've completed ${n} of ${TOTAL} trials. Take a moment and tap when ready.`,
    breakContinue: 'Continue',
  };

  if (!trial || phase === 'saving') {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
        <p className="text-gray-400 text-lg">{phase === 'saving' ? t.saving : 'Loading...'}</p>
      </div>
    );
  }

  const maskSize = Math.round(faceSizePx * 1.3);
  const offset = Math.round(faceSizePx * 0.8);

  return (
    <div className="bg-[#0f172a] flex flex-col select-none" style={{ height: '100dvh' }}>
      {/* Progress */}
      <div className="flex-shrink-0 h-5">
        <div className="h-1.5 bg-gray-800">
          <motion.div className="h-full bg-purple-500" animate={{ width: `${(idx / TOTAL) * 100}%` }} transition={{ duration: 0.3 }} />
        </div>
        <div className="flex justify-end px-4 pt-0.5">
          <span className="text-xs text-gray-600">{t.trialOf}</span>
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col items-center justify-center overflow-hidden px-4">
        {(phase === 'fixation' || phase === 'iti') && (
          <div className="text-white text-6xl font-thin select-none">+</div>
        )}

        {phase === 'alternation' && (
          <div className="relative flex items-center justify-center" style={{ width: '100%', height: maskSize + 40 }}>
            <div className="absolute text-white text-4xl font-thin" style={{ zIndex: 10 }}>+</div>
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

        {phase === 'break' && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center gap-6 max-w-sm text-center"
          >
            <h2 className="text-2xl font-bold text-white">{t.breakTitle}</h2>
            <p className="text-gray-300 text-sm">{t.breakMsg(idx)}</p>
            <button
              onPointerDown={e => { e.preventDefault(); handleBreakContinue(); }}
              className="px-10 py-4 bg-purple-500 hover:bg-purple-400 text-white font-bold rounded-xl text-lg transition-colors touch-manipulation shadow-lg"
            >{t.breakContinue}</button>
          </motion.div>
        )}
      </div>

      {/* Response buttons */}
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
