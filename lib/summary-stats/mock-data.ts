import { EnsembleResult, RecognitionResult, TrialResult, ProbeType } from '@/types/summary-stats';
import { SET_SIZES, VALUE_RANGES } from '@/lib/summary-stats/stimuli';

// Deterministic mock dataset for the teacher dashboard, so a lecturer can
// demo/teach ensemble (summary-statistics) perception with no real participants.
// Mirrors the real design (ensemble mean-assessment + member-recognition trials,
// stimulus types circles/line-lengths, set sizes 3/5/7) and the stored
// summary_stats_results row shapes. Reproduces the teaching results:
//  - Ensemble (mean) accuracy stays robust as set size grows — averaging is cheap.
//  - Recognition (member) accuracy falls with set size — items aren't individually stored.
//  - The "foil-mean" probe is falsely recognised (people "see" the never-shown mean),
//    while target and foil-non-mean probes are handled well.

const NAMES = ['Noa', 'Yael', 'Tamar', 'Shira', 'Maya', 'Ori', 'Amit', 'Itai',
  'Lior', 'Rotem', 'Omer', 'Talia', 'Dani', 'Gal', 'Yuval'];

const STIM_TYPES = ['circles', 'line-lengths'] as const;
const PROBE_TYPES: ProbeType[] = ['target', 'foil-mean', 'foil-non-mean'];

// Hit rate by set size (index 0→ss3, 1→ss5, 2→ss7).
const ENS_HIT = [0.78, 0.73, 0.70];                       // ensemble: robust
const REC_HIT: Record<ProbeType, number[]> = {
  target: [0.85, 0.75, 0.68],
  'foil-non-mean': [0.88, 0.80, 0.72],
  'foil-mean': [0.55, 0.48, 0.42],                        // the ensemble illusion
};

const ENS_PER_CELL = 6;   // ensemble trials per (type × set size)
const REC_PER_CELL = 4;   // recognition trials per (type × set size × probe)

function seededRandom(seed: number) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

export function generateMockData(): TrialResult[] {
  const rows: TrialResult[] = [];

  for (let p = 0; p < NAMES.length; p++) {
    const rng = seededRandom(p * 1000 + 47);
    const sid = `mock-${p}-${NAMES[p].toLowerCase()}`;
    const name = NAMES[p];
    const skill = (rng() - 0.5) * 0.1; // individual accuracy offset
    let trial = 1;

    for (const type of STIM_TYPES) {
      const { min, max } = VALUE_RANGES[type];
      const threshold = (max - min) / 4; // 15 (circles) / 40 (lines)
      const trueValue = (min + max) / 2;

      SET_SIZES.forEach((sz, szIdx) => {
        // ── Ensemble (mean assessment) trials ──
        for (let i = 0; i < ENS_PER_CELL; i++) {
          const hit = rng() < Math.min(0.97, ENS_HIT[szIdx] + skill);
          // Draw an absolute error consistent with the intended hit rate.
          const absErr = hit ? rng() * threshold : threshold + rng() * threshold * 2;
          const signed = (rng() < 0.5 ? -1 : 1) * absErr;
          const ens: EnsembleResult = {
            session_id: sid, participant_name: name,
            trial_type: 'ensemble', trial_number: trial++,
            stimulus_type: type, stat_type: 'mean', n_items: sz,
            true_value: Math.round(trueValue),
            response_value: Math.round(trueValue + signed),
            signed_error: Math.round(signed),
            absolute_error: Math.round(absErr),
            reaction_time_ms: Math.max(400, Math.round(1600 + (rng() - 0.5) * 700)),
            is_practice: false,
          };
          rows.push(ens);
        }

        // ── Recognition (member) trials, split by probe type ──
        for (const probe of PROBE_TYPES) {
          for (let i = 0; i < REC_PER_CELL; i++) {
            const correct = rng() < Math.min(0.97, REC_HIT[probe][szIdx] + skill);
            const isTarget = probe === 'target';
            // response_yes: correct target → yes; correct foil → no; errors flip.
            const responseYes = isTarget ? correct : !correct;
            const rec: RecognitionResult = {
              session_id: sid, participant_name: name,
              trial_type: 'recognition', trial_number: trial++,
              stimulus_type: type, n_items: sz,
              probe_value: Math.round(min + rng() * (max - min)),
              probe_is_target: isTarget,
              probe_type: probe,
              response_yes: responseYes,
              is_correct: correct,
              reaction_time_ms: Math.max(400, Math.round(1300 + (rng() - 0.5) * 600)),
            };
            rows.push(rec);
          }
        }
      });
    }
  }

  return rows;
}
