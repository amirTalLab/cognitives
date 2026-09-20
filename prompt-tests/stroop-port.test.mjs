// The Stroop port against the hand-built experiment it replaces.
//
// The point of a port is that a lecturer can switch the card over and nothing about the
// experiment changes. These pin the parts a reader of the definition cannot check at a
// glance: how many trials there are, which conditions they fall into, and what the two
// new scatter charts actually compute.
//
//   node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON prompt-tests/stroop-port.test.mjs

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

const { STROOP_PORT } = await import('../lib/experiment-runtime/ports.ts');
const { buildTrials, isCorrect } = await import('../lib/experiment-runtime/trials.ts');
const { aggregateXY } = await import('../lib/experiment-runtime/aggregate.ts');

const main = buildTrials(STROOP_PORT, {});
const practice = buildTrials(STROOP_PORT, { practice: true });

// ── The block, as lib/stroop/experiment.ts builds it ─────────────────────────

test('36 main trials: twelve words crossed with three colours, each pair exactly once', () => {
  assert.equal(main.length, 36);
  const pairs = main.map(t => `${t.values.item.word}|${t.values.item.colour}`);
  assert.equal(new Set(pairs).size, 36, 'a word/colour pair appears twice');
  assert.equal(new Set(main.map(t => t.values.item.word)).size, 12);
  assert.deepEqual([...new Set(main.map(t => t.values.item.colour))].sort(), ['green', 'red', 'yellow']);
});

test('each language a reader knows has three congruent trials and six incongruent', () => {
  const count = (group, congruency) => main.filter(t =>
    t.values.item.languageGroup === group && t.values.item.congruency === congruency).length;

  for (const group of ['English', 'Hebrew', 'Spanish']) {
    assert.equal(count(group, 'congruent'), 3, `${group} congruent`);
    assert.equal(count(group, 'incongruent'), 6, `${group} incongruent`);
    assert.equal(count(group, 'baseline'), 0, `${group} should have no baseline trials`);
  }
  // A non-word names no colour, so it is neither — it is the baseline the rest are read
  // against, which is how the original dashboard drew it.
  assert.equal(count('Non-words', 'baseline'), 9);
  assert.equal(count('Non-words', 'congruent'), 0);
  assert.equal(count('Non-words', 'incongruent'), 0);
});

test('the ink colour is the right answer, never the word', () => {
  const incongruent = main.find(t => t.values.item.congruency === 'incongruent');
  assert.ok(incongruent, 'expected an incongruent trial');
  assert.equal(isCorrect(STROOP_PORT, incongruent, incongruent.values.item.colour), true);
  // The word names a different colour, and answering that is wrong.
  const meaning = { red: 'red', adom: 'red', rojo: 'red', green: 'green', yarok: 'green', verde: 'green', yellow: 'yellow', tsahov: 'yellow', amarillo: 'yellow' }[incongruent.values.item.word];
  assert.equal(isCorrect(STROOP_PORT, incongruent, meaning), false);
});

test('practice is the five neutral words, repeated until right and never saved', () => {
  assert.equal(practice.length, 5);
  assert.deepEqual(
    practice.map(t => t.values.item.word).sort(),
    ['class', 'cognition', 'enjoy', 'life', 'welcome'],
  );
  // None of them names a colour, so practice cannot teach the congruency effect by accident.
  assert.ok(practice.every(t => t.values.item.congruency === 'baseline'));
  assert.equal(STROOP_PORT.practice.retryUntilCorrect, true);
  assert.equal(STROOP_PORT.practice.record, false);
});

test('the response keys are the original r/g/y, and the gap between trials is 500ms', () => {
  const keys = STROOP_PORT.trial.response.options.map(o => `${o.value}:${o.key}`);
  assert.deepEqual(keys, ['yellow:y', 'green:g', 'red:r']);
  assert.equal(STROOP_PORT.trial.itiMs, 500);
});

// ── The two-measure charts ────────────────────────────────────────────────────

const row = (over) => ({
  session_id: 's1', participant_name: 'A', trial_index: 0, is_practice: false,
  response: 'red', is_correct: true, reaction_time_ms: 700,
  item_congruency: 'congruent', item_languageGroup: 'English', ...over,
});

test('a point is one participant, placed by two different measures', () => {
  const chart = STROOP_PORT.dashboard.charts[1];
  const points = aggregateXY(chart, [
    row({ reaction_time_ms: 600, item_congruency: 'congruent' }),
    row({ reaction_time_ms: 800, item_congruency: 'incongruent' }),
  ]);
  assert.deepEqual(points, [{ group: 'A', series: 'English', x: 600, y: 800 }]);
});

test('a participant with nothing on one axis is dropped, never plotted at zero', () => {
  // Non-words have no congruent trials at all. The hand-built dashboard substituted 0 and
  // drew them on the x axis, where they read as impossibly fast.
  const chart = STROOP_PORT.dashboard.charts[1];
  const points = aggregateXY(chart, [
    row({ reaction_time_ms: 820, item_congruency: 'baseline', item_languageGroup: 'Non-words' }),
  ]);
  assert.deepEqual(points, []);
});

test('speed against accuracy uses every trial in the group, and keeps both axes', () => {
  const chart = STROOP_PORT.dashboard.charts[2];
  const points = aggregateXY(chart, [
    row({ reaction_time_ms: 600, is_correct: true }),
    row({ reaction_time_ms: 800, is_correct: false }),
  ]);
  assert.equal(points.length, 1);
  assert.equal(points[0].x, 700);   // mean of both trials, not of two condition means
  assert.equal(points[0].y, 50);    // one of two correct
});

test('each language group is its own series', () => {
  const chart = STROOP_PORT.dashboard.charts[2];
  const points = aggregateXY(chart, [
    row({ item_languageGroup: 'English' }),
    row({ item_languageGroup: 'Spanish' }),
  ]);
  assert.deepEqual(points.map(p => p.series).sort(), ['English', 'Spanish']);
});
