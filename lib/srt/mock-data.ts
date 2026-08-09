import { SrtTrialResult } from '@/types/srt';
import { generateTrials, SEQUENCE_A, SEQUENCE_B } from './stimuli';

// Deterministic mock dataset for the teacher dashboard, so a lecturer can
// demo/teach the Serial Reaction Time task (Nissen & Bullemer) with no real
// participants. Reuses the real trial generator (648 trials, block 5 =
// interference) and reproduces the teaching results:
//  - RT falls across blocks as the repeating sequence is learned (implicit).
//  - RT spikes in the interference block (block 5), then recovers — the proof
//    that learning is sequence-specific.
//  - A generation task where explicit knowledge is typically above chance (25%)
//    but modest, and only some participants report noticing a regularity.

const NAMES = ['Noa', 'Yael', 'Tamar', 'Shira', 'Maya', 'Ori', 'Amit', 'Itai',
  'Lior', 'Rotem', 'Omer', 'Talia', 'Dani', 'Gal', 'Yuval'];

// Mean RT (ms) per block: learning 1→4, interference spike at 5, recovery at 6.
const BLOCK_BASE: Record<number, number> = { 1: 480, 2: 440, 3: 415, 4: 395, 5: 475, 6: 388 };

const ISO = '2026-01-01T00:00:00.000Z';

function seededRandom(seed: number) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

export interface MockSrtGenRow {
  session_id: string;
  participant_name: string | null;
  sequence: number[];
  main_is_a: boolean;
  noticed_regularity: boolean | null;
}

export interface MockSrt {
  rows: (SrtTrialResult & { created_at: string })[];
  gen: MockSrtGenRow[];
}

export function generateMockData(): MockSrt {
  const rows: (SrtTrialResult & { created_at: string })[] = [];
  const gen: MockSrtGenRow[] = [];

  for (let p = 0; p < NAMES.length; p++) {
    const rng = seededRandom(p * 1000 + 41);
    const sid = `mock-${p}-${NAMES[p].toLowerCase()}`;
    const name = NAMES[p];
    const mainIsA = p % 2 === 0;
    const speedBias = 0.9 + rng() * 0.25; // individual overall speed factor

    // Reuse the real trial structure (locations, blocks, interference).
    const trials = generateTrials(mainIsA);
    for (const tr of trials) {
      const withinDecline = tr.sequence_type === 'interference'
        ? 0
        : (tr.trial_in_block / 108) * 18; // gradual speed-up within a block
      const rt = Math.round((BLOCK_BASE[tr.block_number] - withinDecline) * speedBias + (rng() - 0.5) * 80);
      const correct = rng() < 0.965;
      const response = correct
        ? tr.target_location
        : ((tr.target_location % 4) + 1); // some other key
      rows.push({
        session_id: sid, participant_name: name,
        block_number: tr.block_number, trial_in_block: tr.trial_in_block,
        trial_overall: tr.trial_overall, sequence_position: tr.sequence_position,
        target_location: tr.target_location, response_location: response,
        correct, rt_ms: Math.max(150, rt),
        sequence_type: tr.sequence_type, is_practice: false,
        created_at: ISO,
      });
    }

    // Generation task: 12 clicks, above chance but modest explicit knowledge.
    const mainSeq = mainIsA ? SEQUENCE_A : SEQUENCE_B;
    const pGen = 0.42 + rng() * 0.28; // individual explicit-knowledge strength
    const sequence = mainSeq.map((loc) =>
      rng() < pGen ? loc : (1 + Math.floor(rng() * 4)));
    const noticed = rng() < 0.15 ? null : rng() < 0.4;
    gen.push({ session_id: sid, participant_name: name, sequence, main_is_a: mainIsA, noticed_regularity: noticed });
  }

  return { rows, gen };
}
