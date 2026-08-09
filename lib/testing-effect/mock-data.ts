import { TrialResult } from '@/types/testing-effect';

// Deterministic mock dataset for the teacher dashboard, so a lecturer can
// demo/teach the testing effect with no real participants. Mirrors the real
// two-session design (Session 1 practice, Session 2 delayed final test) and the
// stored testing_effect_results row shape. Reproduces the teaching results:
//  - Final-test accuracy: retrieval practice > restudy > baseline.
//  - Retrieval practice accuracy climbs from round 1 to round 2.
//  - Items answered correctly during S1 retrieval are recalled far better on the
//    delayed test than items missed in S1 (conditional-recall chart).

const NAMES = ['Noa', 'Yael', 'Tamar', 'Shira', 'Maya', 'Ori', 'Amit', 'Itai',
  'Lior', 'Rotem', 'Omer', 'Talia', 'Dani', 'Gal', 'Yuval'];

const ITEMS_PER_COND = 12;

function seededRandom(seed: number) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

export function generateMockData(): TrialResult[] {
  const rows: TrialResult[] = [];

  for (let p = 0; p < NAMES.length; p++) {
    const rng = seededRandom(p * 1000 + 53);
    const sid = `mock-${p}-${NAMES[p].toLowerCase()}`;
    const name = NAMES[p];
    const skill = (rng() - 0.5) * 0.12; // individual ability offset
    let idx = 0;

    const base = (extra: Partial<TrialResult>): TrialResult => ({
      session_id: sid, participant_name: name, counterbalance_group: 1,
      session_number: 1, phase: 'practice', practice_round: null,
      trial_index: idx++, cue: '', target: '', condition: 'baseline',
      trial_type: 'study', response: null, is_correct: null, reaction_time_ms: null,
      ...extra,
    });

    // ── Retrieval-practice items ──────────────────────────────────────────────
    for (let i = 0; i < ITEMS_PER_COND; i++) {
      const cue = `ret_${i}`;
      const target = `t${i}`;
      const r1 = rng() < Math.min(0.95, 0.55 + skill);
      const r2 = rng() < Math.min(0.97, 0.78 + skill);
      rows.push(base({ session_number: 1, condition: 'retrieval', trial_type: 'retrieval', practice_round: 1, cue, target, response: r1 ? target : 'wrong', is_correct: r1, reaction_time_ms: Math.round(2600 + rng() * 900) }));
      rows.push(base({ session_number: 1, condition: 'retrieval', trial_type: 'retrieval', practice_round: 2, cue, target, response: r2 ? target : 'wrong', is_correct: r2, reaction_time_ms: Math.round(2300 + rng() * 800) }));
      // Delayed final test: S1-hit items survive much better than S1-miss items.
      const s2 = rng() < (r2 ? 0.82 : 0.42);
      rows.push(base({ session_number: 2, phase: 'test', condition: 'retrieval', trial_type: 'test', cue, target, response: s2 ? target : 'wrong', is_correct: s2, reaction_time_ms: s2 ? Math.round(1400 + rng() * 500) : Math.round(1900 + rng() * 600) }));
    }

    // ── Restudy items ─────────────────────────────────────────────────────────
    for (let i = 0; i < ITEMS_PER_COND; i++) {
      const cue = `res_${i}`;
      const target = `s${i}`;
      rows.push(base({ session_number: 1, condition: 'restudy', trial_type: 'restudy', cue, target })); // re-reading: not scored
      const s2 = rng() < Math.min(0.9, 0.62 + skill);
      rows.push(base({ session_number: 2, phase: 'test', condition: 'restudy', trial_type: 'test', cue, target, response: s2 ? target : 'wrong', is_correct: s2, reaction_time_ms: s2 ? Math.round(1500 + rng() * 500) : Math.round(2000 + rng() * 600) }));
    }

    // ── Baseline items (only seen at study, tested at S2) ─────────────────────
    for (let i = 0; i < ITEMS_PER_COND; i++) {
      const cue = `bas_${i}`;
      const target = `b${i}`;
      const s2 = rng() < Math.min(0.85, 0.45 + skill);
      rows.push(base({ session_number: 2, phase: 'test', condition: 'baseline', trial_type: 'test', cue, target, response: s2 ? target : 'wrong', is_correct: s2, reaction_time_ms: s2 ? Math.round(1600 + rng() * 500) : Math.round(2100 + rng() * 600) }));
    }
  }

  return rows;
}
