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
import type { ExperimentDefinition, ResponseSpec, ResponseStep } from './schema';
import { buildTrials, isCorrect, payloadOf, resolve, Trial } from './trials';
import { DisplayView, SEED_KEY, ASSET_BASE_KEY } from './DisplayView';
import { saveTrial } from './store';

/** One completed trial, ready to be stored. */
export interface TrialRow {
  trial_index: number;
  is_practice: boolean;
  response: string;
  is_correct: boolean | null;
  reaction_time_ms: number;
  payload: Record<string, unknown>;
  /** Extra responses beyond the first, e.g. a confidence rating. */
  extra?: Record<string, string>;
}

interface RunnerProps {
  definition: ExperimentDefinition;
  language: 'he' | 'en';
  practice?: boolean;
  onComplete: (rows: TrialRow[]) => void;
  /** Raised when a save fails, so the page can warn rather than lose data silently. */
  onSaveFailure?: () => void;
}

/** Normalises the one-response and many-responses forms into a single list. */
function responseSteps(def: ExperimentDefinition): ResponseStep[] {
  const spec = def.trial.response;
  if (Array.isArray(spec)) return spec;
  const phase = def.trial.phases.find(p => p.awaitsResponse)?.name ?? 'response';
  return [{ ...(spec as ResponseSpec), phase }];
}

export function Runner({ definition, language, practice = false, onComplete, onSaveFailure }: RunnerProps) {
  const [trials] = useState<Trial[]>(() => buildTrials(definition, { practice }));
  const [trialIdx, setTrialIdx] = useState(0);
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [feedback, setFeedback] = useState<null | { correct: boolean | null }>(null);

  const rows = useRef<TrialRow[]>([]);
  const clock = useRef(0);
  const answers = useRef<Record<string, string>>({});

  const trial = trials[trialIdx];
  // Displays that draw something random (array layouts) read the seed from here, so a
  // layout is stable within a trial and different between trials.
  const values = trial
    ? { ...trial.values, [SEED_KEY]: trial.seed, [ASSET_BASE_KEY]: definition.assets?.base ?? '' }
    : {};
  const phases = definition.trial.phases;
  const phase = phases[phaseIdx];
  const steps = responseSteps(definition);
  const rtl = language === 'he';

  const advance = useCallback(() => {
    setFeedback(null);
    if (trialIdx + 1 >= trials.length) {
      onComplete(rows.current);
      return;
    }
    setPhaseIdx(0);
    // The inter-trial interval is a gap, not a phase — nothing is on screen during it.
    setTimeout(() => setTrialIdx(i => i + 1), definition.trial.itiMs ?? 300);
  }, [trialIdx, trials.length, onComplete, definition.trial.itiMs]);

  const finishTrial = useCallback(() => {
    const given = answers.current;
    const first = steps[0];
    const primary = given[first.phase] ?? '';
    const correct = isCorrect(definition, trial, primary);

    const extra: Record<string, string> = {};
    for (const step of steps.slice(1)) {
      if (given[step.phase] !== undefined) extra[step.phase] = given[step.phase];
    }

    const rt = Math.round(performance.now() - clock.current);
    const payload = payloadOf(definition, trial);

    rows.current.push({
      trial_index: trial.index,
      is_practice: practice,
      response: primary,
      is_correct: correct,
      reaction_time_ms: rt,
      payload,
      ...(Object.keys(extra).length ? { extra } : {}),
    });

    // Saved per trial rather than in a batch at the end, so a participant who closes the
    // tab halfway still contributes the trials they finished. Practice is written too,
    // flagged, because a dropout pattern during practice is worth being able to see.
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
    }).then(ok => { if (!ok) onSaveFailure?.(); });

    answers.current = {};

    const showFeedback = practice && definition.practice?.feedback && correct !== null;
    if (showFeedback) {
      setFeedback({ correct });
      return;
    }
    advance();
  }, [definition, trial, practice, steps, advance, onSaveFailure]);

  // Timed phases advance themselves; response phases wait for input.
  useEffect(() => {
    if (!phase || feedback) return;
    if (phase.awaitsResponse) {
      if (phase.startsClock) clock.current = performance.now();
      return;
    }
    const ms = Number(resolve(phase.durationMs, trial?.values ?? {}) ?? 0);
    const timer = setTimeout(() => setPhaseIdx(i => i + 1), ms);
    return () => clearTimeout(timer);
  }, [phaseIdx, trialIdx, phase, feedback, trial]);

  function answer(value: string) {
    if (!phase?.awaitsResponse) return;
    answers.current[phase.name] = value;

    const remaining = phases.slice(phaseIdx + 1).some(p => p.awaitsResponse);
    if (remaining) setPhaseIdx(i => i + 1);
    else finishTrial();
  }

  // Keyboard shortcuts, where the definition supplies them. Buttons remain the primary
  // route — students take these on phones, so keys can only ever be an accelerator.
  useEffect(() => {
    const step = steps.find(s => s.phase === phase?.name);
    if (!step || step.kind !== 'choice') return;
    const handler = (e: KeyboardEvent) => {
      const hit = step.options.find(o => o.key && o.key.toLowerCase() === e.key.toLowerCase());
      if (hit) answer(String(resolve(hit.value, trial?.values ?? {}) ?? hit.value));
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  if (!trial || !phase) return null;

  const step = steps.find(s => s.phase === phase.name);
  const showResponse = phase.awaitsResponse && !feedback;

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
        <DisplayView node={phase.display} values={values} />

        {showResponse && step && (
          <ResponseView step={step} values={values} rtl={rtl} onAnswer={answer} />
        )}

        {feedback && (
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

function ResponseView({ step, values, rtl, onAnswer }: {
  step: ResponseStep;
  values: Record<string, unknown>;
  rtl: boolean;
  onAnswer: (value: string) => void;
}) {
  // Never row-reverse: an ancestor dir="rtl" cancels it and you get the opposite order.
  const dir = { flexDirection: 'row' as const, direction: rtl ? ('rtl' as const) : ('ltr' as const) };

  if (step.kind === 'choice') {
    const wide = step.layout === 'column';
    return (
      <div className={wide ? 'flex flex-col gap-3 w-full max-w-md' : 'flex gap-6 flex-wrap justify-center'}
        style={wide ? undefined : dir}>
        {step.options.map((opt, i) => {
          const label = String(resolve(rtl && opt.labelHe ? opt.labelHe : opt.label, values) ?? '');
          const value = String(resolve(opt.value, values) ?? opt.value);
          return (
            <button key={i} onClick={() => onAnswer(value)}
              className="min-w-20 min-h-20 px-6 py-4 rounded-2xl border-2 border-gray-700 hover:border-purple-400
                         text-gray-200 text-lg transition-colors touch-manipulation">
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
