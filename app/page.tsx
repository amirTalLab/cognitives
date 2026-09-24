'use client';

import { useEffect, useState, FormEvent } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { FlaskConical, Lock, LockOpen, FilePlus2, ArrowRight, QrCode, BarChart2 } from 'lucide-react';
import { getSupabase } from '@/lib/supabase';
import { verifyPassword } from '@/lib/auth';
import { PASSWORD_KEY, setExperimentLock, storedPassword } from '@/lib/protected-writes';
import { ExperimentQr } from '@/components/ExperimentQr';

import { EXPERIMENTS, CATEGORIES } from '@/lib/experiments';

export default function HomePage() {
  const router = useRouter();
  const [authed,   setAuthed]   = useState(false);
  const [pwInput,  setPwInput]  = useState('');
  const [pwError,  setPwError]  = useState(false);
  const [locks,    setLocks]    = useState<Record<string, boolean>>({});
  const [toggling, setToggling] = useState<Record<string, boolean>>({});
  const [lockError, setLockError] = useState<string | null>(null);
  // Which experiment's QR code is on screen. Here rather than on the teacher dashboard:
  // projecting the link should not mean projecting the class's results as well.
  const [qrFor, setQrFor] = useState<{ path: string; title: string } | null>(null);

  // Re-hydrate auth from session. The password itself is needed, not just the flag:
  // changing a lock goes through a database function that checks it, so a session that
  // only remembers "logged in" would have every toggle refused. Such a session is asked
  // for the password once more instead.
  useEffect(() => {
    if (sessionStorage.getItem('ss_home_authed') === '1' && storedPassword()) {
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
    setLockError(null);
    setLocks(l => ({ ...l, [id]: newValue }));           // optimistic update
    // Through the password-checked database function: the public key cannot write the
    // lock table, or any visitor could lock a class out of an experiment.
    const result = await setExperimentLock(id, newValue);
    if (!result.ok) {
      setLocks(l => ({ ...l, [id]: !newValue }));         // revert on failure
      setLockError(result.error ?? 'The lock could not be changed.');
    }
    setToggling(t => ({ ...t, [id]: false }));
  }

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    const ok = await verifyPassword(pwInput);
    if (ok) {
      sessionStorage.setItem('ss_home_authed', '1');
      // Kept for this tab so lock changes can be checked by the database.
      sessionStorage.setItem(PASSWORD_KEY, pwInput);
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

        {/* A refused lock change is undone on its card; this says why. */}
        {lockError && (
          <div role="alert" className="mb-6 p-3 rounded-lg border border-red-500/40 bg-red-500/10 text-red-300 text-sm">
            {lockError}
          </div>
        )}

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
                      {/* Teacher dashboard — top-left, mirroring the lock on the right.
                          The dashboard for an experiment always sits directly under it,
                          so this is the card's link with /teacher appended. Not blocked
                          when the experiment is locked: locking stops students, and the
                          lecturer still needs to read the results. */}
                      <button
                        onClick={() => router.push(`${exp.href ?? `/${id}`}/teacher`)}
                        title={`Teacher dashboard — ${exp.title}`}
                        className="absolute top-1.5 left-1.5 p-1 rounded hover:bg-gray-700/60 transition-colors"
                      >
                        <BarChart2 className="w-3 h-3 text-gray-600 hover:text-purple-400" />
                      </button>

                      {/* QR code — next to the dashboard icon, since both are lecturer
                          tools. Projecting the link no longer means opening a dashboard in
                          front of the class. */}
                      <button
                        onClick={() => setQrFor({ path: exp.href ?? `/${id}`, title: exp.title })}
                        title={`QR code for students — ${exp.title}`}
                        className="absolute top-1.5 left-7 p-1 rounded hover:bg-gray-700/60 transition-colors"
                      >
                        <QrCode className="w-3 h-3 text-gray-600 hover:text-purple-400" />
                      </button>

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

        {qrFor && (
          <ExperimentQr path={qrFor.path} title={qrFor.title} onClose={() => setQrFor(null)} />
        )}

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
