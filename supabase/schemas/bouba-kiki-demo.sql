CREATE TABLE IF NOT EXISTS bouba_kiki_demo_results (
  id               bigint generated always as identity primary key,
  created_at       timestamptz default now() not null,
  session_id       text not null,
  participant_name text,
  trial_index      int,
  left_shape       text,
  right_shape      text,
  chosen_shape     text,
  is_conventional  boolean,
  is_control       boolean,
  reaction_time_ms int,
  is_practice      boolean default false
);

ALTER TABLE bouba_kiki_demo_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow insert" ON bouba_kiki_demo_results FOR INSERT WITH CHECK (true);
CREATE POLICY "allow select" ON bouba_kiki_demo_results FOR SELECT USING (true);
