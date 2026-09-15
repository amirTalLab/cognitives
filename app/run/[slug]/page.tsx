'use client';

// The one route that runs any experiment definition.
//
// This is what replaces per-experiment landing/practice/experiment/thanks pages: the same
// four stages, driven by data. Adding an experiment adds a definition, not a route — which
// is what makes the whole approach scale to many lecturers without a deploy each time.

import { use, useEffect, useMemo, useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { FlaskConical, Check } from 'lucide-react';
import { ExperimentDefinition } from '@/lib/experiment-runtime/schema';
import { getDefinition } from '@/lib/experiment-runtime/registry';
import { Runner, TrialRow } from '@/lib/experiment-runtime/Runner';
import { buildTrials } from '@/lib/experiment-runtime/trials';

type Stage = 'loading' | 'missing' | 'landing' | 'practice' | 'practiceDone' | 'main' | 'thanks';

export default function RunPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const router = useRouter();

  const [def, setDef] = useState<ExperimentDefinition | null>(null);
  const [stage, setStage] = useState<Stage>('loading');
  const [language, setLanguage] = useState<'he' | 'en'>('he');
  const [name, setName] = useState('');
  const [rows, setRows] = useState<TrialRow[]>([]);

  // For the practice-complete screen. Counted from the design, since the main block's runner
  // has not been built yet when that screen is up.
  const mainTrialCount = useMemo(() => {
    if (!def) return 0;
    try {
      return buildTrials(def).length;
    } catch {
      return 0;
    }
  }, [def]);

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
    const begin = (e: FormEvent) => {
      e.preventDefault();
      if (!def.nameOptional && !name.trim()) return;
      sessionStorage.setItem(`${def.slug}_name`, name.trim());
      sessionStorage.setItem(`${def.slug}_language`, language);
      sessionStorage.setItem(`${def.slug}_session_id`, crypto.randomUUID());
      setStage(def.practice ? 'practice' : 'main');
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

          {/* pre-line keeps the paragraphs a lecturer types in /create's instructions box. */}
          <p className="text-gray-300 leading-relaxed mb-6 whitespace-pre-line" dir={rtl ? 'rtl' : 'ltr'}>
            {rtl ? def.instructions.he : def.instructions.en}
          </p>

          <form onSubmit={begin} dir={rtl ? 'rtl' : 'ltr'} className="flex flex-col gap-3">
            <input type="text" required={!def.nameOptional} value={name} onChange={e => setName(e.target.value)}
              placeholder={rtl ? 'שם' : 'Name'}
              className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-gray-200 outline-none focus:border-purple-400" />
            <button type="submit"
              className="w-full py-3 bg-purple-500 hover:bg-purple-400 text-white font-bold rounded-lg touch-manipulation">
              {rtl ? 'התחלה' : 'Begin'}
            </button>
          </form>
        </motion.div>
      </main>
    );
  }

  if (stage === 'practice') {
    return (
      <Runner key="practice" definition={def} language={language} practice
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
        <button onClick={() => setStage('main')}
          className="px-10 py-4 bg-purple-500 hover:bg-purple-400 text-white font-bold text-xl rounded-xl touch-manipulation">
          {rtl ? 'התחל' : 'Start'}
        </button>
      </main>
    );
  }

  if (stage === 'main') {
    return (
      <Runner key="main" definition={def} language={language}
        onComplete={completed => { setRows(completed); setStage('thanks'); }} />
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
