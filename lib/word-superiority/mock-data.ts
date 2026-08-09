import { TrialResult } from '@/types/word-superiority';

// Deterministic mock dataset for the teacher dashboard, so a lecturer can
// demo/teach the word-superiority effect (Reicher–Wheeler) with no real
// participants. Mirrors the real design (word / pseudoword / single-letter
// forced-choice letter identification after a brief masked flash) and the stored
// word_superiority_results row shape. Reproduces the teaching result: a target
// letter is identified more accurately inside a WORD than inside a pseudoword or
// alone — top-down lexical support aids perception.

const NAMES = ['Noa', 'Yael', 'Tamar', 'Shira', 'Maya', 'Ori', 'Amit', 'Itai',
  'Lior', 'Rotem', 'Omer', 'Talia', 'Dani', 'Gal', 'Yuval'];

const CONDITIONS: { name: 'word' | 'pseudoword' | 'single-letter'; acc: number; rt: number; sample: string[] }[] = [
  { name: 'word', acc: 0.85, rt: 650, sample: ['CARE', 'WORD', 'MIND', 'PLAY', 'FISH'] },
  { name: 'pseudoword', acc: 0.75, rt: 700, sample: ['CARL', 'MORD', 'BINT', 'PLAF', 'FISK'] },
  { name: 'single-letter', acc: 0.68, rt: 720, sample: ['E', 'R', 'D', 'A', 'K'] },
];

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const TRIALS_PER_CONDITION = 24;

function seededRandom(seed: number) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

export function generateMockData(): TrialResult[] {
  const rows: TrialResult[] = [];

  for (let p = 0; p < NAMES.length; p++) {
    const rng = seededRandom(p * 1000 + 67);
    const sid = `mock-${p}-${NAMES[p].toLowerCase()}`;
    const name = NAMES[p];
    const skill = (rng() - 0.5) * 0.12;   // individual accuracy offset
    const speedBias = 0.9 + rng() * 0.25; // individual speed factor
    let idx = 0;

    for (const cond of CONDITIONS) {
      for (let i = 0; i < TRIALS_PER_CONDITION; i++) {
        const correct = rng() < Math.min(0.98, cond.acc + skill);
        const correctLetter = LETTERS[Math.floor(rng() * 26)];
        let foil = LETTERS[Math.floor(rng() * 26)];
        if (foil === correctLetter) foil = LETTERS[(LETTERS.indexOf(correctLetter) + 1) % 26];
        const responseLetter = correct ? correctLetter : foil;
        const rt = Math.max(250, Math.round(cond.rt * speedBias + (rng() - 0.5) * 260));

        rows.push({
          session_id: sid,
          participant_name: name,
          trial_index: idx++,
          condition: cond.name,
          stimulus: cond.sample[i % cond.sample.length],
          correct_letter: correctLetter,
          response_letter: responseLetter,
          is_correct: correct,
          reaction_time_ms: rt,
          is_practice: false,
        });
      }
    }
  }

  return rows;
}
