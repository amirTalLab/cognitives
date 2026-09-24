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
  buildTrials, EARLY_RESPONSE, expandRecall, feedbackMessage, isCorrect, NO_RESPONSE, payloadOf,
  lookup, phaseDuration, resolve, SHOWN, Trial,
} from './trials';
import { DisplayView, SEED_KEY, ASSET_BASE_KEY, LANGUAGE_KEY } from './DisplayView';
import { PHASE_COMPONENT_MAP } from './components';
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
  /**
   * Values in scope for every trial of this block — the item a stage group drew for this
   * pass. DRM's study block gets the themed list it is about to present.
   */
  context?: Record<string, unknown>;
  /** Which pass through a stage group this is, stored so the passes can be told apart. */
  repetition?: number;
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
  // A study presentation asks nothing, so there is no step to bind to a phase. Everything
  // downstream reads this as "no response expected" rather than needing its own flag.
  if ((spec as ResponseSpec).kind === 'none') return [];
  const phase = def.trial.phases.find(p => p.awaitsResponse)?.name ?? 'response';
  return [{ ...(spec as ResponseSpec), phase }];
}

/**
 * Whether a response is typed rather than pressed.
 *
 * These hold what the participant has entered in their own state, so a deadline has to be
 * handed to them to submit — it cannot be answered on their behalf from outside.
 */
function typedStep(step: ResponseStep | undefined): boolean {
  return step?.kind === 'text' || step?.kind === 'number' || step?.kind === 'wordList';
}

/**
 * One end of a scale, or a unit, in the language of the run.
 *
 * The `He` form is optional: a scale labelled with numbers or a unit like "%" needs one
 * form, and a questionnaire's "Not at all willing" needs two.
 */
function scaleLabel(
  label: unknown, labelHe: unknown, rtl: boolean, values: Record<string, unknown>,
): string {
  const chosen = rtl && labelHe !== undefined ? labelHe : label;
  return String(resolve(chosen as never, values) ?? '');
}

/** A keyboard event's key, in the spelling definitions use for `key`. */
function keyName(e: KeyboardEvent): string {
  return e.key === ' ' ? 'space' : e.key.toLowerCase();
}

type Feedback = { correct: boolean | null; message?: { en: string; he: string } };

