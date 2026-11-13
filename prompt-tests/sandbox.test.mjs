// Custom displays: a phase drawn by a sandboxed script (lib/experiment-runtime/sandbox.ts).
//
// What can be checked without a browser: the validator's rules, the parsing of what a
// script posts back (everything from inside the frame is untrusted), the escaping of the
// document the frame runs, and the `reported` correctness rule. The frame itself running in
// a real browser is covered by tests/run-custom-display.spec.ts.
//
//   node --test prompt-tests/sandbox.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('@/')) {
      const target = join(process.cwd(), specifier.slice(2));
      const withExt = existsSync(target) ? target : `${target}.ts`;
      return next(pathToFileURL(withExt).href, context);
    }
    if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) {
      const candidate = new URL(`${specifier}.ts`, context.parentURL);
      if (existsSync(fileURLToPath(candidate))) return next(`${specifier}.ts`, context);
    }
    return next(specifier, context);
  },
});

const { validate } = await import('../lib/experiment-runtime/validate.ts');
const { isCorrect, buildTrials, REPORTED_CORRECT_KEY } = await import('../lib/experiment-runtime/trials.ts');
const { readSandboxMessage, sanitizeColumns, sandboxDocument, scriptSyntaxError, SANDBOX_SOURCE, SANDBOX_MAX_SCRIPT } =
  await import('../lib/experiment-runtime/sandbox.ts');

const DOTS = `const { ctx, width, height } = exp.canvas();
let last = exp.now();
function frame() {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#fff';
  ctx.fillRect(width / 2 + Math.cos(exp.values.direction) * 10, height / 2, 4, 4);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);`;

/** A small, valid motion-direction experiment: dots, then an ordinary two-button choice. */
function motionDef(overrides = {}) {
  return {
    slug: 'motionTest',
    version: 1,
    title: { en: 'Motion', he: 'תנועה' },
    category: 'Perception',
    description: { en: 'Which way did the dots move?', he: 'לאן נעו הנקודות?' },
    instructions: { en: ['Watch the dots.'], he: ['הסתכלו על הנקודות.'] },
    factors: [
      { name: 'direction', levels: ['left', 'right'] },
      { name: 'coherence', levels: [10, 40] },
    ],
    repetitions: 4,
    trial: {
      phases: [
        { name: 'fixation', display: { kind: 'fixation' }, durationMs: 500 },
        { name: 'dots', display: { kind: 'blank' }, durationMs: 1000, custom: { script: DOTS } },
        { name: 'response', display: { kind: 'blank' }, awaitsResponse: true, startsClock: true },
      ],
      response: {
        kind: 'choice',
        options: [
          { label: { en: 'Left', he: 'שמאל' }, value: 'left', key: 'ArrowLeft' },
          { label: { en: 'Right', he: 'ימין' }, value: 'right', key: 'ArrowRight' },
        ],
      },
      correct: { kind: 'matchesFactor', factor: 'direction' },
    },
    store: ['direction', 'coherence'],
    dashboard: { charts: [{ title: 'Accuracy', groupBy: 'coherence', measure: 'accuracy' }] },
    ...overrides,
  };
}

const errors = def => validate(def).filter(i => i.severity === 'error').map(i => i.message);

test('a definition with a display-only custom phase is valid', () => {
  assert.deepEqual(errors(motionDef()), []);
});

test('a script that does not parse is caught before anyone runs it', () => {
  const def = motionDef();
  def.trial.phases[1].custom.script = 'const x = ;';
  const found = errors(def);
  assert.equal(found.length, 1);
  assert.match(found[0], /does not parse/);
});

test('an empty or missing script is refused', () => {
  const def = motionDef();
  def.trial.phases[1].custom = { script: '   ' };
  assert.match(errors(def).join('\n'), /non-empty "script"/);
});

test('an enormous script is refused', () => {
  const def = motionDef();
  def.trial.phases[1].custom.script = `// ${'x'.repeat(SANDBOX_MAX_SCRIPT)}`;
  assert.match(errors(def).join('\n'), /over the .* limit/);
});

test('a script that answers must be on a response phase and must call exp.done', () => {
  const def = motionDef();
  def.trial.phases[2] = {
    name: 'response', display: { kind: 'blank' }, awaitsResponse: true, startsClock: true,
    custom: { script: 'exp.root.textContent = "hi";', responds: true },
  };
  def.trial.response = { kind: 'text' };
  def.trial.correct = { kind: 'reported' };
  assert.match(errors(def).join('\n'), /never calls exp\.done/);

  def.trial.phases[2].custom.script = 'exp.root.onpointerdown = () => exp.done("x", { correct: true });';
  assert.deepEqual(errors(def), []);

  delete def.trial.phases[2].awaitsResponse;
  assert.match(errors(def).join('\n'), /must have "awaitsResponse": true/);
});

test('a display-only phase with no duration must end itself', () => {
  const def = motionDef();
  delete def.trial.phases[1].durationMs;
  assert.match(errors(def).join('\n'), /never end/);
  def.trial.phases[1].custom.script = `${DOTS}\nsetTimeout(() => exp.done(), 800);`;
  assert.deepEqual(errors(def), []);
});

test('"reported" correctness needs a script to report it, and no factor', () => {
  const def = motionDef();
  def.trial.correct = { kind: 'reported' };
  // The dots phase is a custom display, so a reported verdict is possible.
  assert.deepEqual(errors(def), []);
  def.trial.phases[1] = { name: 'dots', display: { kind: 'blank' }, durationMs: 1000 };
  assert.match(errors(def).join('\n'), /no phase has a custom script/);
});

