'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  buildPracticeList, getFaceUrl, generateMondrianPool, preloadAllImages,
  FIXATION_MS, CYCLE_FRAMES, MASK_FRAMES, RAMP_MS, MAX_CONTRAST,
  RESCUE_START_MS, RESCUE_END_MS, RESCUE_DUR_MS, ITI_MS,
  FRAME_ASPECT, FACE_W_RATIO, FACE_OFFSET_RATIO, FACE_H_RATIO,
} from '@/lib/brms-emotion/stimuli';
import { Trial } from '@/types/brms-emotion';

type Phase = 'instructions' | 'fixation' | 'alternation' | 'feedback' | 'iti';

const TOTAL = 8;
const MONDRIAN_POOL_SIZE = 20;
const MONDRIAN_CAP_W = 640;

export default function BRMSPracticePage() {
  const router = useRouter();
  const [language, setLanguage] = useState<'en' | 'he'>('he');
  const [trials, setTrials] = useState<Trial[]>([]);
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>('instructions');
  const [feedbackCorrect, setFeedbackCorrect] = useState<boolean | null>(null);
  const [feedbackSide, setFeedbackSide] = useState<string>('');
  const [isPortrait, setIsPortrait] = useState(false);
  const [frameW, setFrameW] = useState(800);
  const [frameH, setFrameH] = useState(336);

  const rafRef = useRef<number>(0);
  const frameCountRef = useRef(0);
  const startTimeRef = useRef(0);
  const mondrianPoolRef = useRef<HTMLCanvasElement[]>([]);
  const mondrianIdxRef = useRef(0);
  const respondedRef = useRef(false);
  const poolGeneratedRef = useRef(false);

  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const faceImgRef = useRef<HTMLImageElement>(null);

  const isHe = language === 'he';

  useEffect(() => {
    const lang = sessionStorage.getItem('brms_language') as 'en' | 'he' | null;
    if (lang) setLanguage(lang);
    preloadAllImages();
    setTrials(buildPracticeList());

    const updateLayout = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      setIsPortrait(h > w * 1.1);
      let fw = w;
      let fh = Math.round(fw / FRAME_ASPECT);
      if (fh > h) { fh = h; fw = Math.round(fh * FRAME_ASPECT); }
      setFrameW(fw);
      setFrameH(fh);
    };
    updateLayout();
    window.addEventListener('resize', updateLayout);
    return () => window.removeEventListener('resize', updateLayout);
  }, []);

  useEffect(() => {
    if (!isPortrait && frameW > 0 && !poolGeneratedRef.current) {
      const mw = Math.min(frameW, MONDRIAN_CAP_W);
      const mh = Math.round(mw / FRAME_ASPECT);
      mondrianPoolRef.current = generateMondrianPool(MONDRIAN_POOL_SIZE, mw, mh);
      poolGeneratedRef.current = true;
    }
  }, [isPortrait, frameW]);

  const trial = trials[idx] as Trial | undefined;

  const faceW = Math.round(FACE_W_RATIO * frameW);
  const faceH = Math.round(FACE_H_RATIO * frameH);
  const faceOffsetPx = Math.round(FACE_OFFSET_RATIO * frameW);
  const faceTop = Math.round((frameH - faceH) / 2);
  const faceLeftL = Math.round(frameW / 2 - faceOffsetPx - faceW / 2);
  const faceLeftR = Math.round(frameW / 2 + faceOffsetPx - faceW / 2);
  const mondrianW = Math.min(frameW, MONDRIAN_CAP_W);
  const mondrianH = Math.round(mondrianW / FRAME_ASPECT);

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
    const maskEl0 = maskCanvasRef.current;
    if (faceEl0) { faceEl0.style.opacity = '0'; faceEl0.src = faceUrl; }
    if (maskEl0 && mondrianPoolRef.current.length > 0) {
      maskEl0.style.opacity = '0';
      const ctx = maskEl0.getContext('2d');
      if (ctx) ctx.drawImage(mondrianPoolRef.current[0], 0, 0, maskEl0.width, maskEl0.height);
    }

    function tick() {
      if (respondedRef.current) return;
      const elapsed = performance.now() - startTimeRef.current;
      if (elapsed >= RESCUE_END_MS) {
        respondedRef.current = true;
        stopAlternation();
        if (maskCanvasRef.current) maskCanvasRef.current.style.opacity = '0';
        if (faceImgRef.current) faceImgRef.current.style.opacity = '0';
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
          mondrianIdxRef.current = (mondrianIdxRef.current + 1) % mondrianPoolRef.current.length;
          const mondrian = mondrianPoolRef.current[mondrianIdxRef.current];
          const ctx = maskEl.getContext('2d');
          if (ctx) ctx.drawImage(mondrian, 0, 0, maskEl.width, maskEl.height);
        }
      }

      frameCountRef.current++;
      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
  }, [trial, stopAlternation]);

  useEffect(() => {
    if (!trial || isPortrait) return;
    if (phase === 'fixation') {
      const timer = setTimeout(() => { setPhase('alternation'); startAlternation(); }, FIXATION_MS);
      return () => clearTimeout(timer);
    }
    if (phase === 'iti') {
      const timer = setTimeout(() => {
        if (idx + 1 >= TOTAL) { router.push('/bRMS/experiment'); }
        else { setIdx(i => i + 1); setPhase('fixation'); setFeedbackCorrect(null); }
      }, ITI_MS);
      return () => clearTimeout(timer);
    }
  }, [phase, trial, idx, startAlternation, router, isPortrait]);

  useEffect(() => { return () => stopAlternation(); }, [stopAlternation]);

  const handleResponse = useCallback((side: 'left' | 'right') => {
    if (phase !== 'alternation' || !trial || respondedRef.current) return;
    respondedRef.current = true;
    stopAlternation();
    if (maskCanvasRef.current) maskCanvasRef.current.style.opacity = '0';
    if (faceImgRef.current) faceImgRef.current.style.opacity = '0';
    setFeedbackCorrect(side === trial.side);
    setFeedbackSide(trial.side);
    setPhase('feedback');
  }, [phase, trial, stopAlternation]);

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
    trialOf: `${idx + 1} / ${TOTAL}`,
    correct: '✓ נכון!',
    incorrect: '✗ שגוי',
    answer: 'הפנים הופיעו ב:',
    left: 'שמאל', right: 'ימין',
    next: 'המשך',
    tapLeft: '◀',
    tapRight: '▶',
    rotateMsg: 'סובבו את הטלפון לרוחב',
    instrTitle: 'תרגול',
    instrBody: 'ריבועים צבעוניים יהבהבו על המסך. פנים יופיעו בהדרגה משמאל או מימין לסימן ה-+. ברגע שתבחינו בפנים — לחצו על הצד שבו הן הופיעו.',
    instrFix: 'שמרו מבט על ה-+ שבמרכז המסך לכל אורך המשימה.',
    instrTip: 'לחצו על חצי המסך השמאלי או הימני, או השתמשו במקשי החצים.',
    instrStart: 'התחילו תרגול',
  } : {
    practice: 'Practice',
    trialOf: `${idx + 1} / ${TOTAL}`,
    correct: '✓ Correct!',
    incorrect: '✗ Incorrect',
    answer: 'The face was on the:',
    left: 'Left', right: 'Right',
    next: 'Next',
    tapLeft: '◀',
    tapRight: '▶',
    rotateMsg: 'Rotate your phone to landscape',
    instrTitle: 'Practice',
    instrBody: 'Colorful squares will flash on screen. A face will gradually appear to the left or right of the +. As soon as you see it — tap the side it appeared on.',
    instrFix: 'Keep your eyes on the + at the center of the screen throughout the task.',
    instrTip: 'Tap the left or right half of the screen, or use the arrow keys.',
    instrStart: 'Start Practice',
  };

  if (!trial) {
    return <div style={{ height: '100dvh', backgroundColor: '#b0b0b0' }} className="flex items-center justify-center">
      <p className="text-gray-600">Loading...</p>
    </div>;
  }

  if (isPortrait) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 text-center px-8"
        style={{ height: '100dvh', backgroundColor: '#0f172a' }}>
        <span className="text-8xl text-purple-400 animate-pulse" style={{ lineHeight: 1 }}>↻</span>
        <p className="text-white text-xl font-bold">{t.rotateMsg}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center select-none"
      style={{ height: '100dvh', backgroundColor: '#b0b0b0', overflow: 'hidden' }}>

      {/* Progress */}
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 3, zIndex: 50 }}>
        <div style={{ width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.08)' }} />
        <motion.div
          style={{ height: '100%', backgroundColor: '#a78bfa', position: 'absolute', top: 0, left: 0 }}
          animate={{ width: `${(idx / TOTAL) * 100}%` }}
          transition={{ duration: 0.4 }}
        />
      </div>
      <div style={{ position: 'fixed', top: 5, right: 12, zIndex: 50 }}>
        <span style={{ fontSize: 11, color: 'rgba(0,0,0,0.35)' }}>{t.practice} · {t.trialOf}</span>
      </div>

      {/* Display frame — 2.38:1 */}
      <div style={{
        position: 'relative',
        width: frameW, height: frameH,
        backgroundColor: '#b0b0b0',
        overflow: 'hidden', flexShrink: 0,
      }}>
        {/* Full-field Mondrian mask */}
        <canvas ref={maskCanvasRef} width={mondrianW} height={mondrianH}
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, zIndex: 2 }} />

        {/* Fixation cross */}
        {phase !== 'instructions' && (
          <div style={{
            position: 'absolute', left: '50%', top: '50%',
            transform: 'translate(-50%, -50%)', zIndex: 5,
            color: '#333',
            fontSize: '2.8rem', fontWeight: 700, userSelect: 'none', lineHeight: 1,
          }}>+</div>
        )}

        {/* Face image */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img ref={faceImgRef} alt=""
          style={{
            position: 'absolute',
            width: faceW, height: faceH,
            top: faceTop,
            left: trial.side === 'left' ? faceLeftL : faceLeftR,
            opacity: 0, zIndex: 1,
            transform: trial.orientation === 'inverted' ? 'rotate(180deg)' : undefined,
          }} />

        {/* Tap zones + side indicators (during alternation) */}
        {phase === 'alternation' && (<>
          <div onPointerDown={e => { e.preventDefault(); handleResponse('left'); }}
            style={{ position: 'absolute', top: 0, left: 0, width: '50%', height: '100%', zIndex: 15, cursor: 'pointer' }} />
          <div onPointerDown={e => { e.preventDefault(); handleResponse('right'); }}
            style={{ position: 'absolute', top: 0, right: 0, width: '50%', height: '100%', zIndex: 15, cursor: 'pointer' }} />
          <div style={{ position: 'absolute', bottom: 6, left: 14, fontSize: 14, color: 'rgba(0,0,0,0.25)', zIndex: 16, userSelect: 'none' }}>{t.tapLeft}</div>
          <div style={{ position: 'absolute', bottom: 6, right: 14, fontSize: 14, color: 'rgba(0,0,0,0.25)', zIndex: 16, userSelect: 'none' }}>{t.tapRight}</div>
        </>)}

        {/* Instructions overlay */}
        {phase === 'instructions' && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            backgroundColor: 'rgba(15, 23, 42, 0.92)', zIndex: 20,
          }}>
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center gap-4 max-w-sm text-center px-6">
              <h2 className="text-2xl font-bold text-white">{t.instrTitle}</h2>
              <p className="text-gray-300 text-sm leading-relaxed">{t.instrBody}</p>
              <p className="text-amber-400 text-sm font-medium">{t.instrFix}</p>
              <p className="text-gray-500 text-xs">{t.instrTip}</p>
              <button
                onPointerDown={e => { e.preventDefault(); setPhase('fixation'); }}
                className="mt-2 px-10 py-3 bg-purple-500 hover:bg-purple-400 text-white font-bold rounded-xl text-base transition-colors touch-manipulation shadow-lg"
              >{t.instrStart}</button>
            </motion.div>
          </div>
        )}

        {/* Feedback overlay */}
        {phase === 'feedback' && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            backgroundColor: 'rgba(15, 23, 42, 0.88)', zIndex: 20,
          }}>
            <AnimatePresence>
              <motion.div key={`fb-${idx}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center gap-4">
                <p className={`text-3xl font-bold ${feedbackCorrect ? 'text-green-400' : 'text-red-400'}`}>
                  {feedbackCorrect ? t.correct : t.incorrect}
                </p>
                {!feedbackCorrect && (
                  <p className="text-gray-400 text-sm">
                    {t.answer} <span className="text-white font-bold">{feedbackSide === 'left' ? t.left : t.right}</span>
                  </p>
                )}
                <button
                  onPointerDown={e => { e.preventDefault(); setPhase('iti'); }}
                  className="mt-2 px-10 py-3 bg-purple-500 hover:bg-purple-400 text-white font-bold rounded-xl text-base transition-colors touch-manipulation shadow-lg"
                >{t.next}</button>
              </motion.div>
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
