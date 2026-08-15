// The file set returned by the generate stage in CREATE_MOCK mode.
//
// These are real, compiling implementations rather than placeholders, because the whole
// point of the preview is to click through a running experiment. A stub that renders an
// empty screen would demo nothing.
//
// Slug is boubaKikiDemo, not boubaKiki: the latter kebabs to "bouba-kiki", which the
// existing experiment already owns (lib/bouba-kiki/, types/bouba-kiki.ts). Staging refuses
// that collision — see lib/create-project/staging.ts.
//
// One deliberate difference from real generated code: the experiment page keeps results in
// sessionStorage instead of inserting into Supabase. Real output writes to the database,
// but a fixture must not put rows in the live table that the course actually uses.

import { GeneratedFile } from './types';

const TYPES = `export type ShapeKind = 'rounded' | 'spiky';

export interface Trial {
  index: number;
  leftShape: ShapeKind;
  rightShape: ShapeKind;
  isControl: boolean;
}

export interface TrialResult {
  session_id: string;
  participant_name: string;
  trial_index: number;
  left_shape: ShapeKind;
  right_shape: ShapeKind;
  chosen_shape: ShapeKind;
  is_conventional: boolean;
  is_control: boolean;
  reaction_time_ms: number;
  is_practice: boolean;
}
`;

const STIMULI = `import { Trial } from '@/types/bouba-kiki-demo';

export const KEY = 'bkd';
export const FIXATION_MS = 500;
export const ITI_MS = 300;
export const N_MAIN = 12;
export const N_CONTROL = 4;
export const N_PRACTICE = 4;

// An irregular rounded blob — the "bouba" shape. Hand-tuned cubic path so it reads as
// organic rather than as a plain circle.
export const BLOB_PATH =
  'M100,18 C137,18 158,42 166,72 C174,102 186,128 166,152 C146,176 118,182 96,180 ' +
  'C68,178 40,168 26,142 C12,116 20,86 32,62 C44,38 68,18 100,18 Z';

/** Spiky star outline — the "kiki" shape. Alternating outer and inner radii. */
export function starPoints(cx: number, cy: number, outer: number, inner: number, spikes = 7): string {
  const pts: string[] = [];
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const angle = (Math.PI / spikes) * i - Math.PI / 2;
    pts.push(String(cx + r * Math.cos(angle)) + ',' + String(cy + r * Math.sin(angle)));
  }
  return pts.join(' ');
}

/** Fisher-Yates, so trial order is genuinely random rather than sort-shuffled. */
export function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function generateTrials(practice = false): Trial[] {
  if (practice) {
    return shuffle(Array.from({ length: N_PRACTICE }, (_, i) => ({
      index: i,
      leftShape: (i % 2 === 0 ? 'rounded' : 'spiky') as Trial['leftShape'],
      rightShape: (i % 2 === 0 ? 'spiky' : 'rounded') as Trial['rightShape'],
      isControl: false,
    })));
  }

  const trials: Trial[] = [];
  for (let i = 0; i < N_MAIN; i++) {
    const roundedLeft = i % 2 === 0;
    trials.push({
      index: i,
      leftShape: roundedLeft ? 'rounded' : 'spiky',
      rightShape: roundedLeft ? 'spiky' : 'rounded',
      isControl: false,
    });
  }
  // Control trials pair two shapes of the same class: with no rounded/spiky contrast the
  // choice should sit at chance, which is what makes the main-trial result meaningful.
  for (let i = 0; i < N_CONTROL; i++) {
    const kind: Trial['leftShape'] = i % 2 === 0 ? 'rounded' : 'spiky';
    trials.push({ index: N_MAIN + i, leftShape: kind, rightShape: kind, isControl: true });
  }
  return shuffle(trials).map((t, i) => ({ ...t, index: i }));
}
`;

