'use client';

// "Create New Project" — the in-app version of the paper -> experiment pipeline.
//
// One section, four nested stages: upload a paper, pick an experiment from it, edit the
// design spec, then refine.
//
// Refine deliberately shows the running experiment and a text box — not the source. A
// lecturer judges an experiment by taking it, so generating code and iterating on it are
// one stage, and the code itself is never put in front of them.

import { useCallback, useEffect, useRef, useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Sparkles, Upload, FileText, Check, AlertTriangle, XCircle, Loader2, Home,
  Send, ArrowLeft, FlaskConical, ExternalLink, RefreshCw,
  Trash2, Play, Database, Terminal, Image as ImageIcon,
} from 'lucide-react';
import { verifyPassword } from '@/lib/auth';
import { AssetManifest, ExperimentDefinition } from '@/lib/experiment-runtime/schema';
import { uploadAssets } from '@/lib/experiment-runtime/assets';
import { ValidationIssue } from '@/lib/experiment-runtime/validate';
import { putPreview, clearPreview } from '@/lib/experiment-runtime/preview-store';
import { publishDefinition } from '@/lib/experiment-runtime/store';
import {
  AnalyzeResponse, Candidate, ChatMessage, ChatResponse, Feasibility,
  GeneratedFile, GenerateResponse, Spec, Stage, Usage, UsageEntry, estimateCost,
  blankSpec, SPEC_PLACEHOLDERS,
} from '@/lib/create-project/types';

/** One entry per Claude Code skill file the pipeline runs on. */
type SkillStatus = { name: string; loaded: boolean; bytes: number };

const STAGES: { key: Stage; label: string }[] = [
  { key: 'upload', label: 'Paper' },
  { key: 'select', label: 'Experiment' },
  { key: 'spec',   label: 'Spec' },
  { key: 'refine', label: 'Refine' },
];

// Vercel caps a serverless request body at 4.5MB, and base64 inflates a file by ~33%.
const MAX_PDF_BYTES = 3.2 * 1024 * 1024;

const FEASIBILITY: Record<Feasibility, { label: string; className: string; Icon: React.ElementType }> = {
  'recreatable':     { label: 'Recreatable',   className: 'text-emerald-400 border-emerald-400/40 bg-emerald-400/10', Icon: Check },
  'caveats':         { label: 'Needs assets',  className: 'text-amber-400 border-amber-400/40 bg-amber-400/10',       Icon: AlertTriangle },
  'not-recreatable': { label: 'Not possible',  className: 'text-gray-500 border-gray-600 bg-gray-800/60',             Icon: XCircle },
};

/** What the lecturer actually wants to look at: the task, and the dashboard behind it. */
const PREVIEW_TABS = [
  { key: 'experiment' as const, label: 'Experiment' },
  { key: 'teacher' as const,    label: 'Teacher dashboard' },
];
type PreviewTab = (typeof PREVIEW_TABS)[number]['key'];

const BTN = 'px-4 py-2 text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg border border-gray-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
const BTN_PRIMARY = 'px-4 py-2 text-sm bg-purple-500 hover:bg-purple-400 text-white font-semibold rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed';

/** POSTs JSON and unwraps the route's `{ error }` shape into a thrown Error. */
async function postJson<T>(url: string, body: unknown): Promise<T> {
  // The server gates the metered endpoints on the shared password; send it on every call.
  const key = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('ss_create_key') ?? '' : '';
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-cognitives-access': key },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({ error: `Request failed (${res.status})` }));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = () => res(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => rej(new Error('Could not read that file.'));
    reader.readAsDataURL(file);
  });
}

/**
 * Unlocks the teacher gate for the preview iframe.
 *
 * The generated dashboard gates on the shared 'ss_teacher_authed' key, and the iframe is
 * same-origin so it reads the same sessionStorage. Anyone on this page has already
 * entered that exact password — verifyPassword checks one hash for the whole site — so
 * re-prompting inside the preview would ask for the same secret twice.
 */
function grantTeacherAccess() {
  sessionStorage.setItem('ss_teacher_authed', '1');
}

/** Rewritten files replace their old contents; genuinely new paths are appended. */
function mergeFiles(existing: GeneratedFile[], incoming: GeneratedFile[]): GeneratedFile[] {
  const merged = [...existing];
  for (const f of incoming) {
    const i = merged.findIndex(m => m.path === f.path);
    if (i === -1) merged.push(f);
    else merged[i] = f;
  }
  return merged;
}


