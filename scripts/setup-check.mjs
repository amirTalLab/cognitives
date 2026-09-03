#!/usr/bin/env node
//
// Is this machine ready to build experiments?
//
// The terminal path asks a lecturer to clone a repo, which is where most of them stop. This
// answers the only question they have — "is it working yet?" — and when the answer is no,
// says which single thing to do next rather than leaving them to infer it from a stack
// trace.
//
// Deliberately staged: previewing an experiment needs nothing but Node and the
// dependencies, while publishing one needs Supabase. Someone who only wants to try a
// design should not be told they are broken because they have no database keys.
//
//   npm run exp:setup

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const c = process.stdout.isTTY
  ? { green: s => `\x1b[32m${s}\x1b[0m`, red: s => `\x1b[31m${s}\x1b[0m`,
      amber: s => `\x1b[33m${s}\x1b[0m`, dim: s => `\x1b[2m${s}\x1b[0m`,
      bold: s => `\x1b[1m${s}\x1b[0m` }
  : { green: s => s, red: s => s, amber: s => s, dim: s => s, bold: s => s };

const root = process.cwd();
const results = [];
/** @param {'ok'|'warn'|'fail'} state */
const add = (state, label, detail, fix) => results.push({ state, label, detail, fix });

// ── Node ──────────────────────────────────────────────────────────────────────
// 22.18 is where TypeScript runs unflagged, which is what lets the checker and the
// publisher load the app's real validator with no build step.
const [major, minor] = process.versions.node.split('.').map(Number);
const nodeOk = major > 22 || (major === 22 && minor >= 18);
add(nodeOk ? 'ok' : 'fail', `Node ${process.versions.node}`,
  nodeOk ? 'new enough' : 'too old — 22.18 or newer is required',
  'Install Node 22.18+ from nodejs.org, then run this again.');

// ── Dependencies ──────────────────────────────────────────────────────────────
const hasModules = existsSync(join(root, 'node_modules'));
add(hasModules ? 'ok' : 'fail', 'Dependencies',
  hasModules ? 'installed' : 'not installed',
  'Run: npm install');

// ── The contract and the examples ─────────────────────────────────────────────
const schema = join(root, 'lib', 'experiment-runtime', 'schema.ts');
add(existsSync(schema) ? 'ok' : 'fail', 'Experiment schema',
  existsSync(schema) ? 'found' : 'missing — are you in the project folder?',
  'cd into the cloned cognitives folder and run this again.');

const skills = ['experiment-definition', 'experiment-from-paper']
  .filter(n => existsSync(join(root, '.claude', 'skills', n, 'SKILL.md')));
add(skills.length === 2 ? 'ok' : 'warn', 'Claude Code skills',
  `${skills.length} of 2 found`,
  'The skills live in .claude/skills/. A shallow or partial clone can miss them.');

// ── Environment ───────────────────────────────────────────────────────────────
const envPath = join(root, '.env.local');
const hasEnv = existsSync(envPath);
const env = hasEnv ? readFileSync(envPath, 'utf8') : '';
const readVar = name => {
  const line = env.split('\n').find(l => l.trim().startsWith(`${name}=`));
  const value = line?.slice(line.indexOf('=') + 1).trim() ?? '';
  return value && !value.includes('your-') && !value.includes('...') ? value : '';
};
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || readVar('NEXT_PUBLIC_SUPABASE_URL');
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || readVar('NEXT_PUBLIC_SUPABASE_ANON_KEY');

if (!hasEnv) {
  add('warn', 'Supabase keys', 'no .env.local yet',
    'Copy .env.local.example to .env.local and fill in the two NEXT_PUBLIC_SUPABASE_ values. Only needed to PUBLISH — previewing works without them.');
} else if (!url || !key) {
  add('warn', 'Supabase keys', '.env.local exists but the two Supabase values are not filled in',
    'Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local. Only needed to PUBLISH.');
} else {
  add('ok', 'Supabase keys', 'set');
}

// ── Can we actually reach it? ─────────────────────────────────────────────────
let canPublish = false;
if (url && key) {
  const base = url.replace(/\/$/, '');
  try {
    const res = await fetch(`${base}/rest/v1/experiment_definitions?select=slug&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) {
      canPublish = true;
      add('ok', 'Supabase connection', 'reachable, and the definitions table is there');
    } else if (res.status === 404) {
      add('fail', 'Supabase connection', 'reachable, but the experiment_definitions table is missing',
        'Run supabase/schemas/experiment-definitions.sql in the Supabase SQL editor.');
    } else {
      add('fail', 'Supabase connection', `refused the key (HTTP ${res.status})`,
        'Check NEXT_PUBLIC_SUPABASE_ANON_KEY against the project’s API settings.');
    }
  } catch (err) {
    const paused = /ENOTFOUND|getaddrinfo|fetch failed/i.test(String(err));
    add('fail', 'Supabase connection', paused ? 'the project did not respond' : String(err).slice(0, 80),
      paused
        ? 'A free Supabase project pauses when idle. Open its dashboard and resume it, then run this again.'
        : 'Check the URL in .env.local.');
  }
}

// ── Report ────────────────────────────────────────────────────────────────────
const mark = { ok: c.green('✓'), warn: c.amber('!'), fail: c.red('✗') };
console.log('');
for (const r of results) {
  console.log(`  ${mark[r.state]} ${r.label.padEnd(22)} ${c.dim(r.detail)}`);
}

const blockers = results.filter(r => r.state === 'fail');
const canPreview = results.filter(r => ['Node ' + process.versions.node, 'Dependencies', 'Experiment schema'].some(l => r.label.startsWith(l.split(' ')[0])))
  .every(r => r.state !== 'fail');

console.log('');
if (blockers.length) {
  console.log(`  ${c.bold('Next:')}`);
  for (const b of blockers) console.log(`    ${b.fix}`);
  console.log('');
}

const yes = c.green('yes'), no = c.red('no');
console.log(`  Build and preview an experiment?  ${canPreview ? yes : no}`);
console.log(`  Publish it for students?          ${canPublish ? yes : c.amber('not yet')}`);
console.log('');

if (canPreview) {
  console.log(`  ${c.bold('To start:')} run ${c.bold('claude')} in this folder, then:`);
  console.log(`    ${c.dim('/experiment build a Stroop task')}`);
  console.log(`    ${c.dim('/experiment papers/your-paper.pdf')}`);
  console.log('');
  console.log(`  ${c.dim('Guide: docs/BUILD-AN-EXPERIMENT.md')}`);
  console.log('');
}

process.exitCode = blockers.length ? 1 : 0;