const MOCK_DATA = `import { TrialResult } from '@/types/bouba-kiki-demo';

// Deterministic mock dataset for the teacher dashboard, so a lecturer can demo the
// bouba-kiki effect with no real participants. Reproduces the teaching result: the
// conventional mapping (rounded -> bouba) is chosen on roughly 95% of main trials, while
// control trials sit at chance.

const NAMES = ['Noa', 'Yael', 'Tamar', 'Shira', 'Maya', 'Ori', 'Amit', 'Itai',
  'Lior', 'Rotem', 'Omer', 'Talia', 'Dani', 'Gal', 'Yuval'];

function seededRandom(seed: number) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

export function generateMockData(): TrialResult[] {
  const rows: TrialResult[] = [];

  for (let p = 0; p < NAMES.length; p++) {
    const rng = seededRandom(p * 1000 + 71);
    const sid = 'mock-' + String(p) + '-' + NAMES[p].toLowerCase();
    const accBias = 0.88 + rng() * 0.10;   // individual strength of the mapping
    const speedBias = 0.9 + rng() * 0.3;   // individual speed factor

    for (let t = 0; t < 16; t++) {
      const isControl = t >= 12;
      const roundedLeft = t % 2 === 0;
      const conventional = isControl ? rng() < 0.5 : rng() < accBias;

      rows.push({
        session_id: sid,
        participant_name: NAMES[p],
        trial_index: t,
        left_shape: roundedLeft ? 'rounded' : 'spiky',
        right_shape: roundedLeft ? 'spiky' : 'rounded',
        chosen_shape: conventional ? 'rounded' : 'spiky',
        is_conventional: conventional,
        is_control: isControl,
        reaction_time_ms: Math.max(400, Math.round(1200 * speedBias + (rng() - 0.5) * 600)),
        is_practice: false,
      });
    }
  }

  return rows;
}
`;

const LANDING = `'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Shapes } from 'lucide-react';
import { KEY } from '@/lib/bouba-kiki-demo/stimuli';

const TEXT = {
  he: {
    title: 'אפקט בובה-קיקי',
    intro: 'תראו שתי צורות. אחת נקראת "בובה" והשנייה "קיקי". המשימה: לבחור איזו צורה היא "בובה".',
    note: 'אין תשובה נכונה או שגויה — פשוט בחרו מה שמרגיש נכון.',
    name: 'שם',
    begin: 'התחלה',
  },
  en: {
    title: 'Bouba-Kiki Effect',
    intro: 'You will see two shapes. One is called "bouba" and the other "kiki". Your task: choose which shape is "bouba".',
    note: 'There is no right or wrong answer — just pick whichever feels right.',
    name: 'Name',
    begin: 'Begin',
  },
};

export default function LandingPage() {
  const router = useRouter();
  const [language, setLanguage] = useState<'he' | 'en'>('he');
  const [name, setName] = useState('');
  const t = TEXT[language];

  function begin(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    sessionStorage.setItem(KEY + '_name', name.trim());
    sessionStorage.setItem(KEY + '_language', language);
    sessionStorage.setItem(KEY + '_session_id', crypto.randomUUID());
    router.push('./practice');
  }

  return (
    <main className="min-h-screen bg-[#0f172a] flex items-center justify-center px-6 py-10">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="bg-gray-900 border border-gray-700 rounded-2xl p-8 w-full max-w-lg">
        <div className="flex items-center gap-3 mb-6">
          <Shapes className="w-7 h-7 text-purple-400" />
          <h1 className="text-2xl font-bold text-gray-100">{t.title}</h1>
          <button onClick={() => setLanguage(language === 'he' ? 'en' : 'he')}
            className="ml-auto px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg border border-gray-600">
            {language === 'he' ? 'English' : 'עברית'}
          </button>
        </div>

        <div dir={language === 'he' ? 'rtl' : 'ltr'} className="mb-6">
          <p className="text-gray-300 leading-relaxed">{t.intro}</p>
          <p className="text-gray-500 text-sm mt-2">{t.note}</p>
        </div>

        <form onSubmit={begin} dir={language === 'he' ? 'rtl' : 'ltr'} className="flex flex-col gap-3">
          <input type="text" required value={name} onChange={e => setName(e.target.value)}
            placeholder={t.name}
            className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-gray-200 outline-none focus:border-purple-400" />
          <button type="submit"
            className="w-full py-3 bg-purple-500 hover:bg-purple-400 text-white font-bold rounded-lg transition-colors touch-manipulation">
            {t.begin}
          </button>
        </form>
      </motion.div>
    </main>
  );
}
`;

