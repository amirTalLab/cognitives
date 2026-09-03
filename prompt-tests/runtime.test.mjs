// Robustness tests for the experiment runtime.
//
// The corpus is every definition already in the repo — the three round-trips, the eight
// generality probes, the templates, and anything in experiments/. They are real designs
// covering preference tasks, pooled stimuli, derived factors, exclusions and generated
// displays, so they make a far better test set than anything invented here.
//
//   node --test prompt-tests/runtime.test.mjs
//
// No API key, no network, no server.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
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

const { validate } = await import('../lib/experiment-runtime/validate.ts');
const { buildTrials, isCorrect, payloadOf, resolve, excluded, seededRandom, shuffle } =
  await import('../lib/experiment-runtime/trials.ts');
const { aggregate, generateMockRows, seriesNames, measureLabel, sem } =
  await import('../lib/experiment-runtime/aggregate.ts');
const roundTrips = await import('../lib/experiment-runtime/round-trips.ts');
const probe = await import('../lib/experiment-runtime/generality-probe.ts');
const templates = await import('../lib/experiment-runtime/templates.ts');

/** Every definition in the repo, named. */
const CORPUS = [];
for (const [mod, label] of [[roundTrips, 'round-trip'], [probe, 'probe'], [templates, 'template']]) {
  for (const [name, value] of Object.entries(mod)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && value.version === 1 && value.slug) {
      CORPUS.push([`${label}:${name}`, value]);
    }
  }
}
const EXPERIMENTS_DIR = join(process.cwd(), 'experiments');
for (const file of readdirSync(EXPERIMENTS_DIR).filter(f => f.endsWith('.json'))) {
  CORPUS.push([`file:${file}`, JSON.parse(readFileSync(join(EXPERIMENTS_DIR, file), 'utf8'))]);
}

const errorsOf = def => validate(def).filter(i => i.severity === 'error').map(i => i.message);

// ── A. Corpus sweep ───────────────────────────────────────────────────────────

test('corpus is not empty', () => {
  assert.ok(CORPUS.length >= 10, `expected the built-in definitions, found ${CORPUS.length}`);
});

for (const [name, def] of CORPUS) {
  test(`[${name}] validates with no errors`, () => {
    assert.deepEqual(errorsOf(def), []);
  });

  test(`[${name}] builds trials`, () => {
    const trials = buildTrials(def, {});
    assert.ok(trials.length > 0, 'produced no trials');

    for (const trial of trials) {
      // Every factor must have a value, or a display bound to it renders blank.
      for (const factor of def.factors) {
        const v = factor.name.split('.').reduce((a, k) => a?.[k], trial.values);
        assert.notEqual(v, undefined, `factor "${factor.name}" is undefined in a trial`);
      }
    }
  });

  test(`[${name}] every interpolated reference resolves`, () => {
    // A "{name}" that names nothing renders as an empty string in front of a class.
    const refs = new Set();
    const walk = node => {
      if (!node || typeof node !== 'object') return;
      for (const v of Object.values(node)) {
        if (typeof v === 'string') for (const m of v.matchAll(/\{([^}]+)\}/g)) refs.add(m[1]);
        else walk(v);
      }
    };
    walk(def.trial.phases);
    walk(def.trial.response);

    const trial = buildTrials(def, {})[0];
    for (const ref of refs) {
      const value = resolve(`{${ref}}`, trial.values);
      assert.notEqual(value, undefined, `"{${ref}}" does not resolve`);
    }
  });

  test(`[${name}] scoring returns a definite answer`, () => {
    const trials = buildTrials(def, {});
    const rule = def.trial.correct;
    for (const trial of trials.slice(0, 20)) {
      const got = isCorrect(def, trial, 'anything');
      assert.ok(got === true || got === false || got === null, `scoring returned ${got}`);
      if (rule.kind !== 'none') assert.notEqual(got, null, 'a scored task returned null');
    }
  });

  test(`[${name}] stored payload has every declared key`, () => {
    const trial = buildTrials(def, {})[0];
    const payload = payloadOf(def, trial);
    for (const key of def.store) {
      const flat = key.replace(/\./g, '_');
      assert.ok(flat in payload, `"${key}" is declared in store but missing from the payload`);
      assert.notEqual(payload[flat], undefined, `"${key}" stored as undefined`);
    }
  });

  test(`[${name}] mock data drives every chart`, () => {
    const rows = generateMockRows(def);
    assert.ok(rows.length > 0, 'mock produced no rows');
    for (const chart of def.dashboard.charts) {
      const points = aggregate(chart, rows);
      assert.ok(points.length > 0, `chart "${chart.title}" aggregated to nothing`);
      for (const p of points) {
        const value = chart.seriesBy ? p[seriesNames(chart, rows)[0]] : p.value;
        assert.ok(Number.isFinite(Number(value)), `chart "${chart.title}" produced ${value}`);
      }
      assert.ok(typeof measureLabel(chart, def) === 'string');
    }
  });
}

