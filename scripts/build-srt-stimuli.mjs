// Regenerates lib/experiment-runtime/stimuli/srt-sequences.ts from the hand-built experiment.
//
//   node scripts/build-srt-stimuli.mjs
//
// SRT is 648 trials built by a rule: a twelve-item sequence repeated nine times per block,
// each block starting at a different point in it, and block five secretly swapped to the
// OTHER sequence. That rule is the experiment, and a definition has pools rather than
// rules — so this applies the original's rule and writes out what it produces.
//
// Both counterbalancing groups are emitted, because half the class learns sequence A and
// half learns B: the reaction-time jump in block five has to be a property of the change,
// not of one particular sequence.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SOURCE = join(process.cwd(), 'lib', 'srt', 'stimuli.ts');
const TARGET = join(process.cwd(), 'lib', 'experiment-runtime', 'stimuli', 'srt-sequences.ts');

if (!existsSync(SOURCE)) {
  console.error(`Cannot find ${SOURCE}. Run this from the repository root.`);
  process.exit(1);
}

const src = readFileSync(SOURCE, 'utf8');

/** Reads one `export const NAME = [ ... ];` numeric array out of the source. */
function readArray(name) {
  const start = src.indexOf(`export const ${name}`);
  if (start === -1) throw new Error(`${name} is not exported from lib/srt/stimuli.ts`);
  const open = src.indexOf('[', src.indexOf('=', start));
  const close = src.indexOf(']', open);
  const text = src.slice(open, close + 1);
  if (!/^\[[\d,\s]+\]$/.test(text)) throw new Error(`${name} is not a plain list of numbers`);
  return JSON.parse(text);
}

/** Reads a `const NAME = [...]` that is not exported — the block start positions. */
function readLocal(name) {
  const start = src.indexOf(`const ${name}`);
  if (start === -1) throw new Error(`${name} is not declared in lib/srt/stimuli.ts`);
  const open = src.indexOf('[', src.indexOf('=', start));
  const close = src.indexOf(']', open);
  return JSON.parse(src.slice(open, close + 1));
}

const SEQUENCE_A = readArray('SEQUENCE_A');
const SEQUENCE_B = readArray('SEQUENCE_B');
const STARTS = readLocal('BLOCK_START_POSITIONS');

const number = name => {
  const m = new RegExp(`export const ${name} = ([\\d_]+)`).exec(src);
  if (!m) throw new Error(`${name} is not exported from lib/srt/stimuli.ts`);
  return Number(m[1].replace(/_/g, ''));
};

const BLOCKS = number('BLOCKS');
const TRIALS_PER_BLOCK = number('TRIALS_PER_BLOCK');
const MAX_RT_MS = number('MAX_RT_MS');

// Every check here is a difference from the original that would otherwise be invisible.
if (SEQUENCE_A.length !== 12 || SEQUENCE_B.length !== 12) {
  throw new Error('Both sequences must be twelve items; the block offsets assume it.');
}
if (STARTS.length !== BLOCKS) {
  throw new Error(`There are ${BLOCKS} blocks but ${STARTS.length} start positions.`);
}
if (TRIALS_PER_BLOCK % SEQUENCE_A.length !== 0) {
  throw new Error(`${TRIALS_PER_BLOCK} trials is not a whole number of twelve-item sequences.`);
}
for (const [name, seq] of [['A', SEQUENCE_A], ['B', SEQUENCE_B]]) {
  if (seq.some(loc => loc < 1 || loc > 4)) throw new Error(`Sequence ${name} names a location outside 1-4`);
  const counts = [1, 2, 3, 4].map(loc => seq.filter(x => x === loc).length);
  if (new Set(counts).size !== 1) {
    throw new Error(`Sequence ${name} does not use the four locations equally (${counts.join(', ')}), so location frequency would be confounded with sequence.`);
  }
}
if (SEQUENCE_A.join() === SEQUENCE_B.join()) {
  throw new Error('The two sequences are identical, so block five would not be an interference block.');
}

/** 1=down, 2=left, 3=right, 4=up — and where each sits on screen, from app/srt/experiment. */
const AT = { 1: 'bottom', 2: 'left', 3: 'right', 4: 'top' };
const LABEL = { 1: 'down', 2: 'left', 3: 'right', 4: 'up' };

const INTERFERENCE_BLOCK = 5;

