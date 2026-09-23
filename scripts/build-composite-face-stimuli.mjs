// Regenerates lib/experiment-runtime/stimuli/composite-face-trials.ts.
//
//   node scripts/build-composite-face-stimuli.mjs
//
// The original picks three faces at random for every trial: one studied, one for the
// bottom half of the composite, and — on a "different" trial — a third for the top. A
// definition draws from pools rather than generating, so this pre-builds a BANK of such
// triples, one pool per cell of the design, and each participant samples from it.
//
// That keeps what the random draw was for: two people do not see the same forty faces, so
// nothing in the result can be a property of one particular face. It also lets the
// generator check what the original only assumed — that the top and bottom of a composite
// are never the same person, and that a "different" trial really does show someone new.

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SOURCE = join(process.cwd(), 'lib', 'composite-face', 'stimuli.ts');
const FACES_DIR = join(process.cwd(), 'public', 'faces');
const TARGET = join(process.cwd(), 'lib', 'experiment-runtime', 'stimuli', 'composite-face-trials.ts');

for (const path of [SOURCE, FACES_DIR]) {
  if (!existsSync(path)) {
    console.error(`Cannot find ${path}. Run this from the repository root.`);
    process.exit(1);
  }
}

const src = readFileSync(SOURCE, 'utf8');

const num = name => {
  const m = new RegExp(`export const ${name} = ([\\d.]+)`).exec(src);
  if (!m) throw new Error(`${name} is not exported from lib/composite-face/stimuli.ts`);
  return Number(m[1]);
};

const CUT_FRAC = num('CUT_FRAC');
const FACE_SIZE = num('FACE_SIZE');

/** The per-condition offsets, read from the original rather than restated. */
function readOffsets() {
  const start = src.indexOf('export const OFFSETS');
  if (start === -1) throw new Error('OFFSETS is not exported from lib/composite-face/stimuli.ts');
  const open = src.indexOf('{', src.indexOf('=', start));
  const close = src.indexOf('}', open);
  const body = src.slice(open + 1, close);
  const out = {};
  for (const line of body.split(',')) {
    const m = /'([^']+)'\s*:\s*([\d.]+)/.exec(line);
    if (m) out[m[1]] = Number(m[2]);
  }
  if (Object.keys(out).length !== 3) throw new Error(`Expected three conditions, found ${Object.keys(out).length}`);
  return out;
}

const OFFSETS = readOffsets();

// The faces actually on disk, so a pool can never name one that will 404 in front of a class.
const available = new Set(
  readdirSync(FACES_DIR).filter(f => f.endsWith('.jpg')).map(f => f.replace(/\.jpg$/, '')),
);

const PRACTICE_FACES = [1, 2, 3, 4].map(n => `c2_1_${n}`);
const MAIN_FACES = [
  ...Array.from({ length: 22 }, (_, i) => `c2_1_${i + 5}`),
  ...Array.from({ length: 26 }, (_, i) => `c2_2_${i + 1}`),
];

for (const [name, pool] of [['practice', PRACTICE_FACES], ['main', MAIN_FACES]]) {
  const missing = pool.filter(f => !available.has(f));
  if (missing.length) {
    throw new Error(`The ${name} pool names faces that are not in public/faces: ${missing.join(', ')}`);
  }
}
if (PRACTICE_FACES.some(f => MAIN_FACES.includes(f))) {
  throw new Error('A practice face is also a main face, so practice would preview the experiment.');
}

// Deterministic, so the file is stable between runs and a diff means a real change.
let seed = 20240917;
const rand = n => Math.floor((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648 * n);
const pick = pool => pool[rand(pool.length)];

function triple(pool, isSame) {
  const study = pick(pool);
  let bottom = pick(pool);
  while (bottom === study) bottom = pick(pool);

  let top;
  if (isSame) {
    top = study;
  } else {
    top = pick(pool);
    while (top === study || top === bottom) top = pick(pool);
  }
  return { study, top, bottom };
}

const CONDITIONS = Object.keys(OFFSETS);
/** How many candidates to bank per cell. Each participant samples a handful from each. */
const BANK = 40;

const url = id => `/faces/${id}.jpg`;
const q = s => `'${String(s).replace(/'/g, "\\'")}'`;

function cell(condition, isSame, pool, count) {
  const items = [];
  const seen = new Set();
  let guard = 0;
  while (items.length < count && guard++ < count * 200) {
    const t = triple(pool, isSame);
    const key = `${t.study}|${t.top}|${t.bottom}`;
    if (seen.has(key)) continue;
    seen.add(key);

    // The checks the original never made, and could not have: a composite whose halves are
    // the same person is not a composite, and a "different" trial showing the studied face
    // on top is a "same" trial wearing the wrong label.
    if (t.top === t.bottom) throw new Error('A composite would show one person in both halves');
    if (isSame && t.top !== t.study) throw new Error('A same trial does not show the studied face on top');
    if (!isSame && t.top === t.study) throw new Error('A different trial shows the studied face on top');

    items.push({ ...t, condition, isSame });
  }
  if (items.length < count) {
    throw new Error(`Could only build ${items.length} of ${count} distinct trials for ${condition}/${isSame}`);
  }
  return items;
}

const poolName = (condition, isSame) =>
  `${condition.replace(/-([a-z])/g, (_, c) => c.toUpperCase())}${isSame ? 'Same' : 'Diff'}`;

const pools = [];
for (const condition of CONDITIONS) {
  for (const isSame of [true, false]) {
    const banked = cell(condition, isSame, MAIN_FACES, BANK);
    pools.push([poolName(condition, isSame), banked]);
  }
}
// Practice draws from the four reserved faces, two per condition, one of each answer.
const practice = CONDITIONS.flatMap(condition => [
  cell(condition, true, PRACTICE_FACES, 1)[0],
  cell(condition, false, PRACTICE_FACES, 1)[0],
]);

const line = t => `  { study: ${q(url(t.study))}, top: ${q(url(t.top))}, bottom: ${q(url(t.bottom))}, `
  + `condition: ${q(t.condition)}, offset: ${OFFSETS[t.condition]}, isSame: ${t.isSame} },`;

const block = ([name, items]) =>
  `export const CF_${name.replace(/([A-Z])/g, '_$1').toUpperCase()}: CfTrial[] = [\n${items.map(line).join('\n')}\n];`;

const out = `// Composite-face trials, built from lib/composite-face/stimuli.ts.
//
// GENERATED by scripts/build-composite-face-stimuli.mjs — do not edit by hand.
//
// The original picks three faces at random per trial. A definition draws from pools, so
// this banks ${BANK} candidates for each cell of the design and lets each participant sample
// from them — which keeps what the random draw was for: no two people see the same forty
// faces, so nothing in the result is a property of one particular face.
//
// Every face named here was checked to exist in public/faces, the halves of a composite are
// never the same person, and a "different" trial never shows the studied face on top.

export interface CfTrial {
  study: string;
  top: string;
  bottom: string;
  condition: string;
  /** How far the lower half slides, as a fraction of the width. */
  offset: number;
  isSame: boolean;
}

${pools.map(block).join('\n\n')}

/** Six practice trials from four faces the main experiment never uses. */
export const CF_PRACTICE: CfTrial[] = [
${practice.map(line).join('\n')}
];

export const CF_CUT = ${CUT_FRAC};
export const CF_SIZE = ${FACE_SIZE};
`;

writeFileSync(TARGET, out, 'utf8');
console.log(
  `Wrote ${TARGET}\n  ${pools.length} banked cells x ${BANK}, plus ${practice.length} practice trials`,
);