export function Runner({
  definition, design: stageDesign, stage, context, repetition, language,
  practice = false, onComplete, onSaveFailure,
}: RunnerProps) {
  // One block: the definition's own design unless a stage supplies its own.
  const design: TrialDesign = stageDesign ?? definition;
  const [trials] = useState<Trial[]>(() => buildTrials(design, { practice, context }));
  const [trialIdx, setTrialIdx] = useState(0);
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [feedback, setFeedback] = useState<null | Feedback>(null);
  // True during the inter-trial gap: the screen is blank and the phase machine is idle.
  const [iti, setIti] = useState(false);

  const rows = useRef<TrialRow[]>([]);
  const clock = useRef(0);
  const answers = useRef<Record<string, string>>({});
  // Extra columns a component phase observed — the triples a participant tested, whether the
  // frame timing held. Cleared per trial, with the answers, so nothing leaks into the next.
  const componentPayload = useRef<Record<string, unknown>>({});
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
  // One handoff per BLOCK. A timed block can run out in the same instant as its last trial
  // finishes, and completing twice would append this block's rows to the run twice.
  const ended = useRef(false);

  const trial = trials[trialIdx];
  // Displays that draw something random (array layouts) read the seed from here, so a
  // layout is stable within a trial and different between trials.
  const values = trial
    ? {
        ...trial.values,
        [SEED_KEY]: trial.seed,
        [ASSET_BASE_KEY]: definition.assets?.base ?? '',
        [LANGUAGE_KEY]: language,
      }
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
      if (!ended.current) { ended.current = true; onComplete(rows.current); }
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
    // `ended` as well as `settled`: once a timed block has handed its rows over, a press
    // still landing from the abandoned trial must not write another one.
    if (settled.current || ended.current) return;

    const given = answers.current;
    const first = steps[0];
    // No step at all is a trial that asks nothing: it ends when its phases run out, with
    // "shown" recorded and no answer to score.
    const passive = first === undefined;
    const primary = early ? EARLY_RESPONSE : passive ? SHOWN : (given[first.phase] ?? '');
    const correct = passive ? null : early ? false : isCorrect(design, trial, primary);

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

    // No reaction time when nothing was timed: a timeout has none, a press during the cue
    // measured from a clock that has not started yet would be a negative or stale number,
    // and a passive trial never started a clock at all — reading it there would record the
    // milliseconds since the block began as though it were a response time.
    const rt = early || wasTimedOut || passive ? null : Math.round(performance.now() - clock.current);
    // The stage name travels with every row, so one results table can hold a study block
    // and a recall block and a chart can still ask about one of them. The repetition comes
    // too where a group ran the same block more than once, so the passes can be told apart.
    const payload = {
      ...payloadOf(design, trial),
      ...(stage ? { stage } : {}),
      ...(repetition !== undefined ? { repetition } : {}),
      // A component phase can add columns of its own. Last, so it cannot quietly overwrite
      // the stage name or a stored factor — a component decides what it observed, not what
      // block it was in.
      ...componentPayload.current,
    };

    // An early press the definition does not record is not a trial at all: it shows "too
    // early" and moves on, keeping nothing — as the hand-built experiments do.
    const kept = !(early && design.trial.recordEarly === false);

    // Free recall is one answer about many items, so it writes a row per studied word rather
    // than one row holding the typed list. Every other block emits its single row, which is
    // the one-element case of the same loop.
    const recalled = early ? null : expandRecall(design, trial, primary);
    const emitted: TrialRow[] = (recalled ?? [{ response: primary, payload: {} }]).map(part => ({
      trial_index: trial.index,
      is_practice: practice,
      // Recall rows are not right or wrong — "recalled" is the measure, and scoring the
      // critical lure as an error would invert what DRM is about.
      is_correct: recalled ? null : correct,
      // Nor is there a reaction time per word: one answer covered all of them.
      reaction_time_ms: recalled ? null : rt,
      response: part.response,
      payload: { ...payload, ...part.payload },
      ...(!recalled && Object.keys(extra).length ? { extra } : {}),
    }));

    if (kept) rows.current.push(...emitted);

    // Saved per trial rather than in a batch at the end, so a participant who closes the
    // tab halfway still contributes the trials they finished. Practice is written too,
    // flagged, because a dropout pattern during practice is worth being able to see —
    // unless the definition says practice is not recorded.
    if (kept && !(practice && design.practice?.record === false)) {
      for (const row of emitted) {
        void saveTrial({
          slug: definition.slug,
          sessionId: sessionStorage.getItem(`${definition.slug}_session_id`) ?? 'unknown',
          participantName: sessionStorage.getItem(`${definition.slug}_name`) ?? 'anonymous',
          trialIndex: row.trial_index,
          isPractice: practice,
          response: row.response,
          isCorrect: row.is_correct,
          reactionTimeMs: row.reaction_time_ms,
          payload: { ...row.payload, ...(row.extra ?? {}) },
          // Which published version this run used, so a later refine cannot quietly mix its
          // results with these. Undefined for a built-in or a preview.
          definitionRevision: definition.revision ?? null,
        }).then(ok => { if (!ok) onSaveFailure?.(); });
      }
    }

    answers.current = {};
    componentPayload.current = {};
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
  }, [definition, design, stage, repetition, trial, practice, steps, advance, onSaveFailure]);

  // A block measured in time: it ends when the clock runs out, mid-trial if need be. The
  // trial in flight is abandoned rather than recorded — nobody answered it, and a filled
  // delay is not measured in trials anyway.
  //
  // Practice is never time-boxed: a filled delay exists to occupy a fixed stretch of the
  // real session, and rehearsing it would only make the session longer.
  const timed = !practice && !!design.endsAfterMs;
  const [remainingMs, setRemainingMs] = useState(design.endsAfterMs ?? 0);

  useEffect(() => {
    const total = design.endsAfterMs;
    if (!total || practice) return;
    const startedAt = performance.now();
    const tick = setInterval(() => {
      const left = total - (performance.now() - startedAt);
      setRemainingMs(Math.max(0, left));
      if (left <= 0 && !ended.current) {
        ended.current = true;
        clearInterval(tick);
        onComplete(rows.current);
      }
    }, 200);
    return () => clearInterval(tick);
  }, [design.endsAfterMs, practice, onComplete]);

  // A trial that asks nothing ends when its last phase has played. Without this the phase
  // index walks past the end of the list, `phase` becomes undefined, and the runner renders
  // nothing for ever — a silent deadlock rather than a visible error.
  useEffect(() => {
    if (phase || !trial || feedback || iti || steps.length > 0) return;
    finishTrial();
  }, [phase, trial, feedback, iti, steps.length, finishTrial]);

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
    // A typed answer submits ITSELF at the deadline, because what the participant has
    // written lives in the input's own state: answering "none" from out here would throw
    // away ninety seconds of recall and record the trial as if nothing had been typed.
    if (typedStep(steps.find(s => s.phase === phase.name))) return;
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
  // Looked up by name from a fixed map — never a path, never evaluated. A published
  // definition is data from a database, so the worst a wrong value can do is match nothing.
  const PhaseComponent = phase.component ? PHASE_COMPONENT_MAP[phase.component] : undefined;
  // A component collects its own answer, so the declarative controls would be a second way
  // to end the same trial.
  const showResponse = (phase.awaitsResponse || inEarlyWindow) && !feedback && !iti && !phase.component;
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
            animate={{ width: `${timed
              ? (1 - remainingMs / (design.endsAfterMs || 1)) * 100
              : (trialIdx / trials.length) * 100}%` }}
            transition={{ duration: 0.4 }} />
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center gap-10 px-6">
        {/* A phase the runtime cannot declare — the participant authors the stimulus, or the
            display is a matter of frame timing. It answers the trial itself, so the ordinary
            response controls stay off. An unknown name renders a message rather than nothing:
            a blank screen mid-experiment is the failure a participant cannot report. */}
        {PhaseComponent ? (
          !iti && !feedback && (
            <PhaseComponent
              key={`${trialIdx}-${phase.name}`}
              values={values} language={language} practice={practice}
              onDone={({ response, payload }) => {
                if (payload) componentPayload.current = { ...componentPayload.current, ...payload };
                answer(response ?? SHOWN);
              }} />
          )
        ) : (
          shown && <DisplayView node={shown} values={values} />
        )}
        {phase.component && !PhaseComponent && (
          <p className="text-amber-400 text-sm">
            This experiment needs a component named &ldquo;{phase.component}&rdquo;, which this
            site does not have.
          </p>
        )}

        {showResponse && step && (
          <ResponseView step={step} values={values} rtl={rtl} onAnswer={answer} highlight={retryHint}
            deadlineMs={typedStep(step)
              ? Number(resolve(phase.timeoutMs, values) ?? 0) || undefined
              : undefined} />
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
        {practice ? (rtl ? 'תרגול · ' : 'Practice · ') : ''}
        {/* A timed block counts down: "trial 7 of 90" would imply a list to get through,
            when the only thing being asked is to keep going until the time is up. */}
        {timed ? `${Math.ceil(remainingMs / 1000)}s` : `${trialIdx + 1} / ${trials.length}`}
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

function ResponseView({ step, values, rtl, onAnswer, highlight, deadlineMs }: {
  step: ResponseStep;
  values: Record<string, unknown>;
  rtl: boolean;
  onAnswer: (value: string) => void;
  /** Marks the correct option while practice waits for it to be pressed. */
  highlight?: string | null;
  /** For a typed answer: submit whatever has been entered after this long. */
  deadlineMs?: number;
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

  // A questionnaire's alternatives belong to the question, not to the task, so they can come
  // from the trial's own data. Falls back to the declared list, which is what every
  // experiment before this used.
  const options = (() => {
    if (step.kind !== 'choice' && step.kind !== 'multiSelect') return [];
    if (step.optionsFrom) {
      const list = lookup(step.optionsFrom.replace(/^\{|\}$/g, ''), values);
      if (Array.isArray(list) && list.length) return list as typeof step.options;
    }
    return step.options ?? [];
  })();

  if (step.kind === 'multiSelect') {
    return <MultiSelectInput options={options} rtl={rtl} values={values} onAnswer={onAnswer} />;
  }

  if (step.kind === 'choice' && step.layout === 'positioned') {
    // The button's PLACE is the answer. Laid out with the same geometry as a `positioned`
    // display (400px tall, ±180px from centre) so a button sits exactly where the stimulus
    // it answers for appeared — if the two drifted apart the task would quietly become
    // harder for every participant.
    return (
      <div style={{ position: 'relative', width: '100%', height: 400 }}>
        {options.map((opt, i) => {
          const at = String(resolve(opt.at, values) ?? 'center');
          const style: React.CSSProperties = {
            position: 'absolute',
            left: at === 'left' ? 'calc(50% - 180px)' : at === 'right' ? 'calc(50% + 180px)' : '50%',
            top: at === 'top' ? 'calc(50% - 180px)' : at === 'bottom' ? 'calc(50% + 180px)' : '50%',
            transform: 'translate(-50%, -50%)',
          };
          const value = String(resolve(opt.value, values) ?? opt.value);
          const marked = highlight != null && highlight === value;
          return (
            <button key={i} {...press(() => onAnswer(value))} style={style}
              aria-label={String(resolve(rtl && opt.labelHe ? opt.labelHe : opt.label, values) ?? '')}
              className={`w-20 h-20 rounded-lg border-2 touch-manipulation transition-colors
                          active:scale-95 ${marked
                            ? 'border-emerald-400 bg-emerald-400/20'
                            : 'border-gray-500 bg-gray-100 hover:border-purple-400'}`}>
              {opt.display && <DisplayView node={opt.display} values={values} />}
            </button>
          );
        })}
      </div>
    );
  }

  if (step.kind === 'choice') {
    const wide = step.layout === 'column';
    return (
      <div className={wide ? 'flex flex-col gap-3 w-full max-w-md' : 'flex gap-6 flex-wrap justify-center'}
        style={wide ? undefined : dir}>
        {options.map((opt, i) => {
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
            <span>{scaleLabel(step.minLabel, step.minLabelHe, rtl, values)}</span>
            <span>{scaleLabel(step.maxLabel, step.maxLabelHe, rtl, values)}</span>
          </div>
        )}
      </div>
    );
  }

  if (step.kind === 'drawing') {
    return <DrawingInput step={step} rtl={rtl} onAnswer={onAnswer} />;
  }

  if (step.kind === 'slider') {
    return <SliderInput step={step} rtl={rtl} values={values} onAnswer={onAnswer} />;
  }

  if (step.kind === 'number' || step.kind === 'text') {
    return <FreeInput step={step} rtl={rtl} values={values} onAnswer={onAnswer} deadlineMs={deadlineMs} />;
  }

  // Named rather than left as a fall-through: "none" now shares this union, and a
  // fall-through would have shown a word-list box to a trial that asks nothing.
  if (step.kind === 'wordList') {
    return <WordListInput rtl={rtl} onAnswer={onAnswer} max={step.maxWords} deadlineMs={deadlineMs} />;
  }

  return null;
}

/**
 * Counts down to a deadline, and fires once when it arrives.
 *
 * Returns the seconds left so a timed answer can show them, as every hand-built experiment
 * with a deadline does — a recall box with a silent ninety-second limit would cut people off
 * with no warning.
 */
function useDeadline(deadlineMs: number | undefined, onElapsed: () => void): number | null {
  // Through a ref: the callback closes over what has been typed, so it changes on every
  // keystroke, and depending on it would restart the countdown with each letter.
  const fire = useRef(onElapsed);
  fire.current = onElapsed;
  const [left, setLeft] = useState<number | null>(deadlineMs ?? null);

  useEffect(() => {
    if (!deadlineMs) return;
    const startedAt = performance.now();
    let done = false;
    const tick = setInterval(() => {
      const remaining = deadlineMs - (performance.now() - startedAt);
      setLeft(Math.max(0, remaining));
      if (remaining <= 0 && !done) {
        done = true;
        clearInterval(tick);
        fire.current();
      }
    }, 200);
    return () => clearInterval(tick);
  }, [deadlineMs]);

  return deadlineMs ? left : null;
}

/** The seconds remaining, shown above a timed answer. */
function Countdown({ ms }: { ms: number | null }) {
  if (ms === null) return null;
  return <p className="text-2xl font-bold text-purple-400 text-center">{Math.ceil(ms / 1000)}s</p>;
}

/**
 * A drawing, captured as an image.
 *
 * Ported from app/creativity/experiment/page.tsx. The guide is drawn INTO the canvas rather
 * than behind it, so what is stored is what the participant saw — a rated drawing that is
 * missing the circle it was drawn on is not the same drawing.
 *
 * Pointer events rather than mouse and touch separately: one code path, and it works with a
 * stylus, which is what a tablet user will reach for.
 */
function DrawingInput({ step, rtl, onAnswer }: {
  step: Extract<ResponseSpec, { kind: 'drawing' }>;
  rtl: boolean;
  onAnswer: (v: string) => void;
}) {
  const width = step.width ?? 300;
  const height = step.height ?? 300;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [touched, setTouched] = useState(false);

  const reset = useCallback(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, width, height);
    if ((step.guide ?? 'none') === 'circle') {
      ctx.beginPath();
      ctx.arc(width / 2, height / 2, Math.min(width, height) / 2 - 4, 0, Math.PI * 2);
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    setTouched(false);
  }, [width, height, step.guide]);

  useEffect(() => { reset(); }, [reset]);

  const at = (e: React.PointerEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  return (
    <div className="flex flex-col items-center gap-3" dir={rtl ? 'rtl' : 'ltr'}>
      <canvas
        ref={canvasRef} width={width} height={height}
        className="rounded-xl border border-gray-700 touch-none cursor-crosshair"
        onPointerDown={e => { e.preventDefault(); drawing.current = true; last.current = at(e); }}
        onPointerMove={e => {
          if (!drawing.current || !last.current) return;
          const ctx = canvasRef.current?.getContext('2d');
          if (!ctx) return;
          const now = at(e);
          ctx.beginPath();
          ctx.moveTo(last.current.x, last.current.y);
          ctx.lineTo(now.x, now.y);
          ctx.strokeStyle = '#e2e8f0';
          ctx.lineWidth = 3;
          ctx.lineCap = 'round';
          ctx.stroke();
          last.current = now;
          setTouched(true);
        }}
        onPointerUp={() => { drawing.current = false; last.current = null; }}
        onPointerLeave={() => { drawing.current = false; last.current = null; }}
      />
      <div className="flex gap-3">
        <button onClick={reset}
          className="px-4 py-2 rounded-lg border border-gray-700 text-gray-400 text-sm touch-manipulation">
          {rtl ? 'ניקוי' : 'Clear'}
        </button>
        <button
          onClick={() => onAnswer(canvasRef.current?.toDataURL('image/png') ?? '')}
          disabled={!touched}
          className={`px-6 py-2 rounded-lg font-semibold touch-manipulation ${touched
            ? 'bg-purple-500 hover:bg-purple-400 text-white'
            : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}>
          {rtl ? 'סיום' : 'Done'}
        </button>
      </div>
    </div>
  );
}

/**
 * A dragged scale whose preview is drawn from the current position.
 *
 * Keyed to the trial by the caller, so the slider resets between trials — a slider left
 * where the last answer put it is a starting point that carries information about the
 * previous stimulus, which is exactly the kind of leak that turns into a serial dependency
 * in the data.
 */
function SliderInput({ step, rtl, values, onAnswer }: {
  step: Extract<ResponseSpec, { kind: 'slider' }>;
  rtl: boolean;
  values: Record<string, unknown>;
  onAnswer: (v: string) => void;
}) {
  const num = (bound: unknown, fallback: number) => {
    const resolved = Number(resolve(bound as never, values));
    return Number.isFinite(resolved) ? resolved : fallback;
  };
  const min = num(step.min, 0);
  const max = num(step.max, 100);
  const start = step.startAt === undefined ? Math.round((min + max) / 2) : num(step.startAt, min);
  const [value, setValue] = useState(start);

  return (
    <div className="flex flex-col items-center gap-5 w-full max-w-md" dir={rtl ? 'rtl' : 'ltr'}>
      {/* Drawn from where the slider is now, so the answer is a match rather than a
          translation of a remembered size into a number. */}
      {step.preview && (
        <div className="flex items-center justify-center" style={{ minHeight: 190 }}>
          <DisplayView node={step.preview} values={{ ...values, value }} />
        </div>
      )}
      <div className="w-full flex flex-col gap-1">
        <input
          type="range"
          min={min} max={max} step={num(step.step, 1)} value={value}
          onChange={e => setValue(Number(e.target.value))}
          className="w-full h-3 rounded-full appearance-none bg-gray-700 accent-purple-400 cursor-pointer touch-manipulation"
        />
        {(step.minLabel || step.maxLabel) && (
          <div className="flex justify-between w-full text-xs text-gray-500">
            <span>{step.minLabel}</span><span>{step.maxLabel}</span>
          </div>
        )}
      </div>
      <button onClick={() => onAnswer(String(value))}
        className="px-10 py-4 bg-purple-500 hover:bg-purple-400 text-white font-bold rounded-xl text-lg touch-manipulation">
        {step.submitLabel ? (rtl ? step.submitLabel.he : step.submitLabel.en) : (rtl ? 'אישור' : 'Confirm')}
      </button>
    </div>
  );
}

/**
 * More than one answer allowed, confirmed with a button.
 *
 * Wason's card task is why: "which cards must you turn over" has a set as its answer, and
 * offering it one card at a time would turn a reasoning problem into four separate ones.
 * Recorded as the chosen values joined by commas IN THE ORDER THE OPTIONS WERE OFFERED, so
 * two people who picked the same cards produce the same string and a chart can group them.
 */
function MultiSelectInput({ options, rtl, values, onAnswer }: {
  options: { value: string; label: string; labelHe?: string }[];
  rtl: boolean;
  values: Record<string, unknown>;
  onAnswer: (v: string) => void;
}) {
  const [chosen, setChosen] = useState<string[]>([]);
  const valueOf = (opt: { value: string }) => String(resolve(opt.value, values) ?? opt.value);

  return (
    <div className="flex flex-col gap-3 w-full max-w-md" dir={rtl ? 'rtl' : 'ltr'}>
      {options.map((opt, i) => {
        const value = valueOf(opt);
        const picked = chosen.includes(value);
        return (
          <button key={i}
            onClick={() => setChosen(prev =>
              prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value])}
            className={`px-5 py-3 rounded-xl border-2 text-start text-lg touch-manipulation transition-colors ${picked
              ? 'border-purple-400 bg-purple-400/10 text-gray-100'
              : 'border-gray-700 text-gray-300 hover:border-purple-400'}`}>
            <span className="inline-block w-5">{picked ? '✓' : ''}</span>
            {String(resolve(rtl && opt.labelHe ? opt.labelHe : opt.label, values) ?? '')}
          </button>
        );
      })}
      <button
        onClick={() => onAnswer(options.map(valueOf).filter(v => chosen.includes(v)).join(','))}
        disabled={chosen.length === 0}
        className={`mt-2 py-3 rounded-xl font-bold touch-manipulation ${chosen.length
          ? 'bg-purple-500 hover:bg-purple-400 text-white'
          : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}>
        {rtl ? 'אישור' : 'Confirm'}
      </button>
    </div>
  );
}

function FreeInput({ step, rtl, values, onAnswer, deadlineMs }: {
  step: Extract<ResponseSpec, { kind: 'number' } | { kind: 'text' }>;
  rtl: boolean;
  values: Record<string, unknown>;
  onAnswer: (v: string) => void;
  deadlineMs?: number;
}) {
  const [value, setValue] = useState('');
  // Whatever has been typed when the time runs out is the answer — an empty one if nothing
  // was typed, which is still a real observation.
  const left = useDeadline(deadlineMs, () => onAnswer(value.trim()));
  if (deadlineMs) {
    return (
      <div className="w-full max-w-md flex flex-col gap-3">
        <Countdown ms={left} />
        <FreeInputForm step={step} rtl={rtl} values={values} value={value} setValue={setValue} onAnswer={onAnswer} />
      </div>
    );
  }
  return <FreeInputForm step={step} rtl={rtl} values={values} value={value} setValue={setValue} onAnswer={onAnswer} />;
}

function FreeInputForm({ step, rtl, values, value, setValue, onAnswer }: {
  step: Extract<ResponseSpec, { kind: 'number' } | { kind: 'text' }>;
  rtl: boolean;
  values: Record<string, unknown>;
  value: string;
  setValue: (v: string) => void;
  onAnswer: (v: string) => void;
}) {
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
      {/* The unit belongs to the question — millions, %, agorot — and without it an
          estimate is ambiguous by exactly the factor the question is about. */}
      {step.kind === 'number' && (step.unit || step.unitHe) && (
        <span className="self-center text-gray-400 text-sm whitespace-nowrap">
          {scaleLabel(step.unit, step.unitHe, rtl, values)}
        </span>
      )}
      <button type="submit" className="px-6 py-3 bg-purple-500 hover:bg-purple-400 text-white font-semibold rounded-lg touch-manipulation">
        {rtl ? 'שלח' : 'Submit'}
      </button>
    </form>
  );
}

function WordListInput({ rtl, onAnswer, max, deadlineMs }: {
  rtl: boolean;
  onAnswer: (v: string) => void;
  max?: number;
  deadlineMs?: number;
}) {
  const [words, setWords] = useState<string[]>([]);
  const [current, setCurrent] = useState('');

  // The half-typed word counts too. The hand-built experiments take a whole textarea at the
  // deadline, so a word someone was in the middle of writing is part of their recall; losing
  // it here would score them as having forgotten it.
  const submit = () => onAnswer([...words, current.trim()].filter(Boolean).join(','));
  const left = useDeadline(deadlineMs, submit);

  return (
    <div className="w-full max-w-md flex flex-col gap-3" dir={rtl ? 'rtl' : 'ltr'}>
      <Countdown ms={left} />
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
      <button onClick={submit} disabled={max !== undefined && words.length > max}
        className="px-6 py-3 bg-purple-500 hover:bg-purple-400 text-white font-semibold rounded-lg touch-manipulation">
        {rtl ? 'סיימתי' : 'Done'}
      </button>
    </div>
  );
}
