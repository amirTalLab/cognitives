import { TrialResult } from '@/types/brms-emotion';
import { IDENTITY_IDS } from './stimuli';

const NAMES = ['Noa', 'Yael', 'Tamar', 'Shira', 'Maya', 'Ori', 'Amit', 'Itai', 'Lior', 'Rotem', 'Omer', 'Talia', 'Dani', 'Gal', 'Yuval'];

const EMOTIONS = ['fearful', 'happy', 'neutral'] as const;
const ORIENTATIONS = ['upright', 'inverted'] as const;
const SIDES = ['left', 'right'] as const;

function seededRandom(seed: number) {
  let s = seed;
  return () => { s = (s * 16807 + 0) % 2147483647; return s / 2147483647; };
}

// Baseline BTs in ms per condition (based on typical bRMS findings)
const BASE_BT: Record<string, Record<string, number>> = {
  fearful:  { upright: 2800, inverted: 4200 },
  happy:    { upright: 3200, inverted: 4500 },
  neutral:  { upright: 3500, inverted: 4800 },
};

export function generateMockData(): TrialResult[] {
  const rows: TrialResult[] = [];

  for (let p = 0; p < NAMES.length; p++) {
    const rng = seededRandom(p * 1000 + 42);
    const sid = `mock-${p}-${NAMES[p].toLowerCase()}`;
    const name = NAMES[p];
    const speedBias = 0.7 + rng() * 0.6; // individual speed factor

    let trialIdx = 0;
    for (const emotion of EMOTIONS) {
      for (const orientation of ORIENTATIONS) {
        for (let t = 0; t < 18; t++) {
          const baseBT = BASE_BT[emotion][orientation] * speedBias;
          const noise = baseBT * (0.6 + rng() * 0.8);
          const rt = Math.round(noise);
          const side = SIDES[t % 2];
          const isCorrect = rng() > 0.06;
          const response = isCorrect ? side : (side === 'left' ? 'right' : 'left');
          const rescue = rt > 15000;

          rows.push({
            session_id: sid,
            participant_name: name,
            trial_index: trialIdx,
            emotion,
            orientation,
            identity_id: IDENTITY_IDS[t % IDENTITY_IDS.length],
            stimulus_set: 'real',
            side_shown: side,
            side_response: response,
            is_correct: isCorrect,
            reaction_time_ms: Math.min(rt, 15000),
            max_contrast: 70,
            rescue_triggered: rescue,
            timing_flag: false,
            is_practice: false,
          });
          trialIdx++;
        }
      }
    }
  }

  return rows;
}
