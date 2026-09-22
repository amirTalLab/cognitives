// The word-superiority port against the hand-built experiment it replaces.
//
// The stimuli are Hebrew and the conditions differ by one letter in the middle of a word,
// so a mistake here is invisible by eye. These check the counts, the balance, and the
// exact strings the participant sees.
//
//   node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON prompt-tests/word-superiority-port.test.mjs

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

const { WORD_SUPERIORITY_PORT: DEF } = await import('../lib/experiment-runtime/ports.ts');
const { WS_WORD_PAIRS, WS_NONWORD_PAIRS } = await import('../lib/experiment-runtime/stimuli/word-superiority-pairs.ts');
const { buildTrials, isCorrect } = await import('../lib/experiment-runtime/trials.ts');

const main = buildTrials(DEF, {});
const practice = buildTrials(DEF, { practice: true });
const items = main.map(t => t.values.item);

const CONDITIONS = ['word', 'pseudoword', 'single-letter'];

/**
 * Where a pair differs — position 3 for all but two pseudoword pairs, which differ at the
 * last letter because ך is a final form. The port asks about wherever it actually is.
 */
function targetIndexOf(item) {
  const sheet = item.condition === 'pseudoword' ? WS_NONWORD_PAIRS : WS_WORD_PAIRS;
  const pair = sheet.find(p =>
    (p.letter1 === item.correctLetter && p.letter2 === item.foilLetter)
    || (p.letter2 === item.correctLetter && p.letter1 === item.foilLetter));
  const a = [...pair.word1], b = [...pair.word2];
  return a.findIndex((c, i) => c !== b[i]);
}

test('60 trials, twenty in each of the three conditions', () => {
  assert.equal(main.length, 60);
  for (const condition of CONDITIONS) {
    assert.equal(items.filter(i => i.condition === condition).length, 20, condition);
  }
});

test('a single-letter trial shows the target letter alone, blanks elsewhere', () => {
  for (const item of items.filter(i => i.condition === 'single-letter')) {
    const chars = [...item.stimulus];
    const idx = targetIndexOf(item);
    assert.equal(chars[idx], item.correctLetter);
    assert.ok(
      chars.every((c, i) => i === idx || c === '_'),
      `expected blanks around the target, got "${item.stimulus}"`,
    );
  }
});

test('the marked position is where the pair actually differs, final letters included', () => {
  for (const item of items) {
    const idx = targetIndexOf(item);
    const marks = item.shape.split(' ');
    assert.equal(marks[idx], '?', `"${item.shape}" marks the wrong position for ${item.stimulus}`);
    assert.equal(marks.filter(m => m === '?').length, 1);
  }
  // The two pairs ending in a final kaf are asked about at the last letter, not the third.
  const finalKaf = items.filter(i => i.correctLetter === 'ך' || i.foilLetter === 'ך');
  assert.ok(finalKaf.length > 0, 'expected the final-kaf pairs to be in the block');
  for (const item of finalKaf.filter(i => i.condition === 'pseudoword')) {
    assert.equal(targetIndexOf(item), 3, `${item.stimulus} should be asked about at the last letter`);
  }
});

test('a word trial shows a real word, and a pseudoword trial one from the nonword sheet', () => {
  const words = new Set(WS_WORD_PAIRS.flatMap(p => [p.word1, p.word2]));
  const nonwords = new Set(WS_NONWORD_PAIRS.flatMap(p => [p.word1, p.word2]));

  for (const item of items.filter(i => i.condition === 'word')) {
    assert.ok(words.has(item.stimulus), `"${item.stimulus}" is not on the word sheet`);
  }
  for (const item of items.filter(i => i.condition === 'pseudoword')) {
    assert.ok(nonwords.has(item.stimulus), `"${item.stimulus}" is not on the nonword sheet`);
  }
});

test('the correct letter really is the one standing at the asked-about position', () => {
  // Only the two readable conditions: a single-letter trial shows blanks by construction.
  for (const item of items.filter(i => i.condition !== 'single-letter')) {
    assert.equal([...item.stimulus][targetIndexOf(item)], item.correctLetter, item.stimulus);
    assert.notEqual(item.foilLetter, item.correctLetter);
  }
});

test('the mask is one # per letter', () => {
  for (const item of items) {
    assert.equal(item.mask, '#'.repeat([...item.stimulus].length));
    assert.ok(/^#+$/.test(item.mask));
  }
});

test('both letters of a pair are shown equally often, and each is the left button equally often', () => {
  for (const condition of CONDITIONS) {
    const cell = items.filter(i => i.condition === condition);
    // Ten trials show the first member of their pair, ten the second.
    const firstMember = cell.filter(i => {
      const sheet = condition === 'pseudoword' ? WS_NONWORD_PAIRS : WS_WORD_PAIRS;
      return sheet.some(p => p.letter1 === i.correctLetter && p.letter2 === i.foilLetter);
    }).length;
    assert.equal(firstMember, 10, `${condition}: expected ten trials showing the first member`);

    const correctOnLeft = cell.filter(i => i.optionA === i.correctLetter).length;
    assert.equal(correctOnLeft, 10, `${condition}: expected the correct letter left ten times`);
  }
});

test('the two buttons are always the correct letter and its foil', () => {
  for (const item of items) {
    assert.deepEqual(
      [item.optionA, item.optionB].sort(),
      [item.correctLetter, item.foilLetter].sort(),
    );
  }
});

test('answering with the letter that was there is correct, the foil is not', () => {
  const trial = main[0];
  assert.equal(isCorrect(DEF, trial, trial.values.item.correctLetter), true);
  assert.equal(isCorrect(DEF, trial, trial.values.item.foilLetter), false);
});

test('practice is six trials, two per condition, from pairs the main block never uses', () => {
  assert.equal(practice.length, 6);
  const byCondition = {};
  for (const t of practice) {
    byCondition[t.values.item.condition] = (byCondition[t.values.item.condition] ?? 0) + 1;
  }
  assert.deepEqual(byCondition, { word: 2, pseudoword: 2, 'single-letter': 2 });

  // The main block uses pairs 0-19; practice uses 20-23, so no stimulus is seen twice.
  const mainStimuli = new Set(items.map(i => i.stimulus));
  for (const t of practice.filter(t => t.values.item.condition !== 'single-letter')) {
    assert.ok(
      !mainStimuli.has(t.values.item.stimulus),
      `practice stimulus "${t.values.item.stimulus}" also appears in the main block`,
    );
  }
  assert.equal(DEF.practice.record, false);
});

test('the flash is 150ms, masked for 500ms, after a 500ms fixation', () => {
  const byName = Object.fromEntries(DEF.trial.phases.map(p => [p.name, p]));
  assert.equal(byName.fixation.durationMs, 500);
  assert.equal(byName.stimulus.durationMs, 150);
  assert.equal(byName.mask.durationMs, 500);
  assert.equal(byName.choice.awaitsResponse, true);
  assert.equal(byName.choice.startsClock, true);
  assert.equal(DEF.trial.itiMs, 300);
});
