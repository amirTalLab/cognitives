// Tests for the Posner port and the runtime features added to build it: response timeouts
// (and with them withheld responses), too-early presses, per-outcome feedback, and the
// chart options its dashboard needs.
//
// Every one of those features is optional, so the corpus sweep in runtime.test.mjs is what
// shows nothing existing changed. This file pins each new rule down on its own, and asserts
// the port reproduces the hand-built experiment's design rather than an approximation of it.
//
//   node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON prompt-tests/posner-port.test.mjs

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

const { validate } = await import('../lib/experiment-runtime/validate.ts');
const { buildTrials, isCorrect, feedbackMessage, NO_RESPONSE } =
  await import('../lib/experiment-runtime/trials.ts');
const { aggregate, generateMockRows } = await import('../lib/experiment-runtime/aggregate.ts');
const { POSNER_CUEING } = await import('../lib/experiment-runtime/ports.ts');

const errorsOf = def => validate(def).filter(i => i.severity === 'error').map(i => i.message);
const countBy = (items, fn) => items.reduce((m, x) => { const k = String(fn(x)); m[k] = (m[k] ?? 0) + 1; return m; }, {});

// ── The port reproduces the original design ───────────────────────────────────

test('the Posner port validates with no errors and no warnings', () => {
  assert.deepEqual(validate(POSNER_CUEING), []);
});

test('the Posner port builds the original mix: 132 trials, 40/10/6/10 per SOA', () => {
  const trials = buildTrials(POSNER_CUEING, {});
  assert.equal(trials.length, 132);
  for (const soa of [300, 500]) {
    const mix = countBy(trials.filter(t => t.values.soa === soa), t => t.values.trialType.validity);
    assert.deepEqual(mix, { valid: 40, invalid: 10, catch: 6, exo_invalid: 10 });
  }
  const steps = Object.values(countBy(trials, t => t.values.fixationMs));
  assert.equal(steps.length, 5);
  assert.ok(Math.max(...steps) - Math.min(...steps) <= 1, `fixation steps used unevenly: ${steps}`);
});

test('the target is in the cued box on valid trials, the other box on invalid ones, absent on catch', () => {
  for (const t of buildTrials(POSNER_CUEING, {})) {
    const { validity, cueSide, targetSide, leftTarget, rightTarget } = t.values.trialType;
    if (validity === 'valid') assert.equal(targetSide, cueSide);
    else if (validity === 'catch') assert.equal(targetSide, 'none');
    else assert.notEqual(targetSide, cueSide);
    // Exactly the box the target is in shows it.
    assert.equal(leftTarget, targetSide === 'left' ? '●' : '');
    assert.equal(rightTarget, targetSide === 'right' ? '●' : '');
  }
});

test('the exogenous cue is the box on the cued side turning red, with no arrow', () => {
  for (const t of buildTrials(POSNER_CUEING, {})) {
    const tt = t.values.trialType;
    if (tt.validity !== 'exo_invalid') {
      assert.notEqual(tt.cueSymbol, '+');
      assert.equal(tt.leftBorder, tt.rightBorder);
      continue;
    }
    assert.equal(tt.cueSymbol, '+');
    assert.equal(tt[`${tt.cueSide}Border`], '#ef4444');
    assert.notEqual(tt[`${tt.targetSide}Border`], '#ef4444');
  }
});

test('on a catch trial pressing nothing is correct; on a target trial it is a miss', () => {
  const trials = buildTrials(POSNER_CUEING, {});
  const catchTrial = trials.find(t => t.values.trialType.validity === 'catch');
  const targetTrials = trials.filter(t => t.values.trialType.validity !== 'catch');
  assert.equal(isCorrect(POSNER_CUEING, catchTrial, NO_RESPONSE), true);
  assert.equal(isCorrect(POSNER_CUEING, catchTrial, 'press'), false);
  for (const t of targetTrials) {
    assert.equal(isCorrect(POSNER_CUEING, t, 'press'), true);
    assert.equal(isCorrect(POSNER_CUEING, t, NO_RESPONSE), false);
  }
});

// ── Validation of the new fields ──────────────────────────────────────────────

