-- DRM False Memory — the base results table.
--
-- RECONSTRUCTED. Every other table in this folder has the CREATE TABLE that made it;
-- this one never did. drm.sql only ever ALTERed drm_results, which means the original
-- CREATE was typed into the SQL editor and never written down — so the schema in this
-- repo could not actually rebuild the database, and nobody found out until it had to.
--
-- Rebuilt from the live table: column names and nullability from 1,000 sampled rows,
-- types from their values, and the CHECK constraints from drm.sql and drm-v2.sql, which
-- are the authoritative record of what those constraints became.
--
-- Run this BEFORE drm.sql, which alters what is created here.

CREATE TABLE IF NOT EXISTS drm_results (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id        UUID NOT NULL,
  participant_name  TEXT,
  -- The word shown at test.
  word              TEXT NOT NULL,
  -- Constraint set by drm.sql; kept here so a fresh table starts in the right shape.
  item_type         TEXT NOT NULL CHECK (item_type IN (
                      'studied', 'critical_lure', 'unrelated_foil',
                      'related_distractor', 'unrelated_distractor')),
  -- The studied list a word came from, or 'none' for foils.
  list_theme        TEXT,
  response          TEXT NOT NULL CHECK (response IN ('old', 'new')),
  is_correct        BOOLEAN NOT NULL,
  reaction_time_ms  INTEGER NOT NULL,
  -- Only studied words have one, so this is null for roughly half the rows.
  serial_position   INTEGER CHECK (serial_position >= 1 AND serial_position <= 12),
  confidence        INTEGER CHECK (confidence >= 1 AND confidence <= 4),
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_drm_results_session ON drm_results (session_id);

-- Read and written with the anon key, like every other results table here. The app only
-- inserts and selects; nothing deletes, so no delete policy.
ALTER TABLE drm_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow insert" ON drm_results;
CREATE POLICY "allow insert" ON drm_results FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "allow select" ON drm_results;
CREATE POLICY "allow select" ON drm_results FOR SELECT USING (true);
