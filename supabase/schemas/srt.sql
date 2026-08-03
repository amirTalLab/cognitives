CREATE TABLE IF NOT EXISTS srt_results (
  id               bigint generated always as identity primary key,
  created_at       timestamptz default now() not null,
  session_id       text not null,
  participant_name text,
  block_number     int not null,
  trial_in_block   int not null,
  trial_overall    int not null,
  sequence_position int not null,
  target_location  int not null,
  response_location int not null,
  correct          boolean not null,
  rt_ms            int,
  sequence_type    text not null,
  is_practice      boolean default false
);

ALTER TABLE srt_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow insert" ON srt_results FOR INSERT WITH CHECK (true);
CREATE POLICY "allow select" ON srt_results FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS srt_generation (
  id               bigint generated always as identity primary key,
  created_at       timestamptz default now() not null,
  session_id       text not null,
  participant_name text,
  sequence         jsonb not null,
  main_is_a        boolean not null,
  noticed_regularity boolean
);

ALTER TABLE srt_generation ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow insert" ON srt_generation FOR INSERT WITH CHECK (true);
CREATE POLICY "allow select" ON srt_generation FOR SELECT USING (true);
