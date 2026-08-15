// Reading and writing results.
//
// ONE table for every definition-based experiment, ever: a fixed spine of columns plus a
// JSONB payload. That is what removes the whole class of database problems the code path
// has — no per-experiment DDL, no migration when a refine adds a field, no orphan tables,
// no silent insert failure when the schema drifts from the code.
//
// Run supabase/schemas/experiment-results.sql once. Nothing after that.

import { getSupabase } from '@/lib/supabase';
import { ResultRow } from './aggregate';
import type { ExperimentDefinition } from './schema';

const TABLE = 'experiment_results';
const DEFINITIONS = 'experiment_definitions';

/**
 * Publishes a definition so it outlives the browser session that made it.
 *
 * Before this, a generated experiment lived only in sessionStorage — which meant a
 * homepage link to it worked for one person, in one tab, until they closed it.
 */
export async function publishDefinition(def: ExperimentDefinition): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: 'Supabase is not configured.' };

  const { error } = await sb.from(DEFINITIONS).upsert({
    slug: def.slug,
    title: def.title,
    title_he: def.titleHe,
    category: def.category,
    definition: def,
    is_published: true,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    const missing = /relation .* does not exist|could not find the table/i.test(error.message);
    return {
      ok: false,
      error: missing
        ? 'The experiment_definitions table does not exist yet. Run supabase/schemas/experiment-definitions.sql in the Supabase SQL editor, then publish again.'
        : error.message,
    };
  }
  return { ok: true };
}

/** Loads a published definition. Returns null when it is absent or not yet published. */
export async function loadDefinition(slug: string): Promise<ExperimentDefinition | null> {
  const sb = getSupabase();
  if (!sb) return null;

  const { data, error } = await sb
    .from(DEFINITIONS)
    .select('definition')
    .eq('slug', slug)
    .eq('is_published', true)
    .maybeSingle();

  if (error || !data) return null;
  return (data as { definition: ExperimentDefinition }).definition;
}

export interface SaveArgs {
  slug: string;
  sessionId: string;
  participantName: string;
  trialIndex: number;
  isPractice: boolean;
  response: string;
  isCorrect: boolean | null;
  reactionTimeMs: number;
  payload: Record<string, unknown>;
}

/**
 * Writes one trial.
 *
 * Returns whether it landed rather than throwing: a participant mid-experiment should
 * never see a crash because the network blipped, but the caller needs to know so it can
 * warn rather than let a class collect nothing in silence.
 */
export async function saveTrial(args: SaveArgs): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;

  const { error } = await sb.from(TABLE).insert({
    experiment_slug: args.slug,
    session_id: args.sessionId,
    participant_name: args.participantName,
    trial_index: args.trialIndex,
    is_practice: args.isPractice,
    response: args.response,
    is_correct: args.isCorrect,
    reaction_time_ms: args.reactionTimeMs,
    payload: args.payload,
  });
  return !error;
}

/**
 * Every non-practice row for one experiment, flattened for the dashboard.
 *
 * Paginated because the Supabase server silently caps a select at 1000 rows regardless of
 * .limit() — the bug that made several hand-written dashboards show only ~15 participants.
 */
export async function fetchRows(slug: string): Promise<ResultRow[]> {
  const sb = getSupabase();
  if (!sb) return [];

  const rows: ResultRow[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await sb
      .from(TABLE)
      .select('*')
      .eq('experiment_slug', slug)
      .eq('is_practice', false)
      .order('created_at', { ascending: true })
      .range(from, from + 999);

    if (error || !data || data.length === 0) break;

    for (const raw of data as Record<string, unknown>[]) {
      const { payload, ...spine } = raw;
      // Flattened so a chart's groupBy reads the same whether a field is spine or payload.
      rows.push({ ...spine, ...(payload as Record<string, unknown> ?? {}) } as ResultRow);
    }

    if (data.length < 1000) break;
    from += 1000;
  }

  return rows;
}
