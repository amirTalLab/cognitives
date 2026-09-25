'use client';

// The one route that runs any experiment definition.
//
// This is what replaces per-experiment landing/practice/experiment/thanks pages: the same
// four stages, driven by data. Adding an experiment adds a definition, not a route — which
// is what makes the whole approach scale to many lecturers without a deploy each time.

import { use, useEffect, useMemo, useRef, useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { FlaskConical, Check } from 'lucide-react';
import { ExperimentDefinition } from '@/lib/experiment-runtime/schema';
import { getDefinition } from '@/lib/experiment-runtime/registry';
import { Runner, TrialRow } from '@/lib/experiment-runtime/Runner';
import { ONBOARDING_COMPONENT_MAP } from '@/lib/experiment-runtime/components';
import { buildTrials, planStages, resolve, type PlannedBlock } from '@/lib/experiment-runtime/trials';
import { previousAssignment } from '@/lib/experiment-runtime/store';
import { DisplayView } from '@/lib/experiment-runtime/DisplayView';

// 'main' is the definition's own design — the first block. 'stageIntro' and 'stageRun'
// walk whatever `stages` lists after it: DRM's recall, serial order's distractor, SRT's
// generation test.
type Stage =
  | 'loading' | 'missing' | 'landing' | 'onboarding' | 'practice' | 'practiceDone' | 'main'
  | 'stageIntro' | 'stagePractice' | 'stageRun' | 'thanks';

export default function RunPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const router = useRouter();

  const [def, setDef] = useState<ExperimentDefinition | null>(null);
  const [stage, setStage] = useState<Stage>('loading');
  const [language, setLanguage] = useState<'he' | 'en'>('he');
  const [name, setName] = useState('');
  const [rows, setRows] = useState<TrialRow[]>([]);
  // Which block of the plan is next. Index 0 is the definition's own design.
  const [stageIdx, setStageIdx] = useState(0);

  // An experiment taken in two sittings: which one this is, what the participant was
  // assigned the first time, and why we could not start when we could not.
  const [session, setSession] = useState<string | null>(null);
  const [remembered, setRemembered] = useState<string | undefined>();
  const [lookupError, setLookupError] = useState<'missing' | 'ambiguous' | null>(null);
  const [looking, setLooking] = useState(false);

  // The blocks this participant will run, with any stage groups already expanded. Drawn
  // once: a group picks its order at random, so asking again mid-run would give a different
  // one and a participant could study one list and then be tested on another.
  // Filtered to the chosen session where there is one, so a second visit runs the blocks
  // that test and not the blocks it is testing.
  const plan = useMemo(() => {
    if (!def) return [];
    const all = planStages(def, undefined, remembered);
    const chosen = def.sessions?.find(s => s.id === session);
    if (!chosen) return all;
    return chosen.blocks
      .map(name => all.find(b => b.stage === name))
      .filter((b): b is PlannedBlock => b !== undefined);
  }, [def, session, remembered]);

  // For the practice-complete screen. Counted from the design, since the block's runner has
  // not been built yet when that screen is up. `stageIdx` rather than the definition,
  // because a later block runs its own practice and its own trial count is the one to show.
  const mainTrialCount = useMemo(() => {
    const block = plan[stageIdx];
    if (!block) return 0;
    try {
      return buildTrials(block.design, { context: block.context }).length;
    } catch {
      return 0;
    }
  }, [plan, stageIdx]);

  useEffect(() => {
    // Caught as well as resolved: an unhandled rejection leaves the stage on 'loading',
    // which renders as an empty dark screen forever. A participant given a stale link
    // should be told the experiment is not there, not left looking at nothing.
    getDefinition(slug)
      .then(d => {
        setDef(d);
        setStage(d ? 'landing' : 'missing');
      })
      .catch(() => setStage('missing'));
  }, [slug]);

  const rtl = language === 'he';

  if (stage === 'loading') return <main style={{ height: '100dvh' }} className="bg-[#0f172a]" />;

  if (stage === 'missing' || !def) {
    return (
      <main style={{ height: '100dvh' }} className="bg-[#0f172a] flex items-center justify-center px-6">
        <p className="text-gray-400">No experiment named &ldquo;{slug}&rdquo;.</p>
      </main>
    );
  }

  if (stage === 'landing') {
    const chosenSession = def.sessions?.find(s => s.id === session);

    const begin = async (e: FormEvent) => {
      e.preventDefault();
      if (!def.nameOptional && !name.trim()) return;

      // A second sitting has to be the SAME person in the SAME condition, or it tests them
      // on material they never studied and writes a row that looks perfectly valid.
      if (chosenSession?.requires && def.assign?.remember) {
        setLooking(true);
        setLookupError(null);
        const found = await previousAssignment(def.slug, name.trim(), def.assign.remember);
        setLooking(false);
        // Refused rather than drawn fresh, and refused loudly: a participant who mistyped
        // their name can see what we looked for.
        if (found === null) { setLookupError('missing'); return; }
        // Two people under one name. Guessing would put one of them in the other's
        // condition, and nothing downstream could ever tell.
        if (typeof found !== 'string') { setLookupError('ambiguous'); return; }
        setRemembered(found);
      }

      sessionStorage.setItem(`${def.slug}_name`, name.trim());
      sessionStorage.setItem(`${def.slug}_language`, language);
      sessionStorage.setItem(`${def.slug}_session_id`, crypto.randomUUID());
      // A device gate first where the definition has one: bRMS cannot start until the
      // physical width of the screen is known, or its stimulus is the wrong size in degrees.
      // Only when the named gate actually exists — a name this site does not have must not
      // strand a participant on a screen that will never render.
      const gated = def.onboarding && ONBOARDING_COMPONENT_MAP[def.onboarding];
      if (gated) { setStage('onboarding'); return; }
      if (def.practice) { setStage('practice'); return; }

      // A later sitting starts on a block that is not the definition's own, and that block
      // carries its own instructions — "you will see the first word of each pair". Going
      // straight to the trials would drop them, and the landing page cannot say them because
      // it has to describe both sittings.
      const opening = plan[0];
      const source = opening?.source as { title?: unknown; instructions?: unknown } | undefined;
      const introduces = opening && opening.stage !== (def.stageName ?? 'main')
        && !!(source?.title || source?.instructions);
      setStageIdx(0);
      setStage(introduces ? 'stageIntro' : 'main');
    };

    return (
      <main className="min-h-screen bg-[#0f172a] flex items-center justify-center px-6 py-10">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="bg-gray-900 border border-gray-700 rounded-2xl p-8 w-full max-w-lg">
          <div className="flex items-center gap-3 mb-6">
            <FlaskConical className="w-7 h-7 text-purple-400" />
            <h1 className="text-2xl font-bold text-gray-100">{rtl ? def.titleHe : def.title}</h1>
            <button onClick={() => setLanguage(rtl ? 'en' : 'he')}
              className="ml-auto px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg border border-gray-600">
              {rtl ? 'English' : 'עברית'}
            </button>
          </div>

          {/* What this participant will actually be looking for, where the design gives them
              their own condition — a coloured letter says it better than the word for it. */}
          {def.instructionsDisplay && (
            <div className="flex justify-center mb-6">
              <DisplayView node={def.instructionsDisplay} values={plan[0]?.context ?? {}} />
            </div>
          )}

          {/* pre-line keeps the paragraphs a lecturer types in /create's instructions box.
              Resolved against the assignment, so instructions can name the condition this
              person was given rather than describing the design in the abstract. */}
          <p className="text-gray-300 leading-relaxed mb-6 whitespace-pre-line" dir={rtl ? 'rtl' : 'ltr'}>
            {resolve(rtl ? def.instructions.he : def.instructions.en, plan[0]?.context ?? {})}
          </p>

          {/* Which sitting this is. An experiment taken over two visits offers the choice
              here, as the hand-built version does with two buttons — a participant arriving
              a week later has to be able to say which one they are here for. */}
          {def.sessions?.length ? (
            <div className="flex flex-col gap-3 mb-6" dir={rtl ? 'rtl' : 'ltr'}>
              {def.sessions.map(entry => (
                <button key={entry.id} type="button"
                  onClick={() => { setSession(entry.id); setLookupError(null); }}
                  className={`text-start px-5 py-4 rounded-xl border-2 transition-colors ${entry.id === session
                    ? 'border-purple-400 bg-purple-400/10'
                    : 'border-gray-700 hover:border-purple-400'}`}>
                  <div className="text-gray-100 font-semibold">
                    {rtl ? entry.title.he : entry.title.en}
                  </div>
                  <div className="text-gray-400 text-sm mt-0.5">
                    {rtl ? entry.description.he : entry.description.en}
                  </div>
                </button>
              ))}
            </div>
          ) : null}

          {/* Why a second sitting could not start. Said plainly, with the name that was
              looked for, because the usual cause is a typo and the participant is the only
              one who can see it. */}
          {lookupError && (
            <p className="text-amber-400 text-sm mb-4" dir={rtl ? 'rtl' : 'ltr'}>
              {lookupError === 'missing'
                ? (rtl
                    ? `לא מצאנו מפגש קודם בשם "${name.trim()}". בדקו את האיות — יש להזין בדיוק את השם מהמפגש הראשון.`
                    : `We have no earlier session under "${name.trim()}". Check the spelling — it has to match the name you used the first time.`)
                : (rtl
                    ? 'יותר מאדם אחד רשום בשם הזה, ולכן אי אפשר לדעת איזה מהם אתם. פנו למרצה.'
                    : 'More than one person is recorded under that name, so we cannot tell which one you are. Ask your lecturer.')}
            </p>
          )}

          <form onSubmit={begin} dir={rtl ? 'rtl' : 'ltr'} className="flex flex-col gap-3">
            <input type="text" required={!def.nameOptional} value={name} onChange={e => setName(e.target.value)}
              placeholder={rtl ? 'שם' : 'Name'}
              className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-gray-200 outline-none focus:border-purple-400" />
            {/* A session has to be chosen before there is anything to begin. */}
            <button type="submit"
              disabled={looking || (!!def.sessions?.length && !session)}
              className="w-full py-3 bg-purple-500 hover:bg-purple-400 text-white font-bold rounded-lg touch-manipulation disabled:opacity-40">
              {looking ? (rtl ? 'מחפשים…' : 'Looking you up…') : (rtl ? 'התחלה' : 'Begin')}
            </button>
          </form>
        </motion.div>
      </main>
    );
  }

  // Between the landing page and the first trial, for a run that cannot begin until
  // something about the device is settled. Looked up by name from a fixed map, never a path:
  // an unknown name is skipped rather than blocking a participant on a screen that will
  // never appear.
  if (stage === 'onboarding') {
    // Guaranteed to exist: the landing page only enters this stage when the name resolves.
    const Gate = ONBOARDING_COMPONENT_MAP[def.onboarding!];
    return (
      <Gate language={language}
        onDone={() => setStage(def.practice ? 'practice' : 'main')} />
    );
  }

  if (stage === 'practice') {
    return (
      <Runner key="practice" definition={def} design={plan[0]?.design} context={plan[0]?.context}
        language={language} practice
        onComplete={() => setStage('practiceDone')} />
    );
  }

  // A pause between practice and the real thing, as every hand-built experiment has: it
  // tells the participant the practice did not count, and lets them start when ready.
  if (stage === 'practiceDone') {
    return (
      <main style={{ height: '100dvh' }} className="bg-[#0f172a] flex flex-col items-center justify-center gap-8 px-6">
        <div className="text-center" dir={rtl ? 'rtl' : 'ltr'}>
          <Check className="w-10 h-10 text-purple-400 mx-auto mb-4" />
          <h2 className="text-3xl font-bold text-gray-100 mb-3">{rtl ? 'התרגול הסתיים!' : 'Practice complete!'}</h2>
          <p className="text-gray-300 text-lg mb-2">{rtl ? 'עכשיו יתחיל הניסוי האמיתי.' : 'The real experiment starts now.'}</p>
          {mainTrialCount > 0 && (
            <p className="text-gray-500 text-sm">{mainTrialCount} {rtl ? 'ניסיונות' : 'trials'}</p>
          )}
        </div>
        {/* Back to whichever block the practice belonged to: the definition's own first
            block, or a later stage that brought its own practice with it. */}
        <button onClick={() => setStage(stageIdx === 0 ? 'main' : 'stageRun')}
          className="px-10 py-4 bg-purple-500 hover:bg-purple-400 text-white font-bold text-xl rounded-xl touch-manipulation">
          {rtl ? 'התחל' : 'Start'}
        </button>
      </main>
    );
  }

  /** After a block: on to the next stage if there is one, otherwise the thank-you screen. */
  const afterBlock = (completed: TrialRow[], nextIdx: number) => {
    setRows(previous => [...previous, ...completed]);
    if (nextIdx < plan.length) {
      setStageIdx(nextIdx);
      // Zero means no intro screen at all, not one that vanishes instantly: DRM's arithmetic
      // runs straight into its recall, and a screen flashing between them would be a pause
      // the original does not have. A block with its own practice still practises first —
      // skipping the intro must not also skip the practice.
      const next = plan[nextIdx];
      setStage(next.autoAdvanceMs !== 0 ? 'stageIntro'
        : next.design.practice ? 'stagePractice' : 'stageRun');
    } else {
      setStage('thanks');
    }
  };

  if (stage === 'main') {
    // Through the plan, like every other block. The first block used to be run from the
    // definition directly, which meant it alone never received the between-subject item —
    // so an experiment whose opening block draws from it built no trials at all.
    const first = plan[0];
    return (
      <Runner key="main" definition={def} design={first.design} context={first.context}
        language={language}
        // Named only when there is more than one block, so a single-block experiment's
        // rows keep exactly the payload they had before stages existed.
        stage={plan.length > 1 ? first.stage : undefined}
        onComplete={completed => afterBlock(completed, 1)} />
    );
  }

  // Between blocks: what is about to happen, and a button to start it when ready — or, for
  // a block that is simply the next beat of a rhythm, a screen that passes by itself.
  if (stage === 'stageIntro') {
    const next = plan[stageIdx];
    if (!next) return null;
    // A later block can bring its own practice, and until this existed it was declared and
    // silently skipped: `Stage.practice` typechecked, validated, and never reached a
    // participant. Only the definition's first block was ever practised, so a two-part
    // experiment — mental rotation after mental scanning, a second task after a first —
    // dropped the practice for every part but the opening one with nothing to show for it.
    return (
      <StageIntro block={next} rtl={rtl}
        onDone={() => setStage(next.design.practice ? 'stagePractice' : 'stageRun')} />
    );
  }

  if (stage === 'stagePractice') {
    const current = plan[stageIdx];
    if (!current) return null;
    return (
      <Runner key={`stage-practice-${stageIdx}`} definition={def} design={current.design}
        context={current.context} language={language} practice
        onComplete={() => setStage('practiceDone')} />
    );
  }

  if (stage === 'stageRun') {
    const current = plan[stageIdx];
    if (!current) return null;
    return (
      // Keyed by position, not by name: a stage group runs the same named block several
      // times, and a key that repeated would leave the previous pass's trials on screen.
      <Runner key={`stage-${stageIdx}`} definition={def} design={current.design}
        stage={current.stage} context={current.context} repetition={current.repetition}
        language={language}
        onComplete={completed => afterBlock(completed, stageIdx + 1)} />
    );
  }

  // ── Thanks: this participant's own result, no teacher-level data ──
  const title = def.thanks?.title
    ? (rtl ? def.thanks.title.he : def.thanks.title.en)
    : (rtl ? 'תודה!' : 'Thank you!');

  if (def.thanks?.showResults === false) {
    return (
      <main className="min-h-screen bg-[#0f172a] flex items-center justify-center px-6 py-10">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
          <Check className="w-16 h-16 text-purple-400 mx-auto mb-6" />
          <h1 className="text-4xl font-bold text-gray-100" dir={rtl ? 'rtl' : 'ltr'}>{title}</h1>
        </motion.div>
      </main>
    );
  }

  const scored = rows.filter(r => r.is_correct !== null);
  const accuracy = scored.length ? Math.round((scored.filter(r => r.is_correct).length / scored.length) * 100) : null;
  // Trials with no timed response (a timeout, or a press that came too early) have no RT,
  // and averaging them in as zero would make the participant look impossibly fast.
  const timed = rows.filter(r => r.reaction_time_ms !== null);
  const meanRt = timed.length ? Math.round(timed.reduce((a, r) => a + (r.reaction_time_ms ?? 0), 0) / timed.length) : 0;

  return (
    <main className="min-h-screen bg-[#0f172a] flex items-center justify-center px-6 py-10">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="bg-gray-900 border border-gray-700 rounded-2xl p-8 w-full max-w-lg text-center">
        <Check className="w-10 h-10 text-purple-400 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-gray-100 mb-6" dir={rtl ? 'rtl' : 'ltr'}>
          {title}
        </h1>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
            <p className="text-3xl font-bold text-purple-400">{accuracy === null ? '—' : `${accuracy}%`}</p>
            <p className="text-xs text-gray-500 mt-1">{rtl ? 'דיוק' : 'accuracy'}</p>
          </div>
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
            <p className="text-3xl font-bold text-purple-400">{meanRt}</p>
            <p className="text-xs text-gray-500 mt-1">{rtl ? 'זמן תגובה ממוצע (מ״ש)' : 'mean RT (ms)'}</p>
          </div>
        </div>

        <p className="text-xs text-gray-600 mb-6">{rows.length} {rtl ? 'ניסיונות' : 'trials'}</p>

        <button onClick={() => router.push('/')}
          className="px-4 py-2 text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg border border-gray-600">
          {rtl ? 'סיום' : 'Done'}
        </button>
      </motion.div>
    </main>
  );
}