/** Landing, practice and experiment share the trial screen, so it is generated once. */
function trialScreen(opts: { practice: boolean }): string {
  const { practice } = opts;
  return `'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Trial, ShapeKind, TrialResult } from '@/types/bouba-kiki-demo';
import { BLOB_PATH, starPoints, generateTrials, KEY, FIXATION_MS, ITI_MS } from '@/lib/bouba-kiki-demo/stimuli';

type Phase = 'fixation' | 'response' | 'feedback';

function Shape({ kind, size }: { kind: ShapeKind; size: number }) {
  return (
    <svg viewBox="0 0 200 200" width={size} height={size} aria-hidden>
      {kind === 'rounded'
        ? <path d={BLOB_PATH} fill="#a78bfa" />
        : <polygon points={starPoints(100, 100, 92, 38)} fill="#a78bfa" />}
    </svg>
  );
}

export default function ${practice ? 'PracticePage' : 'ExperimentPage'}() {
  const router = useRouter();
  const [trials] = useState<Trial[]>(() => generateTrials(${practice}));
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>('fixation');
  const [language, setLanguage] = useState<'he' | 'en'>('he');
  const [chosen, setChosen] = useState<ShapeKind | null>(null);
  const results = useRef<TrialResult[]>([]);
  const shownAt = useRef(0);

  const trial = trials[idx];
  const rtl = language === 'he';

  useEffect(() => {
    setLanguage((sessionStorage.getItem(KEY + '_language') as 'he' | 'en') || 'he');
  }, []);

  // Timed phases are driven by plain setTimeout and are never wrapped in AnimatePresence,
  // whose exit animation would eat a brief display.
  useEffect(() => {
    if (phase !== 'fixation') return;
    const timer = setTimeout(() => { setPhase('response'); shownAt.current = performance.now(); }, FIXATION_MS);
    return () => clearTimeout(timer);
  }, [phase, idx]);

  function choose(side: 'left' | 'right') {
    if (phase !== 'response' || !trial) return;
    const kind = side === 'left' ? trial.leftShape : trial.rightShape;
    setChosen(kind);

    results.current.push({
      session_id: sessionStorage.getItem(KEY + '_session_id') || 'unknown',
      participant_name: sessionStorage.getItem(KEY + '_name') || 'anonymous',
      trial_index: trial.index,
      left_shape: trial.leftShape,
      right_shape: trial.rightShape,
      chosen_shape: kind,
      is_conventional: kind === 'rounded',
      is_control: trial.isControl,
      reaction_time_ms: Math.round(performance.now() - shownAt.current),
      is_practice: ${practice},
    });

    ${practice ? "setPhase('feedback');" : 'advance();'}
  }

  function advance() {
    if (idx + 1 >= trials.length) {
      ${practice
        ? "router.push('./experiment');"
        : "sessionStorage.setItem(KEY + '_results', JSON.stringify(results.current)); router.push('./thanks');"}
      return;
    }
    setChosen(null);
    setPhase('fixation');
    setTimeout(() => setIdx(i => i + 1), ITI_MS);
  }

  if (!trial) return null;

  return (
    <main style={{ height: '100dvh' }} className="bg-[#0f172a] flex flex-col">
      <div className="flex-shrink-0 h-6">
        <div className="h-1.5 bg-gray-800">
          <motion.div className="h-full bg-purple-500"
            animate={{ width: String((idx / trials.length) * 100) + '%' }}
            transition={{ duration: 0.4 }} />
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center gap-10 px-6">
        {phase === 'fixation' && <div className="text-4xl text-gray-500">+</div>}

        {phase !== 'fixation' && (
          <>
            <p className="text-lg text-gray-300" dir={rtl ? 'rtl' : 'ltr'}>
              {rtl ? 'איזו צורה היא "בובה"?' : 'Which shape is "bouba"?'}
            </p>

            <div className="flex items-center gap-10" style={{ flexDirection: 'row', direction: rtl ? 'rtl' : 'ltr' }}>
              {(['left', 'right'] as const).map(side => {
                const kind = side === 'left' ? trial.leftShape : trial.rightShape;
                const picked = chosen === kind && phase === 'feedback';
                return (
                  <button key={side} onClick={() => choose(side)}
                    disabled={phase !== 'response'}
                    className={'rounded-2xl border-2 p-4 transition-colors touch-manipulation ' +
                      (picked ? 'border-purple-400 bg-purple-500/10' : 'border-gray-700 hover:border-gray-500')}>
                    <Shape kind={kind} size={140} />
                  </button>
                );
              })}
            </div>
          </>
        )}

        ${practice ? `{phase === 'feedback' && (
          <div className="flex flex-col items-center gap-4" dir={rtl ? 'rtl' : 'ltr'}>
            <p className="text-sm text-gray-400">
              {rtl ? 'נרשם. אין תשובה נכונה כאן.' : 'Recorded. There is no correct answer here.'}
            </p>
            <button onClick={advance}
              className="px-6 py-3 bg-purple-500 hover:bg-purple-400 text-white font-semibold rounded-lg touch-manipulation">
              {rtl ? 'המשך' : 'Next'}
            </button>
          </div>
        )}` : ''}
      </div>

      <p className="flex-shrink-0 text-center text-xs text-gray-600 pb-4">
        ${practice ? "{rtl ? 'תרגול' : 'Practice'} " : ''}{idx + 1} / {trials.length}
      </p>
    </main>
  );
}
`;
}