// ── A2. Registration ──────────────────────────────────────────────────────────
//
// An experiment has to be registered in three places to work fully: the homepage lists it,
// middleware knows its slug, and middleware's matcher covers its URL. Miss the matcher and
// the lock toggle still appears to work while doing nothing — a locked experiment students
// can walk straight into. That happened to flankerLetterTask, which was registered as
// '/flankerLetterTask/:path*' when it lives at /run/flankerLetterTask, so middleware was
// matching a route that does not exist.
//
// Static, so it costs nothing and cannot be forgotten.

const homepage = readFileSync(join(process.cwd(), 'app', 'page.tsx'), 'utf8');
const middleware = readFileSync(join(process.cwd(), 'middleware.ts'), 'utf8');

/** Slugs the homepage links to /run/{slug}. */
const runSlugs = [...homepage.matchAll(/href:\s*'\/run\/([A-Za-z0-9_-]+)'/g)].map(m => m[1]);

test('the homepage links at least one definition experiment', () => {
  assert.ok(runSlugs.length > 0, 'expected at least one href: "/run/..." on the homepage');
});

for (const slug of runSlugs) {
  test(`[${slug}] is registered for locking`, () => {
    assert.ok(
      new RegExp(`'${slug}'`).test(middleware.split('export const config')[0]),
      `"${slug}" is on the homepage but missing from EXPERIMENT_SLUGS, so its lock does nothing`,
    );
  });

  test(`[${slug}] has a matcher entry for its real URL`, () => {
    const matcher = middleware.split('export const config')[1] ?? '';
    assert.ok(
      matcher.includes(`'/run/${slug}/:path*'`),
      `"${slug}" lives at /run/${slug} but has no '/run/${slug}/:path*' matcher entry — ` +
      'middleware never runs for it and locking silently fails',
    );
    assert.ok(
      !new RegExp(`'/${slug}/:path\\*'`).test(matcher),
      `"${slug}" is matched as '/${slug}/:path*', a route that does not exist. ` +
      `It should be '/run/${slug}/:path*'`,
    );
  });
}

// ── B. Trials engine ──────────────────────────────────────────────────────────

/** A small design with a knob for each feature under test. */
function design(over = {}) {
  return {
    version: 1, slug: 's', title: 't', titleHe: 'ת', category: 'PERCEPTION',
    instructions: { en: 'e', he: 'ה' },
    factors: [{ name: 'a', levels: ['x', 'y'] }, { name: 'b', levels: [1, 2] }],
    repetitions: 2,
    trial: {
      phases: [{ name: 'go', display: { kind: 'text', text: '{a}' }, awaitsResponse: true }],
      response: { kind: 'choice', options: [{ value: 'x', label: 'X' }, { value: 'y', label: 'Y' }] },
      correct: { kind: 'matchesFactor', factor: 'a' },
    },
    store: ['a', 'b'],
    dashboard: { charts: [{ title: 'c', kind: 'bar', groupBy: 'a', measure: 'meanRt' }] },
    ...over,
  };
}

test('trial count is the cross times repetitions', () => {
  assert.equal(buildTrials(design(), {}).length, 2 * 2 * 2);
});

test('a counterbalanced factor is split evenly', () => {
  const def = design({
    factors: [{ name: 'a', levels: ['x', 'y'] }, { name: 'side', levels: ['l', 'r'], counterbalance: true }],
    repetitions: 4,
  });
  const trials = buildTrials(def, {});
  const left = trials.filter(t => t.values.side === 'l').length;
  assert.equal(left, trials.length / 2, `counterbalanced factor split ${left}/${trials.length}`);
});

