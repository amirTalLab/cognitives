#!/usr/bin/env node
//
// Terminal-side tooling for the definition pipeline.
//
// The /create page in the app runs the pipeline through the Anthropic API, which is
// metered. Claude Code in a terminal runs on the subscription instead, so the same
// experiment can be produced for nothing — but only if the terminal has the two things
// the API routes provide: the real validator, and a way to publish.
//
// That is all this script is. It does NOT re-implement any rule:
//   • checking loads lib/experiment-runtime/validate.ts, the exact module /api/create/
//     definition runs, so the two paths can never disagree about what is valid;
//   • publishing writes the same row to the same table the browser writes.
//
// Node runs the TypeScript directly (v22.6+ strips types). The one wrinkle is that the
// repo's imports are extensionless, which Node's resolver rejects, so a resolve hook adds
// the .ts — cheaper than a build step or a dev dependency.
//
// Usage:
//   npm run exp:check   -- experiments/<slug>.json
//   npm run exp:publish -- experiments/<slug>.json
//   npm run exp:list
//   npm run exp:unpublish -- <slug>

import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve as resolvePath, relative, join, extname } from 'node:path';

// ── Loading the repo's TypeScript ────────────────────────────────────────────

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) {
      const candidate = new URL(`${specifier}.ts`, context.parentURL);
      if (existsSync(fileURLToPath(candidate))) return next(`${specifier}.ts`, context);
    }
    return next(specifier, context);
  },
});

const ROOT = resolvePath(fileURLToPath(import.meta.url), '..', '..');

/** Repo-relative when the file is in the repo, absolute when it is not. */
function shortPath(path) {
  const rel = relative(ROOT, path);
  return rel && !rel.startsWith('..') ? rel.replace(/\\/g, '/') : path;
}
const { validate } = await import('../lib/experiment-runtime/validate.ts');
const { buildTrials, resolve: resolveBound } = await import('../lib/experiment-runtime/trials.ts');

// ── Output ───────────────────────────────────────────────────────────────────

const c = process.stdout.isTTY
  ? { red: s => `\x1b[31m${s}\x1b[0m`, amber: s => `\x1b[33m${s}\x1b[0m`,
      green: s => `\x1b[32m${s}\x1b[0m`, dim: s => `\x1b[2m${s}\x1b[0m`,
      bold: s => `\x1b[1m${s}\x1b[0m` }
  : { red: s => s, amber: s => s, green: s => s, dim: s => s, bold: s => s };

const say = (...args) => console.log(...args);

/**
 * A message for the user, not a stack trace.
 *
 * Thrown and caught at the entry point rather than calling process.exit here: exiting
 * while a fetch is still in flight aborts libuv mid-handle on Windows, which prints an
 * assertion failure after a perfectly good error message.
 */
class Fail extends Error {}

function die(message) {
  throw new Fail(message);
}

// ── Reading a definition file ────────────────────────────────────────────────

async function readDefinition(file) {
  if (!file) die('Which file? e.g. npm run exp:check -- experiments/stroop.json');

  const path = resolvePath(process.cwd(), file);
  let text;
  try {
    text = await readFile(path, 'utf8');
  } catch {
    die(`No file at ${shortPath(path)}`);
  }

  try {
    return { definition: JSON.parse(text), path };
  } catch (err) {
    // A JSON position is useless on its own, so show the line it lands on.
    const at = /position (\d+)/.exec(err.message);
    const excerpt = at ? `\n\n  ${c.dim(text.slice(Math.max(0, +at[1] - 60), +at[1] + 60).replace(/\n/g, ' '))}` : '';
    die(`${shortPath(path)} is not valid JSON.\n  ${err.message}${excerpt}`);
  }
}

// ── check ────────────────────────────────────────────────────────────────────

/**
 * Fixed milliseconds in one trial.
 *
 * Response phases have no duration until someone responds, so they are reported
 * separately rather than guessed at — an estimate that silently assumed a response time
 * would be wrong by more than the part it was estimating.
 */
function trialTiming(def, trial) {
  let fixed = 0;
  let awaited = 0;
  for (const phase of def.trial.phases) {
    if (phase.awaitsResponse) { awaited++; continue; }
    const ms = resolveBound(phase.durationMs, trial.values);
    if (typeof ms === 'number') fixed += ms;
  }
  return { fixed: fixed + (def.trial.itiMs ?? 0), awaited };
}