const THANKS = `'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { TrialResult } from '@/types/bouba-kiki-demo';
import { KEY } from '@/lib/bouba-kiki-demo/stimuli';

export default function ThanksPage() {
  const router = useRouter();
  const [rows, setRows] = useState<TrialResult[]>([]);
  const [rtl, setRtl] = useState(true);

  useEffect(() => {
    setRtl((sessionStorage.getItem(KEY + '_language') || 'he') === 'he');
    try {
      setRows(JSON.parse(sessionStorage.getItem(KEY + '_results') || '[]') as TrialResult[]);
    } catch {
      setRows([]);
    }
  }, []);

  const main = rows.filter(r => !r.is_control);
  const rate = main.length ? Math.round((main.filter(r => r.is_conventional).length / main.length) * 100) : 0;
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
            <p className="text-3xl font-bold text-purple-400">{rate}%</p>
            <p className="text-xs text-gray-500 mt-1">
              {rtl ? 'מיפוי מוסכם' : 'conventional mapping'}
            </p>
          </div>
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
            <p className="text-3xl font-bold text-purple-400">{meanRt}</p>
            <p className="text-xs text-gray-500 mt-1">{rtl ? 'זמן תגובה ממוצע (מ״ש)' : 'mean RT (ms)'}</p>
          </div>
        </div>

        <p className="text-sm text-gray-400 mb-6" dir={rtl ? 'rtl' : 'ltr'}>
          {rtl
            ? 'רוב האנשים בוחרים בצורה המעוגלת כ"בובה" — הקשר בין צליל לצורה אינו שרירותי.'
            : 'Most people pick the rounded shape as "bouba" — the link between sound and shape is not arbitrary.'}
        </p>

        <button onClick={() => router.push('/')}
          className="px-4 py-2 text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg border border-gray-600">
          {rtl ? 'סיום' : 'Done'}
        </button>
      </motion.div>
    </main>
  );
}
`;

