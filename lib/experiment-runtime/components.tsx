'use client';

// The escape hatch: phases that cannot be declared.
//
// Read component-names.ts before adding anything here — it holds the rule for when a phase
// is allowed to be code, and the reason the list should stay short. Everything in this file
// is a phase that breaks one of the runtime's three assumptions, never a phase that was
// merely awkward to express.
//
// A component is reached by NAME from the fixed map at the bottom. A definition never names
// a path and never carries code, so a published row — which is data from a database — can at
// worst name nothing, which the validator reports and the runner renders as a message.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ComponentType } from 'react';
import { NO_RESPONSE } from './trials';
import {
  CYCLE_FRAMES, FACE_H_RATIO, FACE_OFFSET_RATIO, FACE_W_RATIO, FRAME_ASPECT,
  MASK_FRAMES, MAX_CONTRAST, RAMP_MS, RESCUE_DUR_MS, RESCUE_END_MS, RESCUE_START_MS,
  COIN_DIAMETER_MM, STIMULUS_SET, generateMondrianPool, getFaceUrl,
} from '../brms-emotion/stimuli';
import type { Emotion, Orientation } from '../../types/brms-emotion';

/** What every phase component is handed, and how it gives a trial back. */
export interface PhaseComponentProps {
  /** This trial's factor values, for a component that varies with them. */
  values: Record<string, unknown>;
  language: 'he' | 'en';
  practice: boolean;
  /**
   * Ends the phase.
   *
   * `response` is the trial's answer, scored by the definition's rule like any other.
   * `payload` adds columns to this trial's row — which a component usually needs: bRMS
   * records whether its frame timing held, and the rule task records every triple that was
   * tested, none of which is a "response".
   */
  onDone: (result: { response?: string; payload?: Record<string, unknown> }) => void;
}

// ─── Wason 2-4-6 ──────────────────────────────────────────────────────────────
//
// Original: app/logics/experiment/page.tsx (RuleScreen) and lib/logics/questions.ts.
//
// The participant is given 2-4-6, told it fits a rule, and may test up to five triples of
// their own to work out what the rule is. The rule is simply "ascending", and almost nobody
// finds it — because almost nobody tests a triple they expect to FAIL. That is the finding:
// people seek confirmation, so they never discover that their hypothesis is narrower than
// the truth.
//
// This is here rather than in a definition because the participant authors the stimulus.
// There are no trials to plan: the numbers come from them, and the answer is a predicate on
// what they typed, not a comparison against a value chosen in advance.

const ascending = (a: number, b: number, c: number) => a < b && b < c;

const WASON_TEXT = {
  en: {
    test: 'Test',
    fits: 'Fits ✓',
    unfits: "Doesn't fit ✗",
    tested: (n: number) => `${n}/5 sequences tested`,
    ready: 'I am ready to guess the rule',
    guess: 'What is the rule?',
    placeholder: 'The rule is...',
    submit: 'Submit',
  },
  he: {
    test: 'בדיקה',
    fits: 'תואם ✓',
    unfits: 'לא תואם ✗',
    tested: (n: number) => `${n}/5 סדרות נבדקו`,
    ready: 'אני מוכן/ה לנחש את הכלל',
    guess: 'מהו הכלל?',
    placeholder: 'הכלל הוא...',
    submit: 'שליחה',
  },
};

const MAX_TRIPLES = 5;