function describe(def) {
  // Seeded so two runs of `check` report the same numbers — a trial count that drifts
  // between runs would look like a bug in the definition rather than in the sampling.
  let seed = 12345;
  const rng = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;

  const trials = buildTrials(def, { rng });
  const practice = def.practice ? buildTrials(def, { practice: true, rng }).length : 0;

  say(`\n  ${c.bold(def.title)} ${c.dim(`· ${def.category} · /run/${def.slug}`)}`);
  say(`  ${trials.length} trials${practice ? ` (+ ${practice} practice)` : ''}, ` +
      `${def.factors.length} factor${def.factors.length === 1 ? '' : 's'}, ` +
      `${def.trial.phases.length} phases`);

  // Cell counts per factor. An unbalanced design is legal but almost never intended, so
  // it is worth seeing before a class runs it.
  for (const factor of def.factors) {
    const counts = new Map();
    for (const trial of trials) {
      const value = trial.values[factor.name];
      const key = value && typeof value === 'object'
        ? String(Object.values(value)[0])
        : String(value);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const shown = [...counts.entries()].slice(0, 6)
      .map(([level, n]) => `${level} ×${n}`).join(', ');
    const more = counts.size > 6 ? c.dim(` … ${counts.size - 6} more`) : '';
    say(`    ${c.dim('·')} ${factor.name}: ${shown}${more}`);
  }

  const { fixed, awaited } = trialTiming(def, trials[0] ?? { values: {} });
  const minutes = ((fixed * (trials.length + practice)) / 60000).toFixed(1);
  say(`  ${c.dim(`≈ ${minutes} min of fixed timing${awaited ? ', plus response time' : ''}`)}`);
}

function report(issues) {
  const errors = issues.filter(i => i.severity === 'error');
  const warnings = issues.filter(i => i.severity === 'warning');

  for (const issue of errors) say(`  ${c.red('error')}   ${issue.message}`);
  for (const issue of warnings) say(`  ${c.amber('warning')} ${issue.message}`);
  return errors.length;
}

async function check(file) {
  const { definition, path } = await readDefinition(file);
  const issues = validate(definition);

  say(`\n${c.dim(shortPath(path))}`);
  const errorCount = report(issues);

  if (errorCount > 0) {
    // Thrown without the ✗ prefix die() adds, since the errors are already listed above.
    throw new Fail(`${errorCount} error${errorCount === 1 ? '' : 's'} — this would not run. Fix them and check again.`);
  }

  describe(definition);
  say(`\n${c.green('✓ valid')}${issues.length ? c.dim(` (${issues.length} warning${issues.length === 1 ? '' : 's'} above)`) : ''}\n`);
  return definition;
}

// ── Supabase (raw REST) ──────────────────────────────────────────────────────

// The app's supabase helper returns null outside a browser on purpose, and the service
// role key is not in play here, so this speaks PostgREST directly with the same anon key
// the browser uses — the same thing middleware.ts does, for the same reason.
function supabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    die('Supabase is not configured. NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY\n' +
        '  must be in .env.local — the npm scripts load that file automatically.');
  }
  return { url: url.replace(/\/$/, ''), key };
}

async function rest(path, init = {}) {
  const { url, key } = supabase();
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });

  const body = await res.text();
  if (!res.ok) {
    if (/relation .*does not exist|could not find the table/i.test(body)) {
      die('The experiment_definitions table does not exist yet.\n' +
          '  Run supabase/schemas/experiment-definitions.sql in the Supabase SQL editor, then try again.');
    }
    die(`Supabase refused the request (${res.status}).\n  ${body.slice(0, 400)}`);
  }
  return body ? JSON.parse(body) : null;
}

// ── assets ───────────────────────────────────────────────────────────────────

const BUCKET = 'experiment-assets';

const MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
};

/**
 * Uploads a folder of images and records them in the definition.
 *
 * Files go to storage rather than into the repo on purpose: a lecturer adding stimuli must
 * not need a commit and a deploy. The manifest written back into the JSON is what lets
 * `check` catch a definition asking for a file nobody uploaded.
 */
