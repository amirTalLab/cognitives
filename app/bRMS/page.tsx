'use client';

import React, { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { v4 as uuidv4 } from 'uuid';
import { COIN_DIAMETER_MM } from '@/lib/brms-emotion/stimuli';

type Step = 'intro' | 'calibrate' | 'hardwareCheck' | 'prepareDisplay';

export default function BRMSLanding() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [language, setLanguage] = useState<'en' | 'he'>('he');
  const [step, setStep] = useState<Step>('intro');
  const [coinPx, setCoinPx] = useState(80);
  const [checkPassed, setCheckPassed] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const [viewingDistCm, setViewingDistCm] = useState(40);
  const dragRef = useRef<{ startY: number; startSize: number } | null>(null);
  const isHe = language === 'he';

  const t = isHe ? {
    title: 'bRMS — רגש ואוריינטציה',
    subtitle: 'Breaking Repeated Masking Suppression',
    inst: [
      'בכל ניסוי יוצגו מסכות צבעוניות מהבהבות. פנים יופיעו בהדרגה משמאל או מימין לנקודת המרכז.',
      'ברגע שתבחינו בפנים, לחצו על הצד שבו הן הופיעו (שמאל או ימין) — מהר ככל האפשר.',
      'הניסוי כולל 120 ניסויים ואורך כ-15–18 דקות, עם 2 הפסקות.',
    ],
    nameLabel: 'שמך',
    namePH: 'הזן את שמך',
    start: 'המשך לכיול',
    toggle: 'English',
    calTitle: 'כיול גודל המסך',
    calInst: 'הצמידו מטבע של 1 ₪ למסך וגררו את העיגול עד שיתאים בדיוק לגודל המטבע.',
    calDone: 'המשך',
    calDrag: 'גררו למעלה / למטה לשינוי גודל',
    hwTitle: 'בדיקת מסך',
    hwChecking: 'בודק יציבות מסגרות...',
    hwPass: 'המסך תקין — אפשר להתחיל!',
    hwFail: 'ביצועי המסך לא אופטימליים. סגרו אפליקציות אחרות ונסו שוב.',
    hwRetry: 'נסה שוב',
    hwStart: 'המשך',
    prepTitle: 'הכנה לניסוי',
    prepFullscreen: 'המסך יעבור למצב מלא בפריסה אופקית.',
    prepRotate: 'סובבו את הטלפון לרוחב והחזיקו אותו כך לכל אורך הניסוי.',
    prepDistance: (cm: number) => `החזיקו את הטלפון במרחק של כ-${cm} ס"מ מהעיניים — כאורך אמה.`,
    prepReady: 'מוכן — התחל תרגול',
  } : {
    title: 'bRMS — Emotion × Orientation',
    subtitle: 'Breaking Repeated Masking Suppression',
    inst: [
      'On each trial, colorful flashing masks will appear. A face will gradually emerge to the left or right of center.',
      'As soon as you see the face, tap the side it appeared on (left or right) — as fast as you can.',
      'The experiment has 120 trials and takes about 15–18 minutes, with 2 breaks.',
    ],
    nameLabel: 'Your name',
    namePH: 'Enter your name',
    start: 'Continue to calibration',
    toggle: 'עברית',
    calTitle: 'Screen Size Calibration',
    calInst: 'Hold a 1 NIS coin against the screen and drag the circle until it matches the coin exactly.',
    calDone: 'Continue',
    calDrag: 'Drag up / down to resize',
    hwTitle: 'Screen Check',
    hwChecking: 'Checking frame rate stability...',
    hwPass: 'Screen looks good — ready to start!',
    hwFail: 'Screen performance is not optimal. Close other apps and try again.',
    hwRetry: 'Retry',
    hwStart: 'Continue',
    prepTitle: 'Display Setup',
    prepFullscreen: 'The screen will switch to fullscreen landscape mode.',
    prepRotate: 'Rotate your phone to landscape and keep it that way for the entire task.',
    prepDistance: (cm: number) => `Hold your phone about ${cm} cm from your eyes — roughly a forearm's length.`,
    prepReady: 'Ready — Start Practice',
  };

  const handleIntroNext = () => {
    if (!name.trim()) {
      alert(isHe ? 'אנא הזן את שמך' : 'Please enter your name');
      return;
    }
    sessionStorage.setItem('brms_session_id', uuidv4());
    sessionStorage.setItem('brms_participant_name', name.trim());
    sessionStorage.setItem('brms_language', language);
    setStep('calibrate');
  };

  const handleCalibrationDone = () => {
    const pxPerMm = coinPx / COIN_DIAMETER_MM;
    sessionStorage.setItem('brms_px_per_mm', String(pxPerMm));
    setStep('hardwareCheck');
    runHardwareCheck();
  };

  const runHardwareCheck = useCallback(() => {
    setChecking(true);
    setCheckPassed(null);
    const timestamps: number[] = [];
    let frameCount = 0;
    const totalFrames = 120; // ~2 seconds at 60Hz

    function tick(ts: number) {
      timestamps.push(ts);
      frameCount++;
      if (frameCount < totalFrames) {
        requestAnimationFrame(tick);
      } else {
        const intervals: number[] = [];
        for (let i = 1; i < timestamps.length; i++) {
          intervals.push(timestamps[i] - timestamps[i - 1]);
        }
        const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        const badFrames = intervals.filter(d => Math.abs(d - mean) > mean * 0.5).length;
        const badRatio = badFrames / intervals.length;
        setCheckPassed(badRatio < 0.1);
        setChecking(false);
      }
    }
    requestAnimationFrame(tick);
  }, []);

  const handleGoToPrepare = () => {
    const pxPerMm = parseFloat(sessionStorage.getItem('brms_px_per_mm') || '4');
    const landscapeW = Math.max(window.innerWidth, window.innerHeight);
    const frameWidthCm = landscapeW / pxPerMm / 10;
    const dist = Math.round(1.61 * frameWidthCm);
    setViewingDistCm(dist);
    setStep('prepareDisplay');
  };

  const handleStartPractice = async () => {
    try {
      const el = document.documentElement;
      if (el.requestFullscreen) await el.requestFullscreen();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      else if ((el as any).webkitRequestFullscreen) (el as any).webkitRequestFullscreen();
    } catch {}
    try { await (screen.orientation as any).lock('landscape'); } catch {}
    router.push('/bRMS/practice');
  };

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    dragRef.current = { startY: e.clientY, startSize: coinPx };
    const onMove = (ev: PointerEvent) => {
      if (!dragRef.current) return;
      const dy = dragRef.current.startY - ev.clientY;
      setCoinPx(Math.max(30, Math.min(300, dragRef.current.startSize + dy)));
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <div className="min-h-screen bg-[#0f172a] flex items-center justify-center px-4 py-8" dir={isHe ? 'rtl' : 'ltr'}>
      <div className="w-full max-w-md">
        <div className="flex justify-end mb-6">
          <button
            onClick={() => setLanguage(l => l === 'en' ? 'he' : 'en')}
            className="px-3 py-1.5 text-sm text-purple-400 border border-purple-400/40 rounded-lg hover:bg-purple-400/10 transition-colors"
          >
            {t.toggle}
          </button>
        </div>

        {step === 'intro' && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="bg-gray-900 border border-gray-700 rounded-2xl p-8 flex flex-col gap-6"
          >
            <div className="text-center">
              <h1 className="text-2xl font-bold text-white">{t.title}</h1>
              <p className="text-sm text-gray-400 mt-1">{t.subtitle}</p>
            </div>

            <ul className="flex flex-col gap-2">
              {t.inst.map((line, i) => (
                <li key={i} className="flex gap-2 text-gray-300 text-sm leading-relaxed">
                  <span className="text-purple-400 font-bold mt-0.5">•</span>
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
                onKeyDown={e => e.key === 'Enter' && handleIntroNext()}
                placeholder={t.namePH}
                className="px-4 py-3 bg-gray-800 border border-gray-600 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-purple-400 transition-colors"
              />
            </div>

            <button
              onPointerDown={e => { e.preventDefault(); handleIntroNext(); }}
              className="w-full py-4 bg-purple-500 hover:bg-purple-400 text-white font-bold rounded-xl text-lg transition-colors touch-manipulation shadow-lg"
            >
              {t.start}
            </button>
          </motion.div>
        )}

        {step === 'calibrate' && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="bg-gray-900 border border-gray-700 rounded-2xl p-8 flex flex-col items-center gap-6"
          >
            <h2 className="text-xl font-bold text-white text-center">{t.calTitle}</h2>
            <p className="text-gray-300 text-sm text-center leading-relaxed">{t.calInst}</p>

            <div
              className="flex items-center justify-center cursor-ns-resize select-none"
              onPointerDown={onPointerDown}
              style={{ touchAction: 'none' }}
            >
              <div
                style={{
                  width: coinPx,
                  height: coinPx,
                  borderRadius: '50%',
                  border: '3px solid #a78bfa',
                  background: 'rgba(167,139,250,0.1)',
                  transition: 'none',
                }}
              />
            </div>
            <p className="text-xs text-gray-500">{t.calDrag}</p>

            <button
              onPointerDown={e => { e.preventDefault(); handleCalibrationDone(); }}
              className="w-full py-4 bg-purple-500 hover:bg-purple-400 text-white font-bold rounded-xl text-lg transition-colors touch-manipulation shadow-lg"
            >
              {t.calDone}
            </button>
          </motion.div>
        )}

        {step === 'hardwareCheck' && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="bg-gray-900 border border-gray-700 rounded-2xl p-8 flex flex-col items-center gap-6"
          >
            <h2 className="text-xl font-bold text-white text-center">{t.hwTitle}</h2>

            {checking && (
              <div className="flex flex-col items-center gap-3 py-4">
                <div className="w-8 h-8 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                <p className="text-gray-400 text-sm">{t.hwChecking}</p>
              </div>
            )}

            {!checking && checkPassed === true && (
              <div className="flex flex-col items-center gap-4">
                <p className="text-green-400 text-sm font-medium text-center">{t.hwPass}</p>
                <button
                  onPointerDown={e => { e.preventDefault(); handleGoToPrepare(); }}
                  className="w-full py-4 bg-purple-500 hover:bg-purple-400 text-white font-bold rounded-xl text-lg transition-colors touch-manipulation shadow-lg"
                >
                  {t.hwStart}
                </button>
              </div>
            )}

            {!checking && checkPassed === false && (
              <div className="flex flex-col items-center gap-4">
                <p className="text-amber-400 text-sm font-medium text-center">{t.hwFail}</p>
                <div className="flex gap-3 w-full">
                  <button
                    onPointerDown={e => { e.preventDefault(); runHardwareCheck(); }}
                    className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 text-white font-bold rounded-xl transition-colors touch-manipulation"
                  >
                    {t.hwRetry}
                  </button>
                  <button
                    onPointerDown={e => { e.preventDefault(); handleGoToPrepare(); }}
                    className="flex-1 py-3 bg-purple-500 hover:bg-purple-400 text-white font-bold rounded-xl transition-colors touch-manipulation"
                  >
                    {t.hwStart}
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        )}

        {step === 'prepareDisplay' && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="bg-gray-900 border border-gray-700 rounded-2xl p-8 flex flex-col items-center gap-6"
          >
            <h2 className="text-xl font-bold text-white text-center">{t.prepTitle}</h2>

            <ul className="flex flex-col gap-3">
              <li className="flex gap-2 text-gray-300 text-sm leading-relaxed">
                <span className="text-purple-400 font-bold mt-0.5">1</span>
                <span>{t.prepFullscreen}</span>
              </li>
              <li className="flex gap-2 text-gray-300 text-sm leading-relaxed">
                <span className="text-purple-400 font-bold mt-0.5">2</span>
                <span>{t.prepRotate}</span>
              </li>
              <li className="flex gap-2 text-gray-300 text-sm leading-relaxed">
                <span className="text-purple-400 font-bold mt-0.5">3</span>
                <span>{t.prepDistance(viewingDistCm)}</span>
              </li>
            </ul>

            <button
              onPointerDown={e => { e.preventDefault(); handleStartPractice(); }}
              className="w-full py-4 bg-purple-500 hover:bg-purple-400 text-white font-bold rounded-xl text-lg transition-colors touch-manipulation shadow-lg"
            >
              {t.prepReady}
            </button>
          </motion.div>
        )}
      </div>
    </div>
  );
}