test('exclude removes exactly the named cells', () => {
  const def = design({ exclude: [{ a: 'x', b: 1 }] });
  const trials = buildTrials(def, {});
  assert.equal(trials.length, 3 * 2, 'expected one cell of four removed');
  assert.equal(trials.filter(t => t.values.a === 'x' && t.values.b === 1).length, 0);
});

test('excluded() matches on a partial pattern', () => {
  assert.equal(excluded({ a: 'x', b: 1 }, [{ a: 'x' }]), true);
  assert.equal(excluded({ a: 'y', b: 1 }, [{ a: 'x' }]), false);
  assert.equal(excluded({ a: 'x', b: 1 }, []), false);
});

test('a derived factor is computed from its sources', () => {
  const def = design({
    factors: [
      { name: 'a', levels: ['x', 'y'] },
      { name: 'd', derivedFrom: ['a'], mapping: { x: 'one', y: 'two' } },
    ],
  });
  for (const t of buildTrials(def, {})) {
    assert.equal(t.values.d, t.values.a === 'x' ? 'one' : 'two');
  }
});

test('sampling never exceeds the pool', () => {
  const def = design({
    pools: { w: [{ t: 'a' }, { t: 'b' }, { t: 'c' }] },
    factors: [{ name: 'item', from: 'w', sample: 2 }],
    trial: { ...design().trial, correct: { kind: 'none' }, phases: [{ name: 'go', display: { kind: 'text', text: '{item.t}' }, awaitsResponse: true }] },
    store: ['item.t'],
    dashboard: { charts: [{ title: 'c', kind: 'bar', groupBy: 'item.t', measure: 'meanRt' }] },
  });
  const values = new Set(buildTrials(def, {}).map(t => t.values.item.t));
  assert.ok(values.size <= 3);
});

test('the same seed produces the same trials', () => {
  const def = design();
  const a = buildTrials(def, { rng: seededRandom(42) }).map(t => JSON.stringify(t.values));
  const b = buildTrials(def, { rng: seededRandom(42) }).map(t => JSON.stringify(t.values));
  assert.deepEqual(a, b);
});

test('shuffle keeps every element', () => {
  const input = Array.from({ length: 50 }, (_, i) => i);
  const out = shuffle(input, seededRandom(1));
  assert.equal(out.length, input.length);
  assert.deepEqual([...out].sort((x, y) => x - y), input);
});

test('a single-level factor still produces trials', () => {
  assert.ok(buildTrials(design({ factors: [{ name: 'a', levels: ['only'] }] }), {}).length > 0);
});

test('practice draws from the same design', () => {
  const def = design({ practice: { count: 3, feedback: true } });
  const practice = buildTrials(def, { practice: true });
  assert.equal(practice.length, 3);
  assert.ok(practice.every(t => t.isPractice));
});

test('building trials is fast even for a large cross', () => {
  const def = design({
    factors: [
      { name: 'a', levels: Array.from({ length: 20 }, (_, i) => `a${i}`) },
      { name: 'b', levels: Array.from({ length: 20 }, (_, i) => i) },
    ],
    repetitions: 5,
  });
  const t0 = performance.now();
  const trials = buildTrials(def, {});
  const ms = performance.now() - t0;
  assert.equal(trials.length, 2000);
  assert.ok(ms < 500, `building 2000 trials took ${ms.toFixed(0)}ms`);
});

// ── C. Validator robustness ───────────────────────────────────────────────────

test('validate never throws, whatever it is given', () => {
  const nasty = [
    undefined, null, 0, '', 'string', [], true, NaN,
    {}, { version: 1 }, { factors: null }, { factors: [{}] },
    { factors: [{ name: 'a' }], trial: null },
    { factors: [{ name: 'a', levels: [] }], trial: { phases: [] } },
    { factors: [{ name: 'a', derivedFrom: ['a'], mapping: {} }] },
    { store: 'not-an-array' }, { dashboard: { charts: 'nope' } },
    { factors: [{ name: 'a', levels: ['x'] }], repetitions: -5 },
    { factors: [{ name: 'a', levels: ['x'] }], repetitions: Infinity },
  ];
  for (const input of nasty) {
    let out;
    assert.doesNotThrow(() => { out = validate(input); }, `threw on ${JSON.stringify(input)}`);
    assert.ok(Array.isArray(out), 'did not return an array');
    for (const issue of out) {
      assert.ok(typeof issue.message === 'string' && issue.message.length > 0, 'issue without a message');
      assert.ok(issue.severity === 'error' || issue.severity === 'warning', 'bad severity');
    }
  }
});

