// Where the runtime finds a definition.
//
// Currently a static map, so the runtime can be run and judged before any of the
// multi-tenant substrate exists. The lookup is deliberately async and by slug: swapping
// this for a Supabase query — one row per experiment, owned by a lecturer — is then a
// change to this file alone, not to the runner or the route.

import type { ExperimentDefinition } from './schema';
import { getPreview } from './preview-store';
import { loadDefinition } from './store';
import { BOUBA_KIKI, VISUAL_SEARCH, WORD_SUPERIORITY } from './round-trips';
import { FLANKER, LEXICAL_DECISION, POSNER, STROOP, SIGNAL_DETECTION, DELAY_DISCOUNTING, SEMANTIC_PRIMING, FACE_INVERSION } from './generality-probe';
import { NAVON, NUMBER_COMPARISON, MENTAL_ROTATION } from './templates';

const BUILT_IN: ExperimentDefinition[] = [
  BOUBA_KIKI, WORD_SUPERIORITY, VISUAL_SEARCH,
  STROOP, FLANKER, POSNER, LEXICAL_DECISION,
  SEMANTIC_PRIMING, DELAY_DISCOUNTING, FACE_INVERSION, SIGNAL_DETECTION,
  NAVON, NUMBER_COMPARISON, MENTAL_ROTATION,
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

  const builtIn = BUILT_IN.find(d => d.slug === slug);
  if (builtIn) return builtIn;

  return await loadDefinition(slug);
}

export async function listDefinitions(): Promise<ExperimentDefinition[]> {
  return BUILT_IN;
}
