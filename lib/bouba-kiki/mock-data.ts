import { TrialResult } from '@/types/bouba-kiki';

// Deterministic mock dataset for the teacher dashboard, so a lecturer can
// demo/teach the Bouba-Kiki effect with no real participants. Mirrors the real
// design (12 main 2AFC trials + 4 control trials per participant) and the stored
// row shape, so every chart on the dashboard renders exactly as it would live.

const NAMES = ['Noa', 'Yael', 'Tamar', 'Shira', 'Maya', 'Ori', 'Amit', 'Itai',
  'Lior', 'Rotem', 'Omer', 'Talia', 'Dani', 'Gal', 'Yuval'];

const WORDS: { text: string; type: 'rounded' | 'spiky' }[] = [
  { text: 'BOUBA', type: 'rounded' },
  { text: 'KIKI', type: 'spiky' },
  { text: 'MALUMA', type: 'rounded' },
  { text: 'TAKETE', type: 'spiky' },
];

const ROUNDED = ['rounded_01.png', 'rounded_02.png', 'rounded_03.png',
  'rounded_04.png', 'rounded_05.png', 'rounded_06.png'];
const SPIKY = ['spiky_01.png', 'spiky_02.png', 'spiky_03.png',
  'spiky_04.png', 'spiky_05.png', 'spiky_06.png'];

function seededRandom(seed: number) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

export function generateMockData(): TrialResult[] {
  const rows: TrialResult[] = [];

  for (let p = 0; p < NAMES.length; p++) {
    const rng = seededRandom(p * 1000 + 7);
    const sid = `mock-${p}-${NAMES[p].toLowerCase()}`;
    const name = NAMES[p];
    // Individual sensitivity to sound symbolism: most people show the effect
    // strongly, a few are near chance.
    const accBias = 0.80 + rng() * 0.15; // base P(correct) 0.80–0.95
    let trialNum = 1;

    // 12 main 2AFC trials (which shape matches the word?)
    for (let i = 0; i < 12; i++) {
      const word = WORDS[i % WORDS.length];
      const roundedOnLeft = rng() < 0.5;
      const leftShape = roundedOnLeft ? ROUNDED[i % ROUNDED.length] : SPIKY[i % SPIKY.length];
      const rightShape = roundedOnLeft ? SPIKY[i % SPIKY.length] : ROUNDED[i % ROUNDED.length];
      const correct = rng() < accBias;
      const matchSide = (word.type === 'rounded') === roundedOnLeft ? 'left' : 'right';
      const response: 'left' | 'right' = correct ? matchSide : (matchSide === 'left' ? 'right' : 'left');
      const rt = Math.max(500, Math.round(1500 + (rng() - 0.5) * 900));

      rows.push({
        session_id: sid,
        participant_name: name,
        trial_number: trialNum++,
        word: word.text,
        word_type: word.type,
        left_shape: leftShape,
        right_shape: rightShape,
        response,
        is_correct: correct,
        reaction_time_ms: rt,
        is_control: false,
      });
    }

    // 4 control trials (single shape: "is this bouba or kiki?")
    const controls: { shape: string; type: 'rounded' | 'spiky' }[] = [
      { shape: ROUNDED[0], type: 'rounded' },
      { shape: ROUNDED[1], type: 'rounded' },
      { shape: SPIKY[0], type: 'spiky' },
      { shape: SPIKY[1], type: 'spiky' },
    ];
    for (const c of controls) {
      const correct = rng() < Math.min(0.97, accBias + 0.05); // naming is a touch easier
      const correctResp: 'left' | 'right' = c.type === 'rounded' ? 'left' : 'right';
      const response: 'left' | 'right' = correct ? correctResp : (correctResp === 'left' ? 'right' : 'left');
      const rt = Math.max(500, Math.round(1300 + (rng() - 0.5) * 800));

      rows.push({
        session_id: sid,
        participant_name: name,
        trial_number: trialNum++,
        word: 'CONTROL',
        word_type: c.type,
        left_shape: c.shape,
        right_shape: '',
        response,
        is_correct: correct,
        reaction_time_ms: rt,
        is_control: true,
      });
    }
  }

  return rows;
}
