// Tests for the Posner port and the runtime features added to build it.
//
// The port is meant to replace app/posnerCueing with the same experiment in every respect
// but look, so the first half asserts it reproduces the original — its trial mix, its
// practice block, its fixation timing, what it saves, and the numbers its dashboard shows —
// rather than an approximation of them. The second half pins down each new runtime rule on
// its own: timeouts and withheld responses, early presses, feedback, and the chart options.
//
// Every one of those features is optional, so the corpus sweep in runtime.test.mjs is what
// shows nothing existing changed.
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
const { buildTrials, isCorrect, feedbackMessage, phaseDuration, NO_RESPONSE } =
  await import('../lib/experiment-runtime/trials.ts');
const { aggregate, generateMockRows, statValue } = await import('../lib/experiment-runtime/aggregate.ts');
const { POSNER_CUEING } = await import('../lib/experiment-runtime/ports.ts');

const errorsOf = def => validate(def).filter(i => i.severity === 'error').map(i => i.message);
const countBy = (items, fn) => items.reduce((m, x) => { const k = String(fn(x)); m[k] = (m[k] ?? 0) + 1; return m; }, {});
const signature = t => {
  const { validity, cueSide, targetSide, soa } = t.values.trialType;
  return `${validity}|${cueSide}|${targetSide}|${soa}`;
};

// ── The port reproduces the original ──────────────────────────────────────────

test('the Posner port validates with no errors and no warnings', () => {
  assert.deepEqual(validate(POSNER_CUEING), []);
});

test('the main block is the original mix: 132 trials, 40/10/6/10 per SOA', () => {
  const trials = buildTrials(POSNER_CUEING, {});
  assert.equal(trials.length, 132);
  for (const soa of [300, 500]) {
    const mix = countBy(trials.filter(t => t.values.trialType.soa === soa), t => t.values.trialType.validity);
    assert.deepEqual(mix, { valid: 40, invalid: 10, catch: 6, exo_invalid: 10 });
  }
});

test('practice is the original fixed eight — the same set every time, only the order shuffled', () => {
  // lib/posner-cueing/experiment.ts generatePracticeTrials, trial by trial.
  const expected = [
    'valid|left|left|300', 'valid|right|right|500', 'valid|left|left|500', 'valid|right|right|300',
    'valid|left|left|300', 'valid|right|right|500', 'invalid|left|right|300', 'catch|right|none|500',
  ].sort();
  const orders = new Set();
  for (let run = 0; run < 20; run++) {
    const practice = buildTrials(POSNER_CUEING, { practice: true });
    assert.deepEqual(practice.map(signature).sort(), expected);
    orders.add(practice.map(signature).join(','));
  }
  assert.ok(orders.size > 1, 'practice order was never shuffled');
});

test('fixation lasts a whole number of ms from 800 to 1200, fixed within a trial and varying across them', () => {
  const [fixation, cue] = POSNER_CUEING.trial.phases;
  const durations = [];
  for (let run = 0; run < 5; run++) {
    for (const trial of buildTrials(POSNER_CUEING, {})) {
      const ms = phaseDuration(fixation, trial, 0);
      assert.ok(Number.isInteger(ms) && ms >= 800 && ms <= 1200, `fixation of ${ms}ms`);
      assert.equal(phaseDuration(fixation, trial, 0), ms, 'a re-render redrew the duration');
      // The cue lasts exactly the trial's SOA — no jitter there.
      assert.equal(phaseDuration(cue, trial, 1), trial.values.trialType.soa);
      durations.push(ms);
    }
  }
  assert.ok(Math.min(...durations) < 850 && Math.max(...durations) > 1150,
    `range only ${Math.min(...durations)}–${Math.max(...durations)}ms`);
});

