import { TwoStepTrialResult } from '@/types/two-step-task';

// Deterministic mock dataset for the teacher dashboard, so a lecturer can
// demo/teach the Daw two-step task with no real participants. Simulates a hybrid
// agent per participant (a mix of model-free and model-based control) so the
// classic teaching results emerge from the stored two_step_results rows:
//  - Stay probability shows BOTH a reward main effect (model-free) AND a
//    reward × transition interaction (model-based).
//  - Per-participant MB/MF indices spread out for the scatter/correlation plots.
//  - Stage-2 reward probabilities drift as bounded random walks.

const NAMES = ['Noa', 'Yael', 'Tamar', 'Shira', 'Maya', 'Ori', 'Amit', 'Itai',
  'Lior', 'Rotem', 'Omer', 'Talia', 'Dani', 'Gal', 'Yuval'];

const N_TRIALS = 150;
const COMMON_P = 0.7;

function seededRandom(seed: number) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

function clamp(x: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, x)); }

export function generateMockData(): (TwoStepTrialResult & { created_at: string })[] {
  const rows: (TwoStepTrialResult & { created_at: string })[] = [];

  for (let p = 0; p < NAMES.length; p++) {
    const rng = seededRandom(p * 1000 + 59);
    const sid = `mock-${p}-${NAMES[p].toLowerCase()}`;
    const name = NAMES[p];
    const base = 0.6;
    const mf = 0.05 + rng() * 0.20; // individual model-free weight
    const mb = 0.05 + rng() * 0.25; // individual model-based weight
    const rtBase = 700 + mb * 600 + rng() * 200; // more model-based → slower

    // Four drifting Stage-2 reward probabilities: [A-left, A-right, B-left, B-right]
    const walk = [0.3 + rng() * 0.4, 0.3 + rng() * 0.4, 0.3 + rng() * 0.4, 0.3 + rng() * 0.4];

    let prevChoice: 'left' | 'right' = rng() < 0.5 ? 'left' : 'right';
    let prevRewarded = false;
    let prevCommon = true;

    for (let t = 0; t < N_TRIALS; t++) {
      // Stage 1 choice: stay/switch based on the PREVIOUS trial's outcome.
      let choice: 'left' | 'right';
      if (t === 0) {
        choice = rng() < 0.5 ? 'left' : 'right';
      } else {
        const rewSign = prevRewarded ? 1 : -1;
        const comSign = prevCommon ? 1 : -1;
        const pStay = clamp(base + (mf / 2) * rewSign + (mb / 2) * rewSign * comSign, 0.05, 0.95);
        choice = rng() < pStay ? prevChoice : (prevChoice === 'left' ? 'right' : 'left');
      }

      // Transition: left→A / right→B are the common outcomes.
      const common = rng() < COMMON_P;
      const state: 'A' | 'B' = (choice === 'left') === common ? 'A' : 'B';
      const idx = state === 'A' ? 0 : 2;
      const leftProb = walk[idx], rightProb = walk[idx + 1];
      // Stage 2: tend to pick the currently better option.
      const s2choice: 'left' | 'right' = rng() < (leftProb > rightProb ? 0.68 : 0.32) ? 'left' : 'right';
      const rewProb = s2choice === 'left' ? leftProb : rightProb;
      const rewarded = rng() < rewProb;

      rows.push({
        session_id: sid, participant_name: name,
        trial_index: t, is_practice: false,
        stage1_choice: choice, stage1_stimulus: choice === 'left' ? 'ship_green' : 'ship_purple',
        stage1_rt_ms: Math.round(rtBase + (rng() - 0.5) * 300),
        transition_type: common ? 'common' : 'rare',
        stage2_state: state,
        stage2_choice: s2choice, stage2_stimulus: `${state}_${s2choice}`,
        stage2_rt_ms: Math.round(rtBase * 0.9 + (rng() - 0.5) * 300),
        rewarded,
        reward_prob_s2a_left: Math.round(walk[0] * 100) / 100,
        reward_prob_s2a_right: Math.round(walk[1] * 100) / 100,
        reward_prob_s2b_left: Math.round(walk[2] * 100) / 100,
        reward_prob_s2b_right: Math.round(walk[3] * 100) / 100,
        missed_stage1: false, missed_stage2: false,
        created_at: '2026-01-01T00:00:00.000Z',
      });

      // Drift the reward probabilities (bounded Gaussian-ish walk).
      for (let k = 0; k < 4; k++) {
        walk[k] = clamp(walk[k] + (rng() - 0.5) * 0.06, 0.25, 0.75);
      }
      prevChoice = choice;
      prevRewarded = rewarded;
      prevCommon = common;
    }
  }

  return rows;
}
