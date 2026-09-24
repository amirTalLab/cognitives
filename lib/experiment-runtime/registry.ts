// Where the runtime finds a definition.
//
// Currently a static map, so the runtime can be run and judged before any of the
// multi-tenant substrate exists. The lookup is deliberately async and by slug: swapping
// this for a Supabase query — one row per experiment, owned by a lecturer — is then a
// change to this file alone, not to the runner or the route.

import type { ExperimentDefinition } from './schema';
import { getPreview } from './preview-store';
import { listPublished, loadDefinition } from './store';
import { RUN_SLUGS } from '@/lib/experiments';
// WORD_SUPERIORITY and VISUAL_SEARCH (round-trips) are deliberately NOT registered: the
// ports below share their slugs and supersede them. A round-trip was an outline that
// simplified the design to fit; a port is the hand-built experiment itself.
//
// Registering both would not be harmless. The lookup takes the FIRST match on slug, so the
// round-trip — listed earlier — would win, and the port would sit in the codebase fully
// tested and never once served to a student.
import { BOUBA_KIKI } from './round-trips';
import { FLANKER, LEXICAL_DECISION, POSNER, STROOP, SIGNAL_DETECTION, DELAY_DISCOUNTING, SEMANTIC_PRIMING, FACE_INVERSION } from './generality-probe';
import { NAVON, NUMBER_COMPARISON, MENTAL_ROTATION } from './templates';
import { COMPOSITE_FACE_PORT, VISUAL_SEARCH_PORT, BOUBA_KIKI_PORT, DRM_PORT, MENTAL_REP_PORT, POSNER_CUEING, SERIAL_ORDER_PORT, SRT_PORT, STROOP_PORT, WORD_SUPERIORITY_PORT } from './ports';

const BUILT_IN: ExperimentDefinition[] = [
  BOUBA_KIKI,
  STROOP, FLANKER, POSNER, LEXICAL_DECISION,
  SEMANTIC_PRIMING, DELAY_DISCOUNTING, FACE_INVERSION, SIGNAL_DETECTION,
  NAVON, NUMBER_COMPARISON, MENTAL_ROTATION,
  POSNER_CUEING, STROOP_PORT, WORD_SUPERIORITY_PORT, BOUBA_KIKI_PORT, DRM_PORT,
  SERIAL_ORDER_PORT, SRT_PORT, COMPOSITE_FACE_PORT, VISUAL_SEARCH_PORT, MENTAL_REP_PORT,
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

/**
 * The definition a slug is actually RUNNING — published if there is one, else the built-in.
 *
 * Deliberately not `getDefinition`, which looks at the preview store first: that is right
 * for a participant opening a link mid-refine, and wrong for a lecturer asking to edit the
 * live experiment, who would silently be handed a half-finished draft from an earlier
 * session instead.
 */
export async function loadLive(slug: string): Promise<ExperimentDefinition | null> {
  try {
    const published = await loadDefinition(slug);
    if (published) return published;
  } catch {
    // Unreachable database: the built-in is what is running anyway.
  }
  return BUILT_IN.find(d => d.slug === slug) ?? null;
}

/** An experiment a lecturer can open on the Refine screen and change by hand. */
export interface EditableExperiment {
  slug: string;
  title: string;
  category: string;
  /** The published version, where one exists. Absent for an experiment still shipping as code. */
  revision?: number;
  updatedAt?: string;
  /**
   * True when nothing is published under this slug, so the built-in is what students get.
   *
   * Editing one is the same screen either way; publishing afterwards writes the first row
   * and from then on that row is what runs, since a published definition is looked up
   * before the built-in of the same slug.
   */
  builtIn: boolean;
}

/**
 * Everything on the homepage that a lecturer can edit, in homepage order.
 *
 * Two sources, because an experiment can be live in two ways. A PORTED one ships as code
 * and has no published row until someone edits it; a GENERATED one is a row from the start.
 * Listing only the rows — which is what /create did — meant none of the ported experiments
 * could be edited at all, even though they are the ones a class actually runs.
 *
 * The homepage catalogue is the ONLY source of what belongs here, so an experiment becomes
 * editable at the moment its card is pointed at /run, and the next port needs nothing done
 * to appear. A published row the catalogue does not link is deliberately left out: those
 * are abandoned drafts and duplicate generations, and offering them for editing invites
 * someone to spend an afternoon refining an experiment no student will ever reach. They
 * still resolve at their own URL, and `npm run exp:unpublish <slug>` retires one for good.
 */
export async function listEditable(): Promise<EditableExperiment[]> {
  // A database that cannot be reached is not an empty database: every built-in is still
  // editable, it just shows as version-less until the row comes back.
  return editableFrom(await listPublished().catch(() => []));
}

/** The pairing rule on its own, so it can be checked against rows without a database. */
export function editableFrom(
  published: { slug: string; title: string; category: string; revision?: number; updatedAt?: string }[],
): EditableExperiment[] {
  const bySlug = new Map(published.map(row => [row.slug, row]));

  const live: EditableExperiment[] = [];
  for (const slug of RUN_SLUGS) {
    const row = bySlug.get(slug);
    const builtIn = BUILT_IN.find(d => d.slug === slug);
    // Neither is an experiment whose card points nowhere; the registration tests catch it.
    if (!row && !builtIn) continue;
    live.push({
      slug,
      title: row?.title ?? builtIn?.title ?? slug,
      category: row?.category ?? builtIn?.category ?? '',
      revision: row?.revision,
      updatedAt: row?.updatedAt,
      builtIn: !row,
    });
  }

  return live;
}
