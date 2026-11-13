// The sandbox: a phase whose display is a small script, run where it cannot touch the site.
//
// Why this exists. The runtime draws what its display kinds can describe — text, shapes,
// images, arrays — and an experiment is otherwise ordinary data. But some paradigms need
// something no fixed list will ever cover: dots drifting at 5% coherence, a flicker, a tone,
// a staircase that adapts to the last answer, a puzzle the participant manipulates. The old
// answer was "generate a whole set of pages instead", which could not be built from the live
// site, could not be edited afterwards, and could break the site's own build.
//
// The new answer keeps everything ordinary — trials, factors, scoring, saving, dashboard,
// versions, Refine — and lets ONE phase be a script. That script runs in an iframe with
// `sandbox="allow-scripts"` and no `allow-same-origin`, so it gets an opaque origin: it cannot
// read the site's storage, cookies or DOM, cannot reach Supabase with the site's key, and a
// Content-Security-Policy with `connect-src 'none'` stops it fetching anything. What it CAN do
// is draw inside its own frame and post a result back, which the runner checks before using.
//
// This file is pure (no React) so the validator, the CLI and the offline tests can use it.

/** Marks messages that come from a sandbox, so nothing else posted to the window is taken for one. */
export const SANDBOX_SOURCE = 'cognitives-sandbox';

/** What the runner posts to the page hosting it (the /create preview) when a sandbox fails. */
export const SANDBOX_REPORT = 'cognitives-sandbox-report';

/** Generous for a stimulus script; a script this long is a program, not a display. */
export const SANDBOX_MAX_SCRIPT = 40_000;

/** A phase that waits on a script that never answers offers a way on after this long. */
export const SANDBOX_STUCK_MS = 120_000;

/** What a sandbox may carry from one trial to the next (a staircase level, the last letters). */
const MAX_MEMORY_BYTES = 50_000;

/** Columns a sandbox may add to a trial's row. */
const MAX_COLUMNS = 30;
const MAX_VALUE_BYTES = 4_000;
const COLUMN_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,47}$/;

/** Everything a script is handed about the trial it is running in. */
export interface SandboxInit {
  /** This trial's factor values and pool items, exactly as the displays see them. */
  values: Record<string, unknown>;
  language: 'he' | 'en';
  practice: boolean;
  trialIndex: number;
  /** Seeds `exp.random()`, so a trial's random layout is reproducible. */
  seed: number;
  /** Prefix for uploaded stimulus files; `exp.asset(name)` uses it. */
  assetBase: string;
  /** What an earlier trial of this block passed to `exp.keep()`, or null. */
  memory: unknown;
  /** True when this script is the one that answers the trial. */
  responds: boolean;
}

/** A message from a sandbox, after checking. Anything malformed is dropped, never trusted. */
export type SandboxMessage =
  | { type: 'start' }
  | { type: 'error'; message: string }
  | { type: 'keep'; memory: unknown }
  | { type: 'record'; data: Record<string, unknown> }
  | { type: 'done'; response: string | null; data: Record<string, unknown>; correct: boolean | null };

/**
 * Parses what a sandbox posted.
 *
 * Everything from inside the frame is untrusted — the script was written by a model from a
 * paper — so nothing is passed through as given: types are checked, strings are capped, and
 * column names that could collide with anything are refused.
 */
export function readSandboxMessage(raw: unknown, token: string): SandboxMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  if (m.source !== SANDBOX_SOURCE || m.token !== token) return null;

  switch (m.type) {
    case 'start':
      return { type: 'start' };
    case 'error':
      return { type: 'error', message: String(m.message ?? 'Unknown error').slice(0, 500) };
    case 'keep': {
      const memory = jsonSafe(m.memory, MAX_MEMORY_BYTES);
      return memory === undefined ? null : { type: 'keep', memory };
    }
    case 'record':
      return { type: 'record', data: sanitizeColumns(m.data) };
    case 'done': {
      const data = sanitizeColumns(m.data);
      const rawCorrect = (m.data as Record<string, unknown> | null)?.correct;
      const response = m.response === null || m.response === undefined
        ? null
        : String(m.response).slice(0, 2000);
      return {
        type: 'done',
        response,
        data,
        correct: typeof rawCorrect === 'boolean' ? rawCorrect : null,
      };
    }
    default:
      return null;
  }
}

/**
 * The columns a script asked to add to the trial's row, made safe to store.
 *
 * `correct` is taken out: it is the script's verdict on the trial, which goes to the
 * is_correct column through the `reported` rule rather than into the payload.
 */
export function sanitizeColumns(data: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!data || typeof data !== 'object' || Array.isArray(data)) return out;
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (Object.keys(out).length >= MAX_COLUMNS) break;
    if (key === 'correct' || !COLUMN_NAME.test(key)) continue;
    if (value === null || typeof value === 'boolean') out[key] = value;
    else if (typeof value === 'number') { if (Number.isFinite(value)) out[key] = value; }
    else if (typeof value === 'string') out[key] = value.slice(0, MAX_VALUE_BYTES);
    else {
      const safe = jsonSafe(value, MAX_VALUE_BYTES);
      if (safe !== undefined) out[key] = safe;
    }
  }
  return out;
}

