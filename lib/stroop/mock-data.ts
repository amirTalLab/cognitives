import { TrialResult, WORDS, COLORS, ColorKey } from '@/types/stroop';
import { getLanguageGroup } from './language-groups';

// Deterministic mock dataset for the teacher dashboard, so a lecturer can
// demo/teach the Stroop effect with no real participants. Mirrors the real
// experiment's design (12 words × 3 font colors = 36 trials per participant)
// and its stored row shape, so every chart renders exactly as it would live.

const NAMES = ['Noa', 'Yael', 'Tamar', 'Shira', 'Maya', 'Ori', 'Amit', 'Itai',
  'Lior', 'Rotem', 'Omer', 'Talia', 'Dani', 'Gal', 'Yuval'];

const COLOR_KEYS: ColorKey[] = ['red', 'green', 'yellow'];

/** The color a word *means* (for congruency); null for non-words. */
function wordMeaningColor(word: string): ColorKey | null {
  const w = word.toLowerCase();
  if (['red', 'adom', 'rojo'].includes(w)) return 'red';
  if (['green', 'yarok', 'verde'].includes(w)) return 'green';
  if (['yellow', 'tsahov', 'amarillo'].includes(w)) return 'yellow';
  return null;
}

// Stroop interference (extra ms on incongruent trials) graded by how readable
// the color word is — the teaching gradient: strongest for English, negligible
// for non-words (which carry no color meaning to interfere).
const INTERFERENCE_MS: Record<string, number> = {
  English: 150,
  Hebrew: 95,
  Spanish: 80,
  'Non-words': 8,
};

function seededRandom(seed: number) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

export function generateMockData(): TrialResult[] {
  const rows: TrialResult[] = [];

  for (let p = 0; p < NAMES.length; p++) {
    const rng = seededRandom(p * 1000 + 42);
    const sid = `mock-${p}-${NAMES[p].toLowerCase()}`;
    const name = NAMES[p];
    const speedBias = 0.85 + rng() * 0.4; // individual overall speed factor

    for (const word of WORDS) {
      for (const colorKey of COLOR_KEYS) {
        const isCongruent = wordMeaningColor(word) === colorKey;
        const group = getLanguageGroup(word);

        const baseCongruent = 600 * speedBias;
        const interference = isCongruent ? 0 : INTERFERENCE_MS[group];
        const noise = (rng() - 0.5) * 120;
        const rt = Math.max(300, Math.round(baseCongruent + interference + noise));

        // ~96% accuracy, a little lower on incongruent trials.
        const isCorrect = rng() > (isCongruent ? 0.02 : 0.05);
        const wrongIdx = (COLOR_KEYS.indexOf(colorKey) + 1 + Math.floor(rng() * 2)) % 3;
        const response = isCorrect ? colorKey : COLOR_KEYS[wrongIdx];

        rows.push({
          session_id: sid,
          participant_name: name,
          word_text: word,
          font_color: COLORS[colorKey].hex,
          is_congruent: isCongruent,
          reaction_time_ms: rt,
          user_response: response,
          is_correct: isCorrect,
        });
      }
    }
  }

  return rows;
}