export default function CreateProjectPage() {
  const router = useRouter();

  const [authed, setAuthed] = useState(false);
  const [pwInput, setPwInput] = useState('');
  const [pwError, setPwError] = useState(false);

  const [stage, setStage] = useState<Stage>('upload');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [canWriteFiles, setCanWriteFiles] = useState(false);
  const [canCreateTables, setCanCreateTables] = useState(false);
  const [skills, setSkills] = useState<SkillStatus[]>([]);
  const [mock, setMock] = useState(false);

  const [pdfName, setPdfName] = useState('');
  const [pdfBase64, setPdfBase64] = useState('');
  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(null);
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [spec, setSpec] = useState<Spec | null>(null);
  // Uploaded before generation, because the generator writes these filenames into the
  // definition. Null means "this experiment needs no images", which is the usual case.
  const [assets, setAssets] = useState<AssetManifest | null>(null);
  const [assetErrors, setAssetErrors] = useState<string[]>([]);
  const [files, setFiles] = useState<GeneratedFile[]>([]);
  const [notes, setNotes] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');

  const [staged, setStaged] = useState(false);
  const [stageResult, setStageResult] = useState<string | null>(null);
  const [previewTab, setPreviewTab] = useState<PreviewTab>('experiment');
  // Bumping this remounts the iframe, which is how a refined experiment gets re-rendered
  // after the dev server has recompiled the rewritten files.
  const [previewNonce, setPreviewNonce] = useState(0);
  const [compileState, setCompileState] = useState<{ ok: boolean; message: string } | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [finishResult, setFinishResult] = useState<string | null>(null);
  const [definition, setDefinition] = useState<ExperimentDefinition | null>(null);
  const [, setIssues] = useState<ValidationIssue[]>([]);
  const [usage, setUsage] = useState<UsageEntry[]>([]);

  /** Records what a stage actually cost, so the running total is measured, not guessed. */
  const meter = useCallback((stage: string, model: 'fast' | 'strong', u?: Usage) => {
    if (u) setUsage(prev => [...prev, { ...u, stage, model }]);
  }, []);

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (sessionStorage.getItem('ss_home_authed') === '1') {
      setAuthed(true);
      grantTeacherAccess();
    }
  }, []);

  useEffect(() => {
    if (!authed) return;
    fetch('/api/create/status')
      .then(r => r.json())
      .then((d: { configured: boolean; canWriteFiles: boolean; skills: SkillStatus[]; mock: boolean; canCreateTables: boolean }) => {
        setConfigured(d.configured);
        setCanWriteFiles(d.canWriteFiles);
        setCanCreateTables(d.canCreateTables);
        setSkills(d.skills ?? []);
        setMock(d.mock);
      })
      .catch(() => setConfigured(false));
  }, [authed]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    if (await verifyPassword(pwInput)) {
      sessionStorage.setItem('ss_home_authed', '1');
      // The metered create endpoints verify this on the server, so it must be sent with each
      // call. Kept only in sessionStorage — cleared when the tab closes.
      sessionStorage.setItem('ss_create_key', pwInput);
      grantTeacherAccess();
      setAuthed(true);
    } else {
      setPwError(true);
      setPwInput('');
    }
  };

  /** Wraps an async stage transition with the shared busy/error handling. */
  const run = useCallback(async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(null);
    }
  }, []);

  async function onPickPdf(file: File) {
    setError(null);
    setStageResult(null);
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setError('Please choose a PDF file.');
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      setError(`That PDF is ${(file.size / 1024 / 1024).toFixed(1)}MB. The limit is 3.2MB — try a smaller or compressed copy.`);
      return;
    }
    const b64 = await fileToBase64(file);
    setPdfName(file.name);
    setPdfBase64(b64);
    // Uploading a different paper invalidates everything downstream.
    setAnalysis(null);
    setCandidate(null);
    setSpec(null);
    setAssets(null);
    setAssetErrors([]);
    setFiles([]);
    setMessages([]);
  }

  /**
   * Uploads stimulus images and keeps the manifest.
   *
   * Straight to storage from here, not through an API route: these are the largest things
   * the pipeline moves, and a route would put Vercel's 4.5MB body cap and base64 inflation
   * in the way of a folder of faces.
   */
  async function onPickAssets(chosen: File[]) {
    if (!spec?.slug) {
      setAssetErrors(['Give the experiment a URL slug first — the files are stored under it.']);
      return;
    }

    setAssetErrors([]);
    await run(`Uploading ${chosen.length} image${chosen.length === 1 ? '' : 's'}…`, async () => {
      const result = await uploadAssets(spec.slug, chosen, assets ?? undefined);
      if (result.error) throw new Error(result.error);
      if (result.manifest) setAssets(result.manifest);
      // Partial failures are listed rather than thrown: nine good files should not be lost
      // because the tenth was a PDF someone dragged in by mistake.
      setAssetErrors(result.failed.map(f => `${f.name} — ${f.reason}`));
    });
  }

  /** Straight to the form, no paper and no API calls. */
  function writeSpecByHand() {
    setError(null);
    setCandidate(null);
    setAnalysis(null);
    setSpec(blankSpec());
    setStage('spec');
  }

  const analyze = () => run('Reading the paper…', async () => {
    const result = await postJson<AnalyzeResponse & { usage?: Usage }>('/api/create/analyze', { pdfBase64, filename: pdfName });
    meter('Analyze paper', 'fast', result.usage);
    setAnalysis(result);
    setStage('select');
  });

  const chooseCandidate = (c: Candidate) => run('Extracting the design spec…', async () => {
    setCandidate(c);
    const result = await postJson<Spec & { usage?: Usage }>('/api/create/spec', { pdfBase64, candidate: c });
    meter('Extract spec', 'fast', result.usage);
    setSpec(result);
    setStage('spec');
  });

  /**
   * Writes the files to disk so the dev server compiles them and the preview iframe can
   * load the real routes. Takes the file list as an argument because it is called
   * straight after generate/chat, before React has re-rendered with the new state.
   */
  const stageFiles = useCallback(async (toStage: GeneratedFile[], slug: string) => {
    const result = await postJson<{ written: string[]; refused: { path: string; reason: string }[] }>(
      '/api/create/stage', { files: toStage, slug },
    );
    setStaged(true);
    setPreviewNonce(n => n + 1);
    const parts = [`Staged ${result.written.length} file(s) into the project.`];
    if (result.refused.length) {
      parts.push(`Refused: ${result.refused.map(r => `${r.path} (${r.reason})`).join(', ')}`);
    }
    setStageResult(parts.join(' '));
  }, []);

  /**
   * The default path: the experiment becomes a definition, not code.
   *
   * Nothing is written to disk and nothing is built, so the preview is immediate — the
   * runtime at /run reads the definition straight out of sessionStorage, which the iframe
   * shares with this page.
   */
  const generateDefinition = () => run('Designing the experiment…', async () => {
    const result = await postJson<{
      definition: ExperimentDefinition; issues: ValidationIssue[]; repairs: number; usage?: Usage;
    }>('/api/create/definition', { spec, assets });

    meter('Generate definition', 'strong', result.usage);
    setDefinition(result.definition);
    setIssues(result.issues);
    putPreview(result.definition);
    setStaged(true);
    setPreviewNonce(n => n + 1);
    setNotes((result.definition.simplifications ?? [])
      .map(s => `${s.what} — ${s.why}`).join('\n'));
    setProblems(result.issues.filter(i => i.severity === 'error').map(i => i.message));
    setCompileState(result.issues.some(i => i.severity === 'error')
      ? { ok: false, message: 'The definition has problems — see above.' }
      : { ok: true, message: result.repairs
          ? `Valid, after ${result.repairs} automatic correction.`
          : 'Valid and ready to run.' });
    setStage('refine');
  });

  const generateCode = () => run('Writing the experiment… this takes a few minutes', async () => {
    const result = await postJson<GenerateResponse & { usage?: Usage; problems?: string[] }>(
      '/api/create/generate', { spec },
    );
    meter('Generate code', 'strong', result.usage);
    setFiles(result.files);
    setNotes(result.notes ?? '');
    setProblems(result.problems ?? []);
    setFinishResult(null);
    setStage('refine');
    // Stage immediately: the point of generating is to look at the running experiment,
    // and making that a second manual click just adds a step before anyone can judge it.
    if (canWriteFiles) {
      await stageFiles(result.files, spec!.slug);
      await verifyAndRepair(result.files, spec!.slug);
    }
    // The database is deliberately NOT touched here — see the Finish step. Creating the
    // table now would freeze it to the first draft, and CREATE TABLE IF NOT EXISTS cannot
    // amend it afterwards.
  });

  /**
   * Type-checks the staged experiment and, if it does not compile, asks Claude to fix it.
   *
   * The skill's Step 8 says to run tsc before calling the job done. In an interactive
   * Claude Code session a human agent does that; nothing did here, so broken code reached
   * the preview as a Next.js error overlay — useless to a lecturer. Capped at two attempts
   * so a stubborn error cannot spend money in a loop.
   */
  const verifyAndRepair = useCallback(async (current: GeneratedFile[], slug: string) => {
    let working = current;

    for (let attempt = 0; attempt <= 2; attempt++) {
      const check = await postJson<{ ok: boolean; errors: string[] }>('/api/create/verify', { slug });
      if (check.ok) {
        setCompileState({ ok: true, message: attempt === 0
          ? 'Compiles cleanly.'
          : `Compiles cleanly after ${attempt} automatic fix${attempt > 1 ? 'es' : ''}.` });
        return;
      }
      if (attempt === 2) {
        setCompileState({ ok: false, message: `Still not compiling after 2 repair attempts:\n${check.errors.slice(0, 6).join('\n')}` });
        return;
      }

      setBusy(`Fixing ${check.errors.length} compile error${check.errors.length > 1 ? 's' : ''}…`);
      const fix = await postJson<ChatResponse & { usage?: Usage }>('/api/create/chat', {
        spec, files: working, repair: true,
        messages: [{ role: 'user', content: `The project does not compile. Compiler output:\n\n${check.errors.join('\n')}` }],
      });
      meter('Auto-repair', 'strong', fix.usage);
      if (fix.files.length === 0) {
        setCompileState({ ok: false, message: `Could not repair automatically:\n${check.errors.slice(0, 6).join('\n')}` });
        return;
      }

      working = mergeFiles(working, fix.files);
      setFiles(working);
      await stageFiles(fix.files, slug);
    }
  }, [spec, meter, stageFiles]);

  /**
   * The last step: bring the database in line with the final schema, then put the
   * experiment on the homepage.
   *
   * Both belong at the end rather than at generation. The table has to match the schema
   * as refined, not as first drafted — and an experiment that gets discarded should never
   * have left a table or a homepage entry behind.
   */
  const finish = () => run('Publishing…', async () => {
    const lines: string[] = [];

    // A definition needs no schema of its own: every one writes to the single shared
    // results table. Publishing it means saving the definition itself, so it outlives the
    // browser session that generated it.
    if (definition) {
      // Validated server-side first, then written from here — the browser holds the
      // Supabase client, and a definition that fails validation must never be saved.
      const check = await postJson<{ ok: boolean; error?: string }>(
        '/api/create/publish', { definition },
      );
      if (!check.ok) {
        setFinishResult(`Not published — ${check.error}`);
        return;
      }

      const saved = await publishDefinition(definition);
      lines.push(saved.ok
        ? `Published. "${definition.title}" now runs at /run/${definition.slug}, and its dashboard at /run/${definition.slug}/teacher.`
        : `Not published — ${saved.error}`);
      if (!saved.ok) { setFinishResult(lines.join('\n')); return; }

      if (canWriteFiles) {
        const reg = await postJson<{ done: string[]; skipped: string[] }>('/api/create/register', {
          slug: spec!.slug, title: spec!.title, titleHe: spec!.titleHe,
          category: spec!.category, target: 'definition',
        });
        if (reg.done.length) lines.push(`Homepage: ${reg.done.join(', ')}.`);
        if (reg.skipped.length) lines.push(`Skipped: ${reg.skipped.join('; ')}.`);
      }

      setFinishResult(lines.join('\n'));
      return;
    }

    const schemaFile = files.find(f => f.path.endsWith('.sql'));

    if (!schemaFile) {
      lines.push('No SQL schema file was generated, so no table was created.');
    } else if (!canCreateTables && !mock) {
      lines.push('No SUPABASE_ACCESS_TOKEN set — the table was not created, so the experiment cannot save data yet.');
    } else {
      const r = await postJson<{ table: string; action: string; missing: string[]; extra: string[]; simulated: boolean }>(
        '/api/create/schema', { sql: schemaFile.contents, slug: spec!.slug },
      );
      const prefix = r.simulated ? 'Mock mode, not executed — ' : '';
      if (r.action === 'create') lines.push(`${prefix}Created ${r.table}.`);
      else if (r.action === 'add-columns') lines.push(`${prefix}Added ${r.missing.length} column(s) to ${r.table}: ${r.missing.join(', ')}.`);
      else lines.push(`${prefix}${r.table} already matches the schema.`);
      // Drift is reported, never "fixed" — dropping a column destroys collected data.
      if (r.extra.length) {
        lines.push(`Note: ${r.table} still has column(s) the experiment no longer uses: ${r.extra.join(', ')}. Left alone deliberately — removing them would delete data.`);
      }
    }

    if (canWriteFiles) {
      const reg = await postJson<{ done: string[]; skipped: string[] }>('/api/create/register', {
        slug: spec!.slug, title: spec!.title, titleHe: spec!.titleHe, category: spec!.category,
      });
      if (reg.done.length) lines.push(`Homepage: ${reg.done.join(', ')}.`);
      if (reg.skipped.length) lines.push(`Skipped: ${reg.skipped.join('; ')}.`);
    } else {
      lines.push('Homepage registration only works locally; on a deployed site, commit the downloaded files instead.');
    }

    setFinishResult(lines.join('\n'));
  });

  /** Routes to whichever path the spec chose. Code is the fallback for outliers. */
  const generate = () => (spec?.buildTarget === 'code' ? generateCode() : generateDefinition());

  const refineDefinition = (next: ChatMessage[]) => run('Applying the change…', async () => {
    const result = await postJson<{
      definition: ExperimentDefinition; issues: ValidationIssue[]; reply: string; usage?: Usage;
    }>('/api/create/refine', { definition, messages: next });

    meter('Refine', 'strong', result.usage);
    setMessages([...next, { role: 'assistant', content: result.reply }]);
    setDefinition(result.definition);
    setIssues(result.issues);
    putPreview(result.definition);
    setPreviewNonce(n => n + 1);
    setProblems(result.issues.filter(i => i.severity === 'error').map(i => i.message));
  });

  const sendChat = () => {
    const text = chatInput.trim();
    if (!text) return;
    const next: ChatMessage[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setChatInput('');
    if (definition) { refineDefinition(next); return; }
    run('Claude is working…', async () => {
      const result = await postJson<ChatResponse & { usage?: Usage; problems?: string[] }>(
        '/api/create/chat', { spec, files, messages: next },
      );
      meter('Refine', 'strong', result.usage);
      setMessages([...next, { role: 'assistant', content: result.reply }]);
      setProblems(result.problems ?? []);
      if (result.files.length > 0) {
        const merged = mergeFiles(files, result.files);
        setFiles(merged);
        if (canWriteFiles) {
          await stageFiles(result.files, spec!.slug);
          await verifyAndRepair(merged, spec!.slug);
        }
        // A refine can change what the experiment stores, so the table may no longer
        // match. Finish is how that gets reconciled — say so rather than leaving it
        // to be discovered when data goes missing.
        if (finishResult) {
          setFinishResult(`${finishResult}\n\nThe experiment changed since this ran. Press Finish again to bring the database back in line.`);
        }
      }
    });
  };


  const stagePreview = () => run('Staging files…', () => stageFiles(files, spec!.slug));

  const discardPreview = () => run('Removing staged files…', async () => {
    await fetch('/api/create/stage', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug: spec!.slug }),
    });

    clearPreview(spec!.slug);
    setDefinition(null);
    const lines = ['Preview removed.'];

    // Discarding used to leave the table behind, so abandoned experiments accumulated in
    // the live database. Dropping is only ever attempted when the table is empty — a
    // table with rows in it is somebody's data, and no cleanup is worth risking that.
    if (canCreateTables || mock) {
      try {
        const res = await fetch('/api/create/schema', {
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ slug: spec!.slug }),
        });
        const r = await res.json() as { result?: string };
        if (r.result === 'dropped') lines.push('Its empty results table was dropped too.');
        else if (r.result === 'kept-has-rows') lines.push('Its results table already has data, so it was left in place.');
      } catch {
        lines.push('Could not check the results table — remove it by hand if it was created.');
      }
    }

    setStaged(false);
    setCompileState(null);
    setFinishResult(null);
    setStageResult(lines.join(' '));
  });

  function updateSpecField(key: string, value: string) {
    setSpec(s => s && ({ ...s, fields: s.fields.map(f => f.key === key ? { ...f, value } : f) }));
  }

  // ── Password gate ─────────────────────────────────────────────────────────────
  if (!authed) {
    return (
      <main className="min-h-screen bg-[#0f172a] flex items-center justify-center px-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="bg-gray-900 border border-gray-700 rounded-2xl p-10 w-full max-w-sm flex flex-col items-center gap-6">
          <FlaskConical className="w-10 h-10 text-purple-400" />
          <div className="text-center">
            <h1 className="text-2xl font-bold">Create New Project</h1>
            <p className="text-gray-400 text-sm mt-1">Teacher access required</p>
          </div>
          <form onSubmit={handleLogin} className="w-full flex flex-col gap-3">
            <input type="password" value={pwInput} autoFocus placeholder="Password"
              onChange={e => { setPwInput(e.target.value); setPwError(false); }}
              className={`w-full px-4 py-3 rounded-lg border bg-gray-800 text-white outline-none transition-colors
                ${pwError ? 'border-red-500' : 'border-gray-600 focus:border-purple-400'}`} />
            {pwError && <p className="text-red-400 text-sm text-center">Incorrect password</p>}
            <button type="submit" className="w-full py-3 bg-purple-500 hover:bg-purple-400 text-white font-bold rounded-lg transition-colors">
              Enter
            </button>
          </form>
        </motion.div>
      </main>
    );
  }

  const stageIndex = STAGES.findIndex(s => s.key === stage);
  // A hand-written spec starts empty, so the three fields nothing downstream can do
  // without are checked before Generate is offered.
  const specReady = !!spec
    && /^[a-zA-Z][a-zA-Z0-9-]*$/.test(spec.slug)
    && spec.title.trim().length > 0
    && (spec.fields.find(f => f.key === 'design')?.value.trim().length ?? 0) > 0;
  // Definitions run at /run/{slug}; generated code lives at its own route.
  const previewBase = spec ? (spec.buildTarget === 'code' ? `/${spec.slug}` : `/run/${spec.slug}`) : '';
  const previewUrl = previewTab === 'teacher' ? `${previewBase}/teacher` : previewBase;

  return (
    <main className="min-h-screen bg-[#0f172a] px-6 py-8">
      <div className="max-w-5xl mx-auto">

        {/* Header — site standard: compact left title, buttons right */}
        <div className="flex items-start gap-3 flex-wrap mb-6">
          <Sparkles className="w-7 h-7 text-purple-400 flex-shrink-0 mt-0.5" />
          <div>
            <h1 className="text-2xl font-bold text-gray-100">Create New Project</h1>
            <p className="text-sm text-purple-400 mt-0.5">
              Academic paper → runnable experiment
              {pdfName && <span className="text-gray-500"> · {pdfName}</span>}
              {mock && (
                <span className="ml-2 text-xs px-2 py-0.5 rounded-full border border-amber-400 bg-amber-500/20 text-amber-400">
                  mock mode
                </span>
              )}
            </p>
          </div>
          <div className="flex gap-3 flex-wrap ml-auto">
            <button onClick={() => router.push('/')} className={BTN}>
              <Home className="w-4 h-4 inline mr-1.5 -mt-0.5" />Home
            </button>
          </div>
        </div>

        {/* Stage stepper */}
        <div className="flex items-center gap-2 flex-wrap mb-8">
          {STAGES.map((s, i) => (
            <div key={s.key} className="flex items-center gap-2">
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs transition-colors
                ${i === stageIndex ? 'border-purple-400 text-purple-300 bg-purple-500/10'
                  : i < stageIndex ? 'border-gray-700 text-gray-400' : 'border-gray-800 text-gray-600'}`}>
                <span className={`w-5 h-5 rounded-full grid place-items-center text-[10px] font-bold
                  ${i < stageIndex ? 'bg-purple-500 text-white' : i === stageIndex ? 'bg-purple-500/30 text-purple-200' : 'bg-gray-800 text-gray-600'}`}>
                  {i < stageIndex ? <Check className="w-3 h-3" /> : i + 1}
                </span>
                {s.label}
              </div>
              {i < STAGES.length - 1 && <div className="w-4 h-px bg-gray-800" />}
            </div>
          ))}
        </div>

        {usage.length > 0 && (
          <div className="mb-6 p-4 rounded-2xl border border-gray-700 bg-gray-900 text-sm">
            <div className="flex items-baseline gap-3 flex-wrap mb-3">
              <span className="font-semibold text-gray-200">Spend so far</span>
              <span className="text-purple-400 font-mono">
                ${usage.reduce((sum, u) => sum + estimateCost(u), 0).toFixed(2)}
              </span>
              <span className="text-xs text-gray-600">
                estimated from real token counts at list prices — check the console for what you were actually billed
              </span>
            </div>
            <table className="w-full text-xs text-gray-400">
              <thead className="text-gray-600">
                <tr className="text-left">
                  <th className="font-normal pb-1">Stage</th>
                  <th className="font-normal pb-1 text-right">In</th>
                  <th className="font-normal pb-1 text-right">Cached</th>
                  <th className="font-normal pb-1 text-right">Out</th>
                  <th className="font-normal pb-1 text-right">Cost</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {usage.map((u, i) => (
                  <tr key={i} className="border-t border-gray-800">
                    <td className="py-1 font-sans">{u.stage}</td>
                    <td className="py-1 text-right">{(u.input + u.cacheWrite).toLocaleString()}</td>
                    <td className="py-1 text-right text-emerald-400">
                      {u.cacheRead > 0 ? u.cacheRead.toLocaleString() : '—'}
                    </td>
                    <td className="py-1 text-right">{u.output.toLocaleString()}</td>
                    <td className="py-1 text-right">${estimateCost(u).toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {mock && (
          <div className="mb-6 p-4 rounded-2xl border border-amber-400/40 bg-amber-400/10 text-amber-300 text-sm">
            <strong className="block mb-1">Mock mode — no API calls, no cost.</strong>
            Every stage returns canned fixtures, so the wizard can be clicked through end to end for free.
            Nothing here reflects what Claude would actually produce. Remove <code className="text-amber-200">CREATE_MOCK=1</code> from{' '}
            <code className="text-amber-200">.env.local</code> and restart to run it for real.
          </div>
        )}

        {configured === false && !mock && (
          <div className="mb-6 p-4 rounded-2xl border border-amber-400/40 bg-amber-400/10 text-amber-300 text-sm">
            <strong className="block mb-1">No Anthropic API key on the server.</strong>
            Add <code className="text-amber-200">ANTHROPIC_API_KEY=sk-ant-…</code> to <code className="text-amber-200">.env.local</code> and
            restart <code className="text-amber-200">npm run dev</code> (or add it to the Vercel project environment variables). The rest of the site is unaffected.
          </div>
        )}

        {skills.some(s => !s.loaded) && (
          <div className="mb-6 p-4 rounded-2xl border border-red-500/40 bg-red-500/10 text-red-300 text-sm">
            <strong className="block mb-1">A skill file could not be read.</strong>
            {skills.filter(s => !s.loaded).map(s => (
              <div key={s.name}><code className="text-red-200">.claude/skills/{s.name}/SKILL.md</code></div>
            ))}
            <p className="mt-1">
              These files are the instructions this pipeline runs on, so the stages that need them will fail.
            </p>
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 rounded-2xl border border-red-500/40 bg-red-500/10 text-red-300 text-sm whitespace-pre-wrap">
            {error}
          </div>
        )}

        {busy && (
          <div className="mb-6 p-4 rounded-2xl border border-purple-400/40 bg-purple-500/10 text-purple-200 text-sm flex items-center gap-3">
            <Loader2 className="w-4 h-4 animate-spin" />{busy}
          </div>
        )}

        {/* ── Stage 1: upload ─────────────────────────────────────────────────── */}
        {stage === 'upload' && (
          <section className="bg-gray-900 border border-gray-700 rounded-2xl p-6">
            <h2 className="font-semibold text-gray-200 mb-1">Upload a paper</h2>
            <p className="text-sm text-gray-400 mb-5">
              A psychology or cognition PDF. Claude reads it, lists the experiments in it, and marks which ones
              can actually run in a browser for a general student population.
            </p>

            <label className="block border-2 border-dashed border-gray-700 hover:border-purple-400/60 rounded-2xl p-10 text-center cursor-pointer transition-colors">
              <input type="file" accept="application/pdf,.pdf" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) void onPickPdf(f); }} />
              {pdfName ? (
                <div className="flex flex-col items-center gap-2 text-gray-300">
                  <FileText className="w-8 h-8 text-purple-400" />
                  <span className="text-sm font-medium">{pdfName}</span>
                  <span className="text-xs text-gray-500">Click to choose a different file</span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 text-gray-400">
                  <Upload className="w-8 h-8 text-gray-600" />
                  <span className="text-sm">Choose a PDF</span>
                  <span className="text-xs text-gray-600">Up to 3.2MB</span>
                </div>
              )}
            </label>

            <div className="flex items-center gap-3 flex-wrap mt-5">
              {/* No paper needed when the lecturer already knows the design. Free, and
                  skips straight to the same form the paper stages would have filled in. */}
              <button onClick={writeSpecByHand} disabled={!!busy} className={BTN}>
                No paper — describe it myself
              </button>
              <button onClick={analyze} disabled={!pdfBase64 || !!busy || (configured === false && !mock)} className={`${BTN_PRIMARY} ml-auto`}>
                Find experiments
              </button>
            </div>

            {/* The same pipeline, run from a terminal on the Claude subscription instead
                of the metered API. Surfaced here because this page is where someone
                learns what a paper costs, and it is the obvious moment to be told there
                is a free way to do it. */}
            <div className="mt-6 pt-5 border-t border-gray-800 flex items-start gap-3">
              <Terminal className="w-4 h-4 text-gray-500 mt-0.5 shrink-0" />
              <p className="text-xs text-gray-500 leading-relaxed">
                Every stage here calls the Anthropic API and is billed per paper.{' '}
                <span className="text-gray-400">
                  In a terminal, <code className="text-gray-300">claude</code> runs the same pipeline on your
                  Claude subscription for nothing
                </span>{' '}
                — ask it to build the experiment and it uses the{' '}
                <code className="text-gray-300">experiment-definition</code> skill, writing{' '}
                <code className="text-gray-300">experiments/&lt;slug&gt;.json</code>, checking it with{' '}
                <code className="text-gray-300">npm run exp:check</code> and publishing it to the same{' '}
                <code className="text-gray-300">/run/&lt;slug&gt;</code> this page would.
              </p>
            </div>
          </section>
        )}

        {/* ── Stage 2: select an experiment ───────────────────────────────────── */}
        {stage === 'select' && analysis && (
          <section className="flex flex-col gap-4">
            <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6">
              <h2 className="font-semibold text-gray-200 mb-1">{analysis.paperTitle}</h2>
              <p className="text-sm text-gray-400">
                {analysis.noneRecreatable
                  ? 'No experiment in this paper can be recreated as a classroom browser task.'
                  : 'Pick the experiment to build. Recreatable ones are listed first.'}
              </p>
              {analysis.noneRecreatable && analysis.noneReason && (
                <p className="mt-3 p-3 rounded-lg bg-gray-800/60 border border-gray-700 text-sm text-gray-300">
                  {analysis.noneReason}
                </p>
              )}
            </div>

            {analysis.candidates.map(c => {
              const f = FEASIBILITY[c.feasibility] ?? FEASIBILITY['not-recreatable'];
              const selectable = c.feasibility !== 'not-recreatable';
              return (
                <div key={c.id} className={`bg-gray-900 border rounded-2xl p-6 ${selectable ? 'border-gray-700' : 'border-gray-800 opacity-60'}`}>
                  <div className="flex items-start gap-3 flex-wrap mb-3">
                    <h3 className="font-semibold text-gray-100">{c.name}</h3>
                    <span className={`text-xs px-2.5 py-1 rounded-full border flex items-center gap-1.5 ${f.className}`}>
                      <f.Icon className="w-3 h-3" />{f.label}
                    </span>
                    {selectable && (
                      <button onClick={() => chooseCandidate(c)} disabled={!!busy} className={`${BTN_PRIMARY} ml-auto`}>
                        Build this one
                      </button>
                    )}
                  </div>
                  <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                    {([
                      ['Paradigm', c.paradigm],
                      ['Manipulation', c.manipulation],
                      ['Measure', c.measure],
                      ['Expected effect', c.expectedEffect],
                      ['Verdict', c.feasibilityReason],
                    ] as const).map(([label, value]) => (
                      <div key={label}>
                        <dt className="text-xs uppercase tracking-wider text-gray-500">{label}</dt>
                        <dd className="text-gray-300">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              );
            })}

            <div className="flex gap-3 flex-wrap">
              <button onClick={() => setStage('upload')} className={BTN}>
                <ArrowLeft className="w-4 h-4 inline mr-1.5 -mt-0.5" />Different paper
              </button>
              {/* The escape hatch when the filter rejected everything, or rejected the one
                  experiment the lecturer actually wanted. */}
              <button onClick={writeSpecByHand} className={`${BTN} ml-auto`}>
                None of these — describe it myself
              </button>
            </div>
          </section>
        )}

        {/* ── Stage 3: review and edit the spec ───────────────────────────────── */}
        {stage === 'spec' && spec && (
          <section className="flex flex-col gap-4">
            <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6">
              <h2 className="font-semibold text-gray-200 mb-1">
                Design spec{candidate && <span className="text-gray-500 font-normal"> · {candidate.name}</span>}
              </h2>
              <p className="text-sm text-gray-400 mb-5">
                {candidate ? (
                  <>
                    Everything here is editable. Fields marked <span className="text-amber-400">inferred</span> were
                    not stated in the paper — papers rarely give exact trial counts or millisecond timings — so check
                    those first. Reviewing a spec is far easier than reviewing generated code.
                  </>
                ) : (
                  <>
                    Describe the experiment in plain language. The more specific you are about timings, trial counts
                    and what appears on screen, the closer the first version will be — but anything you leave vague
                    will simply be filled in sensibly, and you can change it by asking afterwards.
                  </>
                )}
              </p>

              {/* Which build path, and why — shown before anything is generated, because
                  the two differ in speed, cost and whether code gets deployed. */}
              <div className={`mb-5 p-4 rounded-xl border ${spec.buildTarget === 'code'
                ? 'border-amber-400/40 bg-amber-400/10'
                : 'border-emerald-400/40 bg-emerald-400/10'}`}>
                <p className={`text-sm font-medium ${spec.buildTarget === 'code' ? 'text-amber-300' : 'text-emerald-300'}`}>
                  {spec.buildTarget === 'code'
                    ? 'Built as generated code — slower, and reviewed before it runs'
                    : 'Built as a definition — instant preview'}
                </p>
                {spec.buildTargetReason && (
                  <p className="text-xs text-gray-400 mt-1">{spec.buildTargetReason}</p>
                )}
                {spec.simplifications && spec.simplifications.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs uppercase tracking-wider text-gray-500 mb-1">Departures from the paper</p>
                    <ul className="text-xs text-gray-300 list-disc pl-5 space-y-1">
                      {spec.simplifications.map((s, i) => (
                        <li key={i}><span className="text-gray-200">{s.what}</span> — {s.why}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                {([
                  ['slug', 'URL slug'], ['category', 'Category'],
                  ['title', 'English title'], ['titleHe', 'Hebrew title'],
                ] as const).map(([key, label]) => (
                  <label key={key} className="block">
                    <span className="text-xs uppercase tracking-wider text-gray-500">{label}</span>
                    <input value={spec[key]} dir={key === 'titleHe' ? 'rtl' : 'ltr'}
                      onChange={e => setSpec(s => s && ({ ...s, [key]: e.target.value }))}
                      className="mt-1 w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-sm text-gray-200 outline-none focus:border-purple-400" />
                  </label>
                ))}
              </div>
            </div>

            {spec.fields.map(field => (
              <div key={field.key} className="bg-gray-900 border border-gray-700 rounded-2xl p-6">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-medium text-gray-200">{field.label}</span>
                  <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border
                    ${field.source === 'paper'
                      ? 'text-emerald-400 border-emerald-400/40 bg-emerald-400/10'
                      : 'text-amber-400 border-amber-400/40 bg-amber-400/10'}`}>
                    {field.source === 'paper' ? 'from paper' : 'inferred'}
                  </span>
                </div>
                <textarea value={field.value} rows={Math.min(6, Math.ceil(field.value.length / 90) + 2)}
                  placeholder={SPEC_PLACEHOLDERS[field.key]}
                  onChange={e => updateSpecField(field.key, e.target.value)}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-sm text-gray-200 outline-none focus:border-purple-400 resize-y placeholder:text-gray-600" />
              </div>
            ))}

            {/* Stimulus images.
                Here rather than after generation because the generator has to write these
                filenames into the definition — uploading afterwards would mean generating
                twice. Optional: most experiments draw everything from shapes and text. */}
            <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-2">
                <ImageIcon className="w-4 h-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-200">Stimulus images</span>
                <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border text-gray-500 border-gray-600">
                  optional
                </span>
              </div>
              <p className="text-sm text-gray-400 mb-4">
                Only for experiments where the picture <em>is</em> the stimulus — faces, mental-rotation figures,
                scenes. Shapes and text are drawn without any file, so most experiments need nothing here.
                Upload before generating: the design has to name these files.
              </p>

              <div className="flex items-center gap-3 flex-wrap">
                <label className={`${BTN} cursor-pointer`}>
                  <input type="file" multiple accept="image/*" className="hidden"
                    onChange={e => { const f = Array.from(e.target.files ?? []); if (f.length) void onPickAssets(f); }} />
                  {assets ? 'Add more images' : 'Choose images'}
                </label>
                {assets && (
                  <>
                    <span className="text-sm text-gray-400">
                      {assets.files.length} file{assets.files.length === 1 ? '' : 's'} uploaded
                    </span>
                    <button onClick={() => setAssets(null)} disabled={!!busy} className={`${BTN} ml-auto`}>
                      Use none
                    </button>
                  </>
                )}
              </div>

              {assets && assets.files.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {assets.files.map(name => (
                    <span key={name} className="text-xs px-2 py-1 rounded-lg bg-gray-800 border border-gray-700 text-gray-400">
                      {name}
                    </span>
                  ))}
                </div>
              )}

              {assetErrors.length > 0 && (
                <ul className="mt-4 text-xs text-amber-300 list-disc pl-5 space-y-1">
                  {assetErrors.map((m, i) => <li key={i}>{m}</li>)}
                </ul>
              )}
            </div>

            <div className="flex gap-3 flex-wrap items-center">
              {/* Going "back" to a candidate list that was never produced would be a dead end. */}
              <button onClick={() => setStage(analysis ? 'select' : 'upload')} className={BTN}>
                <ArrowLeft className="w-4 h-4 inline mr-1.5 -mt-0.5" />Back
              </button>
              {!specReady && (
                <p className="text-xs text-gray-500">
                  Needs a URL slug, a title, and a design description.
                </p>
              )}
              <button onClick={generate} disabled={!!busy || !specReady} className={`${BTN_PRIMARY} ml-auto`}>
                Generate the experiment
              </button>
            </div>
          </section>
        )}

        {/* ── Stages 4 & 5: generated files + chat ────────────────────────────── */}
        {stage === 'refine' && (definition || files.length > 0) && spec && (
          <section className="flex flex-col gap-4">
            {/* Generation problems — a truncated batch or a file that never arrived.
                Surfaced here because the alternative is discovering it as a 404. */}
            {problems.length > 0 && (
              <div className="bg-gray-900 border border-amber-400/40 rounded-2xl p-6">
                <h2 className="font-semibold text-amber-300 mb-2">Incomplete generation</h2>
                <ul className="text-sm text-amber-300/90 list-disc pl-5 space-y-1">
                  {problems.map((p, i) => <li key={i}>{p}</li>)}
                </ul>
                <p className="text-xs text-gray-500 mt-3">
                  Regenerate from spec, or ask for the missing piece in the box below.
                </p>
              </div>
            )}

            {compileState && (
              <div className={`bg-gray-900 border rounded-2xl p-4 ${compileState.ok ? 'border-gray-700' : 'border-red-500/40'}`}>
                <div className="flex items-start gap-3">
                  {compileState.ok
                    ? <Check className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                    : <XCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />}
                  <p className={`text-sm whitespace-pre-wrap ${compileState.ok ? 'text-gray-400' : 'text-red-300'}`}>
                    {compileState.message}
                  </p>
                </div>
              </div>
            )}


            {/* Live preview — the real routes, running. This is what the lecturer judges. */}
            <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6">
              <div className="flex items-center gap-3 flex-wrap mb-4">
                <h2 className="font-semibold text-gray-200">Preview</h2>
                {staged && (
                  <div className="flex gap-2">
                    {PREVIEW_TABS.map(t => (
                      <button key={t.key} onClick={() => setPreviewTab(t.key)}
                        className={`text-xs px-3 py-1.5 rounded-lg border transition-colors
                          ${previewTab === t.key ? 'border-purple-400 text-purple-300 bg-purple-500/10' : 'border-gray-700 text-gray-400 hover:border-gray-600'}`}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex gap-3 flex-wrap ml-auto">
                  {staged && (
                    <>
                      <a href={previewUrl} target="_blank" rel="noreferrer" className={BTN}>
                        <ExternalLink className="w-4 h-4 inline mr-1.5 -mt-0.5" />New tab
                      </a>
                      <button onClick={() => setPreviewNonce(n => n + 1)} className={BTN}>
                        <RefreshCw className="w-4 h-4 inline mr-1.5 -mt-0.5" />Reload
                      </button>
                      <button onClick={discardPreview} disabled={!!busy} className={BTN}>
                        <Trash2 className="w-4 h-4 inline mr-1.5 -mt-0.5" />Discard
                      </button>
                    </>
                  )}
                </div>
              </div>

              {staged ? (
                <>
                  <iframe
                    key={`${previewTab}-${previewNonce}`}
                    src={previewUrl}
                    title={`Preview — ${previewTab}`}
                    className="w-full h-[36rem] rounded-lg border border-gray-800 bg-[#0b1120]"
                  />
                  <p className="text-xs text-gray-600 mt-2">
                    Running at <code className="text-gray-500">{previewUrl}</code> — the real route, not a picture of it.
                    The teacher dashboard needs its <span className="text-amber-400">Mock Data</span> toggle to show
                    anything, since nobody has taken the experiment yet.
                  </p>
                </>
              ) : canWriteFiles ? (
                <div className="rounded-lg border border-dashed border-gray-700 p-10 text-center">
                  <Play className="w-8 h-8 text-gray-600 mx-auto mb-3" />
                  <p className="text-sm text-gray-400 mb-1">Not staged yet.</p>
                  <p className="text-xs text-gray-600 mb-5 max-w-md mx-auto">
                    Staging writes the generated files into <code className="text-gray-500">app/{spec.slug}/</code> so
                    the dev server compiles them and you can actually use the experiment. Discard removes them again.
                  </p>
                  <button onClick={stagePreview} disabled={!!busy} className={BTN_PRIMARY}>
                    Stage &amp; preview
                  </button>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-gray-700 p-10 text-center">
                  <p className="text-sm text-gray-400">Live preview needs a local dev server.</p>
                  <p className="text-xs text-gray-600 mt-1">
                    A deployed server cannot write files. Download the files below and run them locally.
                  </p>
                </div>
              )}

              {stageResult && (
                <p className="mt-4 p-3 rounded-lg bg-emerald-400/10 border border-emerald-400/40 text-emerald-300 text-sm">
                  {stageResult}
                </p>
              )}
            </div>

            {notes && (
              <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6">
                <h2 className="font-semibold text-gray-200 mb-2">Notes</h2>
                <p className="text-sm text-gray-300 whitespace-pre-wrap">{notes}</p>
              </div>
            )}

            <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6">
              <h2 className="font-semibold text-gray-200 mb-1">Refine</h2>
              <p className="text-sm text-gray-400 mb-4">
                Ask for changes in plain language — &ldquo;make the practice 8 trials&rdquo;, &ldquo;the shapes are
                too small on a phone&rdquo;, &ldquo;add a chart of accuracy by participant&rdquo;. Each change
                rewrites the experiment and the preview above rebuilds, so you can try it and ask again.
              </p>

              {messages.length > 0 && (
                <div className="flex flex-col gap-3 mb-4 max-h-96 overflow-auto pr-1">
                  {messages.map((m, i) => (
                    <div key={i} className={`text-sm rounded-2xl px-4 py-3 whitespace-pre-wrap max-w-[85%]
                      ${m.role === 'user'
                        ? 'bg-purple-500/15 border border-purple-400/30 text-purple-100 ml-auto'
                        : 'bg-gray-800 border border-gray-700 text-gray-300'}`}>
                      {m.content}
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>
              )}

              <form onSubmit={e => { e.preventDefault(); if (!busy) sendChat(); }}
                className="flex gap-3">
                <input value={chatInput} onChange={e => setChatInput(e.target.value)} disabled={!!busy}
                  placeholder="What should change?"
                  className="flex-1 px-4 py-2.5 bg-gray-800 border border-gray-600 rounded-lg text-sm text-gray-200 outline-none focus:border-purple-400 disabled:opacity-50" />
                <button type="submit" disabled={!!busy || !chatInput.trim()} className={BTN_PRIMARY}>
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>

            {/* Finish — the database and the homepage, at the end rather than up front. */}
            <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6">
              <div className="flex items-start gap-3 flex-wrap">
                <Database className="w-5 h-5 text-purple-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-64">
                  <h2 className="font-semibold text-gray-200 mb-1">Finish</h2>
                  <p className="text-sm text-gray-400">
                    Creates the results table and puts the experiment on the homepage. Run this once you are
                    happy with it — the table is built from the schema as it stands now, so refining afterwards
                    means pressing Finish again.
                  </p>
                </div>
                <button onClick={finish} disabled={!!busy} className={`${BTN_PRIMARY} ml-auto`}>
                  Finish &amp; publish
                </button>
              </div>
              {finishResult && (
                <p className="mt-4 p-3 rounded-lg bg-gray-800 border border-gray-700 text-sm text-gray-300 whitespace-pre-wrap">
                  {finishResult}
                </p>
              )}
            </div>

            <div className="flex gap-3 flex-wrap">
              <button onClick={() => setStage('spec')} className={BTN}>
                <ArrowLeft className="w-4 h-4 inline mr-1.5 -mt-0.5" />Back to spec
              </button>
              <div className="flex gap-3 flex-wrap ml-auto">
                {/* Distinct from Refine: this throws the generated experiment away and
                    writes it again from scratch, losing every refinement. */}
                <button onClick={generate} disabled={!!busy} title="Discards all refinements and writes the experiment again from the spec"
                  className={BTN}>
                  Start over from spec
                </button>
              </div>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
