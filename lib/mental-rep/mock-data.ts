import { TrialResult, ScanningTrialResult, RotationTrialResult } from '@/types/mental-rep';
import { LANDMARKS, calculateDistance } from './scanning';

// Deterministic mock dataset for the teacher dashboard, so a lecturer can
// demo/teach the two classic mental-imagery effects with no real participants:
//  - Mental scanning (Kosslyn): RT increases with map distance.
//  - Mental rotation (Shepard & Metzler): RT increases with angular difference.
// Mirrors the real design (21 scanning + 40 rotation trials) and the combined
// mental_rep_results row shape, so both aggregate charts render as they would live.

const NAMES = ['Noa', 'Yael', 'Tamar', 'Shira', 'Maya', 'Ori', 'Amit', 'Itai',
  'Lior', 'Rotem', 'Omer', 'Talia', 'Dani', 'Gal', 'Yuval'];

const ROTATION_DIFFS = [0, 60, 120, 180];

function seededRandom(seed: number) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

function shuffleSeeded<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** All ordered landmark pairs with their Euclidean distance. */
function landmarkPairs() {
  const pairs: { from: string; to: string; distance: number }[] = [];
  for (let i = 0; i < LANDMARKS.length; i++) {
    for (let j = 0; j < LANDMARKS.length; j++) {
      if (i !== j) {
        pairs.push({
          from: LANDMARKS[i].name,
          to: LANDMARKS[j].name,
          distance: calculateDistance(LANDMARKS[i], LANDMARKS[j]),
        });
      }
    }
  }
  return pairs;
}

export function generateMockData(): TrialResult[] {
  const rows: TrialResult[] = [];

  const allPairs = landmarkPairs().sort((a, b) => a.distance - b.distance);
  const tercile = Math.floor(allPairs.length / 3);
  const short = allPairs.slice(0, tercile);
  const medium = allPairs.slice(tercile, tercile * 2);
  const long = allPairs.slice(tercile * 2);

  for (let p = 0; p < NAMES.length; p++) {
    const rng = seededRandom(p * 1000 + 29);
    const sid = `mock-${p}-${NAMES[p].toLowerCase()}`;
    const name = NAMES[p];
    const speedBias = 0.85 + rng() * 0.35; // individual overall speed factor

    // ── Mental scanning: 21 trials (7 per distance tercile) ───────────────────
    const chosen = [
      ...shuffleSeeded(short, rng).slice(0, 7),
      ...shuffleSeeded(medium, rng).slice(0, 7),
      ...shuffleSeeded(long, rng).slice(0, 7),
    ];
    shuffleSeeded(chosen, rng).forEach((pair, i) => {
      // Kosslyn: RT ~ base + slope * distance.
      const rt = Math.round((700 + 20 * pair.distance) * speedBias + (rng() - 0.5) * 220);
      const row: ScanningTrialResult = {
        session_id: sid, participant_name: name,
        experiment_type: 'scanning', trial_number: i + 1,
        from_landmark: pair.from, to_landmark: pair.to,
        distance: pair.distance, found_target: true,
        reaction_time_ms: Math.max(400, rt),
      };
      rows.push(row);
    });

    // ── Mental rotation: 40 main trials (5 same + 5 diff per angle) ────────────
    let rt = 1;
    for (const diff of ROTATION_DIFFS) {
      for (const isSame of [true, false]) {
        for (let k = 0; k < 5; k++) {
          // Shepard & Metzler: RT ~ base + slope * angle; accuracy falls with angle.
          const reaction = Math.round((760 + 8 * diff) * speedBias + (rng() - 0.5) * 300);
          const pCorrect = 0.97 - 0.0009 * diff;
          const isCorrect = rng() < pCorrect;
          const response: 'same' | 'different' = isCorrect
            ? (isSame ? 'same' : 'different')
            : (isSame ? 'different' : 'same');
          const row: RotationTrialResult = {
            session_id: sid, participant_name: name,
            experiment_type: 'rotation', trial_number: rt++,
            figure_id: `figure_${(rt % 8) + 1}`,
            left_angle: 0, right_angle: diff,
            is_same: isSame, rotation_difference: diff,
            response, is_correct: isCorrect,
            reaction_time_ms: Math.max(400, reaction),
            is_practice: false,
          };
          rows.push(row);
        }
      }
    }
  }

  return rows;
}
