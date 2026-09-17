// The original study's figures, drawn beside the class's own data.
//
// A class of thirty is noisy, so the question a lecturer wants on screen is "did we get what
// they got?". These tests pin the part that decides what is drawn: which reported number
// belongs to which bar, what happens when a definition names a group that does not exist,
// and that a chart without figures is untouched.
//
//   node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON prompt-tests/original-results.test.mjs

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
const { aggregate, originalValue, withOriginal, unmatchedOriginals, ORIGINAL_KEY } =
  await import('../lib/experiment-runtime/aggregate.ts');

const rows = [
  { session_id: 'a', participant_name: 'A', trial_index: 0, is_practice: false, response: 'x', is_correct: true, reaction_time_ms: 700, congruency: 'congruent' },
  { session_id: 'a', participant_name: 'A', trial_index: 1, is_practice: false, response: 'x', is_correct: true, reaction_time_ms: 900, congruency: 'incongruent' },
];

const chart = (over = {}) => ({
  title: 'RT by congruency', kind: 'bar', groupBy: 'congruency', measure: 'meanRt', ...over,
});

const STROOP = { source: 'Stroop (1935), Exp. 2', values: { congruent: 650, incongruent: 850 } };

test('each bar gets the figure reported for that condition', () => {
  const points = withOriginal(chart({ original: STROOP }), aggregate(chart({ original: STROOP }), rows));
  assert.deepEqual(points.map(p => [p.group, p.value, p[ORIGINAL_KEY]]), [
    ['congruent', 700, 650],
    ['incongruent', 900, 850],
  ]);
});

test('a renamed group is still matched, by its label or by the value it was renamed from', () => {
  const renamed = chart({
    groups: [{ value: 'congruent', label: 'Congruent' }, { value: 'incongruent', label: 'Incongruent' }],
    original: STROOP,
  });
  const points = withOriginal(renamed, aggregate(renamed, rows));
  assert.deepEqual(points.map(p => [p.group, p[ORIGINAL_KEY]]), [['Congruent', 650], ['Incongruent', 850]]);

  // Written against the label instead — both spellings have to work, or a definition that
  // reads perfectly well would plot nothing.
  const byLabel = chart({
    groups: [{ value: 'congruent', label: 'Congruent' }],
    original: { source: 'x', values: { Congruent: 640 } },
  });
  assert.equal(originalValue(byLabel, 'Congruent'), 640);
});

test('a multi-series chart still gets the comparison, once per group', () => {
  // memoryScanning splits its RT line by probeType AND carries Sternberg's figures, a
  // combination nothing else covered. The paper reports one number per set size, not one
  // per series, so it attaches to the group and is drawn once beside both lines.
  const seriesRows = [
    { session_id: 'a', participant_name: 'A', trial_index: 0, is_practice: false, response: 'present', is_correct: true, reaction_time_ms: 500, setSize: '2', probeType: 'present' },
    { session_id: 'a', participant_name: 'A', trial_index: 1, is_practice: false, response: 'absent', is_correct: true, reaction_time_ms: 560, setSize: '2', probeType: 'absent' },
    { session_id: 'a', participant_name: 'A', trial_index: 2, is_practice: false, response: 'present', is_correct: true, reaction_time_ms: 640, setSize: '6', probeType: 'present' },
    { session_id: 'a', participant_name: 'A', trial_index: 3, is_practice: false, response: 'absent', is_correct: true, reaction_time_ms: 700, setSize: '6', probeType: 'absent' },
  ];
  const sternberg = {
    title: 'RT by set size', kind: 'line', groupBy: 'setSize', measure: 'meanRt', seriesBy: 'probeType',
    original: { source: 'Sternberg (1966)', values: { 2: 446, 6: 599 } },
  };
  const points = withOriginal(sternberg, aggregate(sternberg, seriesRows));
  assert.deepEqual(points.map(p => [p.group, p[ORIGINAL_KEY]]), [['2', 446], ['6', 599]]);
  // The per-series values are untouched by the comparison.
  assert.deepEqual(points.map(p => [p.present, p.absent]), [[500, 560], [640, 700]]);
  assert.deepEqual(unmatchedOriginals(sternberg, points), []);
});

test('a chart with no figures is left exactly as it was', () => {
  const plain = chart();
  const points = aggregate(plain, rows);
  assert.equal(withOriginal(plain, points), points);
  assert.deepEqual(unmatchedOriginals(plain, points), []);
  assert.equal(originalValue(plain, 'congruent'), undefined);
});

test('a figure for a condition the chart does not have is reported, never silently dropped', () => {
  const typo = chart({ original: { source: 'x', values: { congruent: 650, incongrunet: 850 } } });
  const points = withOriginal(typo, aggregate(typo, rows));
  assert.deepEqual(unmatchedOriginals(typo, points), ['incongrunet']);
  // The bar that does match is still drawn; only the unknown one is missing.
  assert.equal(points.find(p => p.group === 'congruent')[ORIGINAL_KEY], 650);
  assert.equal(points.find(p => p.group === 'incongruent')[ORIGINAL_KEY], undefined);
});

// ── Validation ────────────────────────────────────────────────────────────────

const def = (chartOver) => ({
  version: 1, slug: 's', title: 't', titleHe: 'ת', category: 'EXECUTIVE CONTROL',
  instructions: { en: 'e', he: 'ה' },
  factors: [{ name: 'congruency', levels: ['congruent', 'incongruent'] }],
  repetitions: 10,
  trial: {
    phases: [{ name: 'go', display: { kind: 'text', text: '{congruency}' }, awaitsResponse: true }],
    response: { kind: 'choice', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] },
    correct: { kind: 'matchesFactor', factor: 'congruency' },
  },
  store: ['congruency'],
  dashboard: { charts: [chart(chartOver)] },
});

const messages = (d) => validate(d).map(i => i.message);

test('a well-formed original passes validation', () => {
  // Errors only: this fixture also earns the usual "no phase starts the clock" warning,
  // which has nothing to do with the comparison being tested here.
  const errors = validate(def({ original: STROOP })).filter(i => i.severity === 'error');
  assert.deepEqual(errors, []);
  // And nothing about the original itself is complained of, at any severity.
  assert.deepEqual(validate(def({ original: STROOP })).filter(i => /original|groups/i.test(i.message)), []);
});

test('a malformed original is an error, never thrown', () => {
  for (const original of [7, {}, { source: 'x' }, { values: { congruent: 1 } }, { source: 'x', values: { congruent: 'fast' } }]) {
    const d = def({ original });
    assert.doesNotThrow(() => validate(d));
    assert.ok(validate(d).some(i => i.severity === 'error'), `accepted ${JSON.stringify(original)}`);
  }
});

test('a figure for an unknown condition warns, naming the groups it could have used', () => {
  const warnings = messages(def({ original: { source: 'x', values: { incongrunet: 850 } } }));
  assert.ok(warnings.some(m => /incongrunet/.test(m) && /not one of its groups/.test(m)), warnings.join('\n'));
});

test('a chart shape that cannot draw the comparison warns', () => {
  const warnings = messages(def({ kind: 'scatter', groupBy: 'participant', original: STROOP }));
  assert.ok(warnings.some(m => /cannot draw them/.test(m)), warnings.join('\n'));
});
