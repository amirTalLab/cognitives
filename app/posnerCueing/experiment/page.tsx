'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { PosnerTrial, PosnerResult } from '@/types/posner-cueing';
import { generatePracticeTrials, generateMainTrials } from '@/lib/posner-cueing/experiment';
import { getSupabase } from '@/lib/supabase';

type Phase =
  | 'loading'
  | 'fixation'
  | 'cue'
  | 'target'
  | 'feedback'
  | 'iti'
  | 'practice_break'
  | 'complete';

export default function PosnerExperimentPage() {
  const router = useRouter();

  // UI state
  const [phase, setPhase] = useState<Phase>('loading');
  const [feedbackMsg, setFeedbackMsg] = useState('');
  const [mainProgress, setMainProgress] = useState(0);
  const [isPracticeUI, setIsPracticeUI] = useState(true);
  // Chosen on the landing page; the arrows and target are language-neutral, so only the
  // surrounding text changes.
  const [isHe, setIsHe] = useState(true);
  // Also a ref: the feedback messages are set from timing-critical callbacks, and reading
  // the ref keeps those callbacks' dependency lists exactly as they were.
  const isHeRef = useRef(true);

  // Refs
  const phaseRef = useRef<Phase>('loading');
  const isPracticeRef = useRef(true);
  const trialIndexRef = useRef(0);
  const currentTrialRef = useRef<PosnerTrial | null>(null);
  const startTimeRef = useRef<number>(0);
  const resultsRef = useRef<PosnerResult[]>([]);
  const trialsRef = useRef<PosnerTrial[]>([]);
  const mainTrialsRef = useRef<PosnerTrial[]>([]);
  const sessionIdRef = useRef('');
  const participantNameRef = useRef('');
  const mainTrialCountRef = useRef(0);
  const missTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const catchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setPhaseSync = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  // ── Save result ──────────────────────────────────────────────────────────
  const saveResult = useCallback(
    (trial: PosnerTrial, response: string, correct: boolean, rt: number | null) => {
      const result: PosnerResult = {
        session_id: sessionIdRef.current,
        participant_name: participantNameRef.current,
        trial_number: trial.id,
        cue_direction: trial.cueDirection,
        target_side: trial.targetSide ?? 'none',
        validity: trial.validity,
        soa: trial.soa,
        response,
        correct,
        rt_ms: rt,
        is_practice: trial.isPractice,
      };
      resultsRef.current.push(result);
      const supabase = getSupabase();
      if (supabase) {
        supabase.from('posner_results').insert(result).then(({ error }) => {
          if (error) console.error('Supabase insert error:', error);
        });
      }
    },
    [],
  );

  // ── Advance trial ────────────────────────────────────────────────────────
  const advanceTrial = useCallback(() => {
    const trials = trialsRef.current;
    const nextIndex = trialIndexRef.current + 1;

    if (nextIndex >= trials.length) {
      if (isPracticeRef.current) { setPhaseSync('practice_break'); return; }
      else { setPhaseSync('complete'); return; }
    }

    trialIndexRef.current = nextIndex;
    currentTrialRef.current = trials[nextIndex];

    if (!isPracticeRef.current) {
      mainTrialCountRef.current += 1;
      setMainProgress(mainTrialCountRef.current);
    }

    const fixDuration = 800 + Math.floor(Math.random() * 401);
    setPhaseSync('fixation');

    setTimeout(() => {
      if (phaseRef.current !== 'fixation') return;
      const trial = currentTrialRef.current!;
      setPhaseSync('cue');

      setTimeout(() => {
        if (phaseRef.current !== 'cue') return;
        if (trial.validity === 'catch') {
          setPhaseSync('target');
          const catchTimeout = setTimeout(() => {
            if (phaseRef.current !== 'target') return;
            if (!trial.isPractice) saveResult(trial, 'none', true, null);
            setPhaseSync('iti');
            setTimeout(() => { if (phaseRef.current !== 'iti') return; advanceTrial(); }, 600);
          }, 1500);
          catchTimeoutRef.current = catchTimeout;
        } else {
          setPhaseSync('target');
          startTimeRef.current = performance.now();
          const missTimeout = setTimeout(() => {
            if (phaseRef.current !== 'target') return;
            if (!trial.isPractice) saveResult(trial, 'miss', false, null);
            setFeedbackMsg(isHeRef.current ? 'פספסת — נסו ללחוץ מהר יותר!' : 'Missed — try to respond faster!');
            setPhaseSync('feedback');
            setTimeout(() => {
              if (phaseRef.current !== 'feedback') return;
              setPhaseSync('iti');
              setTimeout(() => { if (phaseRef.current !== 'iti') return; advanceTrial(); }, 600);
            }, 500);
          }, 1500);
          missTimeoutRef.current = missTimeout;
        }
      }, trial.soa);
    }, fixDuration);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Unified response handler ─────────────────────────────────────────────
  const handleResponse = useCallback(() => {
    const p = phaseRef.current;
    const trial = currentTrialRef.current;
    if (!trial) return;

    if (p === 'fixation' || p === 'cue') {
      if (missTimeoutRef.current) clearTimeout(missTimeoutRef.current);
      if (catchTimeoutRef.current) clearTimeout(catchTimeoutRef.current);
      setFeedbackMsg(isHeRef.current ? 'מוקדם מדי — המתינו ל-●!' : 'Too early — wait for the ●!');
      setPhaseSync('feedback');
      setTimeout(() => {
        if (phaseRef.current !== 'feedback') return;
        setPhaseSync('iti');
        setTimeout(() => { if (phaseRef.current !== 'iti') return; advanceTrial(); }, 600);
      }, 500);
      return;
    }

    if (p === 'target') {
      if (trial.validity === 'catch') {
        if (catchTimeoutRef.current) clearTimeout(catchTimeoutRef.current);
        if (!trial.isPractice) saveResult(trial, 'false_alarm', false, null);
        setFeedbackMsg(isHeRef.current ? 'לא היה יעד — אין ללחוץ!' : 'No target — do not press!');
        setPhaseSync('feedback');
        setTimeout(() => {
          if (phaseRef.current !== 'feedback') return;
          setPhaseSync('iti');
          setTimeout(() => { if (phaseRef.current !== 'iti') return; advanceTrial(); }, 600);
        }, 500);
      } else {
        const rt = performance.now() - startTimeRef.current;
        if (missTimeoutRef.current) clearTimeout(missTimeoutRef.current);
        if (!trial.isPractice) saveResult(trial, 'hit', true, Math.round(rt));
        setPhaseSync('iti');
        setTimeout(() => { if (phaseRef.current !== 'iti') return; advanceTrial(); }, 600);
      }
    }
  }, [advanceTrial, saveResult, setPhaseSync]);

  // ── Keyboard ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      e.preventDefault();
      handleResponse();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleResponse]);

  // ── Initialise ───────────────────────────────────────────────────────────
  useEffect(() => {
    const sid = sessionStorage.getItem('posner_session_id') ?? '';
    const name = sessionStorage.getItem('posner_participant_name') ?? '';
    if (!sid) { router.push('/posnerCueing'); return; }
    const he = sessionStorage.getItem('posner_language') !== 'en';
    setIsHe(he);
    isHeRef.current = he;
    sessionIdRef.current = sid;
    participantNameRef.current = name;

    const practiceTrials = generatePracticeTrials();
    const mainTrials = generateMainTrials();
    mainTrialsRef.current = mainTrials;
    trialsRef.current = practiceTrials;
    isPracticeRef.current = true;
    setIsPracticeUI(true);
    trialIndexRef.current = -1;
    advanceTrial();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Complete ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase === 'complete') {
      sessionStorage.setItem('posner_results', JSON.stringify(resultsRef.current));
      router.push('/posnerCueing/thanks');
    }
  }, [phase, router]);

  // ── Start main trials ────────────────────────────────────────────────────
  const startMainTrials = useCallback(() => {
    trialsRef.current = mainTrialsRef.current;
    isPracticeRef.current = false;
    setIsPracticeUI(false);
    trialIndexRef.current = -1;
    mainTrialCountRef.current = 0;
    setMainProgress(0);
    advanceTrial();
  }, [advanceTrial]);

  // ── Derived display ──────────────────────────────────────────────────────
  const trial = currentTrialRef.current;
  const showCue = phase === 'cue' || phase === 'target';
  const showTarget = phase === 'target' && trial?.validity !== 'catch';
  const isExoTrial = trial?.validity === 'exo_invalid';
  const showExoRect = showCue && isExoTrial;
  const cueSymbol = isExoTrial ? '+' : trial?.cueDirection === 'left' ? '←' : trial?.cueDirection === 'right' ? '→' : '+';
  const centerSymbol = phase === 'fixation' ? '+' : showCue ? cueSymbol : phase === 'iti' ? '' : '+';
  const progressPct = mainTrialsRef.current.length > 0 ? (mainProgress / mainTrialsRef.current.length) * 100 : 0;
  const showResponseButton = phase === 'fixation' || phase === 'cue' || phase === 'target';

  // ── Render ───────────────────────────────────────────────────────────────
  if (phase === 'loading') {
    return (
      <main className="min-h-screen bg-zinc-900 flex items-center justify-center">
        <p className="text-white text-xl">{isHe ? 'טוען…' : 'Loading…'}</p>
      </main>
    );
  }

  if (phase === 'practice_break') {
    return (
      <main className="min-h-screen bg-zinc-900 flex flex-col items-center justify-center gap-8 p-8">
        <div className="text-center" dir={isHe ? 'rtl' : 'ltr'}>
          <p className="text-4xl mb-4">✓</p>
          <h2 className="text-3xl font-bold text-amber-400 mb-3">{isHe ? 'התרגול הסתיים!' : 'Practice complete!'}</h2>
          <p className="text-white text-lg mb-2">{isHe ? 'עכשיו יתחיל הניסוי האמיתי.' : 'The real experiment starts now.'}</p>
          <p className="text-zinc-400 text-sm">{isHe ? '132 ניסיונות' : '132 trials'}</p>
        </div>
        <button
          onClick={startMainTrials}
          className="px-10 py-4 bg-amber-400 hover:bg-amber-300 text-zinc-900 font-bold text-xl rounded-xl transition-colors touch-manipulation"
        >
          {isHe ? 'התחל' : 'Start'}
        </button>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-900 flex flex-col select-none" style={{ touchAction: 'manipulation' }}>
      {/* ── Top bar ── */}
      <div className="flex-shrink-0 h-6">
        {!isPracticeUI && (
          <div className="h-1.5 bg-zinc-700">
            <div className="h-full bg-amber-400 transition-all duration-300" style={{ width: `${progressPct}%` }} />
          </div>
        )}
        {isPracticeUI && (
          <div className="flex justify-center pt-1">
            <span className="text-xs text-amber-400 bg-zinc-800 px-3 py-0.5 rounded-full border border-amber-400/30">
              {isHe ? 'תרגול' : 'Practice'}
            </span>
          </div>
        )}
      </div>

      {/* ── Centre: stimulus area ── */}
      <div className="flex-1 flex items-center justify-center overflow-hidden">
        <div className="flex items-center gap-4 sm:gap-12 md:gap-16 w-full px-4 justify-center">
          {/* Left box */}
          <div
            className={`flex-shrink-0 rounded-lg flex items-center justify-center transition-colors duration-75
              ${showExoRect && trial?.cueDirection === 'left' ? 'border-4 border-red-500' : 'border-2 border-zinc-500'}`}
            style={{ width: 'clamp(72px, 22vw, 128px)', height: 'clamp(72px, 22vw, 128px)' }}
          >
            {showTarget && trial?.targetSide === 'left' && (
              <span className="text-white font-bold" style={{ fontSize: 'clamp(28px, 8vw, 40px)' }}>●</span>
            )}
          </div>

          {/* Centre cue */}
          <div className="flex-shrink-0 text-center" style={{ width: 'clamp(40px, 12vw, 72px)' }}>
            <span className="text-white font-bold select-none" style={{ fontSize: 'clamp(24px, 7vw, 40px)' }}>
              {centerSymbol}
            </span>
          </div>

          {/* Right box */}
          <div
            className={`flex-shrink-0 rounded-lg flex items-center justify-center transition-colors duration-75
              ${showExoRect && trial?.cueDirection === 'right' ? 'border-4 border-red-500' : 'border-2 border-zinc-500'}`}
            style={{ width: 'clamp(72px, 22vw, 128px)', height: 'clamp(72px, 22vw, 128px)' }}
          >
            {showTarget && trial?.targetSide === 'right' && (
              <span className="text-white font-bold" style={{ fontSize: 'clamp(28px, 8vw, 40px)' }}>●</span>
            )}
          </div>
        </div>
      </div>

      {/* ── Bottom: feedback + response button ── */}
      <div className="flex-shrink-0 flex flex-col items-center gap-3 px-8 pb-8 pt-4">
        {phase === 'feedback' && (
          <span className="text-red-400 text-lg font-bold" dir="rtl">{feedbackMsg}</span>
        )}
        {showResponseButton && (
          <button
            onPointerDown={(e) => { e.preventDefault(); handleResponse(); }}
            className="w-full max-w-xs h-16 bg-amber-400 text-zinc-900 font-bold text-xl rounded-2xl
                       shadow-lg shadow-amber-400/30 active:scale-95 transition-transform touch-manipulation select-none"
          >
            {isHe ? '● לחצו' : '● Press'}
          </button>
        )}
        {!showResponseButton && phase !== 'feedback' && <div className="h-16" />}
      </div>
    </main>
  );
}
