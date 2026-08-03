-- Summary Statistics / Ensemble Perception – Schema migration v2
-- Adds probe_type and foil_type columns, updates constraints
-- Run in the Supabase SQL editor.

-- Add new columns (safe to run if they already exist)
ALTER TABLE summary_stats_results
  ADD COLUMN IF NOT EXISTS probe_type TEXT,
  ADD COLUMN IF NOT EXISTS foil_type  TEXT;

-- Update stimulus_type check: drop old constraint, add new (circles + line-lengths only)
ALTER TABLE summary_stats_results
  DROP CONSTRAINT IF EXISTS summary_stats_results_stimulus_type_check;
ALTER TABLE summary_stats_results
  ADD CONSTRAINT summary_stats_results_stimulus_type_check
  CHECK (stimulus_type IN ('circles', 'line-lengths', 'line-orientations'));
-- Note: kept 'line-orientations' in constraint for backward compatibility with old rows.

-- Update stat_type check: allow 'mean' only (plus NULL for non-ensemble rows)
-- Old rows may have 'max'/'min' values so we keep them valid here:
-- (no change to stat_type constraint to preserve backward compatibility)

-- Verify
SELECT column_name, data_type FROM information_schema.columns
  WHERE table_name = 'summary_stats_results'
  ORDER BY ordinal_position;
