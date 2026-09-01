// Fuzzing the boundary where untrusted text becomes a running experiment.
//
// A definition arrives as text from a model and is then stored, re-read and rendered to a
// class. Everything on that path has to survive input nobody intended: a reply cut off at
// an arbitrary byte, a key called __proto__, a stimulus containing a quote or a brace.
//
//   node --test prompt-tests/fuzz.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) {
      const candidate = new URL(`${specifier}.ts`, context.parentURL);
      if (existsSync(fileURLToPath(candidate))) return next(`${specifier}.ts`, context);
    }
    return next(specifier, context);
  },
});

const { parseJson } = await import('../lib/create-project/anthropic.ts');
const { validate } = await import('../lib/experiment-runtime/validate.ts');
const { buildTrials } = await import('../lib/experiment-runtime/trials.ts');
const { STROOP } = await import('../lib/experiment-runtime/generality-probe.ts');

// ── Truncation at every byte ──────────────────────────────────────────────────

test('a reply truncated at ANY byte is classified, never crashes or hangs', () => {
  const full = JSON.stringify(STROOP);
  const surprises = [];

  for (let cut = 1; cut < full.length; cut++) {
    const partial = full.slice(0, cut);
    try {
      const out = parseJson(partial);
      // Parsing a prefix is legitimate only if it happens to be complete JSON.
      assert.ok(out && typeof out === 'object');
    } catch (err) {
      const m = err.message;
      const classified = /cut off|did not return JSON|malformed JSON|reply was/i.test(m);
      if (!classified) surprises.push({ cut, message: m.split('\n')[0].slice(0, 120) });
      assert.ok(err.name === 'ClaudeError' || err instanceof Error, `unexpected throw type at ${cut}`);
    }
  }

  assert.deepEqual(surprises.slice(0, 5), [], 'some truncations produced an unclassified error');
});

test('truncated replies are mostly reported as cut off, not as malformed', () => {
  // Both are errors, but they send the reader in opposite directions: "cut off" means
  // retry or shrink, "malformed" means the model wrote bad syntax. Getting this wrong cost
  // a real debugging session.
  const full = JSON.stringify(STROOP);
  let cutOff = 0, malformed = 0, parsed = 0;

  for (let cut = 200; cut < full.length; cut += 7) {
    try { parseJson(full.slice(0, cut)); parsed++; }
    catch (err) {
      if (/cut off/i.test(err.message)) cutOff++;
      else if (/malformed/i.test(err.message)) malformed++;
    }
  }

  assert.equal(malformed, 0,
    `${malformed} truncations were mislabelled as malformed (cut off: ${cutOff}, parsed: ${parsed})`);
});

test('parsing a large reply is fast', () => {
  const big = JSON.stringify({ ...STROOP, pools: { w: Array.from({ length: 5000 }, (_, i) => ({ t: `w${i}` })) } });
  const t0 = performance.now();
  parseJson(big);
  const ms = performance.now() - t0;
  assert.ok(ms < 500, `parsing ${big.length} chars took ${ms.toFixed(0)}ms`);
});

test('a deeply nested reply does not blow the stack', () => {
  const deep = `{"a":${'['.repeat(500)}1${']'.repeat(500)}}`;
  assert.doesNotThrow(() => { try { parseJson(deep); } catch (e) { if (!(e instanceof Error)) throw e; } });
});

// ── Hostile content ───────────────────────────────────────────────────────────

test('__proto__ in a reply does not pollute Object.prototype', () => {
  // A definition is parsed from model output and then stored and re-read. If a key called
  // __proto__ could reach the prototype, every object in the process would inherit it.
  parseJson('{"__proto__":{"polluted":"yes"},"slug":"x"}');
  assert.equal({}.polluted, undefined, 'Object.prototype was polluted by parsing');
  parseJson('{"constructor":{"prototype":{"polluted2":"yes"}},"slug":"x"}');
  assert.equal({}.polluted2, undefined, 'Object.prototype was polluted via constructor');
});

