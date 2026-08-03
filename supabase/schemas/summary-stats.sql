-- Summary Statistics / Ensemble Perception – Supabase Schema (v2)
-- Run this in the Supabase SQL editor.
-- If upgrading from v1, use the ALTER TABLE section at the bottom instead.

-- ──────────────────────────────────────────────────────────────────────────
-- FRESH INSTALL (no existing table)
-- ──────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS summary_stats_results (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id       UUID NOT NULL,
  participant_name TEXT,
  trial_type       TEXT NOT NULL CHECK (trial_type IN ('ensemble', 'recognition', '2afc')),
  trial_number     INT  NOT NULL,
  stimulus_type    TEXT NOT NULL CHECK (stimulus_type IN ('circles', 'line-lengths', 'line-orientations')),

  -- Ensemble-only fields
  stat_type        TEXT   CHECK (stat_type IN ('mean', 'max', 'min')),
  n_items          INT,
  true_value       FLOAT,
  response_value   FLOAT,
  signed_error     FLOAT,
  absolute_error   FLOAT,
  is_practice      BOOLEAN,

  -- Recognition-only fields
  probe_value      FLOAT,
  probe_is_target  BOOLEAN,
  response_yes     BOOLEAN,
  is_correct       BOOLEAN,

  -- 2AFC-only fields (foil_value, correct_is_a, chose_a; is_correct shared above)
  foil_value       FLOAT,
  correct_is_a     BOOLEAN,
  chose_a          BOOLEAN,

  -- Common
  reaction_time_ms FLOAT NOT NULL,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE summary_stats_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon inserts on summary_stats_results"
  ON summary_stats_results FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow anon reads on summary_stats_results"
  ON summary_stats_results FOR SELECT USING (true);

CREATE INDEX IF NOT EXISTS idx_summary_stats_session
  ON summary_stats_results (session_id);


-- ──────────────────────────────────────────────────────────────────────────
-- UPGRADE from v1 (table already exists without 2AFC columns)
-- Run ONLY this block if you already ran the v1 schema.
-- ──────────────────────────────────────────────────────────────────────────

-- ALTER TABLE summary_stats_results
--   ADD COLUMN IF NOT EXISTS foil_value   FLOAT,
--   ADD COLUMN IF NOT EXISTS correct_is_a BOOLEAN,
--   ADD COLUMN IF NOT EXISTS chose_a      BOOLEAN;
--
-- -- Drop & recreate the trial_type check to include '2afc'
-- ALTER TABLE summary_stats_results
--   DROP CONSTRAINT IF EXISTS summary_stats_results_trial_type_check;
-- ALTER TABLE summary_stats_results
--   ADD CONSTRAINT summary_stats_results_trial_type_check
--   CHECK (trial_type IN ('ensemble', 'recognition', '2afc'));
