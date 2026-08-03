-- Serial Order Memory Experiment Tables
-- Run this in the Supabase SQL editor

-- Drop existing tables if re-creating
DROP TABLE IF EXISTS serial_order_study;
DROP TABLE IF EXISTS serial_order_distractor;
DROP TABLE IF EXISTS serial_order_recall;

CREATE TABLE serial_order_study (
  id                bigint generated always as identity primary key,
  created_at        timestamptz default now() not null,
  session_id        text not null,
  participant_name  text,
  session_number    int not null default 1,
  serial_position   int not null,
  word              text not null,
  word_onset_time   text,
  word_offset_time  text
);

ALTER TABLE serial_order_study ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow insert" ON serial_order_study FOR INSERT WITH CHECK (true);
CREATE POLICY "allow select" ON serial_order_study FOR SELECT USING (true);

CREATE TABLE serial_order_distractor (
  id                  bigint generated always as identity primary key,
  created_at          timestamptz default now() not null,
  session_id          text not null,
  participant_name    text,
  problem             text not null,
  correct_answer      int not null,
  participant_answer  int,
  accuracy            boolean not null,
  reaction_time_ms    int,
  onset_time          text
);

ALTER TABLE serial_order_distractor ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow insert" ON serial_order_distractor FOR INSERT WITH CHECK (true);
CREATE POLICY "allow select" ON serial_order_distractor FOR SELECT USING (true);

CREATE TABLE serial_order_recall (
  id                      bigint generated always as identity primary key,
  created_at              timestamptz default now() not null,
  session_id              text not null,
  participant_name        text,
  session_number          int not null default 1,
  output_position         int not null,
  response_raw            text,
  response_clean          text,
  matched_word            text,
  matched_serial_position int,
  is_correct_recall       boolean not null default false,
  is_repetition           boolean not null default false,
  recall_submission_time  text
);

ALTER TABLE serial_order_recall ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow insert" ON serial_order_recall FOR INSERT WITH CHECK (true);
CREATE POLICY "allow select" ON serial_order_recall FOR SELECT USING (true);
