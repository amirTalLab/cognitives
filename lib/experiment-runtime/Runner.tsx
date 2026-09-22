'use client';

// Runs an experiment definition.
//
// Drives the phase machine, renders each phase's display, collects responses, scores them
// and emits one row per trial. This is the component that makes "an experiment is data"
// true — everything a generated experiment needs to behave correctly lives here, once,
// rather than being rewritten (and re-broken) per experiment.
//
// CRITICAL: timed phases are driven by plain setTimeout and are never wrapped in an exit
// animation. A ~300ms AnimatePresence exit silently swallows a 150ms stimulus, and that
// bug cost this project real debugging time in the hand-written experiments.

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { ExperimentDefinition, ResponseSpec, ResponseStep, TrialDesign } from './schema';
import {
  buildTrials, EARLY_RESPONSE, feedbackMessage, isCorrect, NO_RESPONSE, payloadOf, phaseDuration, resolve, Trial,
} from './trials';
import { DisplayView, SEED_KEY, ASSET_BASE_KEY } from './DisplayView';
import { saveTrial } from './store';

/** One completed trial, ready to be stored. */
export interface TrialRow {
  trial_index: number;
  is_practice: boolean;
  response: string;
  is_correct: boolean | null;
  /** Null when nothing was timed: the response phase ran out, or the press came too early. */
  reaction_time_ms: number | null;
  payload: Record<string, unknown>;
  /** Extra responses beyond the first, e.g. a confidence rating. */
  extra?: Record<string, string>;
}

interface RunnerProps {
  /** Where the slug, assets and published revision come from — never the trials. */
  definition: ExperimentDefinition;
  /**
   * The block to run. Defaults to the definition's own design, which is the first block.
   * A later stage passes its own, so one runner covers study, distractor and recall alike.
   */
  design?: TrialDesign;
  /** Stored on every row, so a chart can tell the blocks apart. Omitted when there is one. */
  stage?: string;
  language: 'he' | 'en';
  practice?: boolean;
  onComplete: (rows: TrialRow[]) => void;
  /** Raised when a save fails, so the page can warn rather than lose data silently. */
  onSaveFailure?: () => void;
}

/**
 * Normalises every response form into a single list for this trial.
 *
 * Three forms: one response, several bound to named phases, or a set chosen per trial by a
 * factor. The last is why this takes the trial — bouba-kiki's control trials offer two
 * words where its main trials offer two shapes.
 */
function responseSteps(def: TrialDesign, trial?: Trial): ResponseStep[] {
  let spec = def.trial.response;

  if (!Array.isArray(spec) && 'sets' in spec) {
    const chosen = String(resolve(`{${spec.by}}`, trial?.values ?? {}) ?? '');
    // Falling back to the first set keeps a mislabelled trial running rather than leaving a
    // participant with no buttons at all; the validator names the mismatch up front.
    spec = spec.sets[chosen] ?? Object.values(spec.sets)[0];
  }

  if (Array.isArray(spec)) return spec;
  const phase = def.trial.phases.find(p => p.awaitsResponse)?.name ?? 'response';
  return [{ ...(spec as ResponseSpec), phase }];
}

/** A keyboard event's key, in the spelling definitions use for `key`. */
function keyName(e: KeyboardEvent): string {
  return e.key === ' ' ? 'space' : e.key.toLowerCase();
}

type Feedback = { correct: boolean | null; message?: { en: string; he: string } };

