// Canned responses for CREATE_MOCK mode — the /create wizard's equivalent of the Mock
// Data toggle on every teacher dashboard.
//
// Purpose: click through all five stages with realistic content, instantly and with no
// API spend, so the UI can be iterated on without waiting minutes for a generation or
// paying for a layout tweak. This exercises the SHAPE of the pipeline, never the quality
// of the prompts — that only a real key can test.
//
// The fixtures deliberately cover the awkward cases, not just the happy path: a rejected
// candidate, one needing assets, a mix of from-paper and inferred spec fields, and a file
// set long enough to make the file-tab row wrap.

import { AnalyzeResponse, ChatResponse, GenerateResponse, Spec } from './types';
import { FIXTURE_FILES } from './fixture-files';
import { BOUBA_KIKI } from '@/lib/experiment-runtime/round-trips';
import { ExperimentDefinition } from '@/lib/experiment-runtime/schema';

/**
 * The definition the mock pipeline "generates".
 *
 * The real bouba-kiki definition under the demo slug, so mock mode exercises the whole
 * path — generate, validate, preview, dashboard — against something that genuinely runs.
 */
export const MOCK_DEFINITION: ExperimentDefinition = { ...BOUBA_KIKI, slug: 'boubaKikiDemo' };

// Named isMockMode, not useMock: eslint's rules-of-hooks treats any `useX` function as a
// React hook and rejects calling it from an async route handler.
/** True when the wizard should serve fixtures instead of calling the API. */
export function isMockMode(): boolean {
  return process.env.CREATE_MOCK === '1' && process.env.NODE_ENV === 'development';
}

/** Makes the loading banners visible, so their copy and placement can be judged. */
export function mockDelay(ms = 700): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export const MOCK_ANALYSIS: AnalyzeResponse = {
  paperTitle: 'Synaesthesia — A Window Into Perception, Thought and Language',
  noneRecreatable: false,
  candidates: [
    {
      id: 'bouba-kiki',
      name: 'Bouba / Kiki shape–sound mapping',
      paradigm: 'Two-alternative forced choice: a rounded blob and a spiky star are shown side by side, and the participant assigns the names "bouba" and "kiki" to them.',
      manipulation: 'Shape type (rounded vs spiky) crossed with the left/right screen position of each shape.',
      measure: 'Proportion of participants choosing the conventional mapping (rounded → bouba, spiky → kiki).',
      expectedEffect: 'About 95% of non-synaesthetic participants pick the conventional mapping, far above the 50% chance level.',
      feasibility: 'recreatable',
      feasibilityReason: 'Both shapes are drawable as inline SVG, the response is a single tap, and it works on any student.',
    },
    {
      id: 'grapheme-colour-popout',
      name: 'Grapheme–colour pop-out search',
      paradigm: 'A grid of 5s hides a triangle made of 2s; participants report the shape formed by the embedded digits.',
      manipulation: 'Presence or absence of induced colour; display duration.',
      measure: 'Accuracy in reporting the embedded shape.',
      expectedEffect: 'Synaesthetes detect the shape well above chance; controls perform near chance.',
      feasibility: 'not-recreatable',
      feasibilityReason: 'The effect exists only in grapheme–colour synaesthetes, who cannot be assumed in a class cohort.',
    },
    {
      id: 'cross-modal-pitch-size',
      name: 'Pitch–size cross-modal matching',
      paradigm: 'A tone is played and the participant chooses which of two objects it belongs to.',
      manipulation: 'Tone frequency (high vs low) against object size (small vs large).',
      measure: 'Proportion of congruent (high→small, low→large) matches.',
      expectedEffect: 'Congruent matches predominate, in the same family as the bouba/kiki mapping.',
      feasibility: 'caveats',
      feasibilityReason: 'Needs audio playback, which is unreliable in a shared classroom without headphones; tones can be generated but volume cannot be controlled.',
    },
    {
      id: 'number-line-mapping',
      name: 'Number-form spatial layout report',
      paradigm: 'Participants draw or describe where numbers sit in their mental space.',
      manipulation: 'None — a descriptive report.',
      measure: 'Qualitative description of the reported spatial form.',
      expectedEffect: 'Number-form synaesthetes report stable idiosyncratic layouts.',
      feasibility: 'not-recreatable',
      feasibilityReason: 'Free-form introspective report with no manipulation and no scoreable dependent variable.',
    },
  ],
};

