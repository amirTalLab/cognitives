CREATE TABLE IF NOT EXISTS posner_results (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid NOT NULL,
  participant_name text,
  trial_number int NOT NULL,
  cue_direction text NOT NULL,
  target_side text NOT NULL,
  validity text NOT NULL,
  soa int NOT NULL,
  response text NOT NULL,
  correct boolean NOT NULL,
  rt_ms float8,
  is_practice boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_posner_results_session ON posner_results(session_id);
ALTER TABLE posner_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_insert" ON posner_results FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "allow_select" ON posner_results FOR SELECT TO anon USING (true);
CREATE POLICY "allow_delete" ON posner_results FOR DELETE TO anon USING (true);