export function Runner({
  definition, design: stageDesign, stage, language, practice = false, onComplete, onSaveFailure,
}: RunnerProps) {
  // One block: the definition's own design unless a stage supplies its own.
  const design: TrialDesign = stageDesign ?? definition;
  const [trials] = useState<Trial[]>(() => buildTrials(design, { practice }));
  const [trialIdx, setTrialIdx] = useState(0);
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [feedback, setFeedback] = useState<null | Feedback>(null);
  // True during the inter-trial gap: the screen is blank and the phase machine is idle.
  const [iti, setIti] = useState(false);

  const rows = useRef<TrialRow[]>([]);
  const clock = useRef(0);
  const answers = useRef<Record<string, string>>({});
  // Set when the first response phase ran out, so the row records no reaction time.
  const timedOut = useRef(false);
  // The correct option, marked while practice waits for a retry. Null at every other moment,
  // so a main-block trial can never reveal its own answer.
  const [retryHint, setRetryHint] = useState<string | null>(null);

  // One row and one advance per trial, however it ends. A click landing in the same instant
  // as a timeout, or a key pressed while a feedback message is up, would otherwise record
  // the trial twice or skip the next one entirely.
  const settled = useRef(false);
  const advancing = useRef(false);

  const trial = trials[trialIdx];
  // Displays that draw something random (array layouts) read the seed from here, so a
  // layout is stable within a trial and different between trials.
  const values = trial
    ? { ...trial.values, [SEED_KEY]: trial.seed, [ASSET_BASE_KEY]: definition.assets?.base ?? '' }
    : {};
  const phases = design.trial.phases;
  const phase = phases[phaseIdx];
  // Recomputed per trial: a definition may offer a different set of options on different
  // trials, so this cannot be hoisted out of the trial loop.
  const steps = responseSteps(design, trial);
  const rtl = language === 'he';

  // The stretch before the response phase in which the response controls are already shown,
  // when the definition asks for one. A press in it is an anticipation.
  const earlyIdx = design.trial.earlyFrom
    ? phases.findIndex(p => p.name === design.trial.earlyFrom)
    : -1;
  const firstResponseIdx = phases.findIndex(p => p.name === steps[0]?.phase);
  const inEarlyWindow = earlyIdx >= 0 && phaseIdx >= earlyIdx && phaseIdx < firstResponseIdx;

  const advance = useCallback(() => {
    if (advancing.current) return;
    advancing.current = true;
    setFeedback(null);
    if (trialIdx + 1 >= trials.length) {
      onComplete(rows.current);
      return;
    }
    // The inter-trial interval is a gap, not a phase — nothing is on screen during it. Blank
    // the screen and idle the phase machine for the whole ITI, THEN move to the next trial at
    // phase 0. Resetting the phase here without blanking replays the old trial's phases during
    // the gap, flashing its stimulus back before the next trial loads — a real bug once.
    setIti(true);
    setTimeout(() => {
      setTrialIdx(i => i + 1);
      setPhaseIdx(0);
      setIti(false);
      settled.current = false;
      advancing.current = false;
    }, design.trial.itiMs ?? 300);
  }, [trialIdx, trials.length, onComplete, design.trial.itiMs]);

  const finishTrial = useCallback((early = false) => {
    if (settled.current) return;

    const given = answers.current;
    const first = steps[0];
    const primary = early ? EARLY_RESPONSE : (given[first.phase] ?? '');
    const correct = early ? false : isCorrect(design, trial, primary);

    // Practice that teaches the response mapping rather than sampling the design: a wrong
    // answer keeps this same trial on screen with the right option marked, and the clock
    // restarts so the time recorded is of the attempt that succeeded. Nothing is settled,
    // saved or advanced — deliberately before `settled`, which is what ends a trial.
    //
    // Practice only, and never on a timeout or an early press: a main block that refused to
    // advance would trap a participant who cannot find the answer.
    if (
      practice
      && design.practice?.retryUntilCorrect
      && correct === false
      && !early
      && !timedOut.current
    ) {
      answers.current = {};
      setRetryHint(correctOption(design, trial, steps[0]));
      clock.current = performance.now();
      return;
    }

    settled.current = true;
    setRetryHint(null);
    const wasTimedOut = !early && timedOut.current;

    const extra: Record<string, string> = {};
    if (!early) {
      for (const step of steps.slice(1)) {
        if (given[step.phase] !== undefined) extra[step.phase] = given[step.phase];
      }
    }

    // No reaction time when nothing was timed: a timeout has none, and a press during the
    // cue measured from a clock that has not started yet would be a negative or stale number.
    const rt = early || wasTimedOut ? null : Math.round(performance.now() - clock.current);
    // The stage name travels with every row, so one results table can hold a study block
    // and a recall block and a chart can still ask about one of them.
    const payload = { ...payloadOf(design, trial), ...(stage ? { stage } : {}) };

    // An early press the definition does not record is not a trial at all: it shows "too
    // early" and moves on, keeping nothing — as the hand-built experiments do.
    const kept = !(early && design.trial.recordEarly === false);
    if (kept) {
      rows.current.push({
        trial_index: trial.index,
        is_practice: practice,
        response: primary,
        is_correct: correct,
        reaction_time_ms: rt,
        payload,
        ...(Object.keys(extra).length ? { extra } : {}),
      });
    }

    // Saved per trial rather than in a batch at the end, so a participant who closes the
    // tab halfway still contributes the trials they finished. Practice is written too,
    // flagged, because a dropout pattern during practice is worth being able to see —
    // unless the definition says practice is not recorded.
    if (kept && !(practice && design.practice?.record === false)) {
      void saveTrial({
        slug: definition.slug,
        sessionId: sessionStorage.getItem(`${definition.slug}_session_id`) ?? 'unknown',
        participantName: sessionStorage.getItem(`${definition.slug}_name`) ?? 'anonymous',
        trialIndex: trial.index,
        isPractice: practice,
        response: primary,
        isCorrect: correct,
        reactionTimeMs: rt,
        payload: { ...payload, ...extra },
        // Which published version this run used, so a later refine cannot quietly mix its
        // results with these. Undefined for a built-in or a preview.
        definitionRevision: definition.revision ?? null,
      }).then(ok => { if (!ok) onSaveFailure?.(); });
    }

    answers.current = {};
    timedOut.current = false;

    // Per-outcome messages, when the definition has them. They time out by themselves, so a
    // speeded task keeps its pace instead of waiting on a Next button after every miss.
    if (design.trial.feedback) {
      const message = feedbackMessage(design, { correct, timedOut: wasTimedOut, early }, practice);
      if (message) { setFeedback({ correct, message }); return; }
      advance();
      return;
    }

    const showFeedback = practice && design.practice?.feedback && correct !== null;
    if (showFeedback) {
      setFeedback({ correct });
      return;
    }
    advance();
  }, [definition, design, stage, trial, practice, steps, advance, onSaveFailure]);

  // Timed phases advance themselves; response phases wait for input. Idle during the ITI so
  // the old trial's phases do not keep running while the screen is blank.
  useEffect(() => {
    if (!phase || feedback || iti) return;
    if (phase.awaitsResponse) {
      if (phase.startsClock) clock.current = performance.now();
      return;
    }
    const ms = trial ? phaseDuration(phase, trial, phaseIdx) : 0;
    const timer = setTimeout(() => setPhaseIdx(i => i + 1), ms);
    return () => clearTimeout(timer);
  }, [phaseIdx, trialIdx, phase, feedback, iti, trial]);

  // A response phase with a time limit ends on its own, answered "none" — which is a miss on
  // a go trial and the correct answer on a catch or no-go trial.
  useEffect(() => {
    if (!phase?.awaitsResponse || feedback || iti) return;
    const ms = Number(resolve(phase.timeoutMs, trial?.values ?? {}) ?? 0);
    if (!(ms > 0)) return;
    const timer = setTimeout(() => {
      if (phase.name === steps[0]?.phase) timedOut.current = true;
      answer(NO_RESPONSE);
    }, ms);
    return () => clearTimeout(timer);
    // `answer` is re-created every render; what it acts on — this phase of this trial — is
    // exactly what the dependencies below track.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phaseIdx, trialIdx, phase, feedback, iti, trial]);

  // Messages from `trial.feedback` clear themselves.
  useEffect(() => {
    if (!feedback?.message) return;
    const timer = setTimeout(advance, design.trial.feedback?.durationMs ?? 800);
    return () => clearTimeout(timer);
  }, [feedback, advance, design.trial.feedback]);

  function answer(value: string) {
    if (inEarlyWindow) { finishTrial(true); return; }
    if (!phase?.awaitsResponse) return;
    answers.current[phase.name] = value;

    const remaining = phases.slice(phaseIdx + 1).some(p => p.awaitsResponse);
    if (remaining) setPhaseIdx(i => i + 1);
    else finishTrial();
  }

  // Keyboard shortcuts, where the definition supplies them. Buttons remain the primary
  // route — students take these on phones, so keys can only ever be an accelerator.
  useEffect(() => {
    const step = steps.find(s => s.phase === phase?.name) ?? (inEarlyWindow ? steps[0] : undefined);
    if (!step || step.kind !== 'choice' || feedback || iti) return;
    const handler = (e: KeyboardEvent) => {
      const pressed = keyName(e);
      const hit = step.options.find(o => o.key && o.key.toLowerCase() === pressed);
      if (!hit) return;
      // Space would otherwise also scroll the page, or "click" whichever button has focus.
      e.preventDefault();
      answer(String(resolve(hit.value, trial?.values ?? {}) ?? hit.value));
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  if (!trial || !phase) return null;

  const step = steps.find(s => s.phase === phase.name) ?? (inEarlyWindow ? steps[0] : undefined);
  const showResponse = (phase.awaitsResponse || inEarlyWindow) && !feedback && !iti;
  // Between trials: blank, or whatever the definition keeps up. Under a feedback message:
  // the feedback display when there is one, so a stimulus need not linger behind "Missed".
  const shown = iti
    ? design.trial.itiDisplay
    : (feedback?.message && design.trial.feedback?.display) || phase.display;

  return (
    <main style={{ height: '100dvh' }} className="bg-[#0f172a] flex flex-col">
      <div className="flex-shrink-0 h-6">
        <div className="h-1.5 bg-gray-800">
          <motion.div className="h-full bg-purple-500"
            animate={{ width: `${(trialIdx / trials.length) * 100}%` }}
            transition={{ duration: 0.4 }} />
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center gap-10 px-6">
        {shown && <DisplayView node={shown} values={values} />}

        {showResponse && step && (
          <ResponseView step={step} values={values} rtl={rtl} onAnswer={answer} highlight={retryHint} />
        )}

        {feedback && feedback.message && (
          <p dir={rtl ? 'rtl' : 'ltr'}
            className={`text-lg font-semibold ${feedback.correct ? 'text-emerald-400' : 'text-red-400'}`}>
            {rtl ? feedback.message.he : feedback.message.en}
          </p>
        )}

        {feedback && !feedback.message && (
          <div className="flex flex-col items-center gap-4" dir={rtl ? 'rtl' : 'ltr'}>
            <p className={`text-lg font-semibold ${feedback.correct ? 'text-emerald-400' : 'text-red-400'}`}>
              {feedback.correct ? (rtl ? 'נכון' : 'Correct') : (rtl ? 'לא נכון' : 'Incorrect')}
            </p>
            <button onClick={advance}
              className="px-6 py-3 bg-purple-500 hover:bg-purple-400 text-white font-semibold rounded-lg touch-manipulation">
              {rtl ? 'המשך' : 'Next'}
            </button>
          </div>
        )}
      </div>

      <p className="flex-shrink-0 text-center text-xs text-gray-600 pb-4">
        {practice ? (rtl ? 'תרגול · ' : 'Practice · ') : ''}{trialIdx + 1} / {trials.length}
      </p>
    </main>
  );
}

// ─── Responses ────────────────────────────────────────────────────────────────

/**
 * The option that would answer this trial correctly, or null when none does.
 *
 * Found by asking the definition's own rule about each option rather than re-deriving the
 * expected value here, so a mapping rule and a matchesFactor rule are both handled by the
 * one piece of code that already knows how they differ.
 */
function correctOption(
  design: TrialDesign,
  trial: Trial,
  step: ResponseStep | undefined,
): string | null {
  if (!step || step.kind !== 'choice') return null;
  for (const opt of step.options) {
    const value = String(resolve(opt.value, trial.values) ?? opt.value);
    if (isCorrect(design, trial, value) === true) return value;
  }
  return null;
}

function ResponseView({ step, values, rtl, onAnswer, highlight }: {
  step: ResponseStep;
  values: Record<string, unknown>;
  rtl: boolean;
  onAnswer: (value: string) => void;
  /** Marks the correct option while practice waits for it to be pressed. */
  highlight?: string | null;
}) {
  // Never row-reverse: an ancestor dir="rtl" cancels it and you get the opposite order.
  const dir = { flexDirection: 'row' as const, direction: rtl ? ('rtl' as const) : ('ltr' as const) };

  // Answered on pointer DOWN, as every hand-built experiment on this site is: a click fires on
  // release, which adds the length of the tap to every reaction time taken on a phone. A
  // keyboard "click" (Enter on a focused button, detail 0) still answers; the click that
  // follows a pointer press does not, so one tap can never count twice — even when the next
  // response step reuses the same button element.
  const press = (act: () => void) => ({
    onPointerDown: (e: React.PointerEvent) => { e.preventDefault(); act(); },
    onClick: (e: React.MouseEvent) => { if (e.detail === 0) act(); },
  });

  if (step.kind === 'choice') {
    const wide = step.layout === 'column';
    return (
      <div className={wide ? 'flex flex-col gap-3 w-full max-w-md' : 'flex gap-6 flex-wrap justify-center'}
        style={wide ? undefined : dir}>
        {step.options.map((opt, i) => {
          const label = String(resolve(rtl && opt.labelHe ? opt.labelHe : opt.label, values) ?? '');
          const value = String(resolve(opt.value, values) ?? opt.value);
          // Marked, not disabled: the participant still has to press it themselves, which is
          // the point of practice that teaches the mapping.
          const marked = highlight != null && highlight === value;
          return (
            <button key={i} {...press(() => onAnswer(value))}
              className={`min-w-20 min-h-20 px-6 py-4 rounded-2xl border-2 text-gray-200 text-lg
                         transition-colors touch-manipulation ${marked
                           ? 'border-emerald-400 bg-emerald-400/10'
                           : 'border-gray-700 hover:border-purple-400'}`}>
              {opt.display ? <DisplayView node={opt.display} values={values} /> : label}
              {opt.key && <span className="block text-xs text-gray-600 mt-1">{opt.key.toUpperCase()}</span>}
            </button>
          );
        })}
      </div>
    );
  }

  if (step.kind === 'rating') {
    const scale = Array.from({ length: step.max - step.min + 1 }, (_, i) => step.min + i);
    return (
      <div className="flex flex-col items-center gap-3">
        <div className="flex gap-3" style={dir}>
          {scale.map(n => (
            <button key={n} onClick={() => onAnswer(String(n))}
              className="w-14 h-14 rounded-xl border-2 border-gray-700 hover:border-purple-400 text-gray-200 touch-manipulation">
              {n}
            </button>
          ))}
        </div>
        {(step.minLabel || step.maxLabel) && (
          <div className="flex justify-between w-full text-xs text-gray-500" style={dir}>
            <span>{step.minLabel}</span><span>{step.maxLabel}</span>
          </div>
        )}
      </div>
    );
  }

  if (step.kind === 'number' || step.kind === 'text') {
    return <FreeInput step={step} rtl={rtl} onAnswer={onAnswer} />;
  }

  return <WordListInput rtl={rtl} onAnswer={onAnswer} max={step.maxWords} />;
}

function FreeInput({ step, rtl, onAnswer }: {
  step: Extract<ResponseSpec, { kind: 'number' } | { kind: 'text' }>;
  rtl: boolean;
  onAnswer: (v: string) => void;
}) {
  const [value, setValue] = useState('');
  return (
    <form onSubmit={e => { e.preventDefault(); if (value.trim()) onAnswer(value.trim()); }}
      className="flex gap-3 w-full max-w-md" dir={rtl ? 'rtl' : 'ltr'}>
      <input
        type={step.kind === 'number' ? 'number' : 'text'}
        value={value} autoFocus
        onChange={e => setValue(e.target.value)}
        placeholder={step.kind === 'text' ? step.placeholder : undefined}
        className="flex-1 px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-gray-200 outline-none focus:border-purple-400"
      />
      <button type="submit" className="px-6 py-3 bg-purple-500 hover:bg-purple-400 text-white font-semibold rounded-lg touch-manipulation">
        {rtl ? 'שלח' : 'Submit'}
      </button>
    </form>
  );
}

function WordListInput({ rtl, onAnswer, max }: { rtl: boolean; onAnswer: (v: string) => void; max?: number }) {
  const [words, setWords] = useState<string[]>([]);
  const [current, setCurrent] = useState('');

  return (
    <div className="w-full max-w-md flex flex-col gap-3" dir={rtl ? 'rtl' : 'ltr'}>
      <form onSubmit={e => {
        e.preventDefault();
        if (!current.trim()) return;
        setWords(w => [...w, current.trim()]);
        setCurrent('');
      }} className="flex gap-3">
        <input value={current} autoFocus onChange={e => setCurrent(e.target.value)}
          className="flex-1 px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-gray-200 outline-none focus:border-purple-400" />
        <button type="submit" className="px-4 py-3 bg-gray-800 border border-gray-600 text-gray-300 rounded-lg touch-manipulation">+</button>
      </form>
      <div className="flex flex-wrap gap-2">
        {words.map((w, i) => <span key={i} className="px-3 py-1 rounded-full bg-gray-800 text-gray-300 text-sm">{w}</span>)}
      </div>
      <button onClick={() => onAnswer(words.join(','))} disabled={max !== undefined && words.length > max}
        className="px-6 py-3 bg-purple-500 hover:bg-purple-400 text-white font-semibold rounded-lg touch-manipulation">
        {rtl ? 'סיימתי' : 'Done'}
      </button>
    </div>
  );
}