/** The "this paper has nothing usable" branch — the filter's refusal case. */
export const MOCK_ANALYSIS_EMPTY: AnalyzeResponse = {
  paperTitle: 'The Phenomenology of Synaesthesia',
  noneRecreatable: true,
  noneReason:
    'This is a review article. It discusses experiments reported elsewhere but contains no method section of its own — no procedure, stimuli, conditions or measured outcome that could be turned into a task. Building an experiment from it would mean inventing one, not recreating one.',
  candidates: [],
};

export const MOCK_SPEC: Spec = {
  // Not "boubaKiki": that kebabs to bouba-kiki, which the existing experiment already
  // owns, and staging refuses the collision.
  slug: 'boubaKikiDemo',
  title: 'Bouba-Kiki Effect',
  titleHe: 'אפקט בובה-קיקי',
  category: 'LANGUAGE',
  fields: [
    { key: 'design', label: 'Design description', source: 'paper',
      value: 'Tests whether the mapping between speech sounds and visual shapes is arbitrary. Participants assign the nonsense names "bouba" and "kiki" to a rounded and a spiky shape; the overwhelming majority converge on the same mapping, indicating a systematic cross-modal correspondence rather than an arbitrary one.' },
    { key: 'conditions', label: 'Conditions', source: 'paper',
      value: 'Shape pair (rounded vs spiky), counterbalanced for left/right screen position. Control trials pair two shapes of the same class to check that responses are not random.' },
    { key: 'trialStructure', label: 'Trial structure & timing', source: 'inferred',
      value: 'fixation cross 500ms → both shapes appear side by side, untimed → participant taps the shape they think is "bouba" → 300ms inter-trial blank. No mask; the paper reports no time pressure.' },
    { key: 'trialCounts', label: 'Trial counts & ordering', source: 'inferred',
      value: '12 main trials (each shape pair twice, positions counterbalanced) plus 4 control trials, fully randomised. 4 practice trials beforehand with feedback.' },
    { key: 'response', label: 'Response modality', source: 'inferred',
      value: 'Two large on-screen buttons under the shapes, at least 44×44px, tappable on a phone. No keyboard requirement.' },
    { key: 'dv', label: 'Dependent variable', source: 'paper',
      value: 'Proportion of trials on which the conventional mapping is chosen (rounded → bouba). Reaction time recorded as a secondary measure.' },
    { key: 'expectedEffect', label: 'Expected effect', source: 'paper',
      value: 'Roughly 95% conventional mapping, well above the 50% chance level. The effect holds across language backgrounds.' },
    { key: 'charts', label: 'Teacher dashboard charts', source: 'inferred',
      value: 'Bar: proportion conventional per shape pair with SEM error bars and a dashed 50% chance line. Histogram: per-participant conventional rate. Bar: mean RT for conventional vs non-conventional choices.' },
    { key: 'stimuli', label: 'Stimuli & assets', source: 'inferred',
      value: 'Both shapes drawn as inline SVG — a rounded blob from a smoothed closed path, a spiky star from alternating inner and outer radii. No image files, so nothing needs sourcing or shipping.' },
  ],
};

export const MOCK_GENERATION: GenerateResponse = {
  notes: [
    'The paper gives no trial timings or counts, so practice is 4 trials and the main block is 12 plus 4 same-class controls — enough to see the effect without the task outstaying its welcome.',
    '',
    'Control trials pair two shapes of the same class. They should sit at chance; if they do not, participants are responding to position rather than shape.',
    '',
    'Both shapes are inline SVG, so nothing needs sourcing. The spiky shape uses 7 points, which is a guess — the paper only shows the figure.',
  ].join('\n'),
  files: FIXTURE_FILES,
};

/** Echoes the request back so the chat transcript reads naturally in mock mode. */
export function mockChatReply(request: string): ChatResponse {
  return {
    reply: `**Mock mode** — no API call was made, so nothing was actually changed.

You asked: "${request}"

With a real API key, Claude would apply this to the generated files, restage them, and the preview above would rebuild with the change.`,
    files: [],
  };
}
