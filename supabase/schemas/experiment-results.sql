-- One table for every definition-based experiment.
--
-- Run this once. No experiment created through /create will ever need another table, and
-- no refine will ever need a migration: anything experiment-specific goes in `payload`,
-- so adding, renaming or removing a measured field changes no schema at all.
--
-- This is what removes the failure mode where a refine changed the columns, CREATE TABLE
-- IF NOT EXISTS quietly did nothing, and a whole class then collected no data.

CREATE TABLE IF NOT EXISTS experiment_results (
  id               bigint generated always as identity primary key,
  created_at       timestamptz default now() not null,

  -- Which experiment this row belongs to.
  experiment_slug  text not null,

  -- The spine every experiment shares.
  session_id       text not null,
  participant_name text,
  trial_index      int,
  is_practice      boolean default false,
  response         text,
  is_correct       boolean,          -- null for tasks with no correct answer
  reaction_time_ms int,

  -- Everything paradigm-specific: conditions, stimuli, extra responses.
  payload          jsonb default '{}'::jsonb
);

-- The dashboard always filters by slug and practice, and orders by time.
CREATE INDEX IF NOT EXISTS experiment_results_slug_idx
  ON experiment_results (experiment_slug, is_practice, created_at);

ALTER TABLE experiment_results ENABLE ROW LEVEL SECURITY;

-- Matches the rest of the site: participants insert, teachers read. Both go through the
-- public anon key, so this is a UI-level boundary rather than a security one — the same
-- interim position as every other table here, to be replaced by real auth alongside them.
CREATE POLICY "allow insert" ON experiment_results FOR INSERT WITH CHECK (true);
CREATE POLICY "allow select" ON experiment_results FOR SELECT USING (true);
