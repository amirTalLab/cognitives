import { VisualSearchResult } from '@/types/visual-search';

// Deterministic mock dataset for the teacher dashboard, so a lecturer can
// demo/teach conjunction visual search with no real participants. Mirrors the
// real design (target/distractor set sizes 1/2/4/8, present/absent, blue/red
// target colour) and the stored visual_search_results row shape. Reproduces the
// teaching results:
//  - RT rises with both target and distractor set size (serial, capacity-limited).
//  - Target-absent trials are much slower than present (exhaustive vs self-terminating).
//  - Present-trial RT grows with the target's distance from fixation.
//  - A small target-colour (blue − red) difference.

const NAMES = ['Noa', 'Yael', 'Tamar', 'Shira', 'Maya', 'Ori', 'Amit', 'Itai',
  'Lior', 'Rotem', 'Omer', 'Talia', 'Dani', 'Gal', 'Yuval'];

const LEVELS = [1, 2, 4, 8];
const REPS = 2;

function seededRandom(seed: number) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

export function generateMockData(): (VisualSearchResult & { created_at: string })[] {
  const rows: (VisualSearchResult & { created_at: string })[] = [];

  for (let p = 0; p < NAMES.length; p++) {
    const rng = seededRandom(p * 1000 + 61);
    const sid = `mock-${p}-${NAMES[p].toLowerCase()}`;
    const name = NAMES[p];
    const speedBias = 0.9 + rng() * 0.25;               // individual speed factor
    const targetColor = p % 2 === 0 ? 'blue' : 'red';   // blocked target colour
    const colorPenalty = targetColor === 'blue' ? 30 : 0;
    let trial = 1;

    for (const Ts of LEVELS) {
      for (const Ds of LEVELS) {
        for (const present of [true, false]) {
          for (let rep = 0; rep < REPS; rep++) {
            const setCost = 20 * Ts + 25 * Ds; // serial search cost
            const distance = present ? Math.round(rng() * 350) : null;
            const distanceCost = present && distance != null ? distance * 0.3 : 0;
            // Absent trials require an exhaustive scan → ~1.8× the set-size cost.
            const rt = Math.round(
              (500 + (present ? setCost : setCost * 1.8) + colorPenalty + distanceCost) * speedBias
              + (rng() - 0.5) * 220,
            );
            const correct = rng() < (present ? 0.95 : 0.93);
            const response = correct
              ? (present ? 'present' : 'absent')
              : (present ? 'absent' : 'present');

            rows.push({
              session_id: sid, participant_name: name, trial_number: trial++,
              target_set_size: Ts, distractor_set_size: Ds,
              target_present: present, target_color: targetColor,
              response, correct, rt_ms: Math.max(250, rt),
              target_distance_from_center: distance,
              is_practice: false,
              created_at: '2026-01-01T00:00:00.000Z',
            });
          }
        }
      }
    }
  }

  return rows;
}
