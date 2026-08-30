#!/usr/bin/env node
//
// Emits the EXACT prompt a production /api/create request would send, so the pipeline can
// be tested on the Claude Code subscription instead of the metered API.
//
// Why exact matters: the value of a free test is only as good as its fidelity to what runs
// in production. This script does not paraphrase or re-describe the prompt — it imports the
// very functions the API routes call (lib/create-project/prompts.ts) and the very skill and
// schema files they read (lib/create-project/skills.ts), and assembles the same bytes. The
// only thing that then differs between a free run and a paid run is the MODEL. Everything
// upstream of the model — skill text, schema contract, spec framing, output contract — is
// identical by construction, because it comes from the same source, not a copy.
//
// The loop it enables, per paper, for $0:
//   1. emit the analyze/spec prompt here → follow it against the PDF → save the spec
//   2. emit the definition prompt here   → follow it → save experiments-style JSON
//   3. npm run exp:check on that JSON     → the REAL validator, same as the API route
//   4. preview at /run/<slug>, then emit a refine prompt to test a post-preview change
//
// Node runs the TypeScript directly (v22.6+ strips types); extensionless repo imports get
// a .ts added by the resolve hook below — the same mechanism scripts/definition.mjs uses.
//
// Usage:
//   node --env-file-if-exists=.env.local scripts/emit-prompt.mjs analyze
//   node ... scripts/emit-prompt.mjs spec       prompt-tests/emitted/<slug>.candidate.json
//   node ... scripts/emit-prompt.mjs definition prompt-tests/emitted/<slug>.spec.json
//   node ... scripts/emit-prompt.mjs refine     prompt-tests/emitted/<slug>.definition.json "make the delay 2000ms"
//
// Each writes prompt-tests/emitted/<stage>.prompt.txt with the SYSTEM and USER blocks a
// production request would send, plus which model runs it live.

import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve as resolvePath, dirname, join } from 'node:path';

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) {
      const candidate = new URL(`${specifier}.ts`, context.parentURL);
      if (existsSync(fileURLToPath(candidate))) return next(`${specifier}.ts`, context);
    }
    return next(specifier, context);
  },
});

// The real prompt builders and skill/schema loaders — imported, never re-implemented.
const {
  analyzeSystem, specSystem, definitionSystem,
  ANALYZE_USER_TEXT, specUserText, specToPrompt, refineUserText,
} = await import('../lib/create-project/prompts.ts');
const { loadSkill, loadSource, SKILL_PAPER, SKILL_CODEGEN } =
  await import('../lib/create-project/skills.ts');

const SCHEMA_PATH = 'lib/experiment-runtime/schema.ts';
// Mirrors lib/create-project/anthropic.ts — which model each stage runs on in production.
const MODEL_FAST = process.env.ANTHROPIC_MODEL_FAST ?? 'claude-sonnet-5';
const MODEL_STRONG = process.env.ANTHROPIC_MODEL_STRONG ?? 'claude-opus-5';

class Fail extends Error {}

async function readJson(file, what) {
  if (!file) throw new Fail(`This stage needs a ${what} file. See the usage header.`);
  const path = resolvePath(process.cwd(), file);
  let text;
  try { text = await readFile(path, 'utf8'); }
  catch { throw new Fail(`No file at ${file}`); }
  try { return JSON.parse(text); }
  catch (e) { throw new Fail(`${file} is not valid JSON: ${e.message}`); }
}

/** Builds the { model, system, user, note } for one stage. */
async function build(stage, arg, arg2) {
  switch (stage) {
    case 'analyze':
      return {
        model: MODEL_FAST,
        system: analyzeSystem(await loadSkill(SKILL_PAPER)),
        user: ANALYZE_USER_TEXT,
        note: 'Production also attaches the paper as a PDF document block. For a free run, read the PDF yourself and follow the instructions against it.',
      };
    case 'spec': {
      const candidate = await readJson(arg, 'candidate JSON');
      return {
        model: MODEL_FAST,
        system: specSystem(await loadSkill(SKILL_PAPER)),
        user: specUserText(candidate),
        note: 'Production also attaches the same PDF. Read it yourself and extract the spec against it.',
      };
    }
    case 'definition': {
      const spec = await readJson(arg, 'spec JSON');
      return {
        model: MODEL_STRONG,
        system: definitionSystem(await loadSkill(SKILL_CODEGEN), await loadSource(SCHEMA_PATH)),
        user: specToPrompt(spec),
        note: 'No PDF at this stage — the spec is the whole input. Output must be one JSON object per the schema; save it and run: npm run exp:check -- <file>.',
      };
    }
    case 'refine': {
      const definition = await readJson(arg, 'definition JSON');
      if (!arg2) throw new Fail('Refine needs a change request, e.g. refine <definition.json> "make the mask 300ms".');
      return {
        model: MODEL_STRONG,
        system: definitionSystem(await loadSkill(SKILL_CODEGEN), await loadSource(SCHEMA_PATH)),
        user: refineUserText(definition, [{ role: 'user', content: arg2 }]),
        note: 'Return { "reply": ..., "definition": {...} }. Save the definition and re-run exp:check to confirm the edit still validates.',
      };
    }
    default:
      throw new Fail(`Unknown stage "${stage}". Use one of: analyze | spec | definition | refine.`);
  }
}

const [stage, arg, arg2] = process.argv.slice(2);

try {
  const { model, system, user, note } = await build(stage, arg, arg2);

  const out = [
    `# STAGE: ${stage}`,
    `# LIVE MODEL: ${model}   (a free run uses this session's model as a proxy)`,
    `# NOTE: ${note}`,
    '',
    '======================== SYSTEM ========================',
    system,
    '',
    '========================= USER =========================',
    user,
    '',
  ].join('\n');

  const outPath = join('prompt-tests', 'emitted', `${stage}.prompt.txt`);
  await mkdir(dirname(resolvePath(process.cwd(), outPath)), { recursive: true });
  await writeFile(resolvePath(process.cwd(), outPath), out, 'utf8');

  console.log(`\n  wrote ${outPath}`);
  console.log(`  stage:  ${stage}`);
  console.log(`  model:  ${model} (live) — proxied by this session for a free run`);
  console.log(`  system: ${system.length.toLocaleString()} chars`);
  console.log(`  user:   ${user.length.toLocaleString()} chars\n`);
} catch (err) {
  if (err instanceof Fail) { console.error(`\n  ${err.message}\n`); process.exitCode = 1; }
  else throw err;
}