function WasonRuleDiscovery({ language, onDone }: PhaseComponentProps) {
  const t = WASON_TEXT[language];
  const rtl = language === 'he';
  const [tested, setTested] = useState<{ numbers: number[]; fits: boolean }[]>([]);
  const [inputs, setInputs] = useState(['', '', '']);
  const [guessing, setGuessing] = useState(false);
  const [guess, setGuess] = useState('');

  const valid = inputs.every(s => s.trim() !== '' && !Number.isNaN(Number(s)));
  const canTest = tested.length < MAX_TRIPLES && !guessing;

  const test = () => {
    const [a, b, c] = inputs.map(Number);
    setTested(prev => [...prev, { numbers: [a, b, c], fits: ascending(a, b, c) }]);
    setInputs(['', '', '']);
  };

  const submit = () => {
    if (!guess.trim()) return;
    // Every triple goes with the answer. What people TESTED is the whole finding — a
    // participant who only ever tried ascending triples never gave the rule a chance to say
    // no — and none of it is recoverable from the guess alone.
    onDone({
      response: guess.trim(),
      payload: {
        rule_triples: JSON.stringify(tested),
        triples_tested: tested.length,
        // A triple the participant expected to fail is the one that could have taught them
        // something. Counted here rather than in the dashboard so the CSV carries it too.
        disconfirming_tests: tested.filter(tr => !tr.fits).length,
        found_rule: /ascend|increas|larger|bigger|עול|גדל|עולה/i.test(guess),
      },
    });
  };

  return (
    <div className="flex flex-col gap-5 w-full max-w-lg" dir={rtl ? 'rtl' : 'ltr'}>
      {tested.length > 0 && (
        <div className="flex flex-col gap-1">
          {tested.map((tr, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <span className="text-gray-300 font-mono">{tr.numbers.join(' – ')}</span>
              <span className={tr.fits ? 'text-emerald-400' : 'text-red-400'}>
                {tr.fits ? t.fits : t.unfits}
              </span>
            </div>
          ))}
        </div>
      )}

      {!guessing && (
        <>
          {canTest && (
            <div className="flex items-center gap-2">
              {[0, 1, 2].map(i => (
                <input key={i} type="text" inputMode="numeric" value={inputs[i]}
                  onChange={e => setInputs(prev => prev.map((v, j) => (j === i ? e.target.value : v)))}
                  placeholder={`#${i + 1}`}
                  className="w-20 px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-center outline-none focus:border-emerald-400" />
              ))}
              <button onClick={test} disabled={!valid}
                className={`px-4 py-2 rounded-lg font-semibold touch-manipulation ${valid
                  ? 'bg-blue-500 hover:bg-blue-400 text-white'
                  : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}>
                {t.test}
              </button>
            </div>
          )}

          <p className="text-gray-500 text-xs">{t.tested(tested.length)}</p>

          <button onClick={() => setGuessing(true)}
            className="w-full py-3 bg-gray-700 hover:bg-gray-600 text-gray-200 font-semibold rounded-xl touch-manipulation">
            {t.ready}
          </button>
        </>
      )}

      {guessing && (
        <>
          <p className="text-gray-300 text-sm font-semibold">{t.guess}</p>
          <input type="text" value={guess} autoFocus
            onChange={e => setGuess(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()}
            placeholder={t.placeholder}
            className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-xl text-white placeholder-gray-500 outline-none focus:border-emerald-400" />
          <button onClick={submit} disabled={!guess.trim()}
            className={`w-full py-3 rounded-xl font-bold touch-manipulation ${guess.trim()
              ? 'bg-emerald-500 hover:bg-emerald-400 text-white'
              : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}>
            {t.submit}
          </button>
        </>
      )}
    </div>
  );
}


// ─── Continuous flash suppression ─────────────────────────────────────────────
//
// Original: app/bRMS/experiment/page.tsx and lib/brms-emotion/stimuli.ts.
//
// A face is shown to one eye while the other gets a stream of high-contrast Mondrian masks.
// The masks win: the face is invisible, and stays invisible until it does not — the measure
// is how long that takes (breakthrough time). Fearful faces break through faster than happy
// or neutral ones, and inverted faces slower, which is the argument that something processes
// emotion before you are aware of the face at all.
//
// THIS IS THE ESCAPE HATCH'S SECOND CASE, and it is the clearest one. The suppression is a
// per-FRAME contract: masks for four frames, face for two, at 60Hz, with the face's contrast
// ramping over exactly three seconds. A declarative phase with a duration cannot say that,
// and a phase that ran a frame or two long would let the face through early and shorten the
// very number being measured. See docs/ESCAPE-HATCH.md.
//
// Everything AROUND it is ordinary: the trials are crossed factors, the rows are a spine and
// a payload, and the dashboard is bar charts. Only this is code.

const MONDRIAN_POOL_SIZE = 20;
const MONDRIAN_CAP_W = 640;
/** Above this share of irregular frames the trial's timing is not trustworthy. */
const TIMING_TOLERANCE = 0.15;

function BRMSSuppression({ values, language, onDone }: PhaseComponentProps) {
  const rtl = language === 'he';
  const emotion = String(values.emotion ?? 'neutral') as Emotion;
  const orientation = String(values.orientation ?? 'upright') as Orientation;
  const identityId = String(values.identity ?? '1');
  const side = String(values.side ?? 'left');

  const maskRef = useRef<HTMLCanvasElement>(null);
  const faceRef = useRef<HTMLImageElement>(null);
  const raf = useRef(0);
  const frame = useRef(0);
  const started = useRef(0);
  const answered = useRef(false);
  const rescued = useRef(false);
  const stamps = useRef<number[]>([]);
  const pool = useRef<HTMLCanvasElement[]>([]);
  const poolIdx = useRef(0);

  const [size, setSize] = useState({ w: 800, h: 336 });

  // The frame is sized from the window and kept at the original's aspect ratio, which is
  // what makes the stimulus subtend the intended visual angle.
  useEffect(() => {
    const measure = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      let fw = w;
      let fh = Math.round(fw / FRAME_ASPECT);
      if (fh > h) { fh = h; fw = Math.round(fh * FRAME_ASPECT); }
      setSize({ w: fw, h: fh });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const faceW = Math.round(FACE_W_RATIO * size.w);
  const faceH = Math.round(FACE_H_RATIO * size.h);
  const offset = Math.round(FACE_OFFSET_RATIO * size.w);
  const maskW = Math.min(size.w, MONDRIAN_CAP_W);
  const maskH = Math.round(maskW / FRAME_ASPECT);

  const finish = useCallback((response: string, rt: number | null) => {
    if (answered.current) return;
    answered.current = true;
    cancelAnimationFrame(raf.current);
    if (maskRef.current) maskRef.current.style.opacity = '0';
    if (faceRef.current) faceRef.current.style.opacity = '0';

    // Whether the frames arrived evenly. A trial rendered on a struggling machine has a
    // breakthrough time that is partly about the machine, and a lecturer excluding those
    // needs to be able to see which they were — so it travels on the row rather than being
    // silently dropped here.
    const ts = stamps.current;
    let flagged = false;
    if (ts.length >= 10) {
      const gaps = ts.slice(1).map((t, i) => t - ts[i]);
      const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      const bad = gaps.filter(d => Math.abs(d - mean) > mean * 0.5).length;
      flagged = bad / gaps.length > TIMING_TOLERANCE;
    }

    onDone({
      response,
      payload: {
        stimulus_set: STIMULUS_SET,
        side_shown: side,
        rescue_triggered: rescued.current,
        timing_flag: flagged,
        max_contrast: Math.round(MAX_CONTRAST * 100),
        breakthrough_ms: rt,
      },
    });
  }, [onDone, side]);

  useEffect(() => {
    if (!pool.current.length) pool.current = generateMondrianPool(MONDRIAN_POOL_SIZE, maskW, maskH);

    const face = faceRef.current;
    const mask = maskRef.current;
    if (!face || !mask) return;
    face.src = getFaceUrl(identityId, emotion, orientation);
    face.style.opacity = '0';
    mask.style.opacity = '0';

    started.current = performance.now();
    frame.current = 0;
    stamps.current = [];

    const tick = (ts: number) => {
      if (answered.current) return;
      stamps.current.push(ts);
      const elapsed = performance.now() - started.current;

      // Hard stop. A trial nobody answers is not data, and leaving it up would strand a
      // participant staring at a flickering screen.
      if (elapsed >= RESCUE_END_MS) { finish(NO_RESPONSE, null); return; }
      // The masks begin to fade, so the face is eventually visible to anyone. Recorded,
      // because a breakthrough after the rescue began is not a breakthrough.
      if (elapsed >= RESCUE_START_MS) rescued.current = true;

      const cyclePos = frame.current % CYCLE_FRAMES;
      const showFace = cyclePos >= MASK_FRAMES;

      let faceAlpha = Math.min(MAX_CONTRAST, (elapsed / RAMP_MS) * MAX_CONTRAST);
      let maskAlpha = 1;
      if (elapsed >= RESCUE_START_MS) {
        maskAlpha = Math.max(0, 1 - (elapsed - RESCUE_START_MS) / RESCUE_DUR_MS);
        faceAlpha = MAX_CONTRAST;
      }

      if (showFace) {
        mask.style.opacity = '0';
        face.style.opacity = String(faceAlpha);
      } else {
        face.style.opacity = '0';
        mask.style.opacity = String(maskAlpha);
        poolIdx.current = (poolIdx.current + 1) % pool.current.length;
        const ctx = mask.getContext('2d');
        if (ctx) ctx.drawImage(pool.current[poolIdx.current], 0, 0, mask.width, mask.height);
      }

      frame.current += 1;
      raf.current = requestAnimationFrame(tick);
    };

    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [emotion, orientation, identityId, maskW, maskH, finish]);

  const answer = (choice: 'left' | 'right') =>
    finish(choice, Math.round(performance.now() - started.current));

  return (
    <div className="flex flex-col items-center gap-6" dir={rtl ? 'rtl' : 'ltr'}>
      <div style={{ position: 'relative', width: size.w, height: size.h, background: '#000' }}>
        <canvas ref={maskRef} width={maskW} height={maskH}
          style={{
            position: 'absolute', left: '50%', top: '50%',
            width: size.w, height: size.h,
            transform: 'translate(-50%, -50%)', opacity: 0,
          }} />
        {/* The face sits to one side of centre; which side is the question. */}
        <img ref={faceRef} alt=""
          style={{
            position: 'absolute', top: '50%',
            left: side === 'left' ? size.w / 2 - offset : size.w / 2 + offset,
            width: faceW, height: faceH,
            transform: 'translate(-50%, -50%)', opacity: 0,
          }} />
      </div>
      <div className="flex gap-6">
        {(['left', 'right'] as const).map(choice => (
          <button key={choice} onClick={() => answer(choice)}
            className="px-10 py-4 rounded-2xl border-2 border-gray-700 hover:border-purple-400 text-gray-200 text-lg touch-manipulation">
            {choice === 'left' ? (rtl ? 'שמאל' : 'Left') : (rtl ? 'ימין' : 'Right')}
          </button>
        ))}
      </div>
    </div>
  );
}


// ─── Calibrating the display ──────────────────────────────────────────────────
//
// Original: app/bRMS/page.tsx (the calibrate, hardwareCheck and prepareDisplay steps).
//
// A suppression stimulus is specified in DEGREES of visual angle, not pixels. The same
// frame is a different experiment on a phone and on a desktop monitor, so the run cannot
// begin until the physical size of the screen is known — which no definition can describe
// and no trial can measure.
//
// Three steps, in the original's order: size a coin on screen against a real one to get
// pixels per millimetre, watch two seconds of frames to see whether the display can hold
// 60Hz, then go fullscreen and landscape.
//
// The gate NEVER BLOCKS. A refused fullscreen, a browser without orientation lock, a
// hesitant frame check — each is reported and then let through, because a participant who
// cannot start is worse than one whose data carries a caveat. What was measured is written
// to sessionStorage, exactly where the hand-built pages put it.

const CALIBRATE_TEXT = {
  en: {
    title: 'Before we start',
    coin: 'Hold a 1₪ coin against the screen and drag until the circle is exactly its size.',
    coinDone: 'That looks right',
    checking: 'Checking your display…',
    checkGood: 'Your display is steady enough.',
    checkPoor: 'Your display is not perfectly steady. You can continue — it is recorded with '
      + 'your results.',
    distance: (cm: number) => `Sit about ${cm} cm from the screen.`,
    prepare: 'The screen will switch to fullscreen. On a phone, turn it sideways and keep it '
      + 'that way for the whole task.',
    start: 'Start',
  },
  he: {
    title: 'לפני שמתחילים',
    coin: 'הצמידו מטבע של שקל למסך וגררו עד שהעיגול בדיוק בגודלו.',
    coinDone: 'זה נראה נכון',
    checking: 'בודקים את המסך…',
    checkGood: 'המסך יציב מספיק.',
    checkPoor: 'המסך אינו יציב לחלוטין. אפשר להמשיך — הדבר נרשם יחד עם התוצאות.',
    distance: (cm: number) => `שבו במרחק של כ-${cm} ס"מ מהמסך.`,
    prepare: 'המסך יעבור למסך מלא. בטלפון — סובבו לרוחב והשאירו כך לאורך כל המשימה.',
    start: 'התחלה',
  },
};

function CalibrateDisplay({ language, onDone }: { language: 'he' | 'en'; onDone: () => void }) {
  const t = CALIBRATE_TEXT[language];
  const rtl = language === 'he';
  const [step, setStep] = useState<'coin' | 'check' | 'prepare'>('coin');
  const [coinPx, setCoinPx] = useState(72);
  const [steady, setSteady] = useState<boolean | null>(null);
  const [distance, setDistance] = useState(50);

  /** Two seconds of frames: can this display actually hold a steady rate? */
  useEffect(() => {
    if (step !== 'check') return;
    const stamps: number[] = [];
    let raf = 0;
    const tick = (ts: number) => {
      stamps.push(ts);
      if (stamps.length < 120) { raf = requestAnimationFrame(tick); return; }
      const gaps = stamps.slice(1).map((s, i) => s - stamps[i]);
      const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      const bad = gaps.filter(d => Math.abs(d - mean) > mean * 0.5).length;
      setSteady(bad / gaps.length < 0.1);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [step]);

  const acceptCoin = () => {
    const pxPerMm = coinPx / COIN_DIAMETER_MM;
    try {
      sessionStorage.setItem('brms_px_per_mm', String(pxPerMm));
    } catch { /* private window: the run continues uncalibrated rather than stopping */ }
    const widthCm = Math.max(window.innerWidth, window.innerHeight) / pxPerMm / 10;
    setDistance(Math.round(1.61 * widthCm));
    setStep('check');
  };

  const begin = async () => {
    // Both are best-effort. A browser that refuses either still runs the experiment.
    try {
      const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
      if (el.requestFullscreen) await el.requestFullscreen();
      else el.webkitRequestFullscreen?.();
    } catch { /* refused, or already fullscreen */ }
    try {
      const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
      await orientation.lock?.('landscape');
    } catch { /* not supported on desktop, and not needed there */ }
    onDone();
  };

  return (
    <main style={{ minHeight: '100dvh' }}
      className="bg-[#0f172a] flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-lg bg-gray-900 border border-gray-700 rounded-2xl p-8 flex flex-col gap-6"
        dir={rtl ? 'rtl' : 'ltr'}>
        <h1 className="text-2xl font-bold text-gray-100">{t.title}</h1>

        {step === 'coin' && (
          <>
            <p className="text-gray-300">{t.coin}</p>
            <div className="flex justify-center py-4">
              <div style={{ width: coinPx, height: coinPx }}
                className="rounded-full bg-amber-300/90 border-2 border-amber-200" />
            </div>
            <input type="range" min={30} max={200} value={coinPx}
              onChange={e => setCoinPx(Number(e.target.value))}
              className="w-full accent-purple-400" />
            <button onClick={acceptCoin}
              className="w-full py-3 bg-purple-500 hover:bg-purple-400 text-white font-bold rounded-xl touch-manipulation">
              {t.coinDone}
            </button>
          </>
        )}

        {step === 'check' && (
          <>
            <p className="text-gray-300">
              {steady === null ? t.checking : steady ? t.checkGood : t.checkPoor}
            </p>
            {steady !== null && (
              <button onClick={() => setStep('prepare')}
                className="w-full py-3 bg-purple-500 hover:bg-purple-400 text-white font-bold rounded-xl touch-manipulation">
                {t.coinDone}
              </button>
            )}
          </>
        )}

        {step === 'prepare' && (
          <>
            <p className="text-gray-300">{t.distance(distance)}</p>
            <p className="text-gray-400 text-sm">{t.prepare}</p>
            <button onClick={begin}
              className="w-full py-4 bg-purple-500 hover:bg-purple-400 text-white font-bold text-lg rounded-xl touch-manipulation">
              {t.start}
            </button>
          </>
        )}
      </div>
    </main>
  );
}

// ─── The registry ─────────────────────────────────────────────────────────────

/** Keys must match PHASE_COMPONENTS in component-names.ts; a test fails if they drift. */
export const PHASE_COMPONENT_MAP: Record<string, ComponentType<PhaseComponentProps>> = {
  wasonRuleDiscovery: WasonRuleDiscovery,
  bRMSSuppression: BRMSSuppression,
};

/** A gate before the first trial. Same rules; nothing needs one yet. */
export const ONBOARDING_COMPONENT_MAP: Record<string, ComponentType<{
  language: 'he' | 'en';
  onDone: () => void;
}>> = {
  calibrateDisplay: CalibrateDisplay,
};
