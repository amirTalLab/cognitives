// The bouba-kiki port against the hand-built experiment it replaces.
//
// Two kinds of trial share one shuffled block, and they ask different questions with
// different kinds of button. These pin the composition, the scoring of each kind, and that
// the shapes really are the outlines the original drew.
//
//   node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON prompt-tests/bouba-kiki-port.test.mjs

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

const { BOUBA_KIKI_PORT: DEF } = await import('../lib/experiment-runtime/ports.ts');
const { BK_ROUNDED, BK_SPIKY } = await import('../lib/experiment-runtime/stimuli/bouba-kiki-shapes.ts');
const { buildTrials, isCorrect } = await import('../lib/experiment-runtime/trials.ts');

const items = buildTrials(DEF, {}).map(t => t.values.item);
const main = items.filter(i => i.kind === 'main');
const control = items.filter(i => i.kind === 'control');

test('sixteen trials: twelve main and four control, shuffled together', () => {
  assert.equal(items.length, 16);
  assert.equal(main.length, 12);
  assert.equal(control.length, 4);
});

test('each of the four words appears three times', () => {
  const counts = {};
  for (const i of main) counts[i.word] = (counts[i.word] ?? 0) + 1;
  assert.deepEqual(counts, { BOUBA: 3, KIKI: 3, MALUMA: 3, TAKETE: 3 });
});

test('every main trial pairs one rounded shape against one spiky one', () => {
  const rounded = new Set(BK_ROUNDED.map(s => s.d));
  const spiky = new Set(BK_SPIKY.map(s => s.d));
  for (const i of main) {
    const sides = [i.leftD, i.rightD];
    assert.equal(sides.filter(d => rounded.has(d)).length, 1, `${i.word}: expected one rounded side`);
    assert.equal(sides.filter(d => spiky.has(d)).length, 1, `${i.word}: expected one spiky side`);
  }
});

test('the rounded shape is on the left exactly half the time', () => {
  const rounded = new Set(BK_ROUNDED.map(s => s.d));
  assert.equal(main.filter(i => rounded.has(i.leftD)).length, 6);
});

test('the expected answer is the side whose shape matches the word', () => {
  const rounded = new Set(BK_ROUNDED.map(s => s.d));
  for (const i of main) {
    const chosenD = i.expected === 'left' ? i.leftD : i.rightD;
    const chosenIsRounded = rounded.has(chosenD);
    assert.equal(
      chosenIsRounded,
      i.stimulusType === 'rounded',
      `${i.word} (${i.stimulusType}) should expect the ${i.stimulusType} side`,
    );
  }
});

test('control trials are two rounded and two spiky, answered with a word', () => {
  assert.equal(control.filter(i => i.stimulusType === 'rounded').length, 2);
  assert.equal(control.filter(i => i.stimulusType === 'spiky').length, 2);
  for (const i of control) {
    assert.equal(i.expected, i.stimulusType === 'rounded' ? 'bouba' : 'kiki');
    assert.equal(i.responseSet, 'words');
    // A control trial shows its shape; a main trial shows none above the buttons.
    assert.ok(i.shapeD.length > 0);
    assert.equal(i.shapeSize, 250);
  }
  for (const i of main) {
    assert.equal(i.responseSet, 'shapes');
    assert.equal(i.shapeSize, 0);
  }
});

test('each kind of trial is scored in its own vocabulary', () => {
  const trials = buildTrials(DEF, {});
  const mainTrial = trials.find(t => t.values.item.kind === 'main');
  const controlTrial = trials.find(t => t.values.item.kind === 'control');

  assert.equal(isCorrect(DEF, mainTrial, mainTrial.values.item.expected), true);
  assert.equal(isCorrect(DEF, mainTrial, mainTrial.values.item.expected === 'left' ? 'right' : 'left'), false);

  assert.equal(isCorrect(DEF, controlTrial, controlTrial.values.item.expected), true);
  assert.equal(isCorrect(DEF, controlTrial, controlTrial.values.item.expected === 'bouba' ? 'kiki' : 'bouba'), false);
});

test('the two response sets offer different kinds of option', () => {
  const { sets, by } = DEF.trial.response;
  assert.equal(by, 'item.responseSet');

  // Shapes are drawn; words are labelled, and in both languages.
  assert.deepEqual(sets.shapes.options.map(o => o.value), ['left', 'right']);
  assert.ok(sets.shapes.options.every(o => o.display?.kind === 'svgPath'));

  assert.deepEqual(sets.words.options.map(o => o.value), ['bouba', 'kiki']);
  assert.deepEqual(sets.words.options.map(o => o.labelHe), ['בובה', 'קיקי']);
  assert.ok(sets.words.options.every(o => o.display === undefined));
});

test('the shapes are the outlines the original drew, not approximations', () => {
  // Twelve distinct paths, six of each, all in the original 200x200 frame.
  assert.equal(BK_ROUNDED.length, 6);
  assert.equal(BK_SPIKY.length, 6);
  assert.equal(new Set([...BK_ROUNDED, ...BK_SPIKY].map(s => s.d)).size, 12);

  // A circle and an ellipse became arcs; the star polygons became line paths.
  assert.match(BK_ROUNDED.find(s => s.id === 'rounded_02.png').d, /^M 30 100 A 70 70 /);
  assert.match(BK_SPIKY.find(s => s.id === 'spiky_01.png').d, /^M 100 20 L 130 80 L 190 80 /);
  for (const s of [...BK_ROUNDED, ...BK_SPIKY]) {
    assert.match(s.d, /Z$/, `${s.id} should be a closed path`);
  }
});
