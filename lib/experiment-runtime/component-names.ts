// The escape hatch's guest list.
//
// Names only, no components — so the validator, the CLI and the offline tests can all check
// a definition without importing React. lib/experiment-runtime/components.tsx maps these
// names to the actual components.
//
// A definition names a component; it never names a path and never carries code. A published
// definition is a row in a database, so the worst a wrong or hostile value can do is fail to
// match anything here, which the validator reports and the runner renders as a plain
// message. Nothing is imported, evaluated or fetched from what a definition says.

/**
 * WHEN A PHASE IS ALLOWED TO BE CODE.
 *
 * The runtime plans trials in advance, renders declarative displays, and compares responses
 * to planned values. A phase may be a component only when it genuinely breaks one of those
 * three:
 *
 *   1. The participant AUTHORS the stimulus, so there are no trials to plan. Wason's 2-4-6
 *      task is the case: they type a number triple and a predicate judges it.
 *   2. The display cannot be declared — frame-accurate animation, continuous flash
 *      suppression, anything whose correctness is a matter of timing per frame.
 *   3. The input is not an HTML control — freehand drawing, audio capture.
 *
 * NOT because something is merely hard. Ensemble perception looked like a candidate — two
 * interleaved tasks, a slider, a per-trial scoring rule — and building it declaratively is
 * what gave the runtime interleaving, estimation and sliders, which every experiment can now
 * use. A component would have bought one experiment and taught the system nothing.
 *
 * The cost is real and falls on the lecturer: a phase that is code cannot be edited from
 * /create, cannot be generated from a paper, and has to be maintained by hand forever. Three
 * entries here is a healthy number. Thirty would mean the runtime had stopped growing.
 */
export const PHASE_COMPONENTS = [
  /** Wason's 2-4-6 rule discovery: the participant proposes triples and is told yes or no. */
  'wasonRuleDiscovery',
] as const;

/**
 * A gate between the landing page and the first trial.
 *
 * For a run that cannot start until something about the DEVICE is settled — bRMS measures
 * the physical width of the screen so its stimulus subtends the right visual angle, then
 * locks the display to landscape. Nothing a definition can describe, and nothing that
 * belongs in a trial.
 */
export const ONBOARDING_COMPONENTS = [] as const;

export type PhaseComponentName = typeof PHASE_COMPONENTS[number];
export type OnboardingComponentName = typeof ONBOARDING_COMPONENTS[number];
