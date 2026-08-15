'use client';

import { useEffect, useState, FormEvent } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { Beaker, Brain, BrainCog, BarChart2, FlaskConical, Shapes, Target, Search, Users, Type, Lock, LockOpen, Timer, GitFork, List, BookOpen, Lightbulb, Sparkles, Eye, FilePlus2, ArrowRight } from 'lucide-react';
import { getSupabase } from '@/lib/supabase';
import { verifyPassword } from '@/lib/auth';

// `href` is set for experiments built as definitions, which all live under /run/{slug}
// rather than having a route of their own. Without it a generated experiment gets a card
// that 404s.
type Exp = { id: string; title: string; titleHe: string; icon: React.ElementType; color: string; href?: string };

const EXPERIMENTS: Exp[] = [
  { id: 'summaryStats',    title: 'Ensemble Perception',     titleHe: 'תפיסת מכלול',        icon: BarChart2, color: 'text-orange-400'  },
  { id: 'CompositeFace',   title: 'Composite Face Task',     titleHe: 'משימת פנים מורכבות', icon: Users,     color: 'text-pink-400'    },
  { id: 'wordSuperiority', title: 'Word Superiority Effect', titleHe: 'אפקט עליונות המילה', icon: Type,      color: 'text-teal-400'    },
  { id: 'visualSearch',    title: 'Visual Search',           titleHe: 'חיפוש חזותי',        icon: Search,    color: 'text-rose-400'    },
  { id: 'posnerCueing',    title: 'Spatial Cueing',          titleHe: 'הכוונה מרחבית',      icon: Target,    color: 'text-amber-400'   },
  { id: 'bouba-kiki',      title: 'Bouba-Kiki Effect',       titleHe: 'אפקט בובה-קיקי',    icon: Shapes,    color: 'text-indigo-400'  },
  { id: 'stroop',          title: 'Stroop Effect',           titleHe: 'אפקט סטרופ',         icon: Brain,     color: 'text-emerald-400' },
  { id: 'mentalRep',       title: 'Mental Representation',   titleHe: 'ייצוג מנטלי',        icon: BrainCog,  color: 'text-cyan-400'    },
  { id: 'drm',             title: 'Memory (DRM)',             titleHe: 'זיכרון (DRM)',        icon: Beaker,    color: 'text-emerald-400' },
  { id: 'srt',             title: 'Serial Reaction Time',   titleHe: 'זמן תגובה סדרתי',    icon: Timer,     color: 'text-lime-400'    },
  { id: 'twoStepTask',     title: 'Two-Step Task',          titleHe: 'משימת שני השלבים',    icon: GitFork,   color: 'text-violet-400'  },
  { id: 'serialOrder',     title: 'Serial Position',        titleHe: 'זיכרון סדרתי',        icon: List,      color: 'text-sky-400'     },
  { id: 'testingEffect',   title: 'Testing Effect',         titleHe: 'אפקט הבחינה',         icon: BookOpen,  color: 'text-blue-400'    },
  { id: 'logics',          title: 'Reasoning Biases',       titleHe: 'הטיות בחשיבה',         icon: Lightbulb, color: 'text-yellow-400'  },
  { id: 'creativity',      title: 'Creativity Battery',     titleHe: 'סוללת יצירתיות',       icon: Sparkles,  color: 'text-emerald-400' },
  { id: 'bRMS',             title: 'bRMS Emotion',           titleHe: 'bRMS רגש',              icon: Eye,       color: 'text-purple-400'  },
  { id: 'boubaKikiDemo', title: 'Bouba / Kiki shape–sound mapping', titleHe: 'אפקט בובה-קיקי', icon: Shapes, color: 'text-purple-400' },
  { id: 'flankerLetterTask', title: 'Flanker Letter Identification: Effects of Noise Letters', titleHe: 'משימת זיהוי אות מוקפת ברעש (אפקט הפלנקר)', icon: Shapes, color: 'text-purple-400', href: '/run/flankerLetterTask' },
];

