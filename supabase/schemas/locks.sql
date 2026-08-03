-- Experiment lock state for cognitives-xi.vercel.app
-- Run this once in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS experiment_locks (
  experiment_id  text primary key,
  is_locked      boolean default false,
  updated_at     timestamptz default now()
);

ALTER TABLE experiment_locks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow select" ON experiment_locks FOR SELECT USING (true);
CREATE POLICY "allow insert" ON experiment_locks FOR INSERT WITH CHECK (true);
CREATE POLICY "allow update" ON experiment_locks FOR UPDATE USING (true) WITH CHECK (true);

-- Seed all experiments as unlocked
INSERT INTO experiment_locks (experiment_id, is_locked) VALUES
  ('stroop',          false),
  ('drm',             false),
  ('bouba-kiki',      false),
  ('mentalRep',       false),
  ('summaryStats',    false),
  ('posnerCueing',    false),
  ('visualSearch',    false),
  ('CompositeFace',   false),
  ('wordSuperiority', false)
ON CONFLICT (experiment_id) DO NOTHING;
