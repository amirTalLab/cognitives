import { TrialResult } from '@/types/composite-face';

// Deterministic mock dataset for the teacher dashboard, so a lecturer can
// demo/teach the composite-face effect with no real participants. Mirrors the
// real design (aligned / small-misaligned / large-misaligned conditions) and the
// stored composite_face_results row shape. Reproduces the teaching result: the
// ALIGNED condition is harder (lower accuracy, slower RT) because the irrelevant
// bottom half fuses holistically with the top; misalignment releases the top
// half for independent judgement.

const NAMES = ['Noa', 'Yael', 'Tamar', 'Shira', 'Maya', 'Ori', 'Amit', 'Itai',
  'Lior', 'Rotem', 'Omer', 'Talia', 'Dani', 'Gal', 'Yuval'];

const CONDITIONS: { name: 'aligned' | 'small-misaligned' | 'large-misaligned'; acc: number; rt: number }[] = [
  { name: 'aligned', acc: 0.70, rt: 950 },
  { name: 'small-misaligned', acc: 0.83, rt: 840 },
  { name: 'large-misaligned', acc: 0.88, rt: 810 },
];

const TRIALS_PER_CONDITION = 20;

function seededRandom(seed: number) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

export function generateMockData(): TrialResult[] {
  const rows: TrialResult[] = [];

  for (let p = 0; p < NAMES.length; p++) {
    const rng = seededRandom(p * 1000 + 43);
    const sid = `mock-${p}-${NAMES[p].toLowerCase()}`;
    const name = NAMES[p];
    const skill = (rng() - 0.5) * 0.1;   // individual accuracy offset
    const speedBias = 0.9 + rng() * 0.25; // individual speed factor
    let trialIndex = 0;

    for (const cond of CONDITIONS) {
      for (let i = 0; i < TRIALS_PER_CONDITION; i++) {
        const isSame = rng() < 0.5;
        const correct = rng() < Math.min(0.98, cond.acc + skill);
        const response: 'same' | 'different' = correct
          ? (isSame ? 'same' : 'different')
          : (isSame ? 'different' : 'same');
        const rt = Math.max(300, Math.round(cond.rt * speedBias + (rng() - 0.5) * 350));

        rows.push({
          session_id: sid,
          participant_name: name,
          trial_index: trialIndex++,
          condition: cond.name,
          is_same: isSame,
          response,
          is_correct: correct,
          reaction_time_ms: rt,
          study_face: `/CompositeFace/faces/study_${(i % 8) + 1}.png`,
          test_top_face: `/CompositeFace/faces/top_${(i % 8) + 1}.png`,
          test_bottom_face: `/CompositeFace/faces/bottom_${(i % 8) + 1}.png`,
          is_practice: false,
        });
      }
    }
  }

  return rows;
}
