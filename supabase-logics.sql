CREATE TABLE IF NOT EXISTS logics_results (
  id                bigint generated always as identity primary key,
  created_at        timestamptz default now() not null,
  session_id        text not null,
  participant_name  text,
  language          text,
  group_assignment  text,
  question_code     text not null,
  response          text,
  response_numeric  float,
  reaction_time_ms  int,
  question_order    int,
  rule_triples_json text,
  rule_guess        text
);

ALTER TABLE logics_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow insert" ON logics_results FOR INSERT WITH CHECK (true);
CREATE POLICY "allow select" ON logics_results FOR SELECT USING (true);

GRANT SELECT, INSERT ON logics_results TO anon, authenticated;