const CATEGORIES = [
  { name: 'PERCEPTION',        nameHe: 'תפיסה',         ids: ['summaryStats', 'CompositeFace', 'wordSuperiority'] },
  { name: 'ATTENTION',         nameHe: 'קשב',           ids: ['visualSearch', 'posnerCueing', 'flankerLetterTask'] },
  { name: 'LANGUAGE',          nameHe: 'שפה',           ids: ['bouba-kiki', 'boubaKikiDemo'] },
  { name: 'EXECUTIVE CONTROL', nameHe: 'בקרה ניהולית', ids: ['stroop'] },
  { name: 'IMAGINATION',       nameHe: 'דמיון',         ids: ['mentalRep'] },
  { name: 'MEMORY',            nameHe: 'זיכרון',        ids: ['drm', 'serialOrder', 'testingEffect'] },
  { name: 'LEARNING',          nameHe: 'למידה',         ids: ['srt', 'twoStepTask'] },
  { name: 'CONSCIOUSNESS',     nameHe: 'תודעה',         ids: ['bRMS'] },
  { name: 'DECISION MAKING',   nameHe: 'קבלת החלטות',  ids: [] },
  { name: 'REASONING',         nameHe: 'חשיבה',         ids: ['logics'] },
  { name: 'CATEGORIZATION',    nameHe: 'קטגוריזציה',   ids: [] },
  { name: 'HUMOR',             nameHe: 'הומור',         ids: [] },
  { name: 'CREATIVITY',        nameHe: 'יצירתיות',     ids: ['creativity'] },
];

