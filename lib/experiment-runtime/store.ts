// Reading and writing results.
//
// ONE table for every definition-based experiment, ever: a fixed spine of columns plus a
// JSONB payload. That is what removes the whole class of database problems the code path
// has — no per-experiment DDL, no migration when a refine adds a field, no orphan tables,
// no silent insert failure when the schema drifts from the code.
//
// Run supabase/schemas/experiment-results.sql once. Nothing after that.

import { getSupabase } from '@/lib/supabase';
import { describeWriteError, storedPassword } from '@/lib/protected-writes';
import type { ResultRow } from './aggregate';
import type { ExperimentDefinition } from './schema';

const TABLE = 'experiment_results';
const DEFINITIONS = 'experiment_definitions';

/**
 * Publishes a definition so it outlives the browser session that made it.
 *
 * Before this, a generated experiment lived only in sessionStorage — which meant a
 * homepage link to it worked for one person, in one tab, until they closed it.
 *
 * Through the password-checked database function rather than a direct upsert: the public
 * key cannot write this table, or anyone could replace a published experiment. The
 * password is the one the lecturer typed at /create's gate (lib/protected-writes.ts).
 */
export async function publishDefinition(
  def: ExperimentDefinition,
): Promise<{ ok: boolean; error?: string; revision?: number }> {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: 'Supabase is not configured.' };

  // The revision is attached when a definition is LOADED, not authored in it. Sending it
  // back would store a stale version number inside the definition itself — and restoring
  // that revision later would carry a number that means nothing.
  const toPublish: ExperimentDefinition = { ...def };
  delete toPublish.revision;

  const { data, error } = await sb.rpc('publish_definition', {
    p_password: storedPassword(),
    p_slug: def.slug,
    p_title: def.title,
    p_title_he: def.titleHe,
    p_category: def.category,
    p_definition: toPublish,
    p_is_published: true,
  });

  if (error) {
    const missing = /relation .* does not exist|could not find the table/i.test(error.message);
    return {
      ok: false,
      error: missing
        ? 'The experiment_definitions table does not exist yet. Run supabase/schemas/experiment-definitions.sql in the Supabase SQL editor, then publish again.'
        : describeWriteError(error),
    };
  }
  // The function answers with the version it wrote. A database from before revisions
  // existed answers with nothing, which simply leaves the version unknown.
  return { ok: true, revision: typeof data === 'number' ? data : undefined };
}

/**
 * Loads a published definition. Returns null when it is absent or not yet published.
 *
 * The row's revision is carried on the definition, so every trial run from it can be saved
 * with the version it ran under. A database from before revisions exist answers without the
 * column, which simply leaves the revision undefined.
 */
export async function loadDefinition(slug: string): Promise<ExperimentDefinition | null> {
  const sb = getSupabase();
  if (!sb) return null;

  const read = (columns: string) => sb
    .from(DEFINITIONS)
    .select(columns)
    .eq('slug', slug)
    .eq('is_published', true)
    .maybeSingle();

  let { data, error } = await read('definition, revision');

  // A database that has not run definition-revisions.sql has no such column, and asking for
  // it fails the whole read. An experiment that exists must never look missing to a student
  // over a column that only labels its version, so the version is simply dropped.
  if (error && /revision/i.test(error.message)) {
    ({ data, error } = await read('definition'));
  }

  if (error || !data) return null;
  const row = data as unknown as { definition: ExperimentDefinition; revision?: number };
  return typeof row.revision === 'number'
    ? { ...row.definition, revision: row.revision }
    : row.definition;
}

/** One published experiment, as the builder lists them for editing. */
export interface PublishedSummary {
  slug: string;
  title: string;
  category: string;
  revision?: number;
  updatedAt: string;
}

/**
 * Every published experiment, newest change first.
 *
 * This is what makes a published experiment editable: the builder lists these, loads one
 * back into Refine, and republishes it as a new version. Reading is open to the public key
 * — it is the same data the runtime already serves to participants.
 */