/** The twelve items a block presents, in order, starting where that block starts. */
function blockSequence(block, mainSeq, interferenceSeq) {
  const isInterference = block === INTERFERENCE_BLOCK;
  const seq = isInterference ? interferenceSeq : mainSeq;
  const start = STARTS[block - 1];
  return Array.from({ length: seq.length }, (_, t) => {
    const position = (start + t) % seq.length;
    return {
      location: seq[position],
      at: AT[seq[position]],
      sequencePosition: position,
      block,
      sequenceType: isInterference ? 'interference' : 'main',
    };
  });
}

const q = s => `'${String(s).replace(/'/g, "\\'")}'`;
const item = i => `{ location: ${i.location}, at: ${q(i.at)}, sequencePosition: ${i.sequencePosition}, `
  + `block: ${i.block}, sequenceType: ${q(i.sequenceType)} }`;

function groupFor(mainIsA) {
  const mainSeq = mainIsA ? SEQUENCE_A : SEQUENCE_B;
  const interferenceSeq = mainIsA ? SEQUENCE_B : SEQUENCE_A;
  const blocks = Array.from({ length: BLOCKS }, (_, i) =>
    `    block${i + 1}: [\n${blockSequence(i + 1, mainSeq, interferenceSeq).map(x => `      ${item(x)},`).join('\n')}\n    ],`,
  ).join('\n');

  // The generation test primes with the LAST TWO items of the main sequence and then asks
  // for the whole of it, from position one.
  const primes = [mainSeq[10], mainSeq[11]].map((loc, i) =>
    `      { location: ${loc}, at: ${q(AT[loc])}, primeStep: ${i + 1} },`).join('\n');
  const probes = mainSeq.map((loc, i) =>
    `      { answer: ${loc}, at: ${q(AT[loc])}, label: ${q(LABEL[loc])}, sequencePosition: ${i + 1} },`).join('\n');

  return `  {
    label: ${q(mainIsA ? 'A' : 'B')},
    mainIsA: ${mainIsA},
${blocks}
    primes: [
${primes}
    ],
    generation: [
${probes}
    ],
  },`;
}

const out = `// SRT sequences, produced from lib/srt/stimuli.ts by applying its own rule.
//
// GENERATED by scripts/build-srt-stimuli.mjs — do not edit by hand.
//
// The original builds ${BLOCKS * TRIALS_PER_BLOCK} trials from a rule: a twelve-item sequence repeated
// ${TRIALS_PER_BLOCK / SEQUENCE_A.length} times per block, each block starting at a different point in it, and block
// ${INTERFERENCE_BLOCK} swapped to the OTHER sequence without telling the participant. A definition holds
// pools rather than rules, so the rule is applied here and its result written out.
//
// One entry per counterbalancing group: half the class learns sequence A and half learns
// B, so that the reaction-time jump in block ${INTERFERENCE_BLOCK} is a property of the change rather
// than of one particular sequence.
//
// Locations are 1=down, 2=left, 3=right, 4=up, laid out in a diamond.

export interface SrtItem {
  location: number;
  at: string;
  sequencePosition: number;
  block: number;
  sequenceType: string;
}

export interface SrtGroup {
  label: string;
  mainIsA: boolean;
  block1: SrtItem[]; block2: SrtItem[]; block3: SrtItem[];
  block4: SrtItem[]; block5: SrtItem[]; block6: SrtItem[];
  primes: { location: number; at: string; primeStep: number }[];
  generation: { answer: number; at: string; label: string; sequencePosition: number }[];
}

export const SRT_GROUPS: SrtGroup[] = [
${groupFor(true)}
${groupFor(false)}
];

export const SRT_BLOCKS = ${BLOCKS};
export const SRT_REPS_PER_BLOCK = ${TRIALS_PER_BLOCK / SEQUENCE_A.length};
export const SRT_MAX_RT_MS = ${MAX_RT_MS};
export const SRT_INTERFERENCE_BLOCK = ${INTERFERENCE_BLOCK};
`;

writeFileSync(TARGET, out, 'utf8');
console.log(
  `Wrote ${TARGET}\n  2 groups x ${BLOCKS} blocks x 12 items, repeated ${TRIALS_PER_BLOCK / SEQUENCE_A.length}x = ${BLOCKS * TRIALS_PER_BLOCK} trials each`,
);