test('the target is in the cued box on valid trials, the other box on invalid ones, absent on catch', () => {
  for (const t of buildTrials(POSNER_CUEING, {})) {
    const { validity, cueSide, targetSide, leftTarget, rightTarget } = t.values.trialType;
    if (validity === 'valid') assert.equal(targetSide, cueSide);
    else if (validity === 'catch') assert.equal(targetSide, 'none');
    else assert.notEqual(targetSide, cueSide);
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
  assert.equal(isCorrect(POSNER_CUEING, catchTrial, NO_RESPONSE), true);
  assert.equal(isCorrect(POSNER_CUEING, catchTrial, 'press'), false);
  for (const t of trials.filter(x => x.values.trialType.validity !== 'catch')) {
    assert.equal(isCorrect(POSNER_CUEING, t, 'press'), true);
    assert.equal(isCorrect(POSNER_CUEING, t, NO_RESPONSE), false);
  }
});

test('it saves, shows and ends as the original does', () => {
  const { trial, practice, thanks } = POSNER_CUEING;
  assert.equal(practice.record, false, 'the original never saves practice trials');
  assert.equal(trial.recordEarly, false, 'the original discards a too-early press');
  assert.equal(trial.feedback.inMain, true);
  assert.equal(trial.feedback.durationMs, 500);
  assert.equal(trial.itiMs, 600);
  assert.equal(trial.phases[2].timeoutMs, 1500);
  assert.equal(thanks.showResults, false, 'the original thank-you page shows no score');
  assert.equal(POSNER_CUEING.nameOptional, true, 'the original does not require a name');
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

test('jitterMs belongs on a timed phase and cannot be negative', () => {
  const onTimed = goNoGo();
  onTimed.trial.phases[0].jitterMs = 200;
  assert.deepEqual(errorsOf(onTimed), []);

  const onResponse = goNoGo();
  onResponse.trial.phases[1].jitterMs = 200;
  assert.ok(errorsOf(onResponse).some(e => /jitterMs/.test(e) && /awaits a response/.test(e)));

  const negative = goNoGo();
  negative.trial.phases[0].jitterMs = -5;
  assert.ok(errorsOf(negative).some(e => /negative/.test(e)));
});

test('earlyFrom must name a phase that comes before the response', () => {
  assert.deepEqual(errorsOf(goNoGo({}, { earlyFrom: 'wait' })), []);
  assert.ok(errorsOf(goNoGo({}, { earlyFrom: 'nope' })).some(e => /not a phase/.test(e)));
  assert.ok(errorsOf(goNoGo({}, { earlyFrom: 'go' })).some(e => /before the response phase/.test(e)));
});

test('practice.from must name a pool-drawn factor and an existing, non-empty pool', () => {
  const base = over => ({
    ...goNoGo(),
    pools: { items: [{ w: 'a' }, { w: 'b' }], drill: [{ w: 'c' }], empty: [] },
    factors: [{ name: 'item', from: 'items' }, { name: 'kind', levels: ['go', 'nogo'] }],
    practice: { count: 2, feedback: false, ...over },
  });
  assert.deepEqual(errorsOf(base({ from: { factor: 'item', pool: 'drill' } })), []);
  assert.ok(errorsOf(base({ from: { factor: 'kind', pool: 'drill' } })).some(e => /not a factor drawn from a pool/.test(e)));
  assert.ok(errorsOf(base({ from: { factor: 'nope', pool: 'drill' } })).some(e => /not a factor drawn from a pool/.test(e)));
  assert.ok(errorsOf(base({ from: { factor: 'item', pool: 'nope' } })).some(e => /not defined/.test(e)));
  assert.ok(errorsOf(base({ from: { factor: 'item', pool: 'empty' } })).some(e => /empty/.test(e)));
});

test('malformed new fields are reported, never thrown', () => {
  const broken = [
    goNoGo({}, { earlyFrom: 7 }),
    goNoGo({}, { recordEarly: 'no' }),
    goNoGo({}, { itiDisplay: 'boxes' }),
    goNoGo({}, { feedback: 7 }),
    goNoGo({}, { feedback: {} }),
    goNoGo({}, { feedback: { durationMs: 'soon' } }),
    goNoGo({}, { feedback: { durationMs: 500, inMain: true, early: 'too early' } }),
    goNoGo({}, { feedback: { durationMs: 500, inMain: true, timeout: { en: 1 } } }),
    goNoGo({}, { feedback: { durationMs: 500, inMain: true, display: 'x' } }),
    goNoGo({ nameOptional: 'yes' }),
    goNoGo({ thanks: 'bye' }),
    goNoGo({ thanks: { title: 'bye' } }),
    goNoGo({ thanks: { showResults: 'no' } }),
    goNoGo({ practice: 'yes' }),
    goNoGo({ practice: { count: 'eight', feedback: true } }),
    goNoGo({ practice: { count: 2, feedback: true, record: 'no' } }),
    goNoGo({ practice: { count: 2, feedback: true, from: 'drill' } }),
    goNoGo({ dashboard: { charts: [], stats: 'x' } }),
    goNoGo({ dashboard: { charts: [], stats: [{ label: 3, measure: 'meanRt' }] } }),
    goNoGo({ dashboard: { charts: [], stats: [{ label: 'x', measure: 'meanRt', difference: { factor: 'kind' } }] } }),
  ];
  for (const bad of [{ timeoutMs: { ms: 5 } }, { jitterMs: [1] }]) {
    const def = goNoGo();
    Object.assign(def.trial.phases[1], bad);
    broken.push(def);
  }

  for (const def of broken) {
    assert.doesNotThrow(() => validate(def));
    assert.ok(errorsOf(def).length > 0, `accepted ${JSON.stringify({ trial: def.trial, rest: def.practice ?? def.thanks ?? def.nameOptional ?? def.dashboard })}`);
  }

  const good = { durationMs: 400, inMain: true, timeout: { en: 'Missed', he: 'פספוס' } };
  assert.deepEqual(errorsOf(goNoGo({}, { feedback: good })), []);
});

test('charts may group by trial_index, sequence or all; malformed chart options are reported', () => {
  for (const groupBy of ['trial_index', 'sequence', 'all']) {
    const def = goNoGo({ dashboard: { charts: [{ title: 'c', kind: 'line', groupBy, bin: 10, measure: 'meanRt' }] } });
    assert.deepEqual(validate(def), [], groupBy);
  }

  const malformed = [
    { bin: 0 }, { bin: 'x' }, { difference: { factor: 'kind' } }, { filter: 'go' }, { correctOnly: 'yes' },
    { pooled: 'yes' }, { description: 4 }, { xLabel: [] }, { groups: 'go' }, { groups: [{ label: 'no value' }] },
  ];
  for (const bad of malformed) {
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
const pairs = points => points.map(p => [p.group, p.value]);

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
  assert.deepEqual(pairs(aggregate({ ...base, filter: { kind: 'go' } }, rows)), [['go', 600]]);
  assert.deepEqual(pairs(aggregate({ ...base, filter: { kind: ['go', 'nogo'] }, correctOnly: true }, rows)),
    [['go', 300], ['nogo', 500]]);
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
    row({ session_id: 'b', participant_name: 'B', v: 'valid', reaction_time_ms: 1000 }),
    row({ session_id: 'b', participant_name: 'B', v: 'invalid', reaction_time_ms: 1100 }),
    row({ session_id: 'c', participant_name: 'C', v: 'valid', reaction_time_ms: 700 }),
    row({ session_id: 'c', participant_name: 'C', v: 'invalid', reaction_time_ms: null, response: 'none' }),
  ];
  const difference = { factor: 'v', level: 'invalid', minus: 'valid' };
  assert.deepEqual(pairs(aggregate({ title: 'c', kind: 'bar', groupBy: 'participant', measure: 'meanRt', difference }, rows)),
    [['A', 100], ['B', 100]]);
  const overall = aggregate({ title: 'c', kind: 'bar', groupBy: 'all', measure: 'meanRt', difference }, rows);
  assert.deepEqual([overall[0].group, overall[0].value, overall[0].sem], ['All', 100, 0]);
});

test('an ordinary group whose trials have no RT still appears', () => {
  const rows = [row({ kind: 'go' }), row({ kind: 'nogo', reaction_time_ms: null })];
  assert.equal(aggregate({ title: 'c', kind: 'bar', groupBy: 'kind', measure: 'meanRt' }, rows).length, 2);
});

test('bin groups a numeric field, numbered from 1', () => {
  const rows = [0, 32, 33, 65, 66, 131].map(i => row({ trial_index: i }));
  const points = aggregate({ title: 'c', kind: 'line', groupBy: 'trial_index', bin: 33, measure: 'count' }, rows);
  assert.deepEqual(pairs(points), [['1', 2], ['2', 2], ['3', 1], ['4', 1]]);
});

/** Two participants whose trials of interest fall at uneven trial numbers. */
const sequenceRows = [
  row({ session_id: 'a', trial_index: 10, kind: 'x', reaction_time_ms: 100 }),
  row({ session_id: 'a', trial_index: 3, kind: 'x', reaction_time_ms: 300 }),
  row({ session_id: 'a', trial_index: 5, kind: 'y', reaction_time_ms: 9999 }),
  row({ session_id: 'a', trial_index: 20, kind: 'x', reaction_time_ms: 500 }),
  row({ session_id: 'b', trial_index: 1, kind: 'x', reaction_time_ms: 200 }),
  row({ session_id: 'b', trial_index: 2, kind: 'x', reaction_time_ms: 800 }),
];

test('sequence numbers each participant\'s own trials of interest in the order they were run', () => {
  const chart = { title: 'c', kind: 'line', groupBy: 'sequence', measure: 'meanRt', filter: { kind: 'x' } };
  // a ran 300, 100, 500; b ran 200, 800. The y trial between them is not counted.
  assert.deepEqual(pairs(aggregate(chart, sequenceRows)), [['1', 250], ['2', 450], ['3', 500]]);
});

test('pooled averages every trial once across the class; unpooled averages participants', () => {
  const base = { title: 'c', kind: 'line', groupBy: 'sequence', bin: 3, measure: 'meanRt', filter: { kind: 'x' } };
  // Per participant: a (300+100+500)/3 = 300, b (200+800)/2 = 500, mean 400.
  assert.deepEqual(pairs(aggregate(base, sequenceRows)), [['1', 400]]);
  // Pooled: (300+100+500+200+800)/5 = 380.
  const pooled = aggregate({ ...base, pooled: true }, sequenceRows);
  assert.deepEqual(pairs(pooled), [['1', 380]]);
  assert.equal(pooled[0].sem, 0);
});

test('groups sets the order and labels, and never hides a group it does not list', () => {
  const rows = ['c', 'b', 'a'].map(kind => row({ kind }));
  const chart = { title: 'c', kind: 'bar', groupBy: 'kind', measure: 'count', groups: [{ value: 'b', label: 'Bee' }, { value: 'a' }] };
  assert.deepEqual(aggregate(chart, rows).map(p => p.group), ['Bee', 'a', 'c']);
});

test('a stat card is the class-wide value of the same aggregation a chart does', () => {
  const rows = [
    row({ session_id: 'a', kind: 'go', reaction_time_ms: 300 }),
    row({ session_id: 'b', kind: 'go', reaction_time_ms: 500 }),
    row({ session_id: 'b', kind: 'nogo', reaction_time_ms: 9000 }),
  ];
  assert.equal(statValue({ label: 'Go RT', measure: 'meanRt', filter: { kind: 'go' } }, rows), 400);
  assert.equal(statValue({ label: 'Nothing', measure: 'meanRt', filter: { kind: 'missing' } }, rows), null);
});

// ── Mock data ─────────────────────────────────────────────────────────────────

test('mock rows give a correctly withheld trial no response and no RT, as the runner records it', () => {
  const rows = generateMockRows(POSNER_CUEING);
  const rejected = rows.filter(r => r.trialType_validity === 'catch' && r.is_correct);
  assert.ok(rejected.length > 0);
  assert.ok(rejected.every(r => r.response === NO_RESPONSE && r.reaction_time_ms === null));
  assert.ok(rows.filter(r => r.trialType_validity === 'valid').every(r => typeof r.reaction_time_ms === 'number'));
});

test('the Posner dashboard shows the original\'s cards and charts, with the effects in mock data', () => {
  const rows = generateMockRows(POSNER_CUEING);
  const [byType, perPerson, overTime] = POSNER_CUEING.dashboard.charts.map(c => aggregate(c, rows));

  assert.deepEqual(byType.map(p => p.group), ['Valid', 'Invalid', 'Exogenous']);
  const rt = Object.fromEntries(pairs(byType));
  assert.ok(rt.Valid < rt.Invalid && rt.Invalid < rt.Exogenous, JSON.stringify(rt));

  const effects = perPerson.map(p => p.value);
  assert.equal(effects.length, POSNER_CUEING.mock.participants);
  assert.ok(effects.filter(e => e > 0).length >= effects.length * 0.8, `validity effects: ${effects}`);

  // Four time points of five exogenous trials each, getting faster.
  assert.deepEqual(overTime.map(p => p.group), ['1', '2', '3', '4']);
  assert.ok(overTime[0].value > overTime[3].value, JSON.stringify(overTime));

  const [validRt, invalidRt, effect] = POSNER_CUEING.dashboard.stats.map(s => statValue(s, rows));
  assert.equal(validRt, rt.Valid);
  assert.equal(invalidRt, rt.Invalid);
  assert.ok(effect > 20, `average validity effect ${effect}`);
});