const TEACHER = `'use client';

import { useCallback, useEffect, useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Shapes } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ErrorBar,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { getSupabase } from '@/lib/supabase';
import { verifyPassword } from '@/lib/auth';
import { TrialResult } from '@/types/bouba-kiki-demo';
import { generateMockData } from '@/lib/bouba-kiki-demo/mock-data';

const BTN = 'px-4 py-2 text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg border border-gray-600';

function sem(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance / values.length);
}

function ChartCard({ title, children }: { title: string; children: (revealed: boolean) => React.ReactNode }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-semibold text-gray-200">{title}</h3>
        <button onClick={() => setRevealed(r => !r)}
          className="text-xs px-3 py-1 rounded-full border border-gray-600 text-gray-400 hover:border-purple-400 hover:text-purple-400 transition-colors">
          {revealed ? 'Hide' : 'Reveal'}
        </button>
      </div>
      {children(revealed)}
    </div>
  );
}

export default function TeacherPage() {
  const router = useRouter();
  const [authed, setAuthed] = useState(false);
  const [pwInput, setPwInput] = useState('');
  const [pwError, setPwError] = useState(false);
  const [rows, setRows] = useState<TrialResult[]>([]);
  const [useMock, setUseMock] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem('ss_teacher_authed') === '1') setAuthed(true);
  }, []);

  const loadRows = useCallback(async () => {
    const sb = getSupabase();
    if (!sb) return;
    const all: TrialResult[] = [];
    let from = 0;
    // The server caps a select at 1000 rows regardless of .limit(), so page through.
    for (;;) {
      const { data, error } = await sb.from('bouba_kiki_demo_results').select('*')
        .eq('is_practice', false).order('created_at', { ascending: true }).range(from, from + 999);
      if (error || !data || data.length === 0) break;
      all.push(...(data as TrialResult[]));
      if (data.length < 1000) break;
      from += 1000;
    }
    setRows(all);
  }, []);

  useEffect(() => {
    if (!authed) return;
    if (useMock) setRows(generateMockData());
    else void loadRows();
  }, [authed, useMock, loadRows]);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    if (await verifyPassword(pwInput)) {
      sessionStorage.setItem('ss_teacher_authed', '1');
      setAuthed(true);
    } else {
      setPwError(true);
      setPwInput('');
    }
  };

  function downloadCsv() {
    if (rows.length === 0) return;
    const cols = Object.keys(rows[0]);
    const body = rows.map(r =>
      cols.map(c => JSON.stringify((r as unknown as Record<string, unknown>)[c] ?? '')).join(','),
    );
    const csv = [cols.join(','), ...body].join('\\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bouba-kiki-demo.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!authed) {
    return (
      <main className="min-h-screen bg-[#0f172a] flex items-center justify-center px-6">
        <div className="bg-gray-900 border border-gray-700 rounded-2xl p-10 w-full max-w-sm flex flex-col items-center gap-6">
          <Shapes className="w-10 h-10 text-purple-400" />
          <h1 className="text-xl font-bold text-gray-100">Teacher Dashboard</h1>
          <form onSubmit={handleLogin} className="w-full flex flex-col gap-3">
            <input type="password" value={pwInput} autoFocus placeholder="Password"
              onChange={e => { setPwInput(e.target.value); setPwError(false); }}
              className={'w-full px-4 py-3 rounded-lg border bg-gray-800 text-white outline-none ' +
                (pwError ? 'border-red-500' : 'border-gray-600 focus:border-purple-400')} />
            {pwError && <p className="text-red-400 text-sm text-center">Incorrect password</p>}
            <button type="submit" className="w-full py-3 bg-purple-500 hover:bg-purple-400 text-white font-bold rounded-lg">
              Enter
            </button>
          </form>
        </div>
      </main>
    );
  }

  const participants = new Set(rows.map(r => r.session_id)).size;
  const byParticipant = new Map<string, { main: TrialResult[]; control: TrialResult[] }>();
  for (const r of rows) {
    const entry = byParticipant.get(r.session_id) ?? { main: [], control: [] };
    (r.is_control ? entry.control : entry.main).push(r);
    byParticipant.set(r.session_id, entry);
  }

  // Per-participant rates first, then SEM across participants — never across raw trials.
  const mainRates = [...byParticipant.values()].filter(e => e.main.length)
    .map(e => (e.main.filter(r => r.is_conventional).length / e.main.length) * 100);
  const controlRates = [...byParticipant.values()].filter(e => e.control.length)
    .map(e => (e.control.filter(r => r.is_conventional).length / e.control.length) * 100);
  const mean = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;

  const conditionData = [
    { condition: 'Main (rounded vs spiky)', rate: mean(mainRates), sem: sem(mainRates) },
    { condition: 'Control (same class)', rate: mean(controlRates), sem: sem(controlRates) },
  ];

  const participantData = [...byParticipant.entries()]
    .filter(([, e]) => e.main.length)
    .map(([sid, e]) => ({
      name: e.main[0]?.participant_name ?? sid.slice(0, 6),
      rate: (e.main.filter(r => r.is_conventional).length / e.main.length) * 100,
    }))
    .sort((a, b) => b.rate - a.rate);

  return (
    <main className="min-h-screen bg-[#0f172a] px-6 py-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-start gap-3 flex-wrap mb-6">
          <Shapes className="w-7 h-7 text-purple-400 flex-shrink-0 mt-0.5" />
          <div>
            <h1 className="text-2xl font-bold text-gray-100">Bouba-Kiki Effect</h1>
            <p className="text-sm text-purple-400 mt-0.5">
              {participants} participants · {rows.length} trials
              {useMock && (
                <span className="ml-2 text-xs px-2 py-0.5 rounded-full border border-amber-400 bg-amber-500/20 text-amber-400">
                  mock data
                </span>
              )}
            </p>
          </div>
          <div className="flex gap-3 flex-wrap ml-auto">
            <button onClick={() => setUseMock(m => !m)}
              className={useMock
                ? 'px-4 py-2 text-sm rounded-lg border bg-amber-500/20 border-amber-400 text-amber-400'
                : BTN}>
              Mock Data
            </button>
            <button onClick={() => { if (useMock) setRows(generateMockData()); else void loadRows(); }} className={BTN}>
              Refresh
            </button>
            <button onClick={downloadCsv} className={BTN}>Download CSV</button>
            <button onClick={() => router.push('/')} className={BTN}>Home</button>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-10 text-center">
            <p className="text-gray-400">No data yet.</p>
            <p className="text-sm text-gray-600 mt-1">
              Turn on <span className="text-amber-400">Mock Data</span> to demo the effect with no participants.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <ChartCard title="Conventional mapping by trial type">
              {(revealed) => (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={conditionData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="condition" stroke="#9ca3af" />
                    <YAxis stroke="#9ca3af" domain={[0, 100]}
                      label={{ value: 'Chose rounded = bouba (%)', angle: -90, position: 'insideLeft', fill: '#9ca3af' }} />
                    <Tooltip contentStyle={{ background: '#111827', border: '1px solid #374151' }} />
                    <Legend verticalAlign="top" />
                    <ReferenceLine y={50} stroke="#6b7280" strokeDasharray="6 4" />
                    {revealed && (
                      <Bar dataKey="rate" fill="#a78bfa" name="Conventional (%)">
                        <ErrorBar dataKey="sem" width={4} strokeWidth={1.5} stroke="#6b7280" direction="y" />
                      </Bar>
                    )}
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard title="Individual participants">
              {(revealed) => (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={participantData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="name" stroke="#9ca3af" />
                    <YAxis stroke="#9ca3af" domain={[0, 100]}
                      label={{ value: 'Conventional (%)', angle: -90, position: 'insideLeft', fill: '#9ca3af' }} />
                    <Tooltip contentStyle={{ background: '#111827', border: '1px solid #374151' }} />
                    <Legend verticalAlign="top" />
                    <ReferenceLine y={50} stroke="#6b7280" strokeDasharray="6 4" />
                    {revealed && <Bar dataKey="rate" fill="#a78bfa" name="Conventional (%)" />}
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </div>
        )}
      </div>
    </main>
  );
}
`;

