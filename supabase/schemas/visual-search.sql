CREATE TABLE IF NOT EXISTS visual_search_results (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid NOT NULL,
  participant_name text,
  trial_number int NOT NULL,
  block text NOT NULL,
  set_size int NOT NULL,
  target_present boolean NOT NULL,
  response text NOT NULL,
  correct boolean NOT NULL,
  rt_ms float8 NOT NULL,
  is_practice boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_visual_search_results_session ON visual_search_results(session_id);
ALTER TABLE visual_search_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_insert" ON visual_search_results FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "allow_select" ON visual_search_results FOR SELECT TO anon USING (true);
CREATE POLICY "allow_delete" ON visual_search_results FOR DELETE TO anon USING (true);
