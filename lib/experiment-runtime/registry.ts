// Where the runtime finds a definition.
//
// Currently a static map, so the runtime can be run and judged before any of the
// multi-tenant substrate exists. The lookup is deliberately async and by slug: swapping
// this for a Supabase query — one row per experiment, owned by a lecturer — is then a
// change to this file alone, not to the runner or the route.

import type { ExperimentDefinition } from './schema';
import { getPreview } from './preview-store';
import { loadDefinition } from './store';
// WORD_SUPERIORITY (round-trips) is deliberately NOT registered: the port below shares its
// slug and supersedes it. The round-trip was an outline that simplified the design to fit;
// the port is the hand-built experiment itself.
import { BOUBA_KIKI, VISUAL_SEARCH } from './round-trips';
import { FLANKER, LEXICAL_DECISION, POSNER, STROOP, SIGNAL_DETECTION, DELAY_DISCOUNTING, SEMANTIC_PRIMING, FACE_INVERSION } from './generality-probe';
import { NAVON, NUMBER_COMPARISON, MENTAL_ROTATION } from './templates';
import { BOUBA_KIKI_PORT, DRM_PORT, POSNER_CUEING, SERIAL_ORDER_PORT, STROOP_PORT, WORD_SUPERIORITY_PORT } from './ports';

const BUILT_IN: ExperimentDefinition[] = [
  BOUBA_KIKI, VISUAL_SEARCH,
  STROOP, FLANKER, POSNER, LEXICAL_DECISION,
  SEMANTIC_PRIMING, DELAY_DISCOUNTING, FACE_INVERSION, SIGNAL_DETECTION,
  NAVON, NUMBER_COMPARISON, MENTAL_ROTATION,
  POSNER_CUEING, STROOP_PORT, WORD_SUPERIORITY_PORT, BOUBA_KIKI_PORT, DRM_PORT,
  SERIAL_ORDER_PORT,
];

/**
 * A definition file in experiments/, served by a dev-only route.
 *
 * This is what lets the terminal path preview before publishing — edit the JSON, refresh,
 * see it. Returns null everywhere except a local dev server, where the route 404s.
 */
async function loadLocal(slug: string): Promise<ExperimentDefinition | null> {
  if (process.env.NODE_ENV !== 'development') return null;

  try {
    const res = await fetch(`/api/definition/${slug}`);
    if (!res.ok) return null;
    const { definition } = await res.json() as { definition: ExperimentDefinition };
    return definition ?? null;
  } catch {
    return null;
  }
}

/**
 * Finds a definition by slug, most-local first.
 *
 * The order is what someone editing an experiment expects: whatever you are working on
 * right now wins over whatever was published under the same slug earlier.
 */
export async function getDefinition(slug: string): Promise<ExperimentDefinition | null> {
  // Preview first: while an experiment is being refined in /create, the version under
  // review must win over whatever was published earlier under the same slug.
  const preview = getPreview(slug);
  if (preview) return preview;

  // Then the local file, for the same reason — the copy being edited beats the copy
  // published from someone else's machine.
  const local = await loadLocal(slug);
  if (local) return local;

  // Then what is PUBLISHED, ahead of the built-in of the same slug. A built-in is a
  // starting point shipped with the code; a published definition is what a lecturer
  // deliberately made live, possibly by refining that very built-in. If the built-in won,
  // editing a ported experiment would appear to work and change nothing for students.
  //
  // A throw here — not an error response, an unreachable host — used to reject all the way
  // out of this function. The page awaits it with .then() alone, so nothing ever set the
  // stage and the participant was left on a blank screen with no message. That is the
  // exact shape of a paused Supabase project, which this site has already had once.
  try {
    const published = await loadDefinition(slug);
    if (published) return published;
  } catch {
    // Unreachable database: fall through to the built-in, which is better than nothing.
  }

  return BUILT_IN.find(d => d.slug === slug) ?? null;
}

export async function listDefinitions(): Promise<ExperimentDefinition[]> {
  return BUILT_IN;
}
