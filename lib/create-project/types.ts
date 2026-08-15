// Shared types for the "Create New Project" pipeline (paper PDF -> experiment code).
//
// These mirror the two Claude Code skills that this feature ports into the app:
//   .claude/skills/experiment-from-paper/SKILL.md   -> analyze + spec stages
//   .claude/skills/new-cognitive-experiment/SKILL.md -> generate + chat stages
// The skills stay the source of truth for a human-driven Claude Code session; the
// prompts in lib/create-project/prompts.ts are the in-app translation of them.

/** Feasibility verdict from the paper-analysis stage. */
export type Feasibility = 'recreatable' | 'caveats' | 'not-recreatable';

/** One candidate experiment found in an uploaded paper. */
export interface Candidate {
  id: string;
  name: string;
  /** One-line description of the paradigm. */
  paradigm: string;
  /** The manipulation / independent variable. */
  manipulation: string;
  /** The measured behavioural dependent variable. */
  measure: string;
  /** The result reported in the paper (ideally with a number). */
  expectedEffect: string;
  feasibility: Feasibility;
  /** One-line justification for the feasibility verdict. */
  feasibilityReason: string;
}

export interface AnalyzeResponse {
  paperTitle: string;
  /** Set when the paper contains nothing recreatable; candidates may still list the rejects. */
  noneRecreatable: boolean;
  /** Present when noneRecreatable is true — why the paper yields no usable experiment. */
  noneReason?: string;
  candidates: Candidate[];
}

/** A single spec field, tagged with where its value came from. */
export interface SpecField {
  key: string;
  label: string;
  value: string;
  /** 'paper' = stated in the source; 'inferred' = filled in by Claude, needs confirming. */
  source: 'paper' | 'inferred';
}

/**
 * How an experiment gets built.
 *
 * Two paths on purpose. Most paradigms are a definition: validated data run by a fixed
 * renderer, so they preview instantly, cost little, and cannot execute code from an
 * uploaded paper. The rest fall back to generating real Next.js pages, which reaches
 * anything but is slower, dearer, and has to be reviewed and deployed before it runs.
 *
 * The point of choosing at the SPEC stage is that the lecturer is told which path they
 * are on, and why, before anything is generated.
 */
export type BuildTarget = 'definition' | 'code';

/** The design spec handed to the build stage. */
export interface Spec {
  slug: string;
  title: string;
  titleHe: string;
  category: string;
  fields: SpecField[];
  /** Which path this experiment takes. Defaults to 'definition' when absent. */
  buildTarget?: BuildTarget;
  /** Why that path was chosen — shown to the lecturer, so the trade-off is visible. */
  buildTargetReason?: string;
  /**
   * Where the definition path would knowingly depart from the paper.
   *
   * A near-miss is usually still a valid demonstration — three fixed difficulty levels
   * instead of an adaptive staircase — but only a psychologist can judge that, so it is
   * surfaced rather than silently applied.
   */
  simplifications?: { what: string; why: string }[];
}

/** One file produced by the code-generation stage. */
export interface GeneratedFile {
  /** Repo-relative POSIX path, e.g. "app/boubaKiki/experiment/page.tsx". */
  path: string;
  contents: string;
}

export interface GenerateResponse {
  files: GeneratedFile[];
  /** Free-text notes from Claude (setup steps, assumptions, follow-ups). */
  notes: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatResponse {
  reply: string;
  /** Only the files Claude rewrote this turn; merged over the existing set client-side. */
  files: GeneratedFile[];
}

/**
 * Wizard stages, in order. All of them live inside the one "Create New Project" section.
 *
 * Generating and refining are a single stage: the lecturer judges the experiment by using
 * it, so the moment code exists they should be looking at the running preview, not at a
 * file list they have to click past.
 *
 * The first two stages are skippable — see blankSpec below.
 */
export type Stage = 'upload' | 'select' | 'spec' | 'refine';

/**
 * An empty spec, for building an experiment without a paper.
 *
 * The paper stages exist to fill this form in. When a lecturer already knows the design —
 * their own study, or a paradigm they can describe from memory — reading a PDF to
 * reconstruct what they already know costs two API calls and a couple of minutes to arrive
 * at a form they could have typed. This goes straight to the form, for free.
 *
 * Same nine fields as the extracted version, so everything downstream is unchanged. All
 * marked 'inferred', because nothing here came from a source document.
 */
export function blankSpec(): Spec {
  const field = (key: string, label: string): SpecField =>
    ({ key, label, value: '', source: 'inferred' });

  return {
    slug: '',
    title: '',
    titleHe: '',
    category: 'PERCEPTION',
    buildTarget: 'definition',
    buildTargetReason: 'Written by hand, so no feasibility check was run — change the fields below if the design needs generated code instead.',
    fields: [
      field('design', 'Design description'),
      field('conditions', 'Conditions'),
      field('trialStructure', 'Trial structure & timing'),
      field('trialCounts', 'Trial counts & ordering'),
      field('response', 'Response modality'),
      field('dv', 'Dependent variable'),
      field('expectedEffect', 'Expected effect'),
      field('charts', 'Teacher dashboard charts'),
      field('stimuli', 'Stimuli & assets'),
    ],
  };
}

/** Shown in the empty form, so the expected level of detail is obvious. */
export const SPEC_PLACEHOLDERS: Record<string, string> = {
  design: 'What the experiment measures, and the effect it demonstrates.',
  conditions: 'Levels of the independent variable — e.g. congruent / incongruent / neutral.',
  trialStructure: 'Phases with durations — e.g. fixation 500ms → stimulus 150ms → mask 500ms → response.',
  trialCounts: 'Trials per condition, blocked or randomised, and how much practice.',
  response: 'Keyboard keys, on-screen buttons, rating scale, typed answer.',
  dv: 'Accuracy, reaction time, choice proportion, rating.',
  expectedEffect: 'What should happen, with numbers if you know them.',
  charts: 'What the dashboard should plot — e.g. bar of RT by condition with error bars.',
  stimuli: 'Exactly what appears on screen. Text and simple shapes work; image files cannot be created.',
};

/** Token counts returned alongside every real API response. */
export interface Usage {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

/** One metered call, accumulated across a session so spend is visible as it happens. */
export interface UsageEntry extends Usage {
  stage: string;
  model: 'fast' | 'strong';
}

// Published list prices per million tokens. Kept here rather than hardcoded into the
// display so a price change is a one-line edit — and so it is obvious that the figure
// shown is an estimate derived from real token counts, not a billed amount.
const PRICES: Record<'fast' | 'strong', { in: number; out: number }> = {
  fast:   { in: 3,  out: 15 },
  strong: { in: 15, out: 75 },
};

/** Estimated USD for one call. Cache writes bill at 1.25x input, reads at 0.1x. */
export function estimateCost(entry: UsageEntry): number {
  const p = PRICES[entry.model];
  return (
    (entry.input * p.in) +
    (entry.cacheWrite * p.in * 1.25) +
    (entry.cacheRead * p.in * 0.1) +
    (entry.output * p.out)
  ) / 1_000_000;
}
