import { PosnerResult } from '@/types/posner-cueing';

// Deterministic mock dataset for the teacher dashboard, so a lecturer can
// demo/teach Posner spatial cueing with no real participants. Mirrors the real
// design and the stored posner_results row shape. Reproduces the three teaching
// results: valid < invalid RT (the validity effect), exogenous (misleading
// peripheral cue) slowest, and exogenous RT declining over time (adaptation).

const NAMES = ['Noa', 'Yael', 'Tamar', 'Shira', 'Maya', 'Ori', 'Amit', 'Itai',
  'Lior', 'Rotem', 'Omer', 'Talia', 'Dani', 'Gal', 'Yuval'];

function seededRandom(seed: number) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

const N_VALID = 40;
const N_INVALID = 16;
const N_EXO = 20;
const N_CATCH = 8;

export function generateMockData(): PosnerResult[] {
  const rows: PosnerResult[] = [];

  for (let p = 0; p < NAMES.length; p++) {
    const rng = seededRandom(p * 1000 + 31);
    const sid = `mock-${p}-${NAMES[p].toLowerCase()}`;
    const name = NAMES[p];
    const bias = 0.9 + rng() * 0.25; // individual overall speed factor
    let trial = 1;

    const side = (): 'left' | 'right' => (rng() < 0.5 ? 'left' : 'right');
    const soa = (): number => (rng() < 0.5 ? 300 : 500);

    const push = (
      validity: string, cue: 'left' | 'right', target: string,
      rtBase: number, hit: boolean,
    ) => {
      const rt = hit ? Math.max(180, Math.round(rtBase * bias + (rng() - 0.5) * 90)) : null;
      rows.push({
        session_id: sid, participant_name: name, trial_number: trial++,
        cue_direction: cue, target_side: target, validity, soa: soa(),
        response: hit ? 'hit' : 'miss', correct: hit, rt_ms: rt, is_practice: false,
      });
    };

    // Valid: target on the cued side — fastest.
    for (let i = 0; i < N_VALID; i++) {
      const cue = side();
      push('valid', cue, cue, 330, rng() < 0.97);
    }
    // Invalid: target opposite the cue — the validity cost (~+45 ms).
    for (let i = 0; i < N_INVALID; i++) {
      const cue = side();
      push('invalid', cue, cue === 'left' ? 'right' : 'left', 375, rng() < 0.95);
    }
    // Exogenous invalid: misleading peripheral cue — slowest, and RT declines
    // across the block as the participant learns to ignore it (adaptation).
    for (let i = 0; i < N_EXO; i++) {
      const cue = side();
      push('exo_invalid', cue, cue === 'left' ? 'right' : 'left', 405 - i * 2, rng() < 0.94);
    }
    // Catch trials: no target — correct rejection, no RT (ignored by dashboard).
    for (let i = 0; i < N_CATCH; i++) {
      const cue = side();
      rows.push({
        session_id: sid, participant_name: name, trial_number: trial++,
        cue_direction: cue, target_side: 'none', validity: 'catch', soa: soa(),
        response: 'correct_rejection', correct: rng() < 0.9, rt_ms: null, is_practice: false,
      });
    }
  }

  return rows;
}