test('validate survives every single-field deletion from a valid definition', () => {
  for (const [name, def] of CORPUS) {
    for (const key of Object.keys(def)) {
      const broken = structuredClone(def);
      delete broken[key];
      assert.doesNotThrow(() => validate(broken), `[${name}] threw when "${key}" was missing`);
    }
  }
});

test('validate survives every field being replaced with a wrong type', () => {
  const wrongTypes = [null, 0, 'x', [], {}, true];
  for (const [name, def] of CORPUS.slice(0, 6)) {
    for (const key of Object.keys(def)) {
      for (const wrong of wrongTypes) {
        const broken = structuredClone(def);
        broken[key] = wrong;
        assert.doesNotThrow(() => validate(broken),
          `[${name}] threw when "${key}" was ${JSON.stringify(wrong)}`);
      }
    }
  }
});

test('buildTrials does not hang or explode on a hostile design', () => {
  const hostile = [
    design({ repetitions: 0 }),
    design({ factors: [] }),
    design({ factors: [{ name: 'a', levels: [] }] }),
    design({ exclude: [{ a: 'x' }, { a: 'y' }] }),                    // excludes everything
    design({ pools: { w: [] }, factors: [{ name: 'i', from: 'w' }] }), // empty pool
    design({ pools: { w: [{ t: 1 }] }, factors: [{ name: 'i', from: 'w', sample: 99 }] }),
    design({ factors: [{ name: 'd', derivedFrom: ['missing'], mapping: {} }] }),
  ];
  for (const def of hostile) {
    assert.doesNotThrow(() => {
      const trials = buildTrials(def, {});
      assert.ok(Array.isArray(trials));
    }, `threw on ${JSON.stringify(def.factors)}`);
  }
});

// ── D. Aggregation ────────────────────────────────────────────────────────────

const chartOf = over => ({ title: 'c', kind: 'bar', groupBy: 'cond', measure: 'meanRt', ...over });
const rowOf = over => ({
  session_id: 's1', participant_name: 'P', trial_index: 0, is_practice: false,
  response: 'a', is_correct: true, reaction_time_ms: 500, cond: 'x', ...over,
});

test('aggregate handles an empty row set', () => {
  assert.deepEqual(aggregate(chartOf(), []), []);
});

test('aggregate handles a single row', () => {
  const points = aggregate(chartOf(), [rowOf()]);
  assert.equal(points.length, 1);
  assert.equal(points[0].sem, 0, 'SEM of one participant should be 0, not NaN');
});

test('aggregate ignores rows whose group is missing', () => {
  const points = aggregate(chartOf(), [rowOf(), rowOf({ cond: undefined })]);
  assert.equal(points.length, 1);
});

test('accuracy ignores unscored trials rather than counting them wrong', () => {
  const rows = [rowOf({ is_correct: true }), rowOf({ is_correct: null })];
  const [point] = aggregate(chartOf({ measure: 'accuracy' }), rows);
  assert.equal(point.value, 100, 'a null (unscored) trial should not count as incorrect');
});

test('accuracy of entirely unscored trials does not produce NaN', () => {
  const [point] = aggregate(chartOf({ measure: 'accuracy' }), [rowOf({ is_correct: null })]);
  assert.ok(Number.isFinite(point.value));
});

test('SEM is computed across participants, not trials', () => {
  // Two participants, four trials each. SEM must reflect n=2, not n=8 — the other way
  // makes error bars look far too small and a result far stronger than it is.
  const rows = [];
  for (const [sid, rt] of [['a', 400], ['b', 600]]) {
    for (let i = 0; i < 4; i++) rows.push(rowOf({ session_id: sid, reaction_time_ms: rt, trial_index: i }));
  }
  const [point] = aggregate(chartOf(), rows);
  assert.equal(point.value, 500);
  assert.equal(point.sem, Math.round(sem([400, 600]) * 10) / 10);
});

