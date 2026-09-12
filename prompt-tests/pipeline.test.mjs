// Offline tests for the layer around the model.
//
// Every failure this pipeline has had in production was here rather than in the model:
// a missing comma, a truncated reply, an empty reply, a stop reason nobody checked. None
// of them needed an API call to reproduce, yet each was found by paying for one. This
// suite reproduces them for nothing, so they can only ever be found once.
//
//   npm run test:pipeline
//
// No API key, no network, no Next server.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) {
      const candidate = new URL(`${specifier}.ts`, context.parentURL);
      if (existsSync(fileURLToPath(candidate))) return next(`${specifier}.ts`, context);
    }
    return next(specifier, context);
  },
});

const { parseJson, readTextStream } = await import('../lib/create-project/anthropic.ts');
const { validate } = await import('../lib/experiment-runtime/validate.ts');

/** Builds an SSE stream body like the Messages API sends. */
function sseStream(frames) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const f of frames) controller.enqueue(encoder.encode(f));
      controller.close();
    },
  });
}

const delta = t => `event: content_block_delta\ndata: ${JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: t } })}\n\n`;
const start = () => `event: message_start\ndata: ${JSON.stringify({ type: 'message_start', message: { usage: { input_tokens: 10, cache_read_input_tokens: 5 } } })}\n\n`;
const stop = reason => `event: message_delta\ndata: ${JSON.stringify({ type: 'message_delta', delta: { stop_reason: reason }, usage: { output_tokens: 42 } })}\n\n`;

// ── Reading the stream ────────────────────────────────────────────────────────

test('accumulates text deltas across frames', async () => {
  const r = await readTextStream(sseStream([start(), delta('{"a"'), delta(':1}'), stop('end_turn')]));
  assert.equal(r.text, '{"a":1}');
  assert.equal(r.stopReason, 'end_turn');
  assert.equal(r.usage.input, 10);
  assert.equal(r.usage.cacheRead, 5);
  assert.equal(r.usage.output, 42);
});

test('handles a frame split mid-way across chunks', async () => {
  // The network does not respect frame boundaries; a half-arrived frame must be buffered
  // rather than dropped, which used to truncate long replies.
  const whole = delta('hello');
  const cut = Math.floor(whole.length / 2);
  const r = await readTextStream(sseStream([start(), whole.slice(0, cut), whole.slice(cut), stop('end_turn')]));
  assert.equal(r.text, 'hello');
});

test('handles CRLF line endings', async () => {
  const r = await readTextStream(sseStream([start().replace(/\n/g, '\r\n'), delta('x').replace(/\n/g, '\r\n')]));
  assert.equal(r.text, 'x');
});

test('an empty stream yields empty text rather than throwing', async () => {
  const r = await readTextStream(sseStream([]));
  assert.equal(r.text, '');
});

test('surfaces an error event from the stream', async () => {
  const err = `data: ${JSON.stringify({ type: 'error', error: { message: 'overloaded' } })}\n\n`;
  await assert.rejects(() => readTextStream(sseStream([start(), err])), /overloaded/);
});

test('reports max_tokens as the stop reason', async () => {
  const r = await readTextStream(sseStream([start(), delta('{"a":1'), stop('max_tokens')]));
  assert.equal(r.stopReason, 'max_tokens');
});

// ── Parsing the reply ─────────────────────────────────────────────────────────

test('parses plain JSON', () => {
  assert.deepEqual(parseJson('{"a":1}'), { a: 1 });
});

test('parses JSON inside a markdown fence', () => {
  assert.deepEqual(parseJson('```json\n{"a":1}\n```'), { a: 1 });
});

test('parses JSON with prose around it', () => {
  assert.deepEqual(parseJson('Here you go:\n{"a":1}\nHope that helps.'), { a: 1 });
});

test('repairs a trailing comma', () => {
  assert.deepEqual(parseJson('{"a":1,}'), { a: 1 });
});

test('repairs a // comment', () => {
  assert.deepEqual(parseJson('{"a":1 // the value\n}'), { a: 1 });
});

test('repairs a missing comma between array elements', () => {
  // The real failure: two factor objects with nothing between them.
  const out = parseJson('{"factors":[{"name":"pairType"}\n{"name":"position"}]}');
  assert.equal(out.factors.length, 2);
  assert.equal(out.factors[1].name, 'position');
});

test('repairs a missing comma between keys', () => {
  assert.deepEqual(parseJson('{"a":1 "b":2}'), { a: 1, b: 2 });
});

test('does not corrupt braces inside a string', () => {
  assert.deepEqual(parseJson('{"text":"a } b { c","n":1}'), { text: 'a } b { c', n: 1 });
});

