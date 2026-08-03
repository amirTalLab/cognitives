CREATE TABLE IF NOT EXISTS testing_effect_results (
  id               bigint generated always as identity primary key,
  created_at       timestamptz default now() not null,
  session_id       text not null,
  participant_name text not null,
  counterbalance_group int not null,
  session_number   int not null,
  phase            text not null,
  practice_round   int,
  trial_index      int not null,
  cue              text not null,
  target           text not null,
  condition        text not null,
  trial_type       text not null,
  response         text,
  is_correct       boolean,
  reaction_time_ms int
);

ALTER TABLE testing_effect_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow insert" ON testing_effect_results FOR INSERT WITH CHECK (true);
CREATE POLICY "allow select" ON testing_effect_results FOR SELECT USING (true);
