import { DRMResult, DRMRecallResult } from '@/types/drm';
import { WORD_LISTS, UNRELATED_FOILS } from './word-lists';

// Deterministic mock dataset for the teacher dashboard, so a lecturer can
// demo/teach the DRM false-memory illusion with no real participants. Mirrors
// the real design (50-item recognition test + free recall per list) and both
// stored row shapes (drm_results + drm_recall_results), so every figure renders.

const NAMES = ['Noa', 'Yael', 'Tamar', 'Shira', 'Maya', 'Ori', 'Amit', 'Itai',
  'Lior', 'Rotem', 'Omer', 'Talia', 'Dani', 'Gal', 'Yuval'];

// Serial-position curve for studied words: primacy + recency (positions 1–10).
const SERIAL_HIT = [0.88, 0.85, 0.72, 0.68, 0.66, 0.65, 0.67, 0.73, 0.83, 0.88];

function seededRandom(seed: number) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

/** Pick a 1–4 confidence rating consistent with the response and its strength. */
function pickConfidence(rng: () => number, response: 'old' | 'new', strong: boolean): number {
  if (response === 'old') return rng() < (strong ? 0.7 : 0.45) ? 4 : 3;
  return rng() < (strong ? 0.7 : 0.45) ? 1 : 2;
}

interface MockDRM {
  recognition: DRMResult[];
  recall: DRMRecallResult[];
}

export function generateMockData(): MockDRM {
  const recognition: DRMResult[] = [];
  const recall: DRMRecallResult[] = [];

  for (let p = 0; p < NAMES.length; p++) {
    const rng = seededRandom(p * 1000 + 13);
    const sid = `mock-${p}-${NAMES[p].toLowerCase()}`;
    const name = NAMES[p];
    const bias = 0.9 + rng() * 0.2; // individual memory-strength factor

    // ── Recognition test (50 items) ──────────────────────────────────────────
    // 20 studied words: 2 per serial position, from two different lists.
    for (let pos = 1; pos <= 10; pos++) {
      for (let k = 0; k < 2; k++) {
        const list = WORD_LISTS[(pos + k * 2) % WORD_LISTS.length];
        const pOld = Math.min(0.98, SERIAL_HIT[pos - 1] * bias);
        const response: 'old' | 'new' = rng() < pOld ? 'old' : 'new';
        recognition.push({
          session_id: sid, participant_name: name,
          word: list.studyWords[pos - 1], item_type: 'studied', list_theme: list.theme,
          response, is_correct: response === 'old',
          reaction_time_ms: Math.max(400, Math.round(1200 + (rng() - 0.5) * 700)),
          serial_position: pos,
          confidence: pickConfidence(rng, response, response === 'old'),
        });
      }
    }

    // 5 critical lures — the illusion: high false "old" rate with confidence.
    for (const list of WORD_LISTS) {
      const pOld = Math.min(0.95, 0.55 * bias);
      const response: 'old' | 'new' = rng() < pOld ? 'old' : 'new';
      recognition.push({
        session_id: sid, participant_name: name,
        word: list.criticalLure, item_type: 'critical_lure', list_theme: list.theme,
        response, is_correct: response === 'new', // a lure was never studied
        reaction_time_ms: Math.max(400, Math.round(1500 + (rng() - 0.5) * 800)),
        confidence: pickConfidence(rng, response, response === 'old'),
      });
    }

    // 25 unrelated foils — low false-alarm rate.
    for (const word of UNRELATED_FOILS) {
      const pOld = Math.min(0.4, 0.12 / (bias * 0.9));
      const response: 'old' | 'new' = rng() < pOld ? 'old' : 'new';
      recognition.push({
        session_id: sid, participant_name: name,
        word, item_type: 'unrelated_foil', list_theme: 'none',
        response, is_correct: response === 'new',
        reaction_time_ms: Math.max(400, Math.round(1100 + (rng() - 0.5) * 600)),
        confidence: pickConfidence(rng, response, response === 'new'),
      });
    }

    // ── Free recall (one row per studied list) ────────────────────────────────
    for (let li = 0; li < WORD_LISTS.length; li++) {
      const list = WORD_LISTS[li];
      const correctCount = Math.max(2, Math.min(10, Math.round((5 + (rng() - 0.5) * 3) * bias)));
      const lureRecalled = rng() < Math.min(0.7, 0.45 * bias);
      const recalledWords = [
        ...list.studyWords.slice(0, correctCount),
        ...(lureRecalled ? [list.criticalLure] : []),
      ];
      const distractorTotal = 8 + Math.floor(rng() * 8);
      recall.push({
        session_id: sid, participant_name: name,
        list_index: li, list_theme: list.theme,
        recalled_words: JSON.stringify(recalledWords),
        critical_lure_recalled: lureRecalled,
        correct_count: correctCount,
        intrusion_count: Math.floor(rng() * 3),
        prior_list_intrusion_count: li > 0 ? Math.floor(rng() * 2) : 0,
        distractor_correct: Math.round(distractorTotal * (0.75 + rng() * 0.2)),
        distractor_total: distractorTotal,
      });
    }
  }

  return { recognition, recall };
}
