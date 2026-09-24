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
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';

registerHooks({
  resolve(specifier, context, next) {
    // Next's "@/" alias, which node knows nothing about. Without this, any module the app
    // imports by alias — the registry, and so the edit list — could not be tested at all.
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
const { buildTrials, isCorrect, payloadOf, resolve, excluded, seededRandom, shuffle, expandRecall, planStages } =
  await import('../lib/experiment-runtime/trials.ts');
const { aggregate, generateMockRows, seriesNames, measureLabel, sem, statValue, pearson } =
  await import('../lib/experiment-runtime/aggregate.ts');
const roundTrips = await import('../lib/experiment-runtime/round-trips.ts');
const probe = await import('../lib/experiment-runtime/generality-probe.ts');
const templates = await import('../lib/experiment-runtime/templates.ts');
const ports = await import('../lib/experiment-runtime/ports.ts');
const { editableFrom } = await import('../lib/experiment-runtime/registry.ts');

/** Every definition in the repo, named. */
const CORPUS = [];
for (const [mod, label] of [[roundTrips, 'round-trip'], [probe, 'probe'], [templates, 'template'], [ports, 'port']]) {
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

/**
 * The first block as the RUNTIME builds it.
 *
 * Not `buildTrials(def, {})`: an experiment using `assign` draws a between-subject item
 * before anything else, and its first block reads its trials out of that item. Building the
 * definition bare leaves every such factor with no levels — a failure of the test, not of
 * the design.
 */
const firstBlock = (def, rng) => {
  const block = planStages(def, rng)[0];
  return buildTrials(block.design, { rng, context: block.context });
};

// ── A. Corpus sweep ───────────────────────────────────────────────────────────

test('corpus is not empty', () => {
  assert.ok(CORPUS.length >= 10, `expected the built-in definitions, found ${CORPUS.length}`);
});

for (const [name, def] of CORPUS) {
  test(`[${name}] validates with no errors`, () => {
    assert.deepEqual(errorsOf(def), []);
  });

  test(`[${name}] builds trials`, () => {
    const trials = firstBlock(def);
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

    const trial = firstBlock(def)[0];
    for (const ref of refs) {
      const value = resolve(`{${ref}}`, trial.values);
      assert.notEqual(value, undefined, `"{${ref}}" does not resolve`);
    }
  });

  test(`[${name}] scoring returns a definite answer`, () => {
    const trials = firstBlock(def);
    const rule = def.trial.correct;
    for (const trial of trials.slice(0, 20)) {
      const got = isCorrect(def, trial, 'anything');
      assert.ok(got === true || got === false || got === null, `scoring returned ${got}`);
      if (rule.kind !== 'none') assert.notEqual(got, null, 'a scored task returned null');
    }
  });

  test(`[${name}] stored payload has every declared key`, () => {
    const trial = firstBlock(def)[0];
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

// The catalogue moved out of app/page.tsx so that /create's edit list can read the same
// answer the homepage does. Read from the module rather than scraped from the page: a
// regex over a file that no longer holds the list matches nothing, and a registration test
// that silently checks zero slugs is worse than none.
const catalogue = await import('../lib/experiments.ts');
const middleware = readFileSync(join(process.cwd(), 'middleware.ts'), 'utf8');

const runSlugs = catalogue.RUN_SLUGS;

test('the homepage links at least one definition experiment', () => {
  assert.ok(runSlugs.length > 0, 'expected at least one experiment with an href of "/run/..."');
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
    // A bare '/{slug}/:path*' entry is only wrong when nothing serves that URL — the
    // flankerLetterTask bug above. Mid-migration it is REQUIRED: the hand-built page is
    // still on disk and still reachable, so dropping its matcher would leave the old link
    // unlocked while the card points at the port. Both routes, one lock.
    const handBuilt = existsSync(join(process.cwd(), 'app', slug, 'page.tsx'));
    if (!handBuilt) {
      assert.ok(
        !new RegExp(`'/${slug}/:path\\*'`).test(matcher),
        `"${slug}" is matched as '/${slug}/:path*', a route that does not exist. ` +
        `It should be '/run/${slug}/:path*'`,
      );
    } else {
      assert.ok(
        new RegExp(`'/${slug}/:path\\*'`).test(matcher),
        `"${slug}" is ported to /run/${slug} but app/${slug}/ still serves the old URL, ` +
        `so '/${slug}/:path*' must stay in the matcher or that URL cannot be locked`,
      );
    }
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

// ── F. Practice that teaches the mapping ──────────────────────────────────────
//
// Stroop's practice does not sample the design — it drills which colour is which key, and
// will not move on until the answer is right. The runner implements that; these pin the
// rules that stop it being asked for where it cannot work.

test('retrying until correct is accepted on a task that has a correct answer', () => {
  const def = design({ practice: { count: 2, feedback: true, retryUntilCorrect: true } });
  assert.deepEqual(validate(def).filter(i => i.severity === 'error'), []);
  assert.deepEqual(validate(def).filter(i => /retr/i.test(i.message)), []);
});

test('retrying until correct is refused where nothing is correct, since practice could never end', () => {
  const def = design({
    practice: { count: 2, feedback: true, retryUntilCorrect: true },
    trial: { ...design().trial, correct: { kind: 'none' } },
  });
  const errors = validate(def).filter(i => i.severity === 'error');
  assert.ok(
    errors.some(i => /never finish/i.test(i.message)),
    `expected an error about practice never finishing, got: ${errors.map(e => e.message).join(' | ')}`,
  );
});

test('retrying with no feedback warns, since nothing tells the participant what was right', () => {
  const def = design({ practice: { count: 2, feedback: false, retryUntilCorrect: true } });
  const messages = validate(def).map(i => i.message);
  assert.ok(
    messages.some(m => /no clue what the right answer/i.test(m)),
    `expected a warning about missing feedback, got: ${messages.join(' | ')}`,
  );
});

// ── G. Experiments made of several blocks ─────────────────────────────────────
//
// DRM studies a list then asks for recall; serial order puts a distractor between them;
// SRT follows its main task with a generation test. The definition's own design is the
// first block and `stages` are the ones after it.

const stage = (over = {}) => ({
  name: 'recall',
  factors: [{ name: 'probe', levels: ['a', 'b'] }],
  repetitions: 1,
  trial: {
    phases: [{ name: 'ask', display: { kind: 'text', text: '{probe}' }, awaitsResponse: true }],
    response: { kind: 'choice', options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] },
    correct: { kind: 'none' },
  },
  store: ['probe'],
  ...over,
});

test('a second block is accepted, and builds its own trials', () => {
  const def = design({ stageName: 'study', stages: [stage()] });
  assert.deepEqual(validate(def).filter(i => i.severity === 'error'), []);

  // The stage is a design in its own right: the trial builder needs nothing else.
  const trials = buildTrials(stage(), {});
  assert.equal(trials.length, 2);
  assert.deepEqual([...new Set(trials.map(t => t.values.probe))].sort(), ['a', 'b']);
});

test('two blocks with the same name are refused, since their rows could not be told apart', () => {
  const def = design({ stageName: 'study', stages: [stage({ name: 'study' })] });
  const errors = validate(def).filter(i => i.severity === 'error').map(i => i.message);
  assert.ok(errors.some(m => /Two blocks are called "study"/.test(m)), errors.join(' | '));
});

test('a block missing its design is an error, never thrown', () => {
  for (const broken of [{ factors: undefined }, { trial: undefined }, { store: undefined }, { name: undefined }]) {
    const def = design({ stages: [stage(broken)] });
    assert.doesNotThrow(() => validate(def));
    assert.ok(
      validate(def).some(i => i.severity === 'error'),
      `accepted a block with ${Object.keys(broken)[0]} missing`,
    );
  }
});

test('naming the first block when there is only one says so', () => {
  const messages = validate(design({ stageName: 'study' })).map(i => i.message);
  assert.ok(messages.some(m => /only one, so nothing reads it/.test(m)), messages.join(' | '));
});

test('a malformed retryUntilCorrect is an error, never thrown', () => {
  for (const value of ['yes', 1, {}]) {
    const def = design({ practice: { count: 2, feedback: true, retryUntilCorrect: value } });
    assert.doesNotThrow(() => validate(def));
    assert.ok(
      validate(def).some(i => i.severity === 'error'),
      `accepted retryUntilCorrect: ${JSON.stringify(value)}`,
    );
  }
});

// ── H. Designs whose order is the manipulation ────────────────────────────────

/** A design whose trials are distinguishable, so an order can actually be asserted. */
function ordered(over = {}) {
  return design({
    factors: [{ name: 'step', levels: [1, 2, 3, 4] }],
    repetitions: 3,
    order: 'fixed',
    trial: { ...design().trial, correct: { kind: 'none' } },
    store: ['step'],
    ...over,
  });
}

test('a fixed order keeps the cross in the order it was written', () => {
  const trials = buildTrials(ordered(), { rng: seededRandom(7) });
  assert.deepEqual(trials.map(t => t.values.step), [1, 2, 3, 4, 1, 2, 3, 4, 1, 2, 3, 4]);
});

test('a fixed order is the same however the run is seeded', () => {
  const a = buildTrials(ordered(), { rng: seededRandom(1) }).map(t => t.values.step);
  const b = buildTrials(ordered(), { rng: seededRandom(99999) }).map(t => t.values.step);
  assert.deepEqual(a, b);
});

test('omitting order still shuffles, so every ported experiment is untouched', () => {
  // Seeded, so this asserts a fact rather than hoping: 12 trials in written order would be
  // a 1-in-369,600 coincidence, but the seed makes the check deterministic either way.
  const trials = buildTrials(ordered({ order: undefined }), { rng: seededRandom(3) });
  assert.notDeepEqual(trials.map(t => t.values.step), [1, 2, 3, 4, 1, 2, 3, 4, 1, 2, 3, 4]);
  assert.equal(trials.length, 12);
});

test('a fixed order still builds every trial exactly as often', () => {
  const counts = new Map();
  for (const t of buildTrials(ordered(), {})) {
    counts.set(t.values.step, (counts.get(t.values.step) ?? 0) + 1);
  }
  assert.deepEqual([...counts.entries()].sort(), [[1, 3], [2, 3], [3, 3], [4, 3]]);
});

test('fixed-order practice rehearses the opening of the sequence, not a random handful', () => {
  const def = ordered({ practice: { count: 3, feedback: true } });
  assert.deepEqual(buildTrials(def, { practice: true }).map(t => t.values.step), [1, 2, 3]);
});

test('a pool drawn in fixed order presents its items as the list is written', () => {
  const def = ordered({
    pools: { list: [{ word: 'bed' }, { word: 'rest' }, { word: 'awake' }] },
    factors: [{ name: 'item', from: 'list' }],
    repetitions: 1,
    store: ['item.word'],
  });
  assert.deepEqual(
    buildTrials(def, { rng: seededRandom(5) }).map(t => t.values.item.word),
    ['bed', 'rest', 'awake'],
  );
});

test('an order that is neither shuffled nor fixed is refused, never silently shuffled', () => {
  for (const value of ['random', 'Fixed', true, 1]) {
    const def = design({ order: value });
    assert.doesNotThrow(() => validate(def));
    assert.ok(
      validate(def).some(i => i.severity === 'error'),
      `accepted order: ${JSON.stringify(value)}`,
    );
  }
});

test('a block may set its own order independently of the first one', () => {
  const def = design({
    order: 'fixed',
    stages: [stage({ name: 'recall', order: 'sorted' })],
  });
  assert.doesNotThrow(() => validate(def));
  assert.ok(validate(def).some(i => i.severity === 'error' && /"order"/.test(i.message)));
});

// ── I. Blocks that ask nothing ────────────────────────────────────────────────

/** A study presentation: three phases, no response, nothing to score. */
function study(over = {}) {
  return design({
    factors: [{ name: 'word', levels: ['bed', 'rest', 'awake'] }],
    repetitions: 1,
    order: 'fixed',
    trial: {
      phases: [
        { name: 'fixation', display: { kind: 'fixation' }, durationMs: 500 },
        { name: 'word', display: { kind: 'text', text: '{word}' }, durationMs: 2000 },
        { name: 'blank', display: { kind: 'blank' }, durationMs: 250 },
      ],
      response: { kind: 'none' },
      correct: { kind: 'none' },
    },
    store: ['word'],
    dashboard: { charts: [{ title: 'c', kind: 'bar', groupBy: 'word', measure: 'count' }] },
    ...over,
  });
}

test('a block that asks nothing is valid, and needs no response phase', () => {
  const issues = validate(study());
  assert.deepEqual(issues.filter(i => i.severity === 'error'), [], JSON.stringify(issues));
});

test('a block that asks nothing still builds its trials in order', () => {
  assert.deepEqual(buildTrials(study(), {}).map(t => t.values.word), ['bed', 'rest', 'awake']);
});

test('asking nothing while a phase awaits a response is refused, since it could never end', () => {
  const def = study();
  def.trial.phases[1].awaitsResponse = true;
  const messages = validate(def).filter(i => i.severity === 'error').map(i => i.message);
  assert.ok(messages.some(m => /awaits one/.test(m)), messages.join(' | '));
});

test('a block that asks nothing cannot claim to score an answer', () => {
  const def = study({ trial: { ...study().trial, correct: { kind: 'matchesFactor', factor: 'word' } } });
  const messages = validate(def).filter(i => i.severity === 'error').map(i => i.message);
  assert.ok(messages.some(m => /nothing to score/.test(m)), messages.join(' | '));
});

test('a block that asks nothing has no early window, since no press can be early', () => {
  const def = study({ trial: { ...study().trial, earlyFrom: 'fixation' } });
  const messages = validate(def).filter(i => i.severity === 'error').map(i => i.message);
  assert.ok(messages.some(m => /too early/.test(m)), messages.join(' | '));
});

test('a block that does ask something still requires a phase to collect it', () => {
  const def = study({
    trial: {
      ...study().trial,
      response: { kind: 'choice', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] },
      correct: { kind: 'none' },
    },
  });
  const messages = validate(def).filter(i => i.severity === 'error').map(i => i.message);
  assert.ok(messages.some(m => /No phase collects a response/.test(m)), messages.join(' | '));
});

test('a block that asks nothing is not nagged about the reaction-time clock', () => {
  const messages = validate(study()).map(i => i.message);
  assert.ok(!messages.some(m => /reaction-time clock/.test(m)), messages.join(' | '));
});

// ── J. Blocks measured in time ────────────────────────────────────────────────

/** A filled delay: plenty of sums, bounded by a clock rather than by a count. */
function delay(over = {}) {
  return design({
    factors: [{ name: 'n', levels: Array.from({ length: 90 }, (_, i) => i + 10) }],
    repetitions: 1,
    endsAfterMs: 30_000,
    trial: {
      phases: [{ name: 'ask', display: { kind: 'text', text: '{n}' }, awaitsResponse: true, startsClock: true }],
      response: { kind: 'choice', options: [{ value: 'odd', label: 'Odd' }, { value: 'even', label: 'Even' }] },
      correct: { kind: 'none' },
    },
    store: ['n'],
    dashboard: { charts: [{ title: 'c', kind: 'bar', groupBy: 'n', measure: 'count' }] },
    ...over,
  });
}

test('a block bounded by a clock is valid', () => {
  const issues = validate(delay());
  assert.deepEqual(issues.filter(i => i.severity === 'error'), [], JSON.stringify(issues));
});

test('a timed block still builds a full trial list to draw on', () => {
  assert.equal(buildTrials(delay(), {}).length, 90);
});

test('a timed block too short to outlast its own clock is flagged', () => {
  const def = delay({ factors: [{ name: 'n', levels: [1, 2, 3] }], store: ['n'] });
  const messages = validate(def).map(i => i.message);
  assert.ok(messages.some(m => /shorter delay than a slow one/.test(m)), messages.join(' | '));
});

test('a timed block is not nagged for being a long session, since the clock ends it', () => {
  const def = delay({ repetitions: 6 });
  const messages = validate(def).map(i => i.message);
  assert.ok(!messages.some(m => /long session/.test(m)), messages.join(' | '));
});

test('an untimed block of the same size is still called a long session', () => {
  const def = delay({ repetitions: 6, endsAfterMs: undefined });
  const messages = validate(def).map(i => i.message);
  assert.ok(messages.some(m => /long session/.test(m)), messages.join(' | '));
});

test('a duration that is not a positive number of milliseconds is refused', () => {
  for (const value of [0, -1, 'thirty seconds', null]) {
    const def = delay({ endsAfterMs: value });
    assert.doesNotThrow(() => validate(def));
    assert.ok(
      validate(def).some(i => i.severity === 'error'),
      `accepted endsAfterMs: ${JSON.stringify(value)}`,
    );
  }
});

test('a later block may be the timed one', () => {
  const def = design({ stages: [stage({ name: 'distractor', endsAfterMs: 'soon' })] });
  assert.doesNotThrow(() => validate(def));
  assert.ok(validate(def).some(i => i.severity === 'error' && /endsAfterMs/.test(i.message)));
});

// ── K. Free recall, scored per studied item ───────────────────────────────────

const STUDIED = [
  { word: 'bed', serialPosition: 1, itemType: 'studied' },
  { word: 'rest', serialPosition: 2, itemType: 'studied' },
  { word: 'awake', serialPosition: 3, itemType: 'studied' },
  { word: 'sleep', serialPosition: 0, itemType: 'lure' },
];

/** A recall block: one typed list, scored against what was studied. */
function recallBlock(over = {}) {
  return design({
    pools: { studied: STUDIED },
    factors: [{ name: 'listTheme', levels: ['SLEEP'] }],
    repetitions: 1,
    trial: {
      phases: [{ name: 'recall', display: { kind: 'text', text: 'Type what you remember' }, awaitsResponse: true, startsClock: true }],
      response: { kind: 'wordList' },
      correct: { kind: 'none' },
      recall: { against: 'studied', match: 'word' },
    },
    store: ['listTheme'],
    dashboard: {
      charts: [{ title: 'c', kind: 'bar', groupBy: 'serialPosition', measure: 'proportion', ofResponse: 'recalled' }],
    },
    ...over,
  });
}

const oneTrial = def => buildTrials(def, {})[0];

test('a recall block is valid', () => {
  const issues = validate(recallBlock());
  assert.deepEqual(issues.filter(i => i.severity === 'error'), [], JSON.stringify(issues));
});

test('one typed list becomes one row per studied item', () => {
  const def = recallBlock();
  const rows = expandRecall(def, oneTrial(def), 'bed,awake');
  assert.equal(rows.length, 4);
  assert.deepEqual(
    rows.map(r => [r.payload.word, r.response]),
    [['bed', 'recalled'], ['rest', 'missed'], ['awake', 'recalled'], ['sleep', 'missed']],
  );
});

test('the critical lure is just another item, and is caught when recalled', () => {
  const def = recallBlock();
  const rows = expandRecall(def, oneTrial(def), 'bed, sleep');
  const lure = rows.find(r => r.payload.itemType === 'lure');
  assert.equal(lure.response, 'recalled');
});

test('each row carries the item fields a chart groups by', () => {
  const def = recallBlock();
  const row = expandRecall(def, oneTrial(def), 'rest').find(r => r.payload.word === 'rest');
  assert.equal(row.payload.serialPosition, 2);
  assert.equal(row.payload.itemType, 'studied');
  // ...and the trial's own stored fields, so one list can be told from another.
  assert.equal(row.payload.listTheme, 'SLEEP');
});

test('words are matched ignoring case and surrounding space', () => {
  const def = recallBlock();
  const rows = expandRecall(def, oneTrial(def), '  BED , Rest ');
  assert.deepEqual(rows.filter(r => r.response === 'recalled').map(r => r.payload.word), ['bed', 'rest']);
});

test('a typed list may be separated by commas, semicolons or spaces', () => {
  const def = recallBlock();
  for (const typed of ['bed,rest', 'bed; rest', 'bed rest', 'bed,  rest;']) {
    const got = expandRecall(def, oneTrial(def), typed).filter(r => r.response === 'recalled').length;
    assert.equal(got, 2, `failed to split ${JSON.stringify(typed)}`);
  }
});

test('a near miss is not counted as a recall, since guessing at intent would inflate the rate', () => {
  const def = recallBlock();
  const rows = expandRecall(def, oneTrial(def), 'beds');
  assert.equal(rows.filter(r => r.response === 'recalled').length, 0);
});

test('intrusions are kept only where the definition asks for them', () => {
  const plain = recallBlock();
  assert.equal(expandRecall(plain, oneTrial(plain), 'bed,banana').length, 4);

  const kept = recallBlock({
    trial: { ...recallBlock().trial, recall: { against: 'studied', match: 'word', intrusions: true } },
  });
  const rows = expandRecall(kept, oneTrial(kept), 'bed,banana');
  assert.equal(rows.length, 5);
  const intrusion = rows.find(r => r.payload.intrusion);
  assert.equal(intrusion.payload.word, 'banana');
  assert.equal(intrusion.response, 'recalled');
});

test('an empty answer still yields a row per studied item, all missed', () => {
  const def = recallBlock();
  const rows = expandRecall(def, oneTrial(def), '');
  assert.equal(rows.length, 4);
  assert.ok(rows.every(r => r.response === 'missed'));
});

test('a repeated word is not counted twice', () => {
  const def = recallBlock();
  const rows = expandRecall(def, oneTrial(def), 'bed, bed, bed');
  assert.equal(rows.filter(r => r.response === 'recalled').length, 1);
});

test('a block with no recall rule keeps its single row', () => {
  assert.equal(expandRecall(design(), buildTrials(design(), {})[0], 'anything'), null);
});

test('recall scored against a pool that does not exist is refused', () => {
  const def = recallBlock({ trial: { ...recallBlock().trial, recall: { against: 'nope', match: 'word' } } });
  const messages = validate(def).filter(i => i.severity === 'error').map(i => i.message);
  assert.ok(messages.some(m => /does not have/.test(m)), messages.join(' | '));
});

test('recall matching a field no studied item has is refused', () => {
  const def = recallBlock({ trial: { ...recallBlock().trial, recall: { against: 'studied', match: 'spelling' } } });
  const messages = validate(def).filter(i => i.severity === 'error').map(i => i.message);
  assert.ok(messages.some(m => /nothing could ever be recalled/.test(m)), messages.join(' | '));
});

test('scoring recall while collecting no word list says so', () => {
  const def = recallBlock({
    trial: {
      ...recallBlock().trial,
      response: { kind: 'choice', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] },
    },
  });
  const messages = validate(def).map(i => i.message);
  assert.ok(messages.some(m => /no typed words to score/.test(m)), messages.join(' | '));
});

test('a recalled word records where it came in the answer, for lag analyses', () => {
  const def = recallBlock();
  const rows = expandRecall(def, oneTrial(def), 'awake, bed');
  const at = word => rows.find(r => r.payload.word === word).payload.outputPosition;
  assert.equal(at('awake'), 1);
  assert.equal(at('bed'), 2);
  // A word that never came has no output position — null, never zero, which a chart would
  // otherwise read as having been recalled first.
  assert.equal(at('rest'), null);
});

test('a word repeated in the answer keeps the position it first came in', () => {
  const def = recallBlock();
  const rows = expandRecall(def, oneTrial(def), 'bed, rest, bed');
  assert.equal(rows.find(r => r.payload.word === 'bed').payload.outputPosition, 1);
  assert.equal(rows.find(r => r.payload.word === 'rest').payload.outputPosition, 2);
});

test('an intrusion records its output position too, so it can be placed in the sequence', () => {
  const def = recallBlock({
    trial: { ...recallBlock().trial, recall: { against: 'studied', match: 'word', intrusions: true } },
  });
  const rows = expandRecall(def, oneTrial(def), 'bed, banana');
  assert.equal(rows.find(r => r.payload.intrusion).payload.outputPosition, 2);
});

// ── L. Blocks repeated once per drawn item ────────────────────────────────────

const LISTS = [
  { theme: 'SLEEP', lure: 'sleep', words: [{ word: 'bed', pos: 1 }, { word: 'rest', pos: 2 }] },
  { theme: 'CHAIR', lure: 'chair', words: [{ word: 'table', pos: 1 }, { word: 'sit', pos: 2 }] },
  { theme: 'NEEDLE', lure: 'needle', words: [{ word: 'thread', pos: 1 }, { word: 'pin', pos: 2 }] },
];

/** DRM's shape in miniature: study a themed list, then recall it, once per list. */
function grouped(over = {}) {
  return design({
    pools: { lists: LISTS },
    stageName: 'intro',
    stages: [{
      forEach: 'lists',
      as: 'list',
      stages: [
        {
          name: 'study',
          factors: [{ name: 'item', from: '{list.words}' }],
          repetitions: 1,
          order: 'fixed',
          trial: {
            phases: [{ name: 'word', display: { kind: 'text', text: '{item.word}' }, durationMs: 500 }],
            response: { kind: 'none' },
            correct: { kind: 'none' },
          },
          store: ['item.word', 'list.theme'],
        },
        {
          name: 'recall',
          factors: [{ name: 'probe', levels: ['now'] }],
          repetitions: 1,
          trial: {
            phases: [{ name: 'say', display: { kind: 'text', text: 'Recall {list.theme}' }, awaitsResponse: true, startsClock: true }],
            response: { kind: 'wordList' },
            correct: { kind: 'none' },
            recall: { against: '{list.words}', match: 'word' },
          },
          store: ['list.theme'],
        },
      ],
    }],
    ...over,
  });
}

test('a stage group is valid', () => {
  const issues = validate(grouped());
  assert.deepEqual(issues.filter(i => i.severity === 'error'), [], JSON.stringify(issues));
});

test('a group runs its blocks once per item of the pool', () => {
  const plan = planStages(grouped(), seededRandom(4));
  // The definition's own design, then study+recall for each of three lists.
  assert.equal(plan.length, 1 + 3 * 2);
  assert.deepEqual(plan.map(b => b.stage), ['intro', 'study', 'recall', 'study', 'recall', 'study', 'recall']);
});

test('each pass carries its own drawn item, and the passes are numbered', () => {
  const plan = planStages(grouped(), seededRandom(4)).slice(1);
  const themes = plan.map(b => b.context.list.theme);
  // Study and recall of one pass see the SAME list — the bug that would test someone on a
  // list they never studied.
  assert.equal(themes[0], themes[1]);
  assert.equal(themes[2], themes[3]);
  assert.deepEqual(plan.map(b => b.repetition), [1, 1, 2, 2, 3, 3]);
  assert.deepEqual([...new Set(themes)].sort(), ['CHAIR', 'NEEDLE', 'SLEEP']);
});

test('the order of the lists differs between participants', () => {
  const orderFor = seed =>
    planStages(grouped(), seededRandom(seed)).slice(1).map(b => b.context.list.theme).join(',');
  const orders = new Set([1, 2, 3, 4, 5, 6, 7, 8].map(orderFor));
  assert.ok(orders.size > 1, `every participant got the same order: ${[...orders][0]}`);
});

test('a group can be told to keep the pool order instead', () => {
  const def = grouped();
  def.stages[0].shuffle = false;
  const themes = planStages(def, seededRandom(9)).slice(1).map(b => b.context.list.theme);
  assert.deepEqual(themes, ['SLEEP', 'SLEEP', 'CHAIR', 'CHAIR', 'NEEDLE', 'NEEDLE']);
});

test('a group can use only some of its pool', () => {
  const def = grouped();
  def.stages[0].take = 2;
  assert.equal(planStages(def, seededRandom(2)).length, 1 + 2 * 2);
});

test('a block inside a group draws its trials from the list that pass received', () => {
  const plan = planStages(grouped(), seededRandom(4));
  const study = plan.find(b => b.stage === 'study');
  const trials = buildTrials(study.design, { context: study.context });
  const theme = study.context.list.theme;
  const expected = LISTS.find(l => l.theme === theme).words.map(w => w.word);
  assert.deepEqual(trials.map(t => t.values.item.word), expected);
});

test('the drawn item is in scope for what each row stores', () => {
  const plan = planStages(grouped(), seededRandom(4));
  const study = plan.find(b => b.stage === 'study');
  const trial = buildTrials(study.design, { context: study.context })[0];
  const payload = payloadOf(study.design, trial);
  assert.equal(payload.list_theme, study.context.list.theme);
  assert.ok(payload.item_word);
});

test('recall inside a group is scored against the list that pass studied', () => {
  const plan = planStages(grouped(), seededRandom(4));
  const recall = plan.find(b => b.stage === 'recall');
  const trial = buildTrials(recall.design, { context: recall.context })[0];
  const words = recall.context.list.words.map(w => w.word);
  const rows = expandRecall(recall.design, trial, words[0]);
  assert.equal(rows.length, 2);
  assert.equal(rows.find(r => r.payload.word === words[0]).response, 'recalled');
  assert.equal(rows.find(r => r.payload.word === words[1]).response, 'missed');
});

test('an experiment with no stages still plans exactly one block', () => {
  const plan = planStages(design());
  assert.equal(plan.length, 1);
  assert.equal(plan[0].stage, 'main');
  assert.deepEqual(plan[0].context, {});
});

test('a group repeating over a pool that does not exist is refused', () => {
  const def = grouped();
  def.stages[0].forEach = 'nope';
  const messages = validate(def).filter(i => i.severity === 'error').map(i => i.message);
  assert.ok(messages.some(m => /does not have/.test(m)), messages.join(' | '));
});

test('a group taking more items than its pool holds is refused, not silently shortened', () => {
  const def = grouped();
  def.stages[0].take = 9;
  const messages = validate(def).filter(i => i.severity === 'error').map(i => i.message);
  assert.ok(messages.some(m => /holds only 3/.test(m)), messages.join(' | '));
});

test('a group with no blocks to repeat is refused', () => {
  const def = grouped();
  def.stages[0].stages = [];
  assert.doesNotThrow(() => validate(def));
  assert.ok(validate(def).some(i => i.severity === 'error'));
});

test('a block inside a group is checked like any other', () => {
  const def = grouped();
  delete def.stages[0].stages[0].store;
  const messages = validate(def).filter(i => i.severity === 'error').map(i => i.message);
  assert.ok(messages.some(m => /"store"/.test(m)), messages.join(' | '));
});

test('a group whose block shares a name with another block is refused', () => {
  const def = grouped();
  def.stages[0].stages[1].name = 'study';
  const messages = validate(def).filter(i => i.severity === 'error').map(i => i.message);
  assert.ok(messages.some(m => /could not be told apart/.test(m)), messages.join(' | '));
});

// ── M. Stratified sampling and self-advancing screens ─────────────────────────

test('sampling per a field takes that many at each level, not that many overall', () => {
  const words = [];
  for (let list = 1; list <= 5; list++) {
    for (let pos = 1; pos <= 10; pos++) words.push({ word: `l${list}p${pos}`, serialPosition: pos, list });
  }
  const def = design({
    pools: { studied: words },
    factors: [{ name: 'item', from: 'studied', sample: 2, per: 'serialPosition' }],
    repetitions: 1,
    trial: { ...design().trial, correct: { kind: 'none' } },
    store: ['item.word'],
    dashboard: { charts: [{ title: 'c', kind: 'bar', groupBy: 'item.serialPosition', measure: 'count' }] },
  });

  const trials = buildTrials(def, { rng: seededRandom(11) });
  assert.equal(trials.length, 20, 'expected two words at each of ten positions');

  const perPosition = new Map();
  for (const t of trials) {
    const pos = t.values.item.serialPosition;
    perPosition.set(pos, (perPosition.get(pos) ?? 0) + 1);
  }
  assert.deepEqual([...perPosition.keys()].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.ok([...perPosition.values()].every(n => n === 2), `uneven: ${[...perPosition.entries()]}`);
});

test('a stratified draw still differs between participants', () => {
  const words = [];
  for (let list = 1; list <= 5; list++) {
    for (let pos = 1; pos <= 10; pos++) words.push({ word: `l${list}p${pos}`, serialPosition: pos, list });
  }
  const def = design({
    pools: { studied: words },
    factors: [{ name: 'item', from: 'studied', sample: 2, per: 'serialPosition' }],
    repetitions: 1,
    trial: { ...design().trial, correct: { kind: 'none' } },
    store: ['item.word'],
    dashboard: { charts: [{ title: 'c', kind: 'bar', groupBy: 'item.word', measure: 'count' }] },
  });
  const drawFor = seed =>
    buildTrials(def, { rng: seededRandom(seed) }).map(t => t.values.item.word).sort().join(',');
  assert.ok(new Set([1, 2, 3, 4, 5].map(drawFor)).size > 1, 'every participant drew the same words');
});

test('a block can ask its intro screen to pass by itself', () => {
  const def = design({
    stages: [stage({ name: 'second', autoAdvanceMs: 2000 })],
  });
  assert.deepEqual(validate(def).filter(i => i.severity === 'error'), []);
  assert.equal(planStages(def)[1].autoAdvanceMs, 2000);
});

test('a block inside a group carries its self-advancing screen too', () => {
  const def = grouped();
  def.stages[0].stages[0].autoAdvanceMs = 1500;
  const study = planStages(def, seededRandom(3)).filter(b => b.stage === 'study');
  assert.ok(study.length > 0);
  assert.ok(study.every(b => b.autoAdvanceMs === 1500));
});

// ── N. Several right answers, and several answers counted together ────────────

/** A recognition probe: four buttons carrying a decision and a confidence at once. */
function recognition(over = {}) {
  return design({
    factors: [{ name: 'itemType', levels: ['studied', 'lure', 'foil'] }],
    repetitions: 4,
    trial: {
      phases: [{ name: 'judge', display: { kind: 'text', text: 'word' }, awaitsResponse: true, startsClock: true }],
      response: {
        kind: 'choice',
        options: [
          { value: 'sure_no', label: 'Sure no' },
          { value: 'think_no', label: 'Think no' },
          { value: 'think_yes', label: 'Think yes' },
          { value: 'sure_yes', label: 'Sure yes' },
        ],
      },
      correct: {
        kind: 'mapping',
        factor: 'itemType',
        expect: {
          studied: ['think_yes', 'sure_yes'],
          lure: ['think_no', 'sure_no'],
          foil: ['think_no', 'sure_no'],
        },
      },
    },
    store: ['itemType'],
    dashboard: {
      charts: [{
        title: 'Said old', kind: 'bar', groupBy: 'itemType',
        measure: 'proportion', ofResponse: ['think_yes', 'sure_yes'],
      }],
    },
    ...over,
  });
}

test('a recognition design with several right answers per item type is valid', () => {
  assert.deepEqual(validate(recognition()).filter(i => i.severity === 'error'), []);
});

test('either of the two "yes" buttons is correct for a studied word', () => {
  const def = recognition();
  const trial = buildTrials(def, {}).find(t => t.values.itemType === 'studied');
  assert.equal(isCorrect(def, trial, 'sure_yes'), true);
  assert.equal(isCorrect(def, trial, 'think_yes'), true);
  assert.equal(isCorrect(def, trial, 'think_no'), false);
});

test('and either "no" button is correct for a lure', () => {
  const def = recognition();
  const trial = buildTrials(def, {}).find(t => t.values.itemType === 'lure');
  assert.equal(isCorrect(def, trial, 'sure_no'), true);
  assert.equal(isCorrect(def, trial, 'sure_yes'), false);
});

test('a proportion chart can count several responses as one answer', () => {
  const rows = [
    { session_id: 'a', itemType: 'studied', response: 'sure_yes', is_correct: true },
    { session_id: 'a', itemType: 'studied', response: 'think_yes', is_correct: true },
    { session_id: 'a', itemType: 'studied', response: 'think_no', is_correct: false },
    { session_id: 'a', itemType: 'studied', response: 'sure_no', is_correct: false },
  ];
  const chart = { title: 'c', kind: 'bar', groupBy: 'itemType', measure: 'proportion', ofResponse: ['think_yes', 'sure_yes'] };
  assert.equal(aggregate(chart, rows)[0].value, 50);
});

test('a single response value still works as it always did', () => {
  const rows = [
    { session_id: 'a', itemType: 'studied', response: 'sure_yes', is_correct: true },
    { session_id: 'a', itemType: 'studied', response: 'sure_no', is_correct: false },
  ];
  const chart = { title: 'c', kind: 'bar', groupBy: 'itemType', measure: 'proportion', ofResponse: 'sure_yes' };
  assert.equal(aggregate(chart, rows)[0].value, 50);
});

test('mock data answers with values the experiment could really produce', () => {
  const rows = generateMockRows(recognition());
  const offered = new Set(['sure_no', 'think_no', 'think_yes', 'sure_yes']);
  assert.ok(rows.every(r => offered.has(r.response)), 'mock invented a response the task never offers');
});

test('mock data drives a proportion chart rather than leaving it at zero', () => {
  const def = recognition();
  const points = aggregate(def.dashboard.charts[0], generateMockRows(def));
  assert.ok(points.length > 0);
  assert.ok(points.some(p => p.value > 0), 'every group aggregated to zero under mock data');
});

// ── O. DRM ────────────────────────────────────────────────────────────────────

const DRM = ports.DRM_PORT;
const drmPlan = () => planStages(DRM, seededRandom(21));

test('DRM runs practice, then five lists of study/distractor/recall, then recognition', () => {
  const stages = drmPlan().map(b => b.stage);
  assert.deepEqual(stages.slice(0, 3), ['practiceStudy', 'practiceDistractor', 'practiceRecall']);
  assert.equal(stages.at(-1), 'recognition');
  assert.equal(stages.filter(s => s === 'study').length, 5);
  assert.equal(stages.filter(s => s === 'distractor').length, 5);
  assert.equal(stages.filter(s => s === 'recall').length, 5);
});

test('each list is studied exactly once, and the five are in a different order per participant', () => {
  const themesFor = seed => planStages(DRM, seededRandom(seed))
    .filter(b => b.stage === 'study').map(b => b.context.list.theme);
  const themes = themesFor(21);
  assert.equal(new Set(themes).size, 5, 'a list was studied twice or not at all');
  assert.ok(new Set([1, 2, 3, 4, 5, 6].map(s => themesFor(s).join(','))).size > 1);
});

test('a study block presents its ten words in list order, and never the critical lure', () => {
  const study = drmPlan().find(b => b.stage === 'study');
  const trials = buildTrials(study.design, { context: study.context });
  assert.equal(trials.length, 10);
  const shown = trials.map(t => t.values.item.word);
  assert.deepEqual(shown, shown.slice().sort((a, b) =>
    trials.find(t => t.values.item.word === a).values.item.serialPosition
    - trials.find(t => t.values.item.word === b).values.item.serialPosition));
  // The lure is the whole point: it must never appear during study.
  const lure = ports.DRM_PORT.pools.lists.find(l => l.theme === study.context.list.theme);
  assert.ok(!shown.includes(lure.probes.find(p => p.itemType === 'critical_lure').word));
});

test('a study word is shown for 2000ms with 250ms between, as the original', () => {
  const study = drmPlan().find(b => b.stage === 'study');
  const [word, gap] = study.design.trial.phases;
  assert.equal(word.durationMs, 2000);
  assert.equal(gap.durationMs, 250);
  assert.equal(study.design.trial.response.kind, 'none');
});

test('the filled delay is thirty seconds, and offers far more sums than anyone finishes', () => {
  const distractor = drmPlan().find(b => b.stage === 'distractor');
  assert.equal(distractor.design.endsAfterMs, 30_000);
  assert.equal(buildTrials(distractor.design, { context: distractor.context }).length, 90);
});

test('recall is scored against the ten studied words plus the lure', () => {
  const recall = drmPlan().find(b => b.stage === 'recall');
  const trial = buildTrials(recall.design, { context: recall.context })[0];
  const rows = expandRecall(recall.design, trial, '');
  assert.equal(rows.length, 11);
  assert.equal(rows.filter(r => r.payload.itemType === 'critical_lure').length, 1);
  assert.equal(recall.design.trial.phases[0].timeoutMs, 90_000);
});

test('saying the lure in recall is recorded as the false memory, not as an intrusion', () => {
  const recall = drmPlan().find(b => b.stage === 'recall');
  const trial = buildTrials(recall.design, { context: recall.context })[0];
  const lure = recall.context.list.probes.find(p => p.itemType === 'critical_lure').word;
  const row = expandRecall(recall.design, trial, lure).find(r => r.payload.word === lure);
  assert.equal(row.response, 'recalled');
  assert.equal(row.payload.itemType, 'critical_lure');
  assert.ok(!row.payload.intrusion);
});

test('the recognition test is 50 items: 2 per serial position, 5 lures, 25 foils', () => {
  const recognition = drmPlan().at(-1);
  const trials = buildTrials(recognition.design, { rng: seededRandom(5) });
  assert.equal(trials.length, 50);

  const byType = {};
  for (const t of trials) byType[t.values.item.itemType] = (byType[t.values.item.itemType] ?? 0) + 1;
  assert.deepEqual(byType, { studied: 20, critical_lure: 5, unrelated_foil: 25 });

  const positions = {};
  for (const t of trials) {
    if (t.values.item.itemType !== 'studied') continue;
    const pos = t.values.item.serialPosition;
    positions[pos] = (positions[pos] ?? 0) + 1;
  }
  assert.deepEqual(Object.values(positions), Array(10).fill(2), 'serial positions are not probed evenly');
});

test('either "yes" button is right for a studied word, either "no" for the lure', () => {
  const recognition = drmPlan().at(-1);
  const trials = buildTrials(recognition.design, { rng: seededRandom(5) });
  const studied = trials.find(t => t.values.item.itemType === 'studied');
  const lure = trials.find(t => t.values.item.itemType === 'critical_lure');
  assert.equal(isCorrect(recognition.design, studied, 'think_yes'), true);
  assert.equal(isCorrect(recognition.design, studied, 'sure_yes'), true);
  assert.equal(isCorrect(recognition.design, studied, 'sure_no'), false);
  assert.equal(isCorrect(recognition.design, lure, 'sure_no'), true);
  assert.equal(isCorrect(recognition.design, lure, 'sure_yes'), false);
});

test('a later block can reach the pools the experiment declared at the top', () => {
  // The bug this catches ran the whole distractor block as one empty trial, in silence.
  for (const name of ['practiceDistractor', 'distractor', 'recognition']) {
    const block = drmPlan().find(b => b.stage === name);
    assert.ok(
      buildTrials(block.design, { context: block.context }).length > 1,
      `block "${name}" built no trials, so its pool was out of reach`,
    );
  }
});

test('mock data shows the false memory: the lure is recognised nearly as often as a studied word', () => {
  const rows = generateMockRows(DRM);
  const [studied, lure, foil] = aggregate(DRM.dashboard.charts[0], rows).map(p => p.value);
  assert.ok(lure > foil + 30, `lure ${lure}% is not clearly above foils ${foil}%`);
  assert.ok(lure > studied - 20, `lure ${lure}% is far below studied ${studied}%`);
});

test('mock data fills every block, so no figure is empty', () => {
  const rows = generateMockRows(DRM);
  const stages = new Set(rows.map(r => r.stage));
  for (const name of ['study', 'distractor', 'recall', 'recognition']) {
    assert.ok(stages.has(name), `mock produced no rows for "${name}"`);
  }
  for (const chart of DRM.dashboard.charts) {
    assert.ok(aggregate(chart, rows).length > 0, `chart "${chart.title}" aggregated to nothing`);
  }
});

test('a planned block names the definition entry it came from', () => {
  // `design` is a COPY for a block inside a group — the experiment's pools are merged into
  // it — so anything matching a running block back to the authored definition must use
  // `source`. The design editor compared `design` by identity and silently counted every
  // later block as zero trials the moment that stopped being the same object.
  const def = grouped();
  const plan = planStages(def, seededRandom(12));

  assert.equal(plan[0].source, def, 'the first block is the definition itself');

  const authored = def.stages[0].stages;
  for (const block of plan.slice(1)) {
    assert.ok(
      authored.includes(block.source),
      `block "${block.stage}" does not point back at a stage the definition declares`,
    );
  }
  // And the copy really is a copy, or this whole field would be pointless.
  const inGroup = plan.find(b => b.stage === 'study');
  assert.notEqual(inGroup.design, inGroup.source);
  assert.equal(inGroup.design.trial, inGroup.source.trial, 'the copy is shallow, not a rebuild');
});

test('a block inside a group can reach a pool the experiment declared, through the copy', () => {
  const def = grouped();
  def.stages[0].stages[1].factors = [{ name: 'probe', from: 'lists' }];
  const recall = planStages(def, seededRandom(12)).find(b => b.stage === 'recall');
  assert.equal(buildTrials(recall.design, { context: recall.context }).length, LISTS.length);
});

// ── P. Serial position ────────────────────────────────────────────────────────

const SO = ports.SERIAL_ORDER_PORT;
const soPlan = () => planStages(SO, seededRandom(31));

test('serial order runs study, arithmetic, recall, then a second list and immediate recall', () => {
  assert.deepEqual(
    soPlan().map(b => b.stage),
    ['study1', 'arithmetic', 'recall1', 'study2', 'recall2'],
  );
});

test('each list is twenty words, presented in list order', () => {
  for (const name of ['study1', 'study2']) {
    const block = soPlan().find(b => b.stage === name);
    const trials = buildTrials(block.design, { rng: seededRandom(2) });
    assert.equal(trials.length, 20, `${name} is not twenty words`);
    assert.deepEqual(
      trials.map(t => t.values.item.serialPosition),
      Array.from({ length: 20 }, (_, i) => i + 1),
      `${name} is not in serial order`,
    );
  }
});

test('the two sessions study different words, or a recall could belong to either', () => {
  const wordsOf = name => buildTrials(soPlan().find(b => b.stage === name).design, {})
    .map(t => t.values.item.word);
  const first = new Set(wordsOf('study1'));
  assert.ok(wordsOf('study2').every(w => !first.has(w)));
});

test('a word is shown for 2000ms, after a 500ms fixation and before a 500ms blank', () => {
  const [fixation, word, blank] = soPlan()[0].design.trial.phases;
  assert.equal(fixation.durationMs, 500);
  assert.equal(word.durationMs, 2000);
  assert.equal(blank.durationMs, 500);
  assert.equal(soPlan()[0].design.trial.response.kind, 'none');
});

test('only the first session has a filled delay, and it lasts two and a half minutes', () => {
  const timed = soPlan().filter(b => b.design.endsAfterMs);
  assert.equal(timed.length, 1);
  assert.equal(timed[0].stage, 'arithmetic');
  assert.equal(timed[0].design.endsAfterMs, 150_000);
});

test('the arithmetic offers far more problems than the delay allows', () => {
  const block = soPlan().find(b => b.stage === 'arithmetic');
  const built = buildTrials(block.design, { rng: seededRandom(3) });
  assert.ok(built.length > 150, `only ${built.length} problems for a 150s delay`);
  // Typed, and marked right against the problem's own answer.
  assert.equal(block.design.trial.response.kind, 'number');
  const trial = built[0];
  assert.equal(isCorrect(block.design, trial, String(trial.values.sum.answer)), true);
  assert.equal(isCorrect(block.design, trial, String(trial.values.sum.answer + 1)), false);
});

test('recall is two minutes and is scored against the list that session studied', () => {
  for (const [name, study] of [['recall1', 'study1'], ['recall2', 'study2']]) {
    const block = soPlan().find(b => b.stage === name);
    assert.equal(block.design.trial.phases[0].timeoutMs, 120_000);
    const trial = buildTrials(block.design, {})[0];
    const studied = buildTrials(soPlan().find(b => b.stage === study).design, {})
      .map(t => t.values.item.word);
    const rows = expandRecall(block.design, trial, studied[0]);
    assert.equal(rows.length, 20);
    assert.equal(rows.find(r => r.payload.word === studied[0]).response, 'recalled');
  }
});

test('every studied word knows which third of the list it is in', () => {
  const words = buildTrials(soPlan()[0].design, {}).map(t => t.values.item);
  const regionAt = pos => words.find(w => w.serialPosition === pos).region;
  assert.equal(regionAt(1), 'primacy');
  assert.equal(regionAt(7), 'primacy');
  assert.equal(regionAt(8), 'middle');
  assert.equal(regionAt(13), 'middle');
  assert.equal(regionAt(14), 'recency');
  assert.equal(regionAt(20), 'recency');
});

test('mock data shows the serial position curve: the ends beat the middle', () => {
  const rows = generateMockRows(SO);
  const byRegion = Object.fromEntries(
    aggregate(SO.dashboard.charts[2], rows).map(p => [p.group, p.recall1]),
  );
  const primacy = byRegion['Primacy (1–7)'];
  const middle = byRegion['Middle (8–13)'];
  const recency = byRegion['Recency (14–20)'];
  assert.ok(primacy > middle + 10, `primacy ${primacy} vs middle ${middle}`);
  assert.ok(recency > middle + 10, `recency ${recency} vs middle ${middle}`);
});

test('a chart split by block names only the blocks it draws', () => {
  // All five block names used to be offered as series on a chart filtered to two of them,
  // so the legend advertised three series that were empty everywhere.
  const rows = generateMockRows(SO);
  assert.deepEqual(seriesNames(SO.dashboard.charts[2], rows), ['recall1', 'recall2']);
});

test('every ported experiment is registered where the runtime looks for it', () => {
  // Twice now a port was added to PORTS, given tests, and switched on the homepage, while
  // never reaching the registry's BUILT_IN — so /run/<slug> answered "no experiment named
  // <slug>". Nothing offline reads the registry, so only a browser test caught it, and only
  // by accident. This is the cheap version of that check.
  const registry = readFileSync(join(process.cwd(), 'lib', 'experiment-runtime', 'registry.ts'), 'utf8');
  const builtIn = registry.split('const BUILT_IN')[1]?.split('];')[0] ?? '';

  for (const port of ports.PORTS) {
    const name = Object.entries(ports).find(([, v]) => v === port)?.[0];
    assert.ok(
      // Split into identifiers rather than matching a pattern: a word boundary written in a
      // template literal is one lost backslash away from being a backspace character, which
      // matches nothing and makes this test fail on a registry that is perfectly correct.
      builtIn.split(/[^A-Za-z0-9_]+/).includes(name),
      `${name} ("${port.slug}") is in PORTS but not in the registry's BUILT_IN, so /run/${port.slug} would answer "no experiment named ${port.slug}"`,
    );
  }
});

// ── Q. Serial reaction time ───────────────────────────────────────────────────

const SRT = ports.SRT_PORT;
const srtPlan = seed => planStages(SRT, seededRandom(seed));
const srtBlocks = plan => plan.filter(b => /^block\d$/.test(b.stage));

test('SRT runs six blocks, then awareness, priming and the generation test', () => {
  assert.deepEqual(
    srtPlan(5).map(b => b.stage),
    ['block1', 'block2', 'block3', 'block4', 'block5', 'block6',
      'awareness', 'generationPrime', 'generation'],
  );
});

test('each block is the twelve-item sequence nine times over — 648 trials in all', () => {
  const plan = srtPlan(5);
  let total = 0;
  for (const block of srtBlocks(plan)) {
    const trials = buildTrials(block.design, { context: block.context });
    assert.equal(trials.length, 108, `${block.stage} is not 108 trials`);
    total += trials.length;
  }
  assert.equal(total, 648);
});

test('a block presents its sequence in order, repeating every twelve trials', () => {
  const block = srtBlocks(srtPlan(5))[0];
  const locations = buildTrials(block.design, { context: block.context })
    .map(t => t.values.item.location);
  const firstPass = locations.slice(0, 12);
  for (let pass = 1; pass < 9; pass++) {
    assert.deepEqual(locations.slice(pass * 12, pass * 12 + 12), firstPass, `pass ${pass + 1} differs`);
  }
});

test('block five is a different sequence, and the others are the learned one', () => {
  const plan = srtPlan(5);
  for (const block of srtBlocks(plan)) {
    const trials = buildTrials(block.design, { context: block.context });
    const expected = block.stage === 'block5' ? 'interference' : 'main';
    assert.ok(
      trials.every(t => t.values.item.sequenceType === expected),
      `${block.stage} should be the ${expected} sequence`,
    );
  }
  const seqOf = name => {
    const b = plan.find(x => x.stage === name);
    return buildTrials(b.design, { context: b.context })
      .slice(0, 12).map(t => t.values.item.location).join();
  };
  assert.notEqual(seqOf('block5'), seqOf('block4'));
});

test('a participant is assigned one sequence and keeps it for the whole run', () => {
  const plan = srtPlan(5);
  const labels = new Set(plan.map(b => b.context.group && b.context.group.label));
  assert.equal(labels.size, 1, 'the assigned group changed partway through the run');
  assert.ok(['A', 'B'].includes([...labels][0]));
});

test('the class is split between the two sequences, not all given one', () => {
  const labels = new Set(
    Array.from({ length: 12 }, (_, i) => planStages(SRT, seededRandom(i + 1))[0].context.group.label),
  );
  assert.deepEqual([...labels].sort(), ['A', 'B']);
});

test('whoever learned A meets B in block five, and the other way round', () => {
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const plan = srtPlan(seed);
    const take = name => {
      const b = plan.find(x => x.stage === name);
      return buildTrials(b.design, { context: b.context })
        .slice(0, 12).map(t => t.values.item.location).join();
    };
    assert.notEqual(take('block5'), take('block1'), `seed ${seed} saw one sequence throughout`);
  }
});

test('the dot is drawn in the box that answers the trial, and nowhere else', () => {
  const block = srtBlocks(srtPlan(5))[0];
  const places = { 4: 'top', 2: 'left', 3: 'right', 1: 'bottom' };
  for (const trial of buildTrials(block.design, { context: block.context }).slice(0, 20)) {
    const lit = Object.values(places).filter(at => trial.values[`dot_${at}`] !== 'transparent');
    assert.deepEqual(lit, [places[trial.values.item.location]],
      `trial at location ${trial.values.item.location} lit ${lit.join(', ')}`);
  }
});

test('pressing the box the dot is in is correct; any other box is not', () => {
  const block = srtBlocks(srtPlan(5))[0];
  const trial = buildTrials(block.design, { context: block.context })[0];
  assert.equal(isCorrect(block.design, trial, String(trial.values.item.location)), true);
  const other = [1, 2, 3, 4].find(l => l !== trial.values.item.location);
  assert.equal(isCorrect(block.design, trial, String(other)), false);
});

test('a trial times out after three seconds, with no gap before the next', () => {
  const design = srtBlocks(srtPlan(5))[0].design;
  assert.equal(design.trial.phases[0].timeoutMs, 3000);
  assert.equal(design.trial.itiMs, 0);
});

test('the generation test asks for all twelve positions, primed with the last two', () => {
  const plan = srtPlan(5);
  const prime = plan.find(b => b.stage === 'generationPrime');
  const generation = plan.find(b => b.stage === 'generation');

  assert.equal(buildTrials(prime.design, { context: prime.context }).length, 2);
  assert.equal(prime.design.trial.response.kind, 'none');

  const probes = buildTrials(generation.design, { context: generation.context });
  assert.equal(probes.length, 12);
  assert.deepEqual(
    probes.map(t => t.values.item.sequencePosition),
    Array.from({ length: 12 }, (_, i) => i + 1),
  );
  assert.equal(new Set(probes.map(t => t.values.item.answer)).size, 4);
});

test('the awareness question is asked before the sequence is ever mentioned', () => {
  const stages = srtPlan(5).map(b => b.stage);
  assert.ok(stages.indexOf('awareness') < stages.indexOf('generationPrime'));
  assert.equal(srtPlan(5).find(b => b.stage === 'awareness').design.trial.correct.kind, 'none');
});

test('mock data shows learning across blocks and the jump when the sequence changes', () => {
  const rows = generateMockRows(SRT);
  const byBlock = Object.fromEntries(
    aggregate(SRT.dashboard.charts[0], rows).map(p => [String(p.group), p.value]),
  );
  assert.ok(byBlock['4'] < byBlock['1'], `block 4 (${byBlock['4']}) is not faster than block 1 (${byBlock['1']})`);
  assert.ok(byBlock['5'] > byBlock['4'] + 50, `no jump at block 5: ${byBlock['4']} to ${byBlock['5']}`);
  assert.ok(byBlock['6'] < byBlock['5'], 'block 6 did not recover');
});

test('the awareness pie counts answers rather than averaging them', () => {
  const pie = SRT.dashboard.charts.find(c => c.kind === 'pie');
  assert.equal(pie.measure, 'count');
  const points = aggregate(pie, generateMockRows(SRT));
  assert.ok(points.length > 0);
  assert.ok(points.every(p => Number.isFinite(p.value)));
});

test('a pie that averages instead of counting is refused', () => {
  const def = design({
    dashboard: { charts: [{ title: 'c', kind: 'pie', groupBy: 'a', measure: 'meanRt' }] },
  });
  const messages = validate(def).filter(i => i.severity === 'error').map(i => i.message);
  assert.ok(messages.some(m => /no whole to divide/.test(m)), messages.join(' | '));
});

test('a chart kind the renderer does not know is refused, not drawn as a bar', () => {
  const def = design({
    dashboard: { charts: [{ title: 'c', kind: 'donut', groupBy: 'a', measure: 'count' }] },
  });
  assert.ok(validate(def).some(i => i.severity === 'error' && /"kind"/.test(i.message)));
});

test('assigning from a pool that does not exist is refused', () => {
  const def = design({ assign: { pool: 'nope', as: 'group' } });
  const messages = validate(def).filter(i => i.severity === 'error').map(i => i.message);
  assert.ok(messages.some(m => /does not have/.test(m)), messages.join(' | '));
});

test('an assignment that collides with a factor name is refused', () => {
  const def = design({ pools: { g: [{ x: 1 }, { x: 2 }] }, assign: { pool: 'g', as: 'a' } });
  const messages = validate(def).filter(i => i.severity === 'error').map(i => i.message);
  assert.ok(messages.some(m => /silently overwrite/.test(m)), messages.join(' | '));
});

test('a one-item assignment pool says it is not a between-subject manipulation', () => {
  const def = design({ pools: { g: [{ x: 1 }] }, assign: { pool: 'g', as: 'group' } });
  const messages = validate(def).map(i => i.message);
  assert.ok(messages.some(m => /not a between-subject manipulation/.test(m)), messages.join(' | '));
});

// ── R. Composite face ─────────────────────────────────────────────────────────

const CF = ports.COMPOSITE_FACE_PORT;
const cfTrials = seed => buildTrials(CF, { rng: seededRandom(seed) });

test('forty trials: twenty aligned, ten of each misalignment', () => {
  const counts = {};
  for (const t of cfTrials(9)) {
    counts[t.values.item.condition] = (counts[t.values.item.condition] ?? 0) + 1;
  }
  assert.deepEqual(counts, { aligned: 20, 'small-misaligned': 10, 'large-misaligned': 10 });
});

test('each condition is split evenly between same and different', () => {
  const counts = {};
  for (const t of cfTrials(9)) {
    const key = `${t.values.item.condition}/${t.values.item.answer}`;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  assert.deepEqual(counts, {
    'aligned/same': 10, 'aligned/different': 10,
    'small-misaligned/same': 5, 'small-misaligned/different': 5,
    'large-misaligned/same': 5, 'large-misaligned/different': 5,
  });
});

test('a same trial shows the studied face on top; a different trial never does', () => {
  for (const t of cfTrials(9)) {
    const { study, top, bottom, answer } = t.values.item;
    if (answer === 'same') assert.equal(top, study, 'a same trial did not show the studied face');
    else assert.notEqual(top, study, 'a different trial showed the studied face on top');
    // The bottom half is always someone else, or there is no composite to see past.
    assert.notEqual(bottom, top, 'both halves are the same person');
    assert.notEqual(bottom, study, 'the bottom half is the studied face');
  }
});

test('only the aligned condition has its halves flush; the others are slid', () => {
  const offsets = {};
  for (const t of cfTrials(9)) offsets[t.values.item.condition] = t.values.item.offset;
  assert.equal(offsets.aligned, 0);
  assert.ok(offsets['small-misaligned'] > 0);
  assert.ok(offsets['large-misaligned'] > offsets['small-misaligned'],
    'the large misalignment is not larger than the small one');
});

test('the composite is cut at the nose and stays the size of the studied face', () => {
  const test = CF.trial.phases.find(p => p.name === 'test');
  assert.equal(test.display.kind, 'composite');
  assert.equal(test.display.cut, 0.55);
  const study = CF.trial.phases.find(p => p.name === 'study');
  assert.equal(test.display.size, study.display.size);
});

test('the face is shown for 800ms, after a 500ms fixation and before a 500ms blank', () => {
  const at = name => CF.trial.phases.find(p => p.name === name);
  assert.equal(at('fixation').durationMs, 500);
  assert.equal(at('study').durationMs, 800);
  assert.equal(at('blank').durationMs, 500);
  assert.equal(CF.trial.itiMs, 300);
  // The judgement waits; nothing else on the trial does.
  assert.equal(at('test').awaitsResponse, true);
});

test('answering with what the trial actually shows is correct', () => {
  const trials = cfTrials(9);
  const same = trials.find(t => t.values.item.answer === 'same');
  const diff = trials.find(t => t.values.item.answer === 'different');
  assert.equal(isCorrect(CF, same, 'same'), true);
  assert.equal(isCorrect(CF, same, 'different'), false);
  assert.equal(isCorrect(CF, diff, 'different'), true);
});

test('two participants do not see the same forty faces', () => {
  const facesFor = seed => cfTrials(seed).map(t => t.values.item.study).join();
  assert.notEqual(facesFor(1), facesFor(2));
});

test('practice is six trials from faces the main experiment never uses', () => {
  const practice = buildTrials(CF, { practice: true, rng: seededRandom(4) });
  assert.equal(practice.length, 6);
  const mainFaces = new Set(cfTrials(9).flatMap(t =>
    [t.values.item.study, t.values.item.top, t.values.item.bottom]));
  for (const t of practice) {
    assert.ok(!mainFaces.has(t.values.item.study),
      `practice previewed ${t.values.item.study}, which the main block also uses`);
  }
});

test('every face a trial names is one the site actually serves', () => {
  const served = new Set(
    readdirSync(join(process.cwd(), 'public', 'faces'))
      .filter(f => f.endsWith('.jpg'))
      .map(f => `/faces/${f}`),
  );
  const all = [...cfTrials(9), ...buildTrials(CF, { practice: true, rng: seededRandom(4) })];
  for (const t of all) {
    for (const key of ['study', 'top', 'bottom']) {
      assert.ok(served.has(t.values.item[key]),
        `${t.values.item[key]} is not in public/faces, so it would 404 in front of a class`);
    }
  }
});

test('mock data shows the composite effect: aligned is the hard condition', () => {
  const rows = generateMockRows(CF);
  const byCondition = Object.fromEntries(
    aggregate(CF.dashboard.charts[0], rows).map(p => [String(p.group), p.value]),
  );
  const aligned = byCondition['Aligned'];
  const large = byCondition['Misaligned (large)'];
  assert.ok(large > aligned + 10, `aligned ${aligned}% is not clearly worse than misaligned ${large}%`);
});

test('no two built-in experiments share a slug', () => {
  // The lookup takes the FIRST match, so a duplicate slug does not error — it silently
  // serves whichever was listed earlier. The visual search port shipped behind its own
  // round-trip exactly that way: fully tested, registered, and never once reached.
  const registry = readFileSync(join(process.cwd(), 'lib', 'experiment-runtime', 'registry.ts'), 'utf8');
  const listed = (registry.split('const BUILT_IN')[1] ?? '').split('];')[0]
    .split(/[^A-Za-z0-9_]+/).filter(Boolean);

  const modules = { ...roundTrips, ...probe, ...templates, ...ports };
  const slugs = new Map();
  for (const name of listed) {
    const def = modules[name];
    if (!def || typeof def !== 'object' || !def.slug) continue;
    const already = slugs.get(def.slug);
    assert.ok(
      !already,
      `${already} and ${name} are both registered as "${def.slug}"; only ${already} would ever be served`,
    );
    slugs.set(def.slug, name);
  }
  assert.ok(slugs.size > 10, `only found ${slugs.size} registered definitions`);
});

// ── S. Visual search ──────────────────────────────────────────────────────────

const VS = ports.VISUAL_SEARCH_PORT;
const vsFirst = seed => planStages(VS, seededRandom(seed))[0];
const vsTrials = seed => {
  const b = vsFirst(seed);
  return buildTrials(b.design, { rng: seededRandom(seed), context: b.context });
};

test('128 trials: four set sizes crossed with four, present and absent, four times over', () => {
  assert.equal(vsTrials(3).length, 128);
});

test('every cell of the design is run equally often', () => {
  const counts = {};
  for (const t of vsTrials(3)) {
    const key = `${t.values.targetSetSize}/${t.values.distractorSetSize}/${t.values.targetPresent}`;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  assert.equal(Object.keys(counts).length, 32, 'not every cell was built');
  assert.ok(Object.values(counts).every(n => n === 4), `uneven cells: ${JSON.stringify(counts)}`);
});

test('a participant hunts one colour, and the distractors are the other', () => {
  const group = vsFirst(3).context.group;
  assert.ok(['red', 'blue'].includes(group.label));
  assert.notEqual(group.target, group.other);
});

test('the class is split between the two target colours', () => {
  const labels = new Set(
    Array.from({ length: 12 }, (_, i) => vsFirst(i + 1).context.group.label),
  );
  assert.deepEqual([...labels].sort(), ['blue', 'red']);
});

test('a present trial shows one target and one fewer same-colour distractor', () => {
  for (const t of vsTrials(3)) {
    const expected = t.values.targetPresent ? 1 : 0;
    assert.equal(t.values.nTarget, expected,
      `targetPresent ${t.values.targetPresent} produced ${t.values.nTarget} targets`);
    // The same-colour items always add up to the set size, target included.
    assert.equal(t.values.nTarget + t.values.nSameColour, t.values.targetSetSize,
      `set size ${t.values.targetSetSize} does not add up`);
  }
});

test('the array holds three kinds at once, which is what makes it a conjunction search', () => {
  const search = VS.trial.phases.find(p => p.name === 'search');
  assert.equal(search.display.kind, 'array');
  assert.equal(search.display.groups.length, 3);

  const [target, sameColour, sameShape] = search.display.groups;
  assert.equal(target.item.text, 'T');
  assert.equal(sameColour.item.text, 'L');
  assert.equal(sameShape.item.text, 'T');
  // Target colour for the first two, the other colour for the third.
  assert.equal(target.item.color, sameColour.item.color);
  assert.notEqual(target.item.color, sameShape.item.color);
});

test('the target is never rotated, and every distractor can be', () => {
  const [target, sameColour, sameShape] = VS.trial.phases
    .find(p => p.name === 'search').display.groups;
  // A T on its side reads as an L, so rotating the target would make it unfindable.
  assert.equal(target.rotate, undefined);
  assert.deepEqual(sameColour.rotate, [0, 90, 180, 270]);
  assert.deepEqual(sameShape.rotate, [0, 90, 180, 270]);
});

test('answering with what the display holds is correct', () => {
  const trials = vsTrials(3);
  const present = trials.find(t => t.values.targetPresent === true);
  const absent = trials.find(t => t.values.targetPresent === false);
  assert.equal(isCorrect(VS, present, 'present'), true);
  assert.equal(isCorrect(VS, present, 'absent'), false);
  assert.equal(isCorrect(VS, absent, 'absent'), true);
});

test('a search that has not finished in five seconds is recorded and moved on', () => {
  const search = VS.trial.phases.find(p => p.name === 'search');
  assert.equal(search.timeoutMs, 5000);
  assert.equal(VS.trial.itiMs, 500);
});

test('mock data shows search time climbing with the number of items', () => {
  const rows = generateMockRows(VS);
  const bySize = Object.fromEntries(
    aggregate(VS.dashboard.charts[1], rows).map(p => [String(p.group), p.value]),
  );
  assert.ok(bySize['8'] > bySize['1'] + 300, `8 items (${bySize['8']}) is not far slower than 1 (${bySize['1']})`);
  assert.ok(bySize['4'] > bySize['2'], 'the climb is not monotonic');
});

test('mock data shows an absent search costing more than a present one', () => {
  const rows = generateMockRows(VS);
  const present = rows.filter(r => String(r.targetPresent) === 'true' && r.is_correct && r.reaction_time_ms != null);
  const absent = rows.filter(r => String(r.targetPresent) === 'false' && r.is_correct && r.reaction_time_ms != null);
  const mean = xs => xs.reduce((a, b) => a + b.reaction_time_ms, 0) / xs.length;
  assert.ok(mean(absent) > mean(present) + 200,
    `absent ${Math.round(mean(absent))}ms is not clearly slower than present ${Math.round(mean(present))}ms`);
});

// ── T. What a lecturer can edit ───────────────────────────────────────────────
//
// The edit list on /create used to read published rows alone, so the nine ported
// experiments — the ones a class actually runs — could not be opened at all. It now reads
// the homepage catalogue, which means a port becomes editable at the moment its card is
// pointed at /run and nothing has to be remembered separately.

const catalogueSource = readFileSync(join(process.cwd(), 'lib', 'experiments.ts'), 'utf8');

test('every experiment the homepage sends to /run has a definition behind it', () => {
  // The precondition for editing: listEditable pairs each linked slug with a definition,
  // and a slug with neither a published row nor a built-in silently drops out of the list.
  const builtInSource = readFileSync(
    join(process.cwd(), 'lib', 'experiment-runtime', 'registry.ts'), 'utf8');
  const registered = (builtInSource.split('const BUILT_IN')[1] ?? '').split('];')[0];
  const modules = { ...roundTrips, ...probe, ...templates, ...ports };
  const slugs = new Set(
    registered.split(/[^A-Za-z0-9_]+/)
      .map(name => modules[name]?.slug)
      .filter(Boolean),
  );
  // Published-only experiments are legitimate too; these are the ones shipped as code.
  const published = ['lexicalDecisionPairs'];

  for (const slug of catalogue.RUN_SLUGS) {
    assert.ok(
      slugs.has(slug) || published.includes(slug),
      `the homepage sends students to /run/${slug}, but nothing is registered under that slug`,
    );
  }
});

test('every ported experiment is reachable from the homepage, and so editable', () => {
  for (const port of ports.PORTS) {
    assert.ok(
      catalogue.RUN_SLUGS.includes(port.slug),
      `${port.slug} is ported but its homepage card does not point at /run/${port.slug}, `
      + 'so it cannot be edited',
    );
  }
});

test('the catalogue marks a moved experiment by its href, and nothing else', () => {
  // This is the whole mechanism: `href` starting /run/ IS the record that an experiment has
  // moved. A second list of "which ones are ported" would be a second thing to forget.
  const moved = catalogue.EXPERIMENTS.filter(e => e.href?.startsWith('/run/'));
  assert.equal(moved.length, catalogue.RUN_SLUGS.length);
  for (const exp of moved) {
    assert.equal(exp.href, `/run/${exp.href.slice('/run/'.length)}`);
  }
  // And an experiment without one is still a hand-built page, not a broken definition.
  for (const exp of catalogue.EXPERIMENTS) {
    if (!exp.href) continue;
    assert.ok(exp.href.startsWith('/run/'), `"${exp.id}" has an href that is not a /run link`);
  }
});

test('the homepage no longer keeps its own copy of the catalogue', () => {
  // Two copies is how an experiment ends up runnable but not editable. If the list ever
  // moves back into the page, this fails rather than the edit list quietly going stale.
  const homepageSource = readFileSync(join(process.cwd(), 'app', 'page.tsx'), 'utf8');
  assert.ok(
    /from '@\/lib\/experiments'/.test(homepageSource),
    'app/page.tsx does not import the shared catalogue',
  );
  assert.ok(
    !/const EXPERIMENTS\s*:/.test(homepageSource),
    'app/page.tsx declares its own EXPERIMENTS list again',
  );
});

test('the edit list is exactly what the homepage links, and nothing else', () => {
  // Three rows were published under slugs the homepage does not link: an abandoned demo and
  // two near-identical generations of the same experiment. Listing them invited a lecturer
  // to spend an afternoon refining an experiment no student can reach.
  const rows = [
    { slug: 'lexicalDecisionPairs', title: 'Lexical decision', category: 'language', revision: 5 },
    { slug: 'boubaKikiDemo', title: 'Bouba/Kiki demo', category: 'perception', revision: 1 },
    { slug: 'kanizsaWordPrime', title: 'Kanizsa prime', category: 'perception', revision: 1 },
  ];
  const listed = editableFrom(rows).map(e => e.slug);

  assert.deepEqual(listed, [...catalogue.RUN_SLUGS],
    'the edit list does not match the homepage catalogue, in its order');
  for (const orphan of ['boubaKikiDemo', 'kanizsaWordPrime']) {
    assert.ok(!listed.includes(orphan), `${orphan} is not on the homepage but is offered for editing`);
  }
});

test('a published row supersedes the built-in it was refined from', () => {
  // Which copy the Edit button opens is the difference between changing what students run
  // and changing a starting point that has already been overridden.
  const [ported] = catalogue.RUN_SLUGS;
  const bare = editableFrom([]).find(e => e.slug === ported);
  assert.equal(bare.builtIn, true, 'a port with no row should be marked as built in');
  assert.equal(bare.revision, undefined);

  const edited = editableFrom([
    { slug: ported, title: 'Refined', category: 'memory', revision: 3 },
  ]).find(e => e.slug === ported);
  assert.equal(edited.builtIn, false, 'a port with a published row is no longer the built-in');
  assert.equal(edited.revision, 3);
  assert.equal(edited.title, 'Refined', 'the list shows the built-in title over the published one');
});

test('an unreachable database still lists every experiment that ships as code', () => {
  // listPublished throwing is caught, not propagated, so a paused Supabase project degrades
  // the list rather than emptying it. What drops out is only what exists solely as a row —
  // and that one could not be opened with the database down anyway, so listing it would
  // offer an Edit button that cannot work.
  const listed = editableFrom([]).map(e => e.slug);
  for (const port of ports.PORTS) {
    assert.ok(listed.includes(port.slug), `${port.slug} ships as code but vanished with the database`);
  }
  assert.ok(
    !listed.includes('lexicalDecisionPairs'),
    'a published-only experiment cannot be listed when its row is unreachable',
  );
});

test('the create page reads the editable list, not the published rows', () => {
  const createSource = readFileSync(join(process.cwd(), 'app', 'create', 'page.tsx'), 'utf8');
  assert.ok(/listEditable\(\)/.test(createSource), 'the edit list is not built from listEditable');
  assert.ok(
    !/listPublished\(\)/.test(createSource),
    'the create page still lists published rows, so ported experiments would be missing',
  );
  // And it opens the LIVE copy, which for a port is the built-in rather than a row.
  assert.ok(/loadLive\(/.test(createSource), 'editing does not load the live definition');
});

test('a ported experiment can be opened for editing before it has ever been published', () => {
  // The bug this guards: loadDefinition reads the database, so a built-in with no row
  // answered null and the Edit button reported the experiment as unpublished.
  const registrySource = readFileSync(
    join(process.cwd(), 'lib', 'experiment-runtime', 'registry.ts'), 'utf8');
  const loadLive = registrySource.split('export async function loadLive')[1] ?? '';
  assert.ok(
    /BUILT_IN\.find/.test(loadLive),
    'loadLive does not fall back to the built-in, so a port could not be edited',
  );
});

test('the catalogue and the runtime agree on the two hand-built pages that remain', () => {
  // A sanity check on the migration itself: everything the homepage still serves from its
  // own route has no /run href, and everything with one is gone from app/<slug>/ or kept
  // only for its old results.
  const stillHandBuilt = catalogue.EXPERIMENTS.filter(e => !e.href).map(e => e.id);
  for (const id of stillHandBuilt) {
    assert.ok(
      !ports.PORTS.some(p => p.slug === id),
      `"${id}" is ported but its card still points at the hand-built page`,
    );
  }
  assert.ok(stillHandBuilt.length > 0, 'expected some experiments still to be hand-built');
});

test('the catalogue is a plain data module with no page imports', () => {
  // It is read by the homepage AND by /create; pulling a page into it would make the edit
  // list depend on the homepage rendering.
  assert.ok(!/from '@\/app\//.test(catalogueSource), 'the catalogue imports from a page');
  assert.ok(/export const RUN_SLUGS/.test(catalogueSource));
});

// ── U. What a participant is told before they answer anything ─────────────────
//
// The blind spot every other test in this file shares: they all begin by responding to a
// trial, so nothing here can see the screen a participant reads FIRST. visualSearch shipped
// without ever saying which colour to hunt for, and 472 green tests said nothing — it was
// found by running it. A sweep of all nine ports against their original landing pages then
// turned up three more, which these tests pin.

/** The instruction lines of a hand-built landing page, both languages, as authored. */
function landingLines(slug) {
  const source = readFileSync(join(process.cwd(), 'app', slug, 'page.tsx'), 'utf8');
  const lines = [];
  for (const block of source.matchAll(/(?:inst|steps|instructions):\s*\[([\s\S]*?)\]/g)) {
    for (const quoted of block[1].matchAll(/'((?:[^'\\]|\\.)*)'/g)) {
      lines.push(quoted[1].replace(/\\'/g, "'"));
    }
  }
  assert.ok(lines.length > 0, `found no instruction lines in app/${slug}/page.tsx`);
  return lines;
}

const portBySlug = slug => ports.PORTS.find(p => p.slug === slug);

test('the composite face task tells participants exactly what it always told them', () => {
  // Not a style point. The composite effect IS the failure to ignore the irrelevant half,
  // so an added "ignore the bottom half entirely" — which this port briefly had, and the
  // original never said anywhere — changes the manipulation rather than clarifying it, and
  // results collected under it would not be comparable with the rows already in the table.
  const def = portBySlug('CompositeFace');
  const both = `${def.instructions.en}\n${def.instructions.he}`;
  for (const line of landingLines('CompositeFace')) {
    assert.ok(both.includes(line), `the original says "${line}" and the port no longer does`);
  }
  assert.ok(
    !/ignore the bottom half|התעלמ/i.test(both),
    'the port tells participants to ignore the bottom half; the original never did',
  );
});

test('the serial position task still forbids writing the words down', () => {
  // The one experimental control on that page, and the port dropped it. The serial-position
  // curve is the entire result: a participant who jots words during presentation produces
  // one that measures nothing, and nothing downstream can tell that they did.
  const def = portBySlug('serialOrder');
  assert.match(def.instructions.en, /do not write anything down/i);
  assert.match(def.instructions.he, /אל תרשמ/);
});

test('every port that promises a length promises one it can keep', () => {
  // /run's landing screen renders `instructions` and nothing else — there is no automatic
  // trial count — so a length the hand-built page promised is gone unless it is written
  // into the definition. Where one IS written, it has to match what the design builds, or
  // the page is lying in the other direction.
  const rng = seededRandom(7);
  for (const def of ports.PORTS) {
    const stated = def.instructions.en.match(/(\d+)\s+practice\s*\+\s*(\d+)\s+trials/i);
    if (!stated) continue;
    const plan = planStages(def, rng);
    const main = plan.reduce((n, b) => n + buildTrials(b.design, { rng, context: b.context }).length, 0);
    const practice = buildTrials(plan[0].design, { practice: true, rng, context: plan[0].context }).length;
    assert.equal(Number(stated[2]), main, `${def.slug} promises ${stated[2]} trials and builds ${main}`);
    assert.equal(Number(stated[1]), practice,
      `${def.slug} promises ${stated[1]} practice trials and builds ${practice}`);
  }
});

test('the long ports say how long they are', () => {
  // Anything past a few minutes has to warn people, or they quit in the middle and the row
  // is unusable. visualSearch is 128 trials and said nothing at all.
  for (const slug of ['visualSearch', 'posnerCueing', 'stroop', 'wordSuperiority']) {
    const def = portBySlug(slug);
    assert.match(def.instructions.en, /\d+\s+trials/i, `${slug} never says how many trials it is`);
    assert.match(def.instructions.he, /ניסיונות|ניסויים/, `${slug} never says its length in Hebrew`);
  }
});

// ── V. Mental representation ──────────────────────────────────────────────────
//
// Two experiments in one session, both claiming that a mental image keeps the properties of
// the thing it depicts: scanning time rises with distance on a map that is no longer on
// screen, rotation time rises with the angle between two figures. Both findings are a SLOPE
// rather than a difference between conditions, which is why this is the port that taught the
// runtime to report a correlation, and why it needed a practice block that is not the first.

const MENTAL_REP = ports.PORTS.find(p => p.slug === 'mentalRep');
const mrPlan = () => planStages(MENTAL_REP, seededRandom(11));
const mrBlock = name => mrPlan().find(b => b.stage === name);

test('mentalRep runs the map, then 21 scans, then 40 rotations', () => {
  const rng = seededRandom(11);
  const plan = planStages(MENTAL_REP, rng);
  assert.deepEqual(plan.map(b => b.stage), ['mapStudy', 'scanning', 'rotation']);

  const counts = plan.map(b => buildTrials(b.design, { rng, context: b.context }).length);
  assert.deepEqual(counts, [1, 21, 40], 'the original studies one map, scans 21 pairs, rotates 40');
});

test('the map is studied for thirty seconds and asks for nothing', () => {
  // The whole scanning result rests on the map being in memory rather than on screen. A
  // study phase that ended early, or that took a keypress, would be measuring perception.
  const [phase] = MENTAL_REP.trial.phases;
  assert.equal(phase.durationMs, 30000);
  assert.equal(MENTAL_REP.trial.response.kind, 'none');
  assert.ok(!phase.awaitsResponse, 'the study phase must not wait for a response');
});

test('rotation practises before its own trials, though it is the second half', () => {
  // The capability this port added. Before it, `practice` on a stage typechecked, validated
  // and was silently never run: only the definition's first block was ever practised, so a
  // participant met the rotation task cold after the whole of a different task.
  const rotation = mrBlock('rotation');
  assert.ok(rotation.design.practice, 'the rotation block declares no practice');
  assert.equal(rotation.design.practice.count, 5);
  assert.equal(rotation.design.practice.feedback, true);

  const rng = seededRandom(3);
  const practice = buildTrials(rotation.design, { practice: true, rng, context: rotation.context });
  assert.equal(practice.length, 5, 'the original gives five practice trials with feedback');
});

test('a later block that practises is actually taken through the practice', () => {
  // The definition half of the above is worth nothing if the page ignores it, which is
  // exactly what it did. Both routes into a block have to practise: the one through the
  // intro screen, and the one that skips the intro because autoAdvanceMs is zero.
  const source = readFileSync(join(process.cwd(), 'app', 'run', '[slug]', 'page.tsx'), 'utf8');
  assert.ok(/'stagePractice'/.test(source), 'the run page has no stage-practice step');
  const routes = source.match(/design\.practice \? 'stagePractice' : 'stageRun'/g) ?? [];
  assert.equal(routes.length, 2,
    'both ways into a block — through the intro and straight past it — must practise first');
});

test('rotation samples five pairs from each angle and answer', () => {
  const rotation = mrBlock('rotation');
  const trials = buildTrials(rotation.design, { rng: seededRandom(5), context: rotation.context });

  for (const angle of [0, 60, 120, 180]) {
    for (const answer of ['same', 'different']) {
      const n = trials.filter(t => t.values.pair.angle === angle && t.values.pair.answer === answer).length;
      assert.equal(n, 5, `expected 5 trials at ${angle} degrees answered "${answer}", found ${n}`);
    }
  }
});

test('a "different" pair is the mirror of the same figure, not another figure', () => {
  // What makes the task a rotation task. Two DIFFERENT objects can be told apart by their
  // shape without rotating anything; a mirror image cannot, so the only way to decide is to
  // turn it — which is the whole reason time rises with angle.
  const rotation = mrBlock('rotation');
  const trials = buildTrials(rotation.design, { rng: seededRandom(9), context: rotation.context });

  for (const trial of trials) {
    const { left, right, answer, figure } = trial.values.pair;
    assert.ok(left.includes(figure) && right.includes(figure),
      `a ${answer} trial pairs ${left} with ${right}, which are not the same figure`);
    assert.equal(right.endsWith('_m.svg'), answer === 'different',
      `a "${answer}" trial should ${answer === 'different' ? '' : 'not '}mirror the right figure`);
    assert.ok(!left.endsWith('_m.svg'), 'the left figure is never the mirrored one');
  }
});

test('every figure a rotation trial names exists on disk', () => {
  // The figures are files now, not a React component drawing cubes. A path that is right in
  // the pool and absent from public/ is a blank square in the middle of the experiment.
  const rotation = mrBlock('rotation');
  const trials = buildTrials(rotation.design, { rng: seededRandom(21), context: rotation.context });
  for (const trial of trials) {
    for (const src of [trial.values.pair.left, trial.values.pair.right]) {
      assert.ok(existsSync(join(process.cwd(), 'public', src.replace(/^\//, ''))), `${src} does not exist`);
    }
  }
});

test('scanning takes seven pairs from each distance band', () => {
  const scanning = mrBlock('scanning');
  const trials = buildTrials(scanning.design, { rng: seededRandom(7), context: scanning.context });

  for (const band of ['short', 'medium', 'long']) {
    const n = trials.filter(t => t.values.pair.band === band).length;
    assert.equal(n, 7, `expected 7 ${band} scans, found ${n}`);
  }

  // And the bands are genuinely ordered, or "distance" would not be the manipulation.
  const mean = band => {
    const d = trials.filter(t => t.values.pair.band === band).map(t => t.values.pair.distance);
    return d.reduce((a, b) => a + b, 0) / d.length;
  };
  assert.ok(mean('short') < mean('medium'), 'short scans are not shorter than medium ones');
  assert.ok(mean('medium') < mean('long'), 'medium scans are not shorter than long ones');
});

test('a scan trial names both landmarks before the clock starts', () => {
  // The original shows "starting at X, scan to Y" for 1.5s and only then starts timing. Time
  // the reading of two words into the measure and short scans gain a fixed cost that long
  // ones also have — which flattens the very slope the experiment is looking for.
  const scanning = mrBlock('scanning');
  const phases = scanning.design.trial.phases;
  const ready = phases.find(p => p.name === 'ready');
  const scan = phases.find(p => p.name === 'scan');

  assert.ok(ready, 'there is no naming phase before the scan');
  assert.equal(ready.durationMs, 1500);
  assert.ok(!ready.startsClock, 'the clock must not start while the pair is being read');
  assert.ok(scan.startsClock && scan.awaitsResponse);
});

test('scanning is not scored, because there is no right answer', () => {
  // Pressing space when you "arrive" cannot be correct or incorrect. Scoring it would put a
  // fabricated accuracy on the dashboard and, worse, let `correctOnly` silently drop trials.
  const scanning = mrBlock('scanning');
  assert.equal(scanning.design.trial.correct.kind, 'none');
  assert.equal(scanning.design.trial.response.options.length, 1);
  assert.equal(scanning.design.trial.response.options[0].key, ' ');
});

// ── W. Correlation as a measure ───────────────────────────────────────────────
//
// "RT rises with X" is one of the most common claims in the field, and the number that
// states it is an r, which no group mean can express.

test('pearson matches a correlation worked by hand', () => {
  // A perfect positive relationship, a perfect negative one, and a real one.
  assert.equal(pearson([{ x: 1, y: 2 }, { x: 2, y: 4 }, { x: 3, y: 6 }]), 1);
  assert.equal(pearson([{ x: 1, y: 6 }, { x: 2, y: 4 }, { x: 3, y: 2 }]), -1);
  const r = pearson([{ x: 0, y: 500 }, { x: 60, y: 620 }, { x: 120, y: 700 }, { x: 180, y: 900 }]);
  assert.ok(r > 0.97 && r < 0.99, `expected about .98, got ${r}`);
});

test('an unmeasurable correlation is absent, not zero', () => {
  // Zero reads as "no relationship". For someone who pressed at one speed all through, or
  // saw one value of x, the truth is "not measurable from this person" — and averaging a
  // zero in would drag everyone else's real correlation towards nothing.
  assert.equal(pearson([{ x: 1, y: 2 }, { x: 2, y: 4 }]), null, 'two points is not a correlation');
  assert.equal(pearson([{ x: 5, y: 1 }, { x: 5, y: 2 }, { x: 5, y: 3 }]), null, 'no spread in x');
  assert.equal(pearson([{ x: 1, y: 7 }, { x: 2, y: 7 }, { x: 3, y: 7 }]), null, 'no spread in y');
});

test('a correlation is computed per participant, then averaged', () => {
  // The reason it must be: one uniformly slow participant sits above everyone else at EVERY
  // value of x, so pooling the class would read their slowness as a relationship. Here two
  // people each have a perfect within-person correlation; pooled, the cloud is a mess.
  const row = (participant, angle, rt) => ({
    participant_name: participant, pair_angle: angle, reaction_time_ms: rt, is_correct: true,
  });
  const rows = [
    row('fast', 0, 400), row('fast', 60, 500), row('fast', 120, 600), row('fast', 180, 700),
    row('slow', 0, 1400), row('slow', 60, 1500), row('slow', 120, 1600), row('slow', 180, 1700),
  ];
  const stat = { label: 'angle', measure: 'correlation', against: 'pair.angle' };
  const value = statValue(stat, rows);
  assert.ok(value > 0.999, `each participant is a perfect line, so the mean r should be 1, got ${value}`);
});

test('a correlation card ignores rows from other blocks', () => {
  // mentalRep has two correlations on one dashboard, over two different fields. Without the
  // stage filter each would be computed over the other block's rows as well — where its own
  // field is absent, so the number would quietly be built from whichever trials had it.
  const stats = MENTAL_REP.dashboard.stats.filter(s => s.measure === 'correlation');
  assert.equal(stats.length, 2);
  for (const stat of stats) {
    assert.ok(stat.filter && stat.filter.stage, `"${stat.label}" is not filtered to one block`);
  }
});

test('a correlation against an unstored field is reported, not left blank', () => {
  const broken = {
    ...MENTAL_REP,
    dashboard: {
      ...MENTAL_REP.dashboard,
      stats: [{ label: 'Nonsense', measure: 'correlation', against: 'pair.nothing' }],
    },
  };
  const messages = validate(broken).map(i => i.message).join('\n');
  assert.match(messages, /pair\.nothing/);
});