test('custom phases in a later block are checked too', () => {
  const def = motionDef({
    stages: [{
      name: 'second',
      factors: [{ name: 'direction', levels: ['left', 'right'] }],
      repetitions: 2,
      trial: {
        phases: [
          { name: 'dots', display: { kind: 'blank' }, durationMs: 800, custom: { script: 'let = 3' } },
          { name: 'response', display: { kind: 'blank' }, awaitsResponse: true },
        ],
        response: { kind: 'choice', options: [{ label: { en: 'L', he: 'ש' }, value: 'left' }, { label: { en: 'R', he: 'י' }, value: 'right' }] },
        correct: { kind: 'matchesFactor', factor: 'direction' },
      },
      store: ['direction'],
    }],
  });
  assert.match(errors(def).join('\n'), /block "second".*does not parse/);
});

test('component and custom on the same phase is refused', () => {
  const def = motionDef();
  def.trial.phases[1].component = 'wasonRuleDiscovery';
  assert.match(errors(def).join('\n'), /both "component" and "custom"/);
});

test('the reported rule reads the verdict the runner placed in the values', () => {
  const def = motionDef({ trial: { ...motionDef().trial, correct: { kind: 'reported' } } });
  const [trial] = buildTrials(def);
  assert.equal(isCorrect(def, { ...trial, values: { ...trial.values, [REPORTED_CORRECT_KEY]: true } }, 'x'), true);
  assert.equal(isCorrect(def, { ...trial, values: { ...trial.values, [REPORTED_CORRECT_KEY]: false } }, 'x'), false);
  // A script that crashed or never said: not correct, rather than null (which means "no right answer").
  assert.equal(isCorrect(def, trial, 'x'), false);
});

// ── What comes back from inside the frame ──────────────────────────────────────

const TOKEN = 'abc123';
const msg = body => ({ source: SANDBOX_SOURCE, token: TOKEN, ...body });

test('messages without the frame token, or from anything else, are ignored', () => {
  assert.equal(readSandboxMessage({ ...msg({ type: 'done' }), token: 'other' }, TOKEN), null);
  assert.equal(readSandboxMessage({ type: 'done', token: TOKEN }, TOKEN), null);
  assert.equal(readSandboxMessage('done', TOKEN), null);
  assert.equal(readSandboxMessage(msg({ type: 'navigate' }), TOKEN), null);
});

test('done carries the response as a string and the verdict apart from the columns', () => {
  const m = readSandboxMessage(msg({ type: 'done', response: 42, data: { correct: true, level: 3 } }), TOKEN);
  assert.deepEqual(m, { type: 'done', response: '42', data: { level: 3 }, correct: true });
  const none = readSandboxMessage(msg({ type: 'done', response: null, data: null }), TOKEN);
  assert.deepEqual(none, { type: 'done', response: null, data: {}, correct: null });
});

test('columns a script adds are named safely, capped, and JSON only', () => {
  const out = sanitizeColumns({
    ok: 1,
    'bad name': 2,
    __proto__x: 3,
    'drop;table': 4,
    nan: NaN,
    long: 'y'.repeat(10_000),
    list: [1, 2, 3],
    fn: () => 1,
  });
  assert.equal(out.ok, 1);
  assert.equal(out.__proto__x, 3);
  assert.ok(!('bad name' in out) && !('drop;table' in out) && !('nan' in out) && !('fn' in out));
  assert.equal(out.long.length, 4000);
  assert.deepEqual(out.list, [1, 2, 3]);

  const many = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`c${i}`, i]));
  assert.equal(Object.keys(sanitizeColumns(many)).length, 30);
  assert.deepEqual(sanitizeColumns([1, 2]), {});
  assert.deepEqual(sanitizeColumns('x'), {});
});

test('memory too large to carry is dropped rather than truncated into nonsense', () => {
  assert.deepEqual(readSandboxMessage(msg({ type: 'keep', memory: { level: 2 } }), TOKEN), { type: 'keep', memory: { level: 2 } });
  assert.equal(readSandboxMessage(msg({ type: 'keep', memory: 'z'.repeat(60_000) }), TOKEN), null);
});

test('error messages are capped', () => {
  const m = readSandboxMessage(msg({ type: 'error', message: 'e'.repeat(5000) }), TOKEN);
  assert.equal(m.message.length, 500);
});

// ── The document the frame runs ────────────────────────────────────────────────

const INIT = {
  values: { word: '</script><script>alert(1)</script>', line: 'a b' },
  language: 'he', practice: false, trialIndex: 0, seed: 1, assetBase: '', memory: null, responds: false,
};

test('values cannot close the harness script element', () => {
  const doc = sandboxDocument('exp.done();', INIT, TOKEN);
  // Exactly the two harness scripts plus the user script: nothing injected.
  assert.equal((doc.match(/<script>/g) ?? []).length, 2);
  assert.ok(!doc.includes('</script><script>alert'));
  assert.ok(!doc.includes(' '));
});

test('a script containing "</script" does not end its element early', () => {
  const doc = sandboxDocument('const s = "</script><b>x</b>";', INIT, TOKEN);
  assert.equal((doc.match(/<\/script>/g) ?? []).length, 2);
});

test('the frame forbids network access and same-origin reach', () => {
  const doc = sandboxDocument('1', INIT, TOKEN);
  assert.match(doc, /connect-src 'none'/);
  assert.match(doc, /default-src 'none'/);
  assert.match(doc, /dir="rtl"/);
});

test('syntax checking does not run the script', () => {
  globalThis.__ran = false;
  assert.equal(scriptSyntaxError('globalThis.__ran = true;'), null);
  assert.equal(globalThis.__ran, false);
  assert.match(scriptSyntaxError('function ('), /./);
});