test('does not corrupt escaped quotes', () => {
  assert.deepEqual(parseJson('{"text":"he said \\"hi\\"","n":2}'), { text: 'he said "hi"', n: 2 });
});

test('does not corrupt Hebrew text', () => {
  const out = parseJson('{"he":"בכל ניסיון, שתי מחרוזות","n":3}');
  assert.equal(out.n, 3);
  assert.equal(out.he, 'בכל ניסיון, שתי מחרוזות');
});

test('a reply cut off mid-array is reported as cut off, not malformed', () => {
  // The real failure: truncated inside a stimulus pool. Slicing to the last brace yields
  // something object-shaped with an unclosed array, which used to read as a syntax slip.
  assert.throws(
    () => parseJson('{"pools":{"pairs":[{"top":"MARKET"},{"top":"PENCIL"}'),
    /cut off/i,
  );
});

test('a reply cut off inside a string is reported as cut off', () => {
  assert.throws(() => parseJson('{"a":"unfinished'), /cut off/i);
});

test('a reply with no JSON at all says so', () => {
  assert.throws(() => parseJson('I cannot help with that.'), /did not return JSON/i);
});

test('an empty reply says so rather than throwing something opaque', () => {
  assert.throws(() => parseJson(''), /did not return JSON/i);
});

// ── Validating what came back ─────────────────────────────────────────────────

const MINIMAL = {
  version: 1, slug: 's', title: 't', titleHe: 'ת', category: 'PERCEPTION',
  instructions: { en: 'e', he: 'ה' },
  factors: [{ name: 'cond', levels: ['a', 'b'] }],
  repetitions: 5,
  trial: {
    phases: [{ name: 'go', display: { kind: 'text', text: '{cond}' }, awaitsResponse: true }],
    response: { kind: 'choice', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] },
    correct: { kind: 'matchesFactor', factor: 'cond' },
  },
  store: ['cond'],
  dashboard: { charts: [{ title: 'c', kind: 'bar', groupBy: 'cond', measure: 'meanRt' }] },
};

const errorsOf = def => validate(def).filter(i => i.severity === 'error').map(i => i.message);

test('a well-formed definition validates clean', () => {
  assert.deepEqual(errorsOf(structuredClone(MINIMAL)), []);
});

test('a half-written definition produces messages, never a crash', () => {
  // The model can stop anywhere. Validation must survive every prefix of a definition,
  // because a thrown TypeError here would surface as a 500 with no explanation.
  const keys = Object.keys(MINIMAL);
  for (let i = 0; i < keys.length; i++) {
    const partial = Object.fromEntries(keys.slice(0, i).map(k => [k, structuredClone(MINIMAL[k])]));
    assert.doesNotThrow(() => validate(partial), `threw on a definition with ${i} of ${keys.length} fields`);
  }
});

test('validation catches a reference to a factor that does not exist', () => {
  const def = structuredClone(MINIMAL);
  def.trial.correct = { kind: 'matchesFactor', factor: 'nope' };
  assert.ok(errorsOf(def).some(m => /nope/.test(m)), 'expected the unknown factor to be named');
});

test('validation catches a design that produces no trials', () => {
  const def = structuredClone(MINIMAL);
  def.repetitions = 0;
  assert.ok(errorsOf(def).length > 0);
});

test('validation catches a sample larger than its pool', () => {
  const def = structuredClone(MINIMAL);
  def.pools = { words: [{ w: 'a' }, { w: 'b' }] };
  def.factors = [{ name: 'item', from: 'words', sample: 10 }];
  def.trial.correct = { kind: 'none' };
  def.trial.phases[0].display = { kind: 'text', text: '{item.w}' };
  def.store = ['item.w'];
  def.dashboard.charts[0].groupBy = 'item.w';
  assert.ok(errorsOf(def).length > 0, 'a sample bigger than the pool should be an error');
});

// ── Wizard draft persistence ──────────────────────────────────────────────────
//
// The create wizard holds several paid API results in React state, so a refresh used to
// throw the work and the money away. These cover the draft that now survives it — in
// particular the two ways a naive implementation loses data anyway: overwriting a real
// draft with an empty one on load, and trusting whatever JSON happens to be in storage.

/** The smallest localStorage that behaves like the real one, including the quota error. */
function fakeStorage(limitChars = Infinity) {
  const map = new Map();
  return {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => {
      if (String(v).length > limitChars) {
        const err = new Error('QuotaExceededError');
        err.name = 'QuotaExceededError';
        throw err;
      }
      map.set(k, String(v));
    },
    removeItem: k => map.delete(k),
    get size() { return map.size; },
  };
}

