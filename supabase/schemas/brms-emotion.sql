-- bRMS Emotion × Orientation experiment
-- Run this in the Supabase SQL editor before testing data collection.

CREATE TABLE IF NOT EXISTS brms_emotion_results (
  id               uuid default gen_random_uuid() primary key,
  created_at       timestamptz default now() not null,
  session_id       uuid not null,
  participant_name text,
  trial_index      int,
  emotion          text not null,
  orientation      text not null,
  identity_id      text,
  stimulus_set     text not null,
  side_shown       text not null,
  side_response    text not null,
  is_correct       boolean not null,
  reaction_time_ms int not null,
  max_contrast     int default 70,
  rescue_triggered boolean default false,
  timing_flag      boolean default false,
  is_practice      boolean default false
);

CREATE INDEX idx_brms_emotion_results_session_id ON brms_emotion_results(session_id);

ALTER TABLE brms_emotion_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous inserts" ON brms_emotion_results
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Allow anonymous selects" ON brms_emotion_results
  FOR SELECT TO anon USING (true);

GRANT SELECT, INSERT ON brms_emotion_results TO anon, authenticated;
