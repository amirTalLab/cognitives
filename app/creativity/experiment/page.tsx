'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  AUT_OBJECTS, AUT_TIME_PER_OBJECT_MS,
  CIRCLES_TOTAL, CIRCLES_TIME_MS,
  RAT_TRIPLETS, RAT_TIME_MS,
  checkRATAnswer, formatTime,
} from '@/lib/creativity/stimuli';
import { getSupabase } from '@/lib/supabase';

const KEY = 'crt';

type ExperimentPart = 'aut-intro' | 'aut' | 'circles-intro' | 'circles' | 'rat-intro' | 'rat' | 'done';

// ── Drawing Canvas ─────────────────────────────────────────────────────────
function DrawingCanvas({ size, onDrawingChange }: {
  size: number;
  onDrawingChange: (dataUrl: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, size, size);
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 4, 0, Math.PI * 2);
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 2;
    ctx.stroke();
  }, [size]);

  const getPos = (e: React.TouchEvent | React.MouseEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in e) {
      const touch = e.touches[0];
      return { x: (touch.clientX - rect.left) * scaleX, y: (touch.clientY - rect.top) * scaleY };
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  };

  const startDraw = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    drawing.current = true;
    lastPos.current = getPos(e);
  };

  const moveDraw = (e: React.TouchEvent | React.MouseEvent) => {
    if (!drawing.current || !lastPos.current) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.stroke();
    lastPos.current = pos;
  };

  const endDraw = () => {
    drawing.current = false;
    lastPos.current = null;
    if (canvasRef.current) {
      onDrawingChange(canvasRef.current.toDataURL('image/png', 0.5));
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, size, size);
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 4, 0, Math.PI * 2);
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 2;
    ctx.stroke();
    onDrawingChange('');
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        className="rounded-xl border border-gray-600"
        style={{ width: size, height: size, cursor: 'crosshair', touchAction: 'none' }}
        onMouseDown={startDraw}
        onMouseMove={moveDraw}
        onMouseUp={endDraw}
        onMouseLeave={endDraw}
        onTouchStart={startDraw}
        onTouchMove={moveDraw}
        onTouchEnd={endDraw}
      />
      <button
        onClick={clearCanvas}
        className="text-xs text-gray-400 hover:text-gray-200 transition-colors"
      >
        Clear / נקה
      </button>
    </div>
  );
}