const SQL = `CREATE TABLE IF NOT EXISTS bouba_kiki_demo_results (
  id               bigint generated always as identity primary key,
  created_at       timestamptz default now() not null,
  session_id       text not null,
  participant_name text,
  trial_index      int,
  left_shape       text,
  right_shape      text,
  chosen_shape     text,
  is_conventional  boolean,
  is_control       boolean,
  reaction_time_ms int,
  is_practice      boolean default false
);

ALTER TABLE bouba_kiki_demo_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow insert" ON bouba_kiki_demo_results FOR INSERT WITH CHECK (true);
CREATE POLICY "allow select" ON bouba_kiki_demo_results FOR SELECT USING (true);
`;

export const FIXTURE_FILES: GeneratedFile[] = [
  { path: 'types/bouba-kiki-demo.ts', contents: TYPES },
  { path: 'lib/bouba-kiki-demo/stimuli.ts', contents: STIMULI },
  { path: 'lib/bouba-kiki-demo/mock-data.ts', contents: MOCK_DATA },
  { path: 'app/boubaKikiDemo/page.tsx', contents: LANDING },
  { path: 'app/boubaKikiDemo/practice/page.tsx', contents: trialScreen({ practice: true }) },
  { path: 'app/boubaKikiDemo/experiment/page.tsx', contents: trialScreen({ practice: false }) },
  { path: 'app/boubaKikiDemo/thanks/page.tsx', contents: THANKS },
  { path: 'app/boubaKikiDemo/teacher/page.tsx', contents: TEACHER },
  { path: 'supabase/schemas/bouba-kiki-demo.sql', contents: SQL },
];
