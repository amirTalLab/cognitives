-- DRM False Memory Experiment — Schema Update
-- Run this in the Supabase SQL Editor

-- ============================================================
-- 1. Update existing drm_results table
-- ============================================================

-- Update item_type constraint to new values
ALTER TABLE drm_results DROP CONSTRAINT IF EXISTS drm_results_item_type_check;
ALTER TABLE drm_results ADD CONSTRAINT drm_results_item_type_check
  CHECK (item_type IN ('studied', 'critical_lure', 'unrelated_foil',
                        'related_distractor', 'unrelated_distractor'));

-- Ensure GRANT for Data API access
GRANT SELECT, INSERT ON drm_results TO anon, authenticated;

-- ============================================================
-- 2. Create new drm_recall_results table
-- ============================================================

CREATE TABLE IF NOT EXISTS drm_recall_results (
  id                         bigint generated always as identity primary key,
  created_at                 timestamptz default now() not null,
  session_id                 text not null,
  participant_name           text,
  list_index                 int not null,
  list_theme                 text not null,
  recalled_words             text,
  critical_lure_recalled     boolean not null default false,
  correct_count              int not null default 0,
  intrusion_count            int not null default 0,
  prior_list_intrusion_count int not null default 0
);

ALTER TABLE drm_recall_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow insert" ON drm_recall_results FOR INSERT WITH CHECK (true);
CREATE POLICY "allow select" ON drm_recall_results FOR SELECT USING (true);

GRANT SELECT, INSERT ON drm_recall_results TO anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_drm_recall_session ON drm_recall_results(session_id);

-- ============================================================
-- 3. Add distractor columns to drm_recall_results
-- ============================================================

ALTER TABLE drm_recall_results ADD COLUMN IF NOT EXISTS distractor_correct int default 0;
ALTER TABLE drm_recall_results ADD COLUMN IF NOT EXISTS distractor_total int default 0;