test('a series absent from one group still yields a number there', () => {
  const rows = [
    rowOf({ cond: 'x', ser: 's1' }),
    rowOf({ cond: 'y', ser: 's2' }),
  ];
  const points = aggregate(chartOf({ seriesBy: 'ser' }), rows);
  for (const p of points) {
    for (const s of seriesNames(chartOf({ seriesBy: 'ser' }), rows)) {
      assert.ok(Number.isFinite(Number(p[s])), `group ${p.group} has no number for series ${s}`);
    }
  }
});

test('proportion counts the named response', () => {
  const rows = [rowOf({ response: 'left' }), rowOf({ response: 'right' })];
  const [point] = aggregate(chartOf({ measure: 'proportion', ofResponse: 'left' }), rows);
  assert.equal(point.value, 50);
});

test('numeric groups sort numerically, not alphabetically', () => {
  const rows = [2, 10, 1].map(n => rowOf({ cond: n }));
  const points = aggregate(chartOf(), rows);
  assert.deepEqual(points.map(p => p.group), ['1', '2', '10']);
});

test('aggregation stays fast on a high-cardinality grouping', () => {
  const rows = [];
  for (let p = 0; p < 40; p++) {
    for (let t = 0; t < 1000; t++) {
      rows.push(rowOf({ session_id: `s${p}`, cond: `c${t % 1000}`, trial_index: t }));
    }
  }
  const t0 = performance.now();
  aggregate(chartOf(), rows);
  const ms = performance.now() - t0;
  assert.ok(ms < 1000, `aggregating 40k rows over 1000 groups took ${ms.toFixed(0)}ms`);
});

test('mock generation stays fast', () => {
  const def = design({
    factors: [{ name: 'a', levels: Array.from({ length: 10 }, (_, i) => `a${i}`) }],
    repetitions: 10,
    mock: { participants: 40, baseRtMs: 600, baseAccuracy: 0.9 },
  });
  const t0 = performance.now();
  const rows = generateMockRows(def);
  const ms = performance.now() - t0;
  assert.equal(rows.length, 100 * 40);
  assert.ok(ms < 1000, `generating ${rows.length} mock rows took ${ms.toFixed(0)}ms`);
});

test('mock data reproduces the stated effect', () => {
  // The Mock Data toggle is how a lecturer demonstrates a result with no participants, so
  // the generated numbers have to show the effect the definition claims.
  const def = design({
    factors: [{ name: 'cond', levels: ['fast', 'slow'] }],
    repetitions: 10,
    store: ['cond'],
    trial: { ...design().trial, correct: { kind: 'none' } },
    dashboard: { charts: [chartOf()] },
    mock: {
      participants: 30, baseRtMs: 700, baseAccuracy: 0.9,
      effects: [{ factor: 'cond', level: 'fast', rtDeltaMs: -150 }],
    },
  });
  const rows = generateMockRows(def);
  const points = aggregate(chartOf(), rows);
  const fast = points.find(p => p.group === 'fast').value;
  const slow = points.find(p => p.group === 'slow').value;
  assert.ok(fast < slow, `mock did not reproduce the effect: fast=${fast} slow=${slow}`);
});

// ── E. Persistence shape ──────────────────────────────────────────────────────

test('dotted store keys are flattened for the payload', () => {
  const def = design({
    pools: { w: [{ t: 'a', kind: 'k' }] },
    factors: [{ name: 'item', from: 'w' }],
    store: ['item.t', 'item.kind'],
    trial: { ...design().trial, correct: { kind: 'none' }, phases: [{ name: 'go', display: { kind: 'text', text: '{item.t}' }, awaitsResponse: true }] },
    dashboard: { charts: [{ title: 'c', kind: 'bar', groupBy: 'item.t', measure: 'meanRt' }] },
  });
  const payload = payloadOf(def, buildTrials(def, {})[0]);
  assert.equal(payload.item_t, 'a');
  assert.equal(payload.item_kind, 'k');
});

test('storing a field that does not exist does not crash', () => {
  const def = design({ store: ['a', 'nonexistent'] });
  assert.doesNotThrow(() => payloadOf(def, buildTrials(def, {})[0]));
});