/** A one-button speeded design: press on go, withhold on no-go. */
function goNoGo(over = {}, trialOver = {}) {
  return {
    version: 1, slug: 'gng', title: 'Go/No-Go', titleHe: 'גו/נו-גו', category: 'ATTENTION',
    instructions: { en: 'e', he: 'ה' },
    factors: [{ name: 'kind', levels: ['go', 'nogo'] }],
    repetitions: 10,
    trial: {
      phases: [
        { name: 'wait', display: { kind: 'fixation' }, durationMs: 300 },
        { name: 'go', display: { kind: 'text', text: '{kind}' }, awaitsResponse: true, startsClock: true, timeoutMs: 1000 },
      ],
      response: { kind: 'choice', options: [{ value: 'press', label: 'Press', key: 'space' }] },
      correct: { kind: 'mapping', factor: 'kind', expect: { go: 'press', nogo: 'none' } },
      ...trialOver,
    },
    store: ['kind'],
    dashboard: { charts: [{ title: 'c', kind: 'bar', groupBy: 'kind', measure: 'accuracy' }] },
    ...over,
  };
}

test('a single go button with a timeout is valid, and "none" may be the expected answer', () => {
  assert.deepEqual(errorsOf(goNoGo()), []);
});

test('without a timeout, a single button and an expected "none" are both refused, with the fix named', () => {
  const def = goNoGo();
  delete def.trial.phases[1].timeoutMs;
  const errors = errorsOf(def);
  assert.ok(errors.some(e => /fewer than two options/.test(e) && /timeoutMs/.test(e)), errors.join('\n'));
  assert.ok(errors.some(e => /expects the response "none"/.test(e)), errors.join('\n'));
});

test('timeoutMs on a timed phase, or of zero or less, is an error', () => {
  const onTimed = goNoGo();
  onTimed.trial.phases[0].timeoutMs = 500;
  assert.ok(errorsOf(onTimed).some(e => /does not await a response/.test(e)));

  const zero = goNoGo();
  zero.trial.phases[1].timeoutMs = 0;
  assert.ok(errorsOf(zero).some(e => /must be above zero/.test(e)));
});

test('earlyFrom must name a phase that comes before the response', () => {
  assert.deepEqual(errorsOf(goNoGo({}, { earlyFrom: 'wait' })), []);
  assert.ok(errorsOf(goNoGo({}, { earlyFrom: 'nope' })).some(e => /not a phase/.test(e)));
  assert.ok(errorsOf(goNoGo({}, { earlyFrom: 'go' })).some(e => /before the response phase/.test(e)));
});

test('malformed timeouts, earlyFrom and feedback are reported, never thrown', () => {
  const broken = [
    goNoGo({}, { earlyFrom: 7 }),
    goNoGo({}, { feedback: 7 }),
    goNoGo({}, { feedback: {} }),
    goNoGo({}, { feedback: { durationMs: 'soon' } }),
    goNoGo({}, { feedback: { durationMs: 500, inMain: true, early: 'too early' } }),
    goNoGo({}, { feedback: { durationMs: 500, inMain: true, timeout: { en: 1 } } }),
  ];
  const badTimeout = goNoGo();
  badTimeout.trial.phases[1].timeoutMs = { ms: 5 };
  broken.push(badTimeout);

  for (const def of broken) {
    assert.doesNotThrow(() => validate(def));
    assert.ok(errorsOf(def).length > 0, `accepted ${JSON.stringify(def.trial)}`);
  }

  const good = { durationMs: 400, inMain: true, timeout: { en: 'Missed', he: 'פספוס' } };
  assert.deepEqual(errorsOf(goNoGo({}, { feedback: good })), []);
});

test('charts may group by trial_index; a bad bin, difference, filter or correctOnly is reported', () => {
  const binned = goNoGo({ dashboard: { charts: [{ title: 'c', kind: 'line', groupBy: 'trial_index', bin: 10, measure: 'meanRt' }] } });
  assert.deepEqual(validate(binned), []);

  for (const bad of [{ bin: 0 }, { bin: 'x' }, { difference: { factor: 'kind' } }, { filter: 'go' }, { correctOnly: 'yes' }]) {
    const def = goNoGo({ dashboard: { charts: [{ title: 'c', kind: 'bar', groupBy: 'kind', measure: 'meanRt', ...bad }] } });
    assert.doesNotThrow(() => validate(def));
    assert.ok(errorsOf(def).length > 0, `accepted ${JSON.stringify(bad)}`);
  }
});

