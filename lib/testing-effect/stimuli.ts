import type { CueTargetPair, Condition, CounterbalanceGroup } from '@/types/testing-effect';

export const SET_A: CueTargetPair[] = [
  { cue: 'navo', target: 'cheese' },
  { cue: 'lumer', target: 'rabbit' },
  { cue: 'fepin', target: 'castle' },
  { cue: 'sorda', target: 'button' },
  { cue: 'kelpum', target: 'violin' },
  { cue: 'vaski', target: 'desert' },
  { cue: 'doren', target: 'needle' },
  { cue: 'mital', target: 'thunder' },
  { cue: 'gropen', target: 'village' },
  { cue: 'tavil', target: 'pepper' },
  { cue: 'renka', target: 'kitten' },
  { cue: 'pildo', target: 'anchor' },
];

export const SET_B: CueTargetPair[] = [
  { cue: 'bregan', target: 'lemon' },
  { cue: 'molar', target: 'silver' },
  { cue: 'kavit', target: 'turtle' },
  { cue: 'zimel', target: 'blanket' },
  { cue: 'norpa', target: 'feather' },
  { cue: 'felda', target: 'hammer' },
  { cue: 'ruvan', target: 'tomato' },
  { cue: 'seplik', target: 'donkey' },
  { cue: 'lomik', target: 'curtain' },
  { cue: 'dasken', target: 'rocket' },
  { cue: 'vornet', target: 'pillow' },
  { cue: 'paska', target: 'necklace' },
];

export const SET_C: CueTargetPair[] = [
  { cue: 'merlun', target: 'velvet' },
  { cue: 'safir', target: 'ticket' },
  { cue: 'jolpen', target: 'statue' },
  { cue: 'kandro', target: 'bread' },
  { cue: 'pelnik', target: 'monkey' },
  { cue: 'varlo', target: 'beach' },
  { cue: 'nistel', target: 'tower' },
  { cue: 'rofim', target: 'train' },
  { cue: 'dulka', target: 'book' },
  { cue: 'hesmin', target: 'crown' },
  { cue: 'ganer', target: 'scissors' },
  { cue: 'wopel', target: 'lantern' },
];

const COUNTERBALANCE: Record<CounterbalanceGroup, Record<'A' | 'B' | 'C', Condition>> = {
  1: { A: 'baseline', B: 'restudy', C: 'retrieval' },
  2: { A: 'restudy', B: 'retrieval', C: 'baseline' },
  3: { A: 'retrieval', B: 'baseline', C: 'restudy' },
};

export function getConditionAssignment(group: CounterbalanceGroup): { condition: Condition; pairs: CueTargetPair[] }[] {
  const mapping = COUNTERBALANCE[group];
  return [
    { condition: mapping.A, pairs: [...SET_A] },
    { condition: mapping.B, pairs: [...SET_B] },
    { condition: mapping.C, pairs: [...SET_C] },
  ];
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Timing constants (ms)
export const STUDY_BLANK_MS = 500;
export const STUDY_DISPLAY_MS = 4000;
export const RESTUDY_DISPLAY_MS = 4000;
export const RESTUDY_BLANK_MS = 500;
export const RETRIEVAL_TIMEOUT_MS = 8000;
export const RETRIEVAL_FEEDBACK_MS = 2000;
export const RETRIEVAL_BLANK_MS = 500;
export const TEST_FIXATION_MS = 500;
export const TEST_TIMEOUT_MS = 12000;
export const TEST_BLANK_MS = 500;

// Response scoring
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z]/g, '');
}

function pluralRoot(s: string): string {
  if (s.endsWith('ies')) return s.slice(0, -3) + 'y';
  if (s.endsWith('es')) return s.slice(0, -2);
  if (s.endsWith('s')) return s.slice(0, -1);
  return s;
}

export function scoreResponse(response: string, target: string): boolean {
  const r = normalize(response);
  const t = normalize(target);
  if (!r) return false;
  if (r === t) return true;
  if (levenshtein(r, t) <= 2) return true;
  if (pluralRoot(r) === pluralRoot(t)) return true;
  if (levenshtein(pluralRoot(r), pluralRoot(t)) <= 2) return true;
  return false;
}

export const CONDITION_LABELS: Record<Condition, { en: string; he: string }> = {
  baseline: { en: 'Baseline', he: 'בסיס' },
  restudy: { en: 'Restudy', he: 'לימוד חוזר' },
  retrieval: { en: 'Retrieval Practice', he: 'תרגול שליפה' },
};
