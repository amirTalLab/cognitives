CREATE TABLE IF NOT EXISTS two_step_results (
  id                    bigint generated always as identity primary key,
  created_at            timestamptz default now() not null,
  session_id            text not null,
  participant_name      text,
  trial_index           int not null,
  is_practice           boolean default false,
  stage1_choice         text,
  stage1_stimulus       text,
  stage1_rt_ms          int,
  transition_type       text,
  stage2_state          text,
  stage2_choice         text,
  stage2_stimulus       text,
  stage2_rt_ms          int,
  rewarded              boolean,
  reward_prob_s2a_left  double precision,
  reward_prob_s2a_right double precision,
  reward_prob_s2b_left  double precision,
  reward_prob_s2b_right double precision,
  missed_stage1         boolean default false,
  missed_stage2         boolean default false
);

ALTER TABLE two_step_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow insert" ON two_step_results FOR INSERT WITH CHECK (true);
CREATE POLICY "allow select" ON two_step_results FOR SELECT USING (true);