// ── Feedback ──────────────────────────────────────────────────────────────────

const msg = t => ({ en: t, he: t });
const pickFrom = (def, practice = false) => outcome =>
  feedbackMessage(def, { correct: null, timedOut: false, early: false, ...outcome }, practice)?.en ?? null;

test('feedback picks by outcome: too early, then correct, then timed out, then incorrect', () => {
  const pick = pickFrom(goNoGo({}, {
    feedback: { durationMs: 400, inMain: true, correct: msg('yes'), incorrect: msg('no'), timeout: msg('late'), early: msg('early') },
  }));
  assert.equal(pick({ early: true, correct: false }), 'early');
  assert.equal(pick({ correct: true, timedOut: true }), 'yes', 'a rightly withheld response is correct, not a miss');
  assert.equal(pick({ correct: false, timedOut: true }), 'late');
  assert.equal(pick({ correct: false }), 'no');
});

test('feedback falls back to the incorrect message, and says nothing where no message applies', () => {
  const pick = pickFrom(goNoGo({}, { feedback: { durationMs: 400, inMain: true, incorrect: msg('no') } }));
  assert.equal(pick({ correct: false, timedOut: true }), 'no');
  assert.equal(pick({ early: true, correct: false }), 'no');
  assert.equal(pick({ correct: true }), null);
});

test('feedback shows in the main block only with inMain, and in practice only with practice.feedback', () => {
  const fb = { durationMs: 400, incorrect: msg('no') };
  const wrong = { correct: false };
  assert.equal(pickFrom(goNoGo({}, { feedback: fb }))(wrong), null);
  assert.equal(pickFrom(goNoGo({}, { feedback: { ...fb, inMain: true } }))(wrong), 'no');
  assert.equal(pickFrom(goNoGo({ practice: { count: 2, feedback: false } }, { feedback: fb }), true)(wrong), null);
  assert.equal(pickFrom(goNoGo({ practice: { count: 2, feedback: true } }, { feedback: fb }), true)(wrong), 'no');
});

// ── Aggregation ───────────────────────────────────────────────────────────────

const row = o => ({
  session_id: 's1', participant_name: 'P1', trial_index: 0, is_practice: false,
  response: 'press', is_correct: true, reaction_time_ms: 400, ...o,
});

test('mean RT leaves out trials with no reaction time instead of counting them as zero', () => {
  const chart = { title: 'c', kind: 'bar', groupBy: 'kind', measure: 'meanRt' };
  const points = aggregate(chart, [
    row({ kind: 'go', reaction_time_ms: 400 }),
    row({ kind: 'go', reaction_time_ms: null, response: 'none' }),
  ]);
  assert.equal(points[0].value, 400);
});

test('a filter keeps one value or any of a list, and correctOnly drops errors', () => {
  const rows = [
    row({ kind: 'go', reaction_time_ms: 300 }),
    row({ kind: 'go', reaction_time_ms: 900, is_correct: false }),
    row({ kind: 'nogo', reaction_time_ms: 500 }),
    row({ kind: 'catch', reaction_time_ms: 700 }),
  ];
  const base = { title: 'c', kind: 'bar', groupBy: 'kind', measure: 'meanRt' };
  assert.deepEqual(aggregate({ ...base, filter: { kind: 'go' } }, rows).map(p => [p.group, p.value]), [['go', 600]]);
  assert.deepEqual(
    aggregate({ ...base, filter: { kind: ['go', 'nogo'] }, correctOnly: true }, rows).map(p => [p.group, p.value]),
    [['go', 300], ['nogo', 500]],
  );
});

test('a filter on a dotted field matches its flattened column', () => {
  const rows = [row({ trialType_validity: 'valid' }), row({ trialType_validity: 'catch' })];
  const chart = { title: 'c', kind: 'bar', groupBy: 'trialType.validity', measure: 'count', filter: { 'trialType.validity': 'valid' } };
  assert.deepEqual(aggregate(chart, rows).map(p => p.group), ['valid']);
});

