import { TrialResult } from '@/types/bouba-kiki-demo';

// Deterministic mock dataset for the teacher dashboard, so a lecturer can demo the
// bouba-kiki effect with no real participants. Reproduces the teaching result: the
// conventional mapping (rounded -> bouba) is chosen on roughly 95% of main trials, while
// control trials sit at chance.

const NAMES = ['Noa', 'Yael', 'Tamar', 'Shira', 'Maya', 'Ori', 'Amit', 'Itai',
  'Lior', 'Rotem', 'Omer', 'Talia', 'Dani', 'Gal', 'Yuval'];

function seededRandom(seed: number) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

export function generateMockData(): TrialResult[] {
  const rows: TrialResult[] = [];

  for (let p = 0; p < NAMES.length; p++) {
    const rng = seededRandom(p * 1000 + 71);
    const sid = 'mock-' + String(p) + '-' + NAMES[p].toLowerCase();
    const accBias = 0.88 + rng() * 0.10;   // individual strength of the mapping
    const speedBias = 0.9 + rng() * 0.3;   // individual speed factor

    for (let t = 0; t < 16; t++) {
      const isControl = t >= 12;
      const roundedLeft = t % 2 === 0;
      const conventional = isControl ? rng() < 0.5 : rng() < accBias;

      rows.push({
        session_id: sid,
        participant_name: NAMES[p],
        trial_index: t,
        left_shape: roundedLeft ? 'rounded' : 'spiky',
        right_shape: roundedLeft ? 'spiky' : 'rounded',
        chosen_shape: conventional ? 'rounded' : 'spiky',
        is_conventional: conventional,
        is_control: isControl,
        reaction_time_ms: Math.max(400, Math.round(1200 * speedBias + (rng() - 0.5) * 600)),
        is_practice: false,
      });
    }
  }

  return rows;
}