async function assets(file, folder) {
  if (!folder) die('Which folder of images? e.g. npm run exp:assets -- experiments/shepard.json ./blocks');

  const { definition, path } = await readDefinition(file);
  if (!definition.slug) die(`${shortPath(path)} has no slug, so there is nowhere to put the files.`);

  const dir = resolvePath(process.cwd(), folder);
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    die(`No folder at ${shortPath(dir)}`);
  }

  const images = entries
    .filter(e => e.isFile() && MIME[extname(e.name).toLowerCase()])
    .map(e => e.name)
    .sort();

  if (images.length === 0) {
    die(`No images in ${shortPath(dir)} — looked for ${Object.keys(MIME).join(', ')}.`);
  }

  const { url, key } = supabase();
  say(`\n  Uploading ${images.length} file${images.length === 1 ? '' : 's'} to ${BUCKET}/${definition.slug}/`);

  for (const name of images) {
    const body = await readFile(join(dir, name));
    const res = await fetch(`${url}/storage/v1/object/${BUCKET}/${definition.slug}/${encodeURIComponent(name)}`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': MIME[extname(name).toLowerCase()],
        // Re-uploading a corrected image is the common case, so replacing is the default.
        'x-upsert': 'true',
      },
      body,
    });

    if (!res.ok) {
      const detail = await res.text();
      if (/bucket not found/i.test(detail)) {
        die(`The "${BUCKET}" bucket does not exist yet.\n` +
            '  Run supabase/schemas/experiment-assets.sql in the Supabase SQL editor, then try again.');
      }
      die(`Upload of "${name}" failed (${res.status}).\n  ${detail.slice(0, 300)}`);
    }
    say(`    ${c.green('✓')} ${name} ${c.dim(`${(body.length / 1024).toFixed(0)} KB`)}`);
  }

  definition.assets = {
    base: `${url}/storage/v1/object/public/${BUCKET}/${definition.slug}/`,
    files: images,
  };
  await writeFile(path, `${JSON.stringify(definition, null, 2)}\n`, 'utf8');

  say(`\n  ${c.dim(`manifest written to ${shortPath(path)}`)}`);

  // Checked immediately: the point of the manifest is to catch a src naming a file that is
  // not there, and the moment right after uploading is when that is cheapest to fix.
  await check(file);
}

// ── publish ──────────────────────────────────────────────────────────────────

async function publish(file) {
  const definition = await check(file);

  await rest('experiment_definitions', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      slug: definition.slug,
      title: definition.title,
      title_he: definition.titleHe,
      category: definition.category,
      definition,
      is_published: true,
      updated_at: new Date().toISOString(),
    }),
  });

  say(`${c.green('✓ published')} — live wherever this Supabase project is used, including the deployed site.\n`);
  say(`  experiment  /run/${definition.slug}`);
  say(`  dashboard   /run/${definition.slug}/teacher\n`);
  say(c.dim('  Reachable by URL only until it is listed on the homepage.\n'));
}

// ── unpublish ────────────────────────────────────────────────────────────────

async function unpublish(slug) {
  if (!slug) die('Which slug? e.g. npm run exp:unpublish -- stroopDemo');

  const rows = await rest(`experiment_definitions?slug=eq.${encodeURIComponent(slug)}&select=slug`);
  if (!rows?.length) die(`Nothing published under "${slug}". Run npm run exp:list to see what is.`);

  await rest(`experiment_definitions?slug=eq.${encodeURIComponent(slug)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ is_published: false, updated_at: new Date().toISOString() }),
  });

  // The row is kept rather than deleted: results already collected reference the slug, and
  // re-publishing should not mean rebuilding the definition.
  say(`\n${c.green('✓')} /run/${slug} no longer resolves. The definition is kept — publish again to restore it.\n`);
}

// ── list ─────────────────────────────────────────────────────────────────────

async function list() {
  const rows = await rest(
    'experiment_definitions?select=slug,title,category,is_published,updated_at&order=updated_at.desc',
  );

  if (!rows.length) {
    say(`\n${c.dim('Nothing published yet.')}\n`);
    return;
  }

  say('');
  for (const row of rows) {
    const mark = row.is_published ? c.green('●') : c.dim('○');
    const when = new Date(row.updated_at).toISOString().slice(0, 10);
    say(`  ${mark} ${row.slug.padEnd(24)} ${c.dim(`${(row.category ?? '').padEnd(14)} ${when}`)}  ${row.title ?? ''}`);
  }
  say(`\n  ${c.dim('● published · ○ unpublished')}\n`);
}

// ── Entry ────────────────────────────────────────────────────────────────────

const [command, arg, arg2] = process.argv.slice(2);

const USAGE = `
  ${c.bold('Experiment definitions')} — the terminal side of the pipeline.

    npm run exp:check     -- experiments/<slug>.json         validate, and describe what it builds
    npm run exp:assets    -- experiments/<slug>.json ./imgs  upload stimulus images, record them
    npm run exp:publish   -- experiments/<slug>.json         check, then make it live at /run/<slug>
    npm run exp:list                                         what is published
    npm run exp:unpublish -- <slug>                          take one down
`;

try {
  switch (command) {
    case 'check':     await check(arg); break;
    case 'assets':    await assets(arg, arg2); break;
    case 'publish':   await publish(arg); break;
    case 'unpublish': await unpublish(arg); break;
    case 'list':      await list(); break;
    default:
      say(USAGE);
      // An unrecognised command is a mistake worth failing on; no command at all is
      // someone asking what this does.
      process.exitCode = command ? 1 : 0;
  }
} catch (err) {
  if (!(err instanceof Fail)) throw err;
  say(`\n${c.red('✗')} ${err.message}\n`);
  process.exitCode = 1;
}