// ── Timer Bar ──────────────────────────────────────────────────────────────
function TimerBar({ remaining, total }: { remaining: number; total: number }) {
  const pct = Math.max(0, Math.min(100, (remaining / total) * 100));
  const warn = remaining < 15000;
  return (
    <div className="flex items-center gap-3 w-full">
      <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${warn ? 'bg-red-500' : 'bg-emerald-500'}`}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>
      <span className={`text-sm font-mono font-bold min-w-[48px] text-right ${warn ? 'text-red-400' : 'text-emerald-400'}`}>
        {formatTime(remaining)}
      </span>
    </div>
  );
}

// ── Intro Screen ───────────────────────────────────────────────────────────
function IntroScreen({ title, instructions, onStart, buttonText }: {
  title: string;
  instructions: string[];
  onStart: () => void;
  buttonText: string;
}) {
  return (
    <div className="min-h-screen bg-[#0f172a] flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="bg-gray-900 border border-gray-700 rounded-2xl p-8 max-w-lg w-full flex flex-col gap-6"
      >
        <h2 className="text-xl font-bold text-white text-center">{title}</h2>
        <ul className="flex flex-col gap-2">
          {instructions.map((line, i) => (
            <li key={i} className="flex gap-2 text-gray-300 text-sm leading-relaxed">
              <span className="text-emerald-400 font-bold mt-0.5">•</span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
        <button
          onClick={onStart}
          className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-white font-bold rounded-lg transition-colors touch-manipulation"
        >
          {buttonText}
        </button>
      </motion.div>
    </div>
  );
}

// ── Main Experiment ────────────────────────────────────────────────────────
export default function ExperimentPage() {
  const router = useRouter();
  const [language, setLanguage] = useState<'en' | 'he'>('he');
  const [sessionId, setSessionId] = useState('');
  const [participantName, setParticipantName] = useState('');
  const [part, setPart] = useState<ExperimentPart>('aut-intro');

  // AUT state
  const [autObjectIdx, setAutObjectIdx] = useState(0);
  const [autTimeLeft, setAutTimeLeft] = useState(AUT_TIME_PER_OBJECT_MS);
  const [autInput, setAutInput] = useState('');
  const [autUses, setAutUses] = useState<string[]>([]);
  const autStartRef = useRef(0);
  const autInputRef = useRef<HTMLInputElement>(null);

  // Circles state
  const [circleIdx, setCircleIdx] = useState(0);
  const [circlesTimeLeft, setCirclesTimeLeft] = useState(CIRCLES_TIME_MS);
  const [circleLabel, setCircleLabel] = useState('');
  const [circleDrawing, setCircleDrawing] = useState('');
  const [circlesCompleted, setCirclesCompleted] = useState(0);
  const circlesStartRef = useRef(0);
  const circleTrialStartRef = useRef(0);
  const circleLabelRef = useRef<HTMLInputElement>(null);

  // RAT state
  const [ratIdx, setRatIdx] = useState(0);
  const [ratTimeLeft, setRatTimeLeft] = useState(RAT_TIME_MS);
  const [ratInput, setRatInput] = useState('');
  const [ratSolved, setRatSolved] = useState(0);
  const ratStartRef = useRef(0);
  const ratTrialStartRef = useRef(0);
  const ratInputRef = useRef<HTMLInputElement>(null);

  const isHe = language === 'he';

  useEffect(() => {
    const sid = sessionStorage.getItem(`${KEY}_session_id`) || crypto.randomUUID();
    const pname = sessionStorage.getItem(`${KEY}_participant_name`) || '';
    const lang = sessionStorage.getItem(`${KEY}_language`) as 'en' | 'he' | null;
    setSessionId(sid);
    setParticipantName(pname);
    if (lang) setLanguage(lang);
  }, []);

  // ── AUT Timer ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (part !== 'aut') return;
    const interval = setInterval(() => {
      const elapsed = Date.now() - autStartRef.current;
      const remaining = AUT_TIME_PER_OBJECT_MS - elapsed;
      setAutTimeLeft(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
        if (autObjectIdx < AUT_OBJECTS.length - 1) {
          setAutObjectIdx(i => i + 1);
          setAutUses([]);
          setAutInput('');
          autStartRef.current = Date.now();
          setAutTimeLeft(AUT_TIME_PER_OBJECT_MS);
          setTimeout(() => autInputRef.current?.focus(), 50);
        } else {
          setPart('circles-intro');
        }
      }
    }, 200);
    return () => clearInterval(interval);
  }, [part, autObjectIdx]);

  // ── Circles Timer ──────────────────────────────────────────────────────
  useEffect(() => {
    if (part !== 'circles') return;
    const interval = setInterval(() => {
      const elapsed = Date.now() - circlesStartRef.current;
      const remaining = CIRCLES_TIME_MS - elapsed;
      setCirclesTimeLeft(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
        setPart('rat-intro');
      }
    }, 200);
    return () => clearInterval(interval);
  }, [part]);

  // ── RAT Timer ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (part !== 'rat') return;
    const interval = setInterval(() => {
      const elapsed = Date.now() - ratStartRef.current;
      const remaining = RAT_TIME_MS - elapsed;
      setRatTimeLeft(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
        finishExperiment();
      }
    }, 200);
    return () => clearInterval(interval);
  }, [part]);

  // ── AUT: submit a use ─────────────────────────────────────────────────
  const submitAUTUse = useCallback(async () => {
    const text = autInput.trim();
    if (!text || part !== 'aut') return;
    const timeInTask = Date.now() - autStartRef.current;
    const obj = AUT_OBJECTS[autObjectIdx];

    setAutUses(prev => [...prev, text]);
    setAutInput('');

    const sb = getSupabase();
    if (sb) {
      await sb.from('creativity_aut_results').insert({
        session_id: sessionId,
        participant_name: participantName,
        language,
        object_index: obj.index,
        object_name: obj.nameEn,
        use_index: autUses.length,
        use_text: text,
        time_in_task_ms: timeInTask,
        is_practice: false,
      });
    }

    setTimeout(() => autInputRef.current?.focus(), 50);
  }, [autInput, part, autObjectIdx, autUses.length, sessionId, participantName, language]);

  // ── Circles: submit a circle ──────────────────────────────────────────
  const submitCircle = useCallback(async () => {
    const label = circleLabel.trim();
    if (!label || part !== 'circles') return;
    if (!circleDrawing) return;

    const responseTime = Date.now() - circleTrialStartRef.current;
    const timeInTask = Date.now() - circlesStartRef.current;

    const sb = getSupabase();
    if (sb) {
      await sb.from('creativity_circles_results').insert({
        session_id: sessionId,
        participant_name: participantName,
        language,
        circle_index: circleIdx,
        label,
        drawing_data: circleDrawing,
        response_time_ms: responseTime,
        time_in_task_ms: timeInTask,
        is_practice: false,
      });
    }

    const nextIdx = circleIdx + 1;
    setCirclesCompleted(c => c + 1);
    setCircleLabel('');
    setCircleDrawing('');

    if (nextIdx >= CIRCLES_TOTAL) {
      setPart('rat-intro');
    } else {
      setCircleIdx(nextIdx);
      circleTrialStartRef.current = Date.now();
    }
  }, [circleLabel, circleDrawing, part, circleIdx, sessionId, participantName, language]);

  // ── RAT: submit answer ────────────────────────────────────────────────
  const submitRAT = useCallback(async (skipped: boolean) => {
    if (part !== 'rat') return;
    const triplet = RAT_TRIPLETS[ratIdx];
    if (!triplet) return;

    const response = skipped ? '' : ratInput.trim();
    const correct = !skipped && checkRATAnswer(response, triplet.solution);
    const responseTime = Date.now() - ratTrialStartRef.current;

    if (correct) setRatSolved(s => s + 1);

    const sb = getSupabase();
    if (sb) {
      await sb.from('creativity_rat_results').insert({
        session_id: sessionId,
        participant_name: participantName,
        language,
        triplet_index: triplet.index,
        triplet_words: triplet.words.join(' / '),
        response: response || null,
        is_correct: correct,
        skipped,
        response_time_ms: responseTime,
        is_practice: false,
      });
    }

    setRatInput('');
    const nextIdx = ratIdx + 1;
    if (nextIdx >= RAT_TRIPLETS.length) {
      finishExperiment();
    } else {
      setRatIdx(nextIdx);
      ratTrialStartRef.current = Date.now();
      setTimeout(() => ratInputRef.current?.focus(), 50);
    }
  }, [part, ratIdx, ratInput, sessionId, participantName, language]);

  const finishExperiment = () => {
    sessionStorage.setItem(`${KEY}_completed`, '1');
    router.push('/creativity/thanks');
  };

  // ── Intro texts ────────────────────────────────────────────────────────
  const autIntro = isHe ? {
    title: 'חלק 1 — שימושים חלופיים',
    instructions: [
      'עבור כל חפץ, רשמו כמה שיותר שימושים שונים שאתם יכולים לחשוב עליהם.',
      'השימושים יכולים להיות יוצאי דופן או יצירתיים — אין תשובות שגויות.',
      'הקלידו כל שימוש ולחצו אנטר.',
      'יש לכם דקה לכל חפץ (4 חפצים).',
    ],
    button: 'התחילו',
  } : {
    title: 'Part 1 — Alternative Uses',
    instructions: [
      'For each everyday object, list as many different uses as you can.',
      'They can be unusual or creative — there are no wrong answers.',
      'Type each use and press enter.',
      'You have 1 minute per object (4 objects).',
    ],
    button: 'Start',
  };

  const circlesIntro = isHe ? {
    title: 'חלק 2 — עיגולים',
    instructions: [
      'לפניכם עיגולים ריקים.',
      'הפכו כמה שיותר מהם לציורים של דברים אמיתיים — שכל עיגול יהיה חלק מחפץ מזוהה.',
      'אחרי כל ציור, הקלידו תווית קצרה שמתארת מה זה.',
      'עבדו במהירות; יש לכם 6 דקות.',
    ],
    button: 'התחילו',
  } : {
    title: 'Part 2 — Circles',
    instructions: [
      'Below are empty circles.',
      'Turn as many as you can into drawings of real things — make each circle part of a recognizable object.',
      'After each drawing, type a short label for what it is.',
      'Work quickly; you have 6 minutes.',
    ],
    button: 'Start',
  };

  const ratIntro = isHe ? {
    title: 'חלק 3 — מילה מקשרת',
    instructions: [
      'עבור כל שלישיית מילים, מצאו את המילה היחידה שמתחברת לכל שלוש.',
      'היא יכולה ליצור צירוף או מילה מורכבת עם כל אחת מהשלוש.',
      'הקלידו את התשובה ולחצו שלח, או דלגו למילה הבאה.',
      'פתרו כמה שאתם יכולים ב-5 דקות.',
      'דוגמה: COTTAGE / SWISS / CAKE → CHEESE',
      '(cottage cheese, Swiss cheese, cheesecake)',
    ],
    button: 'התחילו',
  } : {
    title: 'Part 3 — Remote Associates',
    instructions: [
      'For each set of three words, find the single word that connects to all three.',
      'It may form a phrase or compound with each.',
      'Type your answer and submit, or skip to the next.',
      'Solve as many as you can in 5 minutes.',
      'Example: COTTAGE / SWISS / CAKE → CHEESE',
      '(cottage cheese, Swiss cheese, cheesecake)',
    ],
    button: 'Start',
  };

  // ── AUT Intro ──────────────────────────────────────────────────────────
  if (part === 'aut-intro') {
    return (
      <div dir={isHe ? 'rtl' : 'ltr'}>
        <IntroScreen
          title={autIntro.title}
          instructions={autIntro.instructions}
          buttonText={autIntro.button}
          onStart={() => {
            autStartRef.current = Date.now();
            setAutTimeLeft(AUT_TIME_PER_OBJECT_MS);
            setPart('aut');
            setTimeout(() => autInputRef.current?.focus(), 100);
          }}
        />
      </div>
    );
  }

  // ── AUT Task ───────────────────────────────────────────────────────────
  if (part === 'aut') {
    const obj = AUT_OBJECTS[autObjectIdx];
    const objectName = isHe ? obj.nameHe : obj.nameEn;
    const locked = autTimeLeft <= 0;

    return (
      <div
        className="bg-[#0f172a] flex flex-col px-4 py-6"
        style={{ height: '100dvh' }}
        dir={isHe ? 'rtl' : 'ltr'}
      >
        <div className="flex-shrink-0 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-400 text-xs">
              {isHe ? `חפץ ${autObjectIdx + 1} מתוך 4` : `Object ${autObjectIdx + 1} of 4`}
            </span>
            <span className="text-gray-400 text-xs">
              {autUses.length} {isHe ? 'שימושים' : 'uses'}
            </span>
          </div>
          <TimerBar remaining={autTimeLeft} total={AUT_TIME_PER_OBJECT_MS} />
        </div>

        <div className="text-center mb-4">
          <h2 className="text-3xl font-bold text-white">{objectName}</h2>
          <p className="text-gray-400 text-sm mt-1">
            {isHe ? 'רשמו שימושים שונים לחפץ הזה' : 'List different uses for this object'}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto mb-4">
          {autUses.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {autUses.map((use, i) => (
                <div key={i} className="bg-gray-800/50 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200">
                  <span className="text-emerald-400 font-mono mr-2">{i + 1}.</span>
                  {use}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex-shrink-0 flex gap-2">
          <input
            ref={autInputRef}
            type="text"
            value={autInput}
            onChange={e => setAutInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submitAUTUse()}
            disabled={locked}
            placeholder={isHe ? 'הקלידו שימוש...' : 'Type a use...'}
            className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder:text-gray-500 focus:outline-none focus:border-emerald-400 disabled:opacity-50"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
          />
          <button
            onClick={submitAUTUse}
            disabled={locked || !autInput.trim()}
            className="px-5 py-3 bg-emerald-500 hover:bg-emerald-400 text-white font-bold rounded-lg transition-colors disabled:opacity-50 touch-manipulation"
          >
            +
          </button>
        </div>
      </div>
    );
  }

  // ── Circles Intro ──────────────────────────────────────────────────────
  if (part === 'circles-intro') {
    return (
      <div dir={isHe ? 'rtl' : 'ltr'}>
        <IntroScreen
          title={circlesIntro.title}
          instructions={circlesIntro.instructions}
          buttonText={circlesIntro.button}
          onStart={() => {
            circlesStartRef.current = Date.now();
            circleTrialStartRef.current = Date.now();
            setCirclesTimeLeft(CIRCLES_TIME_MS);
            setPart('circles');
          }}
        />
      </div>
    );
  }

  // ── Circles Task ───────────────────────────────────────────────────────
  if (part === 'circles') {
    const locked = circlesTimeLeft <= 0;
    const canvasSize = Math.min(280, typeof window !== 'undefined' ? window.innerWidth - 64 : 280);

    return (
      <div
        className="bg-[#0f172a] flex flex-col px-4 py-6"
        style={{ height: '100dvh', touchAction: 'none', overscrollBehavior: 'none' }}
        dir={isHe ? 'rtl' : 'ltr'}
      >
        <div className="flex-shrink-0 mb-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-400 text-xs">
              {isHe ? `עיגול ${circleIdx + 1}` : `Circle ${circleIdx + 1}`}
            </span>
            <span className="text-gray-400 text-xs">
              {circlesCompleted} {isHe ? 'הושלמו' : 'completed'}
            </span>
          </div>
          <TimerBar remaining={circlesTimeLeft} total={CIRCLES_TIME_MS} />
        </div>

        <div className="flex-1 flex flex-col items-center justify-center gap-4 overflow-y-auto">
          <DrawingCanvas
            key={circleIdx}
            size={canvasSize}
            onDrawingChange={setCircleDrawing}
          />

          <div className="w-full max-w-xs flex flex-col gap-2">
            <input
              ref={circleLabelRef}
              type="text"
              value={circleLabel}
              onChange={e => setCircleLabel(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submitCircle()}
              disabled={locked}
              placeholder={isHe ? 'מה ציירתם? (תווית)' : 'What did you draw? (label)'}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder:text-gray-500 focus:outline-none focus:border-emerald-400 disabled:opacity-50"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
            />
            <button
              onClick={submitCircle}
              disabled={locked || !circleLabel.trim() || !circleDrawing}
              className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-white font-bold rounded-lg transition-colors disabled:opacity-50 touch-manipulation"
            >
              {isHe ? 'שלחו והמשיכו' : 'Submit & Next'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── RAT Intro ──────────────────────────────────────────────────────────
  if (part === 'rat-intro') {
    return (
      <div dir={isHe ? 'rtl' : 'ltr'}>
        <IntroScreen
          title={ratIntro.title}
          instructions={ratIntro.instructions}
          buttonText={ratIntro.button}
          onStart={() => {
            ratStartRef.current = Date.now();
            ratTrialStartRef.current = Date.now();
            setRatTimeLeft(RAT_TIME_MS);
            setPart('rat');
            setTimeout(() => ratInputRef.current?.focus(), 100);
          }}
        />
      </div>
    );
  }

  // ── RAT Task ───────────────────────────────────────────────────────────
  if (part === 'rat') {
    const triplet = RAT_TRIPLETS[ratIdx];
    const locked = ratTimeLeft <= 0;

    if (!triplet) {
      finishExperiment();
      return null;
    }

    return (
      <div
        className="bg-[#0f172a] flex flex-col px-4 py-6"
        style={{ height: '100dvh' }}
        dir="ltr"
      >
        <div className="flex-shrink-0 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-400 text-xs">
              Triplet {ratIdx + 1} of {RAT_TRIPLETS.length}
            </span>
            <span className="text-gray-400 text-xs">
              {ratSolved} solved
            </span>
          </div>
          <TimerBar remaining={ratTimeLeft} total={RAT_TIME_MS} />
        </div>

        <div className="flex-1 flex flex-col items-center justify-center gap-8">
          <div className="flex items-center gap-4 text-center">
            {triplet.words.map((word, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span className="text-gray-500 text-xl">/</span>}
                <span className="text-2xl font-bold text-white font-mono tracking-wide">{word}</span>
              </React.Fragment>
            ))}
          </div>

          <div className="w-full max-w-sm flex flex-col gap-3">
            <input
              ref={ratInputRef}
              type="text"
              value={ratInput}
              onChange={e => setRatInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && ratInput.trim() && submitRAT(false)}
              disabled={locked}
              placeholder="Type the linking word..."
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 text-white text-center text-lg font-mono placeholder:text-gray-500 focus:outline-none focus:border-emerald-400 disabled:opacity-50"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
            />
            <div className="flex gap-2">
              <button
                onClick={() => submitRAT(false)}
                disabled={locked || !ratInput.trim()}
                className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-400 text-white font-bold rounded-lg transition-colors disabled:opacity-50 touch-manipulation"
              >
                {isHe ? 'שלחו' : 'Submit'}
              </button>
              <button
                onClick={() => submitRAT(true)}
                disabled={locked}
                className="px-5 py-3 bg-gray-700 hover:bg-gray-600 text-gray-300 font-bold rounded-lg transition-colors disabled:opacity-50 touch-manipulation"
              >
                {isHe ? 'דלגו' : 'Skip'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Done (fallback, should redirect) ───────────────────────────────────
  return null;
}