export default function HomePage() {
  const router = useRouter();
  const [authed,   setAuthed]   = useState(false);
  const [pwInput,  setPwInput]  = useState('');
  const [pwError,  setPwError]  = useState(false);
  const [locks,    setLocks]    = useState<Record<string, boolean>>({});
  const [toggling, setToggling] = useState<Record<string, boolean>>({});

  // Re-hydrate auth from session
  useEffect(() => {
    if (sessionStorage.getItem('ss_home_authed') === '1') {
      setAuthed(true);
      loadLocks();
    }
  }, []);

  async function loadLocks() {
    const sb = getSupabase();
    if (!sb) return;
    const { data } = await sb.from('experiment_locks').select('experiment_id, is_locked');
    if (data) {
      const map: Record<string, boolean> = {};
      (data as { experiment_id: string; is_locked: boolean }[]).forEach(
        row => { map[row.experiment_id] = row.is_locked; }
      );
      setLocks(map);
    }
  }

  async function toggleLock(id: string) {
    if (toggling[id]) return;
    const newValue = !locks[id];
    setToggling(t => ({ ...t, [id]: true }));
    setLocks(l => ({ ...l, [id]: newValue }));           // optimistic update
    const sb = getSupabase();
    if (sb) {
      const { error } = await sb.from('experiment_locks').upsert({
        experiment_id: id,
        is_locked:     newValue,
        updated_at:    new Date().toISOString(),
      });
      if (error) setLocks(l => ({ ...l, [id]: !newValue })); // revert on failure
    }
    setToggling(t => ({ ...t, [id]: false }));
  }

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    const ok = await verifyPassword(pwInput);
    if (ok) {
      sessionStorage.setItem('ss_home_authed', '1');
      // Set session cookie so middleware skips lock checks for admin
      document.cookie = 'cognitives_admin=1; path=/; SameSite=Strict';
      setAuthed(true);
      loadLocks();
    } else {
      setPwError(true);
      setPwInput('');
    }
  };

  if (!authed) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-border rounded-xl p-10 w-full max-w-sm flex flex-col items-center gap-6"
        >
          <FlaskConical className="w-10 h-10 text-emerald-400" />
          <div className="text-center">
            <h1 className="text-2xl font-bold">תהליכים קוגניטיביים</h1>
            <p className="text-muted text-sm mt-1">Cognitive Processes</p>
          </div>
          <form onSubmit={handleLogin} className="w-full flex flex-col gap-3">
            <input
              type="password"
              value={pwInput}
              onChange={e => { setPwInput(e.target.value); setPwError(false); }}
              placeholder="Password"
              autoFocus
              className={`w-full px-4 py-3 rounded-lg border bg-zinc-800 text-white outline-none transition-colors
                ${pwError ? 'border-red-500' : 'border-border focus:border-emerald-400'}`}
            />
            {pwError && <p className="text-red-400 text-sm text-center">Incorrect password</p>}
            <button type="submit"
              className="w-full py-3 bg-emerald-400 hover:bg-emerald-300 text-zinc-900 font-bold rounded-lg transition-colors">
              Enter
            </button>
          </form>
        </motion.div>
      </main>
    );
  }

  const expMap = Object.fromEntries(EXPERIMENTS.map(e => [e.id, e]));

  return (
    <main className="min-h-screen flex flex-col items-center px-6 py-10">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-4xl"
      >
        {/* Header */}
        <div className="flex items-center gap-3 mb-1">
          <FlaskConical className="w-7 h-7 text-emerald-400" />
          <h1 className="text-2xl font-bold">תהליכים קוגניטיביים</h1>
        </div>
        <p className="text-sm text-muted mb-10 ml-10">
          ניסויי כיתה &nbsp;•&nbsp; Cognitive Processes Course Experiments
        </p>

        {/* Category rows */}
        <div className="divide-y divide-gray-800/60">
          {CATEGORIES.map(cat => (
            <div key={cat.name} className="flex gap-6 py-5">

              {/* Category label */}
              <div className="w-44 flex-shrink-0 pt-1">
                <p className="text-xs font-bold tracking-widest text-gray-400">{cat.name}</p>
                <p className="text-xs text-gray-600 mt-0.5" dir="rtl">{cat.nameHe}</p>
              </div>

              {/* Experiment cards */}
              <div className="flex flex-wrap gap-3 flex-1">
                {cat.ids.length > 0 ? cat.ids.map(id => {
                  const exp    = expMap[id];
                  const locked = !!locks[id];
                  return (
                    <motion.div
                      key={id}
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      className={`relative flex flex-col items-center gap-2 bg-card border rounded-xl px-4 py-4 w-36 transition-all
                        ${locked ? 'border-gray-700/60 opacity-60' : 'border-border hover:border-emerald-400/40'}`}
                    >
                      {/* Lock toggle — top-right corner */}
                      <button
                        onClick={() => toggleLock(id)}
                        title={locked ? 'Unlock experiment' : 'Lock experiment'}
                        className="absolute top-1.5 right-1.5 p-1 rounded hover:bg-gray-700/60 transition-colors"
                      >
                        {toggling[id] ? (
                          <div className="w-3 h-3 border border-gray-500 border-t-transparent rounded-full animate-spin" />
                        ) : locked ? (
                          <Lock className="w-3 h-3 text-amber-400" />
                        ) : (
                          <LockOpen className="w-3 h-3 text-gray-600" />
                        )}
                      </button>

                      {/* Navigate to experiment */}
                      <button
                        onClick={() => router.push(exp.href ?? `/${id}`)}
                        className="flex flex-col items-center gap-2 w-full"
                      >
                        <exp.icon className={`w-8 h-8 ${exp.color}`} />
                        <div className="text-center">
                          <p className="text-xs font-semibold leading-snug">{exp.title}</p>
                          <p className="text-xs text-gray-500 leading-snug mt-0.5" dir="rtl">{exp.titleHe}</p>
                        </div>
                      </button>
                    </motion.div>
                  );
                }) : (
                  <div className="flex items-center">
                    <span className="text-xs text-gray-700 italic">— coming soon</span>
                  </div>
                )}
              </div>

            </div>
          ))}
        </div>

        {/* Create New Project — the paper → experiment pipeline */}
        <motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          onClick={() => router.push('/create')}
          className="mt-10 w-full flex items-center gap-4 text-left bg-card border border-border hover:border-purple-400/50 rounded-xl px-5 py-5 transition-colors"
        >
          <FilePlus2 className="w-8 h-8 text-purple-400 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold">Create New Project</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Upload a paper → pick an experiment from it → edit the spec → generate the code
            </p>
            <p className="text-xs text-gray-600 mt-0.5" dir="rtl">יצירת ניסוי חדש ממאמר</p>
          </div>
          <ArrowRight className="w-4 h-4 text-gray-600 flex-shrink-0" />
        </motion.button>
      </motion.div>
    </main>
  );
}