/** A JSON round-trip within a size limit, or undefined when it is too big or not JSON at all. */
function jsonSafe(value: unknown, maxBytes: number): unknown {
  try {
    const text = JSON.stringify(value ?? null);
    if (text === undefined || text.length > maxBytes) return undefined;
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * Checks that a script at least parses, without running it.
 *
 * `new Function` compiles the body and stops there. Returns the parser's message, or null.
 * Where eval is forbidden (a strict CSP) the check is skipped rather than failing every script:
 * the sandbox reports a syntax error at run time anyway.
 */
export function scriptSyntaxError(script: string): string | null {
  try {
    new Function('exp', `"use strict";\n${script}`);
    return null;
  } catch (err) {
    if (err instanceof SyntaxError) return err.message;
    return null;
  }
}

/** JSON that is safe inside a <script> element: no way to close the element from a string. */
function inlineJson(value: unknown): string {
  return JSON.stringify(value ?? null)
    .replace(/</g, '\\u003c')
    .replace(new RegExp(String.fromCharCode(0x2028), 'g'), '\\u2028')
    .replace(new RegExp(String.fromCharCode(0x2029), 'g'), '\\u2029');
}

/**
 * The HTML document a sandbox frame runs.
 *
 * The script is placed in its own <script> element after the harness, wrapped in a function
 * so it receives `exp` and runs in strict mode. A literal "</script" inside it would end the
 * element early and spill the rest as page text, so it is escaped — inside a JS string,
 * "<\/script" is the same characters.
 */
export function sandboxDocument(script: string, init: SandboxInit, token: string): string {
  const safeScript = script.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
  return `<!doctype html>
<html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob: https:; media-src data: blob: https:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
html,body{margin:0;height:100%;background:#0f172a;color:#f1f5f9;font-family:system-ui,-apple-system,"Segoe UI",Arial,sans-serif;overflow:hidden;touch-action:manipulation;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent}
#root{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px}
button{font:inherit;font-size:18px;padding:12px 22px;border-radius:12px;border:1px solid #475569;background:#1e293b;color:#f1f5f9;cursor:pointer;touch-action:manipulation}
button:active{background:#334155}
canvas{display:block}
</style></head>
<body${init.language === 'he' ? ' dir="rtl"' : ''}><div id="root"></div>
<script>
(function () {
  var TOKEN = ${inlineJson(token)};
  var INIT = ${inlineJson(init)};
  var SOURCE = ${inlineJson(SANDBOX_SOURCE)};
  function post(message) {
    message.source = SOURCE;
    message.token = TOKEN;
    try { parent.postMessage(message, '*'); } catch (e) { /* the frame is already gone */ }
  }
  function describe(e) {
    if (!e) return 'Unknown error';
    if (e.message) return String(e.message);
    return String(e);
  }
  var reported = false;
  function fail(message) {
    if (reported) return;
    reported = true;
    post({ type: 'error', message: message });
  }
  window.addEventListener('error', function (e) { fail(describe(e.error) || e.message || 'Script error'); });
  window.addEventListener('unhandledrejection', function (e) { fail('Unhandled promise rejection: ' + describe(e.reason)); });

  // mulberry32: small, fast, and seeded from the trial, so a layout can be reproduced.
  var s = (INIT.seed >>> 0) || 1;
  function random() {
    s = (s + 0x6D2B79F5) >>> 0;
    var t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  var finished = false;
  var root = document.getElementById('root');
  var exp = {
    root: root,
    values: INIT.values,
    language: INIT.language,
    practice: INIT.practice,
    trialIndex: INIT.trialIndex,
    memory: INIT.memory,
    responds: INIT.responds,
    get width() { return root.clientWidth; },
    get height() { return root.clientHeight; },
    random: random,
    now: function () { return performance.now(); },
    text: function (both) {
      if (both == null) return '';
      if (typeof both !== 'object') return String(both);
      return String(both[INIT.language] != null ? both[INIT.language] : (both.en != null ? both.en : ''));
    },
    asset: function (name) {
      name = String(name);
      if (/^(https?:|data:|blob:)/.test(name)) return name;
      return INIT.assetBase + name;
    },
    canvas: function () {
      var ratio = window.devicePixelRatio || 1;
      var c = document.createElement('canvas');
      var w = root.clientWidth, h = root.clientHeight;
      c.width = Math.round(w * ratio);
      c.height = Math.round(h * ratio);
      c.style.width = w + 'px';
      c.style.height = h + 'px';
      c.style.position = 'absolute';
      c.style.left = '0';
      c.style.top = '0';
      root.appendChild(c);
      var ctx = c.getContext('2d');
      ctx.scale(ratio, ratio);
      return { canvas: c, ctx: ctx, width: w, height: h };
    },
    keep: function (memory) { post({ type: 'keep', memory: memory }); },
    record: function (data) { post({ type: 'record', data: data }); },
    done: function (response, data) {
      if (finished) return;
      finished = true;
      post({ type: 'done', response: response == null ? null : String(response), data: data || null });
    }
  };
  window.exp = exp;
  post({ type: 'start' });
})();
</script>
<script>
(function (exp) {
"use strict";
${safeScript}
})(window.exp);
</script>
</body></html>`;
}