/**
 * The screen between two blocks.
 *
 * Waits for a Continue press, unless the block asks to move on by itself — DRM's "List 3 —
 * get ready" and its three-second breaks are part of the pacing, and turning each of them
 * into a button press would hand the participant ten untimed rests the design never gave
 * them.
 */
function StageIntro({ block, rtl, onDone }: {
  block: PlannedBlock;
  rtl: boolean;
  onDone: () => void;
}) {
  // Through a ref so the timer is not restarted by the parent handing down a fresh callback
  // — which would leave a self-advancing screen up for longer than it asked for, or for ever.
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    if (!block.autoAdvanceMs) return;
    const timer = setTimeout(() => done.current(), block.autoAdvanceMs);
    return () => clearTimeout(timer);
  }, [block.autoAdvanceMs]);

  return (
    <main style={{ height: '100dvh' }} className="bg-[#0f172a] flex flex-col items-center justify-center gap-8 px-6">
      <div className="text-center max-w-xl" dir={rtl ? 'rtl' : 'ltr'}>
        <Check className="w-10 h-10 text-purple-400 mx-auto mb-4" />
        {block.title && (
          <h2 className="text-3xl font-bold text-gray-100 mb-3">{rtl ? block.title.he : block.title.en}</h2>
        )}
        {block.instructions && (
          <p className="text-gray-300 leading-relaxed whitespace-pre-line">
            {rtl ? block.instructions.he : block.instructions.en}
          </p>
        )}
      </div>
      {!block.autoAdvanceMs && (
        <button onClick={onDone}
          className="px-10 py-4 bg-purple-500 hover:bg-purple-400 text-white font-bold text-xl rounded-xl touch-manipulation">
          {rtl ? 'המשך' : 'Continue'}
        </button>
      )}
    </main>
  );
}