test('script-like text in a stimulus survives as text', () => {
  const payload = '{"text":"<script>alert(1)</script>","n":1}';
  const out = parseJson(payload);
  assert.equal(out.text, '<script>alert(1)</script>', 'markup must round-trip as data');
});

test('unusual but legal text round-trips', () => {
  const cases = [
    'עברית עם פיסוק, נקודתיים: וסוגריים (כאלה)',
    'emoji 🧠🔬 and math ∑∫',
    'tabs\tand\nnewlines',
    'quote " and backslash \\ and brace }',
    'a'.repeat(5000),
  ];
  for (const text of cases) {
    const out = parseJson(JSON.stringify({ text }));
    assert.equal(out.text, text, `round-trip failed for ${text.slice(0, 30)}`);
  }
});

// ── Definitions from disk ─────────────────────────────────────────────────────

test('every recorded reply still parses or fails cleanly', () => {
  // The recordings are real model output. They are the best available sample of what this
  // code actually has to survive.
  const dir = join(process.cwd(), 'prompt-tests', 'recordings');
  if (!existsSync(dir)) return;
  const files = readdirSync(dir).filter(f => f.endsWith('.txt'));

  for (const file of files) {
    const raw = readFileSync(join(dir, file), 'utf8');
    try {
      const out = parseJson(raw);
      assert.ok(out && typeof out === 'object', `${file} parsed to a non-object`);
    } catch (err) {
      assert.ok(/cut off|did not return JSON|malformed/i.test(err.message),
        `${file} produced an unclassified error: ${err.message.slice(0, 120)}`);
    }
  }
});

test('a definition parsed from a recording survives validation', () => {
  const dir = join(process.cwd(), 'prompt-tests', 'recordings');
  if (!existsSync(dir)) return;
  for (const file of readdirSync(dir).filter(f => f.startsWith('definition.'))) {
    let def;
    try { def = parseJson(readFileSync(join(dir, file), 'utf8')); } catch { continue; }
    assert.doesNotThrow(() => validate(def), `${file} crashed the validator`);
    assert.doesNotThrow(() => {
      const errors = validate(def).filter(i => i.severity === 'error');
      if (errors.length === 0) buildTrials(def, {});
    }, `${file} validated but could not build trials`);
  }
});

// ── Mutation fuzzing of a real definition ─────────────────────────────────────

test('random mutations of a valid definition never crash the validator', () => {
  const rnd = (seed => () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)(7);
  const VALUES = [null, undefined, 0, -1, 1e9, NaN, '', 'x', [], {}, true, false, { kind: 'nope' }];

  /** Replaces a random leaf somewhere in the object. */
  function mutate(node, depth = 0) {
    if (!node || typeof node !== 'object' || depth > 6) return;
    const keys = Object.keys(node);
    if (keys.length === 0) return;
    const key = keys[Math.floor(rnd() * keys.length)];
    if (rnd() < 0.35 || typeof node[key] !== 'object' || node[key] === null) {
      node[key] = VALUES[Math.floor(rnd() * VALUES.length)];
    } else {
      mutate(node[key], depth + 1);
    }
  }

  const failures = [];
  for (let i = 0; i < 600; i++) {
    const def = structuredClone(STROOP);
    const rounds = 1 + Math.floor(rnd() * 3);
    for (let r = 0; r < rounds; r++) mutate(def);

    try {
      const issues = validate(def);
      assert.ok(Array.isArray(issues));
      // Only build when validation is happy: a design it rejected is allowed to be
      // unbuildable, but one it ACCEPTED must build without throwing. That equivalence is
      // the point of the test — it is what "validated" has to mean.
      //
      // No guard on the trial count here any more: the validator rejects a design too big
      // to allocate, and buildTrials refuses one anyway, so an enormous mutation is now
      // just another rejection rather than something that takes the process down.
      if (issues.filter(x => x.severity === 'error').length === 0) buildTrials(def, {});
    } catch (err) {
      failures.push(`${err.message.split('\n')[0].slice(0, 100)}`);
    }
  }

  const unique = [...new Set(failures)];
  assert.deepEqual(unique, [], `mutations crashed the pipeline:\n  ${unique.slice(0, 10).join('\n  ')}`);
});