test('a difference is taken within each participant, and someone missing a level is left out', () => {
  const rows = [
    row({ session_id: 'a', participant_name: 'A', v: 'valid', reaction_time_ms: 400 }),
    row({ session_id: 'a', participant_name: 'A', v: 'invalid', reaction_time_ms: 500 }),
    // Slow overall, same-size effect. Averaging across people first would muddle the two.
    row({ session_id: 'b', participant_name: 'B', v: 'valid', reaction_time_ms: 1000 }),
    row({ session_id: 'b', participant_name: 'B', v: 'invalid', reaction_time_ms: 1100 }),
    // Never answered an invalid trial in time: no effect to report — not an effect of -700.
    row({ session_id: 'c', participant_name: 'C', v: 'valid', reaction_time_ms: 700 }),
    row({ session_id: 'c', participant_name: 'C', v: 'invalid', reaction_time_ms: null, response: 'none' }),
  ];
  const difference = { factor: 'v', level: 'invalid', minus: 'valid' };

  const perPerson = aggregate({ title: 'c', kind: 'bar', groupBy: 'participant', measure: 'meanRt', difference }, rows);
  assert.deepEqual(perPerson.map(p => [p.group, p.value]), [['A', 100], ['B', 100]]);

  const overall = aggregate({ title: 'c', kind: 'bar', groupBy: 'all', measure: 'meanRt', difference },
    rows.map(r => ({ ...r, all: 'everyone' })));
  assert.deepEqual([overall[0].value, overall[0].sem], [100, 0]);
});

test('a group nobody had anything measurable in is dropped, but a group with plain data never is', () => {
  const rows = [row({ kind: 'go' }), row({ kind: 'nogo', reaction_time_ms: null })];
  // Ordinary charts are unchanged: a group whose only trials have no RT still appears.
  assert.equal(aggregate({ title: 'c', kind: 'bar', groupBy: 'kind', measure: 'meanRt' }, rows).length, 2);
});

test('bin groups a numeric field, numbered from 1', () => {
  const rows = [0, 32, 33, 65, 66, 131].map(i => row({ trial_index: i }));
  const points = aggregate({ title: 'c', kind: 'line', groupBy: 'trial_index', bin: 33, measure: 'count' }, rows);
  assert.deepEqual(points.map(p => [p.group, p.value]), [['1', 2], ['2', 2], ['3', 1], ['4', 1]]);
});

// ── Mock data ─────────────────────────────────────────────────────────────────

test('mock rows give a correctly withheld trial no response and no RT, as the runner records it', () => {
  const rows = generateMockRows(POSNER_CUEING);
  const rejected = rows.filter(r => r.trialType_validity === 'catch' && r.is_correct);
  assert.ok(rejected.length > 0);
  assert.ok(rejected.every(r => r.response === NO_RESPONSE && r.reaction_time_ms === null));
  assert.ok(rows.filter(r => r.trialType_validity === 'valid').every(r => typeof r.reaction_time_ms === 'number'));
});

test('Posner mock data shows the validity effect, the exogenous cost, and that cost fading', () => {
  const rows = generateMockRows(POSNER_CUEING);
  const [byType, perPerson, overTime] = POSNER_CUEING.dashboard.charts.map(c => aggregate(c, rows));

  const rt = Object.fromEntries(byType.map(p => [p.group, p.value]));
  assert.ok(rt.valid < rt.invalid && rt.invalid < rt.exo_invalid, JSON.stringify(rt));
  assert.equal(rt.catch, undefined, 'catch trials have no RT and must not appear in an RT chart');

  const effects = perPerson.map(p => p.value);
  assert.equal(effects.length, POSNER_CUEING.mock.participants);
  assert.ok(effects.filter(e => e > 0).length >= effects.length * 0.8, `validity effects: ${effects}`);

  assert.equal(overTime.length, 4);
  assert.ok(overTime[0].value > overTime[3].value, JSON.stringify(overTime));
});
