import { LogicsResponse } from '@/types/logics';
import { ALL_QUESTION_CODES } from './questions';

// Deterministic mock dataset for the teacher dashboard, so a lecturer can
// demo/teach the reasoning-biases battery with no real participants. Reproduces
// the textbook effect for each question: availability & representativeness
// errors, the Wason abstract-vs-concrete gap, anchoring (group A low anchor vs
// group B high anchor), framing reversals, and CRT intuitive-vs-reflective
// answers. Faithful to the stored logics_results row shape.

type Group = 'A' | 'B';

const NAMES = ['Noa', 'Yael', 'Tamar', 'Shira', 'Maya', 'Ori', 'Amit', 'Itai',
  'Lior', 'Rotem', 'Omer', 'Talia', 'Dani', 'Gal', 'Yuval', 'Roni', 'Adi', 'Nadav',
  'Hila', 'Eden', 'Bar', 'Tal', 'Sivan', 'Guy'];

function seededRandom(seed: number) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

function clamp(x: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, x)); }
function likert(rng: () => number, mean: number) {
  return clamp(Math.round(mean + (rng() - 0.5) * 2.2), 1, 5);
}

interface Answer {
  response: string;
  response_numeric: number | null;
  rule_guess: string | null;
  rule_triples_json: string | null;
}

const A0 = (response: string, response_numeric: number | null = null): Answer =>
  ({ response, response_numeric, rule_guess: null, rule_triples_json: null });

/** The biased response for one question code, given the participant's group. */
function answer(code: string, group: Group, rng: () => number): Answer {
  switch (code) {
    // ── Availability (people over-weight what comes to mind) ──
    case 'Q-A1': return A0(rng() < 0.7 ? 'more-2' : rng() < 0.5 ? 'more-8' : 'same');
    case 'Q-A2': return A0(rng() < 0.7 ? 'murder' : 'suicide');           // suicide is actually higher
    case 'Q-A3': return A0(rng() < 0.6 ? 'sharks' : 'dogs');              // dogs are actually higher
    case 'Q-A4': return A0(rng() < 0.7 ? 'start-k' : 'third-k');          // third-letter is actually higher

    // ── Representativeness ──
    case 'Q-R1': return A0(rng() < 0.55 ? 'mixed' : rng() < 0.75 ? 'equal' : 'blocky');
    case 'Q-R2': return A0(rng() < 0.8 ? 'teller-feminist' : 'teller');   // conjunction fallacy
    case 'Q-R3': return A0(rng() < 0.5 ? 'tails' : rng() < 0.8 ? 'equal' : 'heads'); // gambler's fallacy

    // ── Wason selection (comma-joined multi-select) ──
    case 'Q-WASON-A': {                                                    // abstract → mostly wrong
      const r = rng();
      return A0(r < 0.5 ? 'E,4' : r < 0.8 ? 'E' : r < 0.9 ? 'E,7' : '4'); // 'E,7' is correct
    }
    case 'Q-WASON-B': {                                                    // concrete → mostly correct
      const r = rng();
      return A0(r < 0.75 ? 'beer,16yo' : r < 0.9 ? 'beer' : 'beer,cola,16yo');
    }

    // ── Rule discovery (2-4-6) ──
    case 'Q-RULE': {
      if (rng() < 0.75) {
        // Positive-test-only: confirms an over-specific rule.
        return {
          response: '', response_numeric: null,
          rule_guess: 'increasing by 2',
          rule_triples_json: JSON.stringify([
            { numbers: [8, 10, 12], fits: true },
            { numbers: [20, 22, 24], fits: true },
            { numbers: [50, 52, 54], fits: true },
          ]),
        };
      }
      // Tests disconfirming cases → discovers the general rule.
      return {
        response: '', response_numeric: null,
        rule_guess: 'any three increasing numbers',
        rule_triples_json: JSON.stringify([
          { numbers: [1, 2, 3], fits: true },
          { numbers: [10, 5, 1], fits: false },
          { numbers: [3, 6, 9], fits: true },
          { numbers: [2, 2, 2], fits: false },
        ]),
      };
    }

    // ── Anchoring (group A = low anchor, group B = high anchor) ──
    case 'Q-ANCH-1-s1': return A0(group === 'A' ? (rng() < 0.9 ? 'higher' : 'lower') : (rng() < 0.85 ? 'lower' : 'higher'));
    case 'Q-ANCH-1-s2': return A0('', Math.round(group === 'A' ? 40 + rng() * 25 : 72 + rng() * 30));   // Turkey pop (M), true ~85
    case 'Q-ANCH-2-s1': return A0(group === 'A' ? (rng() < 0.9 ? 'higher' : 'lower') : (rng() < 0.85 ? 'lower' : 'higher'));
    case 'Q-ANCH-2-s2': return A0('', Math.round(group === 'A' ? 18 + rng() * 14 : 40 + rng() * 18));   // Africa UN %, true ~28
    case 'Q-ANCH-3-s1':
    case 'Q-ANCH-3-s2': return A0('', Math.round(group === 'A' ? 300 + rng() * 500 : 1500 + rng() * 1800)); // 1..8! est, true 40320

    // ── Framing (A vs B are the same problem, framed oppositely) ──
    case 'Q-FRAME-1': return A0('', likert(rng, group === 'A' ? 4.1 : 3.0));   // survival vs mortality frame
    case 'Q-FRAME-2': return A0(group === 'A' ? (rng() < 0.72 ? 'certain' : 'gamble') : (rng() < 0.65 ? 'gamble' : 'certain')); // Asian disease
    case 'Q-FRAME-3': return A0('', likert(rng, group === 'A' ? 4.0 : 3.0));   // most passed vs some failed
    case 'Q-FRAME-4': return A0('', likert(rng, group === 'A' ? 3.5 : 2.4));   // tax break vs tax penalty

    // ── CRT (intuitive-wrong vs reflective-correct) ──
    case 'Q-CRT-1': return A0('', rng() < 0.6 ? 10 : 5);     // correct 5
    case 'Q-CRT-2': return A0('', rng() < 0.55 ? 100 : 5);   // correct 5
    case 'Q-CRT-3': return A0('', rng() < 0.55 ? 24 : 47);   // correct 47
    case 'Q-CRT-4': return A0('', rng() < 0.5 ? 1 : 2);      // correct 2
    case 'Q-CRT-5': return A0('', rng() < 0.55 ? 7 : 8);     // correct 8
    case 'Q-CRT-6': return A0('', rng() < 0.5 ? 3 : rng() < 0.6 ? 5 : 6); // correct 3

    default: return A0('');
  }
}

export function generateMockData(): LogicsResponse[] {
  const rows: LogicsResponse[] = [];

  for (let p = 0; p < NAMES.length; p++) {
    const rng = seededRandom(p * 1000 + 71);
    const sid = `mock-${p}-${NAMES[p].toLowerCase()}`;
    const group: Group = p % 2 === 0 ? 'A' : 'B';

    ALL_QUESTION_CODES.forEach((code, order) => {
      const a = answer(code, group, rng);
      rows.push({
        session_id: sid,
        participant_name: NAMES[p],
        language: 'he',
        group_assignment: group,
        question_code: code,
        response: a.response,
        response_numeric: a.response_numeric,
        reaction_time_ms: Math.round(2500 + rng() * 6000),
        question_order: order,
        rule_triples_json: a.rule_triples_json,
        rule_guess: a.rule_guess,
      });
    });
  }

  return rows;
}