export async function listPublished(): Promise<PublishedSummary[]> {
  const sb = getSupabase();
  if (!sb) return [];

  const read = (columns: string) => sb
    .from(DEFINITIONS)
    .select(columns)
    .eq('is_published', true)
    .order('updated_at', { ascending: false });

  let { data, error } = await read('slug, title, category, updated_at, revision');
  // A database without the revision column still lists fine; the version is simply unknown.
  if (error && /revision/i.test(error.message)) ({ data, error } = await read('slug, title, category, updated_at'));
  if (error || !data) return [];

  return (data as unknown as Record<string, unknown>[]).map(row => ({
    slug: String(row.slug),
    title: String(row.title ?? row.slug),
    category: String(row.category ?? ''),
    revision: typeof row.revision === 'number' ? row.revision : undefined,
    updatedAt: String(row.updated_at ?? ''),
  }));
}

export interface SaveArgs {
  slug: string;
  sessionId: string;
  participantName: string;
  trialIndex: number;
  isPractice: boolean;
  response: string;
  isCorrect: boolean | null;
  /** Null when there was no timed response: a timeout, or an answer given too early. */
  reactionTimeMs: number | null;
  payload: Record<string, unknown>;
  /** Which published version of the experiment this trial ran under, when it has one. */
  definitionRevision?: number | null;
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

  const row: Record<string, unknown> = {
    experiment_slug: args.slug,
    session_id: args.sessionId,
    participant_name: args.participantName,
    trial_index: args.trialIndex,
    is_practice: args.isPractice,
    response: args.response,
    is_correct: args.isCorrect,
    reaction_time_ms: args.reactionTimeMs,
    payload: args.payload,
  };
  if (typeof args.definitionRevision === 'number') {
    row.definition_revision = args.definitionRevision;
  }

  const { error } = await sb.from(TABLE).insert(row);
  if (!error) return true;

  // A database that has not run definition-revisions.sql has no such column. Losing a
  // class's data over a column that only labels it would be the wrong trade, so the trial
  // is saved without the label instead.
  if ('definition_revision' in row && /definition_revision/i.test(error.message)) {
    delete row.definition_revision;
    const retry = await sb.from(TABLE).insert(row);
    return !retry.error;
  }
  return false;
}

/**
 * Every non-practice row for one experiment, flattened for the dashboard.
 *
 * Paginated because the Supabase server silently caps a select at 1000 rows regardless of
 * .limit() — the bug that made several hand-written dashboards show only ~15 participants.
 */
/**
 * What a returning participant was assigned last time, for an experiment run in two visits.
 *
 * The testing effect is why: it studies word pairs one week and tests them the next, and
 * which set of pairs got which treatment has to be the SAME both times, or the comparison is
 * between two different people's conditions.
 *
 * Only ONE value is recovered — the assignment label — and everything else follows from it
 * in the definition. That keeps the lookup to a single narrow read.
 *
 * Three answers, and the difference matters:
 *   null        — no earlier visit. The caller refuses rather than drawing a fresh
 *                 assignment, which would test someone on pairs they never studied and
 *                 produce a row that looks perfectly valid.
 *   AMBIGUOUS   — more than one distinct assignment under that name, so two people share it.
 *                 Guessing would silently put one of them in the other's condition.
 *   a label     — what they were given.
 */
export const AMBIGUOUS = Symbol('ambiguous participant');

export async function previousAssignment(
  slug: string,
  participantName: string,
  field: string,
): Promise<string | null | typeof AMBIGUOUS> {
  const sb = getSupabase();
  if (!sb) return null;

  const { data, error } = await sb
    .from(TABLE)
    .select('payload')
    .eq('experiment_slug', slug)
    .eq('participant_name', participantName)
    .eq('is_practice', false)
    .limit(500);

  if (error || !data || data.length === 0) return null;

  const key = field.replace(/\./g, '_');
  const found = new Set<string>();
  for (const row of data as { payload?: Record<string, unknown> }[]) {
    const value = row.payload?.[key];
    if (value !== undefined && value !== null) found.add(String(value));
  }

  if (found.size === 0) return null;
  if (found.size > 1) return AMBIGUOUS;
  return [...found][0];
}

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
