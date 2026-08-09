import { RecallResponse, DistractorResult } from '@/types/serial-order';

// Deterministic mock dataset for the teacher dashboard, so a lecturer can
// demo/teach serial-order memory with no real participants. Mirrors both stored
// tables (serial_order_recall + serial_order_distractor) and reproduces the
// three teaching results:
//  - Serial position curve: primacy + recency (recency stronger for immediate S2).
//  - Temporal contiguity: recall output order favours adjacent positions (lag ±1),
//    with a forward asymmetry — which drives the lag / lag-CRP figures.
//  - An arithmetic distractor task between the two recall sessions.

const NAMES = ['Noa', 'Yael', 'Tamar', 'Shira', 'Maya', 'Ori', 'Amit', 'Itai',
  'Lior', 'Rotem', 'Omer', 'Talia', 'Dani', 'Gal', 'Yuval'];

const WORDS = ['river', 'candle', 'planet', 'guitar', 'basket', 'window', 'tiger',
  'pepper', 'anchor', 'ladder', 'monkey', 'pillow', 'rocket', 'garden', 'button',
  'castle', 'yellow', 'forest', 'silver', 'bridge'];

// P(recall) by serial position (1–20). Immediate recall (S2) shows strong
// recency; delayed recall (S1) shows reduced recency, similar primacy.
const P_S2 = [0.82, 0.78, 0.70, 0.62, 0.52, 0.45, 0.40, 0.38, 0.36, 0.35,
  0.35, 0.37, 0.40, 0.45, 0.55, 0.68, 0.80, 0.86, 0.90, 0.92];
const P_S1 = [0.78, 0.72, 0.64, 0.56, 0.46, 0.40, 0.36, 0.34, 0.33, 0.32,
  0.33, 0.35, 0.36, 0.38, 0.42, 0.48, 0.52, 0.55, 0.58, 0.60];

const ISO = '2026-01-01T00:00:00.000Z';

function seededRandom(seed: number) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

function weightedPick(weights: number[], rng: () => number): number {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < weights.length; i++) { r -= weights[i]; if (r <= 0) return i; }
  return weights.length - 1;
}

/** Order recalled positions to reproduce temporal contiguity (lag ±1 favoured,
 *  forward asymmetry), starting near recency. */
function orderByContiguity(positions: number[], rng: () => number): number[] {
  const remaining = [...positions];
  const order: number[] = [];
  // Start biased toward recency (later positions).
  let idx = weightedPick(remaining.map(pos => pos * pos), rng);
  let current = remaining.splice(idx, 1)[0];
  order.push(current);
  while (remaining.length) {
    const weights = remaining.map(pos => {
      const lag = pos - current;
      const dist = Math.abs(lag);
      let w = 1 / (dist * dist);      // strong preference for adjacent
      if (lag > 0) w *= 1.4;           // forward asymmetry
      return w;
    });
    idx = weightedPick(weights, rng);
    current = remaining.splice(idx, 1)[0];
    order.push(current);
  }
  return order;
}

interface MockSerialOrder {
  recalls: RecallResponse[];
  distractor: DistractorResult[];
}

export function generateMockData(): MockSerialOrder {
  const recalls: RecallResponse[] = [];
  const distractor: DistractorResult[] = [];

  for (let p = 0; p < NAMES.length; p++) {
    const rng = seededRandom(p * 1000 + 37);
    const sid = `mock-${p}-${NAMES[p].toLowerCase()}`;
    const name = NAMES[p];
    const bias = 0.9 + rng() * 0.2; // individual overall memory strength

    for (const sessionNum of [1, 2] as const) {
      const pCurve = sessionNum === 2 ? P_S2 : P_S1;
      // Sample which positions get recalled.
      const recalledPositions: number[] = [];
      for (let pos = 1; pos <= 20; pos++) {
        if (rng() < Math.min(0.98, pCurve[pos - 1] * bias)) recalledPositions.push(pos);
      }
      // Order them by temporal contiguity, then emit rows.
      orderByContiguity(recalledPositions, rng).forEach((pos, k) => {
        const word = WORDS[pos - 1];
        recalls.push({
          session_id: sid, participant_name: name,
          session_number: sessionNum, output_position: k + 1,
          response_raw: word, response_clean: word,
          matched_word: word, matched_serial_position: pos,
          is_correct_recall: true, is_repetition: false,
          recall_submission_time: ISO,
        });
      });
    }

    // Arithmetic distractor task (between the two recall sessions).
    const nProblems = 12 + Math.floor(rng() * 7);
    for (let i = 0; i < nProblems; i++) {
      const a = 2 + Math.floor(rng() * 8);
      const b = 2 + Math.floor(rng() * 8);
      const correct = rng() < 0.85;
      distractor.push({
        session_id: sid, participant_name: name,
        problem: `${a} + ${b}`, correct_answer: a + b,
        participant_answer: correct ? a + b : a + b + (rng() < 0.5 ? 1 : -1),
        accuracy: correct,
        reaction_time_ms: Math.round(2500 + rng() * 1800),
        onset_time: ISO,
      });
    }
  }

  return { recalls, distractor };
}
