'use client';

// The one route that runs any experiment definition.
//
// This is what replaces per-experiment landing/practice/experiment/thanks pages: the same
// four stages, driven by data. Adding an experiment adds a definition, not a route — which
// is what makes the whole approach scale to many lecturers without a deploy each time.

import { use, useEffect, useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { FlaskConical, Check } from 'lucide-react';
import { ExperimentDefinition } from '@/lib/experiment-runtime/schema';
import { getDefinition } from '@/lib/experiment-runtime/registry';
import { Runner, TrialRow } from '@/lib/experiment-runtime/Runner';

type Stage = 'loading' | 'missing' | 'landing' | 'practice' | 'main' | 'thanks';

export default function RunPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const router = useRouter();

  const [def, setDef] = useState<ExperimentDefinition | null>(null);
  const [stage, setStage] = useState<Stage>('loading');
  const [language, setLanguage] = useState<'he' | 'en'>('he');
  const [name, setName] = useState('');
  const [rows, setRows] = useState<TrialRow[]>([]);

  useEffect(() => {
    getDefinition(slug).then(d => {
      setDef(d);
      setStage(d ? 'landing' : 'missing');
    });
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
      if (!name.trim()) return;
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

          <p className="text-gray-300 leading-relaxed mb-6" dir={rtl ? 'rtl' : 'ltr'}>
            {rtl ? def.instructions.he : def.instructions.en}
          </p>

          <form onSubmit={begin} dir={rtl ? 'rtl' : 'ltr'} className="flex flex-col gap-3">
            <input type="text" required value={name} onChange={e => setName(e.target.value)}
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
        onComplete={() => setStage('main')} />
    );
  }

  if (stage === 'main') {
    return (
      <Runner key="main" definition={def} language={language}
        onComplete={completed => { setRows(completed); setStage('thanks'); }} />
    );
  }

  // ── Thanks: this participant's own result, no teacher-level data ──
  const scored = rows.filter(r => r.is_correct !== null);
  const accuracy = scored.length ? Math.round((scored.filter(r => r.is_correct).length / scored.length) * 100) : null;
  const meanRt = rows.length ? Math.round(rows.reduce((a, r) => a + r.reaction_time_ms, 0) / rows.length) : 0;

  return (
    <main className="min-h-screen bg-[#0f172a] flex items-center justify-center px-6 py-10">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="bg-gray-900 border border-gray-700 rounded-2xl p-8 w-full max-w-lg text-center">
        <Check className="w-10 h-10 text-purple-400 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-gray-100 mb-6" dir={rtl ? 'rtl' : 'ltr'}>
          {rtl ? 'תודה!' : 'Thank you!'}
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