globalThis.window = globalThis;
globalThis.localStorage = fakeStorage();

const { readDraft, writeDraft, clearDraft, worthSaving, describeDraft } =
  await import('../lib/create-project/draft.ts');

/** A draft state with nothing in it — what the page holds on a fresh load. */
function emptyState() {
  return {
    stage: 'upload', pdfName: '', analysis: null, candidate: null, spec: null,
    assets: null, definition: null, files: [], notes: '', problems: [],
    messages: [], usage: [], staged: false, compileState: null, finishResult: null,
  };
}

test('a draft round-trips through storage', () => {
  globalThis.localStorage = fakeStorage();
  const state = { ...emptyState(), stage: 'refine', pdfName: 'sternberg.pdf',
    definition: structuredClone(MINIMAL), usage: [{ stage: 'Generate definition', model: 'strong', input: 9, output: 9, cacheWrite: 0, cacheRead: 0 }] };

  writeDraft(state);
  const back = readDraft();
  assert.equal(back.stage, 'refine');
  assert.equal(back.pdfName, 'sternberg.pdf');
  assert.deepEqual(back.definition, MINIMAL);
  assert.equal(back.usage.length, 1, 'the spend table has to survive too');
  assert.ok(back.savedAt > 0, 'a draft needs a timestamp to be describable');
});

test('an empty wizard is not worth saving, so it cannot clobber a real draft', () => {
  // The whole guard: landing on /create writes empty state on first render. If that were
  // saved, the draft would be destroyed before it was ever offered back.
  assert.equal(worthSaving(emptyState()), false);
  assert.equal(worthSaving({ ...emptyState(), analysis: { paperTitle: 'x', candidates: [] } }), true);
  assert.equal(worthSaving({ ...emptyState(), spec: { slug: 'a' } }), true);
  assert.equal(worthSaving({ ...emptyState(), definition: MINIMAL }), true);
  assert.equal(worthSaving({ ...emptyState(), files: [{ path: 'a', contents: '' }] }), true);
});

test('an untouched blank spec does not count as work', () => {
  // "No paper — describe it myself" installs a spec with every field empty. If that counted,
  // pressing the button would destroy a saved draft before it had even been offered back.
  const blank = {
    slug: '', title: '', titleHe: '', category: 'PERCEPTION',
    fields: [{ key: 'design', label: 'Design description', value: '', source: 'inferred' }],
  };
  assert.equal(worthSaving({ ...emptyState(), spec: blank }), false);
  assert.equal(worthSaving({ ...emptyState(), spec: { ...blank, title: 'Stroop' } }), true,
    'typing a title is real work and must start being saved');
  assert.equal(
    worthSaving({ ...emptyState(), spec: { ...blank, fields: [{ ...blank.fields[0], value: 'a' }] } }),
    true, 'typing into any spec field is real work too');
});

test('corrupt or foreign storage contents are ignored, not thrown', () => {
  globalThis.localStorage = fakeStorage();
  globalThis.localStorage.setItem('cognitives_create_draft', '{not json');
  assert.equal(readDraft(), null);

  globalThis.localStorage.setItem('cognitives_create_draft', JSON.stringify({ version: 99, stage: 'refine' }));
  assert.equal(readDraft(), null, 'a draft from a future schema must not be half-applied');
});

test('a draft too large to store fails quietly rather than breaking the pipeline', () => {
  globalThis.localStorage = fakeStorage(50);
  assert.doesNotThrow(() => writeDraft({ ...emptyState(), notes: 'x'.repeat(500) }));
  assert.equal(readDraft(), null);
});

test('clearing removes the draft', () => {
  globalThis.localStorage = fakeStorage();
  writeDraft({ ...emptyState(), definition: MINIMAL });
  assert.ok(readDraft());
  clearDraft();
  assert.equal(readDraft(), null);
});

test('the restore prompt names the experiment and how long ago it stopped', () => {
  const base = { ...emptyState(), version: 1, savedAt: Date.now() - 5 * 60_000, stage: 'spec' };
  const line = describeDraft({ ...base, spec: { title: 'Memory Scanning' } });
  assert.match(line, /Memory Scanning/);
  assert.match(line, /5 minutes ago/);
  assert.match(line, /design spec/);

  // Falls back through the names available at earlier stages rather than saying "undefined".
  assert.match(describeDraft({ ...base, pdfName: 'sternberg.pdf' }), /sternberg\.pdf/);
  assert.match(describeDraft(base), /Untitled experiment/);
});
