-- Everything this site needs, on a fresh Supabase project.
--
-- Run this ONCE, in the SQL editor, on a project that has nothing in it. It is the
-- concatenation of every file in this folder in dependency order, with the policy
-- statements guarded so the whole thing is safe to run again.
--
-- It creates the schema only. No student data comes with it — the results tables start
-- empty, and the lock table is seeded with every experiment unlocked.
--
-- Afterwards, check it worked with:  npm run exp:doctor



-- ==========================================================================
-- 1. One results table per experiment
-- ==========================================================================


-- ---- locks.sql -----------------------------------------------------

-- Experiment lock state for cognitives.vercel.app
-- Run this once in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS experiment_locks (
  experiment_id  text primary key,
  is_locked      boolean default false,
  updated_at     timestamptz default now()
);

ALTER TABLE experiment_locks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow select" ON experiment_locks;
CREATE POLICY "allow select" ON experiment_locks FOR SELECT USING (true);
DROP POLICY IF EXISTS "allow insert" ON experiment_locks;
CREATE POLICY "allow insert" ON experiment_locks FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "allow update" ON experiment_locks;
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


-- ---- stroop.sql ----------------------------------------------------

-- Stroop Lab Database Schema
-- Run this in your Supabase SQL Editor to create the required table

-- Create the stroop_results table
CREATE TABLE stroop_results (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid NOT NULL,
  participant_name text,
  word_text text NOT NULL,
  font_color text NOT NULL,
  is_congruent boolean NOT NULL,
  reaction_time_ms float8 NOT NULL,
  user_response text NOT NULL,
  is_correct boolean NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create index for faster session queries
CREATE INDEX idx_stroop_results_session_id ON stroop_results(session_id);

-- Enable Row Level Security
ALTER TABLE stroop_results ENABLE ROW LEVEL SECURITY;

-- Allow anonymous inserts (for recording experiment results)
DROP POLICY IF EXISTS "Allow anonymous inserts" ON stroop_results;
CREATE POLICY "Allow anonymous inserts" ON stroop_results
  FOR INSERT TO anon WITH CHECK (true);

-- Allow anonymous selects (for viewing results)
DROP POLICY IF EXISTS "Allow anonymous selects" ON stroop_results;
CREATE POLICY "Allow anonymous selects" ON stroop_results
  FOR SELECT TO anon USING (true);

-- Allow anonymous deletes (for clearing session results)
DROP POLICY IF EXISTS "Allow anonymous deletes" ON stroop_results;
CREATE POLICY "Allow anonymous deletes" ON stroop_results
  FOR DELETE TO anon USING (true);


-- ---- drm-base.sql --------------------------------------------------

-- DRM False Memory — the base results table.
--
-- RECONSTRUCTED. Every other table in this folder has the CREATE TABLE that made it;
-- this one never did. drm.sql only ever ALTERed drm_results, which means the original
-- CREATE was typed into the SQL editor and never written down — so the schema in this
-- repo could not actually rebuild the database, and nobody found out until it had to.
--
-- Rebuilt from the live table: column names and nullability from 1,000 sampled rows,
-- types from their values, and the CHECK constraints from drm.sql and drm-v2.sql, which
-- are the authoritative record of what those constraints became.
--
-- Run this BEFORE drm.sql, which alters what is created here.

CREATE TABLE IF NOT EXISTS drm_results (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id        UUID NOT NULL,
  participant_name  TEXT,
  -- The word shown at test.
  word              TEXT NOT NULL,
  -- Constraint set by drm.sql; kept here so a fresh table starts in the right shape.
  item_type         TEXT NOT NULL CHECK (item_type IN (
                      'studied', 'critical_lure', 'unrelated_foil',
                      'related_distractor', 'unrelated_distractor')),
  -- The studied list a word came from, or 'none' for foils.
  list_theme        TEXT,
  response          TEXT NOT NULL CHECK (response IN ('old', 'new')),
  is_correct        BOOLEAN NOT NULL,
  reaction_time_ms  INTEGER NOT NULL,
  -- Only studied words have one, so this is null for roughly half the rows.
  serial_position   INTEGER CHECK (serial_position >= 1 AND serial_position <= 12),
  confidence        INTEGER CHECK (confidence >= 1 AND confidence <= 4),
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_drm_results_session ON drm_results (session_id);

-- Read and written with the anon key, like every other results table here. The app only
-- inserts and selects; nothing deletes, so no delete policy.
ALTER TABLE drm_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow insert" ON drm_results;
DROP POLICY IF EXISTS "allow insert" ON drm_results;
CREATE POLICY "allow insert" ON drm_results FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "allow select" ON drm_results;
DROP POLICY IF EXISTS "allow select" ON drm_results;
CREATE POLICY "allow select" ON drm_results FOR SELECT USING (true);


-- ---- drm.sql -------------------------------------------------------

-- DRM False Memory Experiment — Schema Update
-- Run this in the Supabase SQL Editor

-- ============================================================
-- 1. Update existing drm_results table
-- ============================================================

-- Update item_type constraint to new values
ALTER TABLE drm_results DROP CONSTRAINT IF EXISTS drm_results_item_type_check;
ALTER TABLE drm_results ADD CONSTRAINT drm_results_item_type_check
  CHECK (item_type IN ('studied', 'critical_lure', 'unrelated_foil',
                        'related_distractor', 'unrelated_distractor'));

-- Ensure GRANT for Data API access
GRANT SELECT, INSERT ON drm_results TO anon, authenticated;

-- ============================================================
-- 2. Create new drm_recall_results table
-- ============================================================

CREATE TABLE IF NOT EXISTS drm_recall_results (
  id                         bigint generated always as identity primary key,
  created_at                 timestamptz default now() not null,
  session_id                 text not null,
  participant_name           text,
  list_index                 int not null,
  list_theme                 text not null,
  recalled_words             text,
  critical_lure_recalled     boolean not null default false,
  correct_count              int not null default 0,
  intrusion_count            int not null default 0,
  prior_list_intrusion_count int not null default 0
);

ALTER TABLE drm_recall_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow insert" ON drm_recall_results;
CREATE POLICY "allow insert" ON drm_recall_results FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "allow select" ON drm_recall_results;
CREATE POLICY "allow select" ON drm_recall_results FOR SELECT USING (true);

GRANT SELECT, INSERT ON drm_recall_results TO anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_drm_recall_session ON drm_recall_results(session_id);

-- ============================================================
-- 3. Add distractor columns to drm_recall_results
-- ============================================================

ALTER TABLE drm_recall_results ADD COLUMN IF NOT EXISTS distractor_correct int default 0;
ALTER TABLE drm_recall_results ADD COLUMN IF NOT EXISTS distractor_total int default 0;


-- ---- bouba-kiki.sql ------------------------------------------------

-- Bouba-Kiki Experiment Database Schema
-- Run this in your Supabase SQL Editor to create the bouba_kiki_results table

-- Create the bouba_kiki_results table
CREATE TABLE bouba_kiki_results (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid NOT NULL,
  participant_name text,
  trial_number integer NOT NULL CHECK (trial_number >= 1),
  word text NOT NULL,
  word_type text NOT NULL CHECK (word_type IN ('rounded', 'spiky')),
  left_shape text NOT NULL,
  right_shape text NOT NULL,
  response text NOT NULL CHECK (response IN ('left', 'right')),
  is_correct boolean NOT NULL,
  reaction_time_ms float8 NOT NULL CHECK (reaction_time_ms >= 0),
  is_control boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Create indexes for better query performance
CREATE INDEX idx_bouba_kiki_session_id ON bouba_kiki_results(session_id);
CREATE INDEX idx_bouba_kiki_word_type ON bouba_kiki_results(word_type);
CREATE INDEX idx_bouba_kiki_is_control ON bouba_kiki_results(is_control);
CREATE INDEX idx_bouba_kiki_created_at ON bouba_kiki_results(created_at);

-- Enable Row Level Security
ALTER TABLE bouba_kiki_results ENABLE ROW LEVEL SECURITY;

-- Allow anonymous inserts (for participants)
DROP POLICY IF EXISTS "Allow anonymous inserts" ON bouba_kiki_results;
CREATE POLICY "Allow anonymous inserts" ON bouba_kiki_results
  FOR INSERT TO anon WITH CHECK (true);

-- Allow anonymous selects (for viewing results)
DROP POLICY IF EXISTS "Allow anonymous selects" ON bouba_kiki_results;
CREATE POLICY "Allow anonymous selects" ON bouba_kiki_results
  FOR SELECT TO anon USING (true);

-- Allow anonymous deletes (for clearing session results)
DROP POLICY IF EXISTS "Allow anonymous deletes" ON bouba_kiki_results;
CREATE POLICY "Allow anonymous deletes" ON bouba_kiki_results
  FOR DELETE TO anon USING (true);


-- ---- bouba-kiki-demo.sql -------------------------------------------

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
DROP POLICY IF EXISTS "allow insert" ON bouba_kiki_demo_results;
CREATE POLICY "allow insert" ON bouba_kiki_demo_results FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "allow select" ON bouba_kiki_demo_results;
CREATE POLICY "allow select" ON bouba_kiki_demo_results FOR SELECT USING (true);


-- ---- mental-rep.sql ------------------------------------------------

-- Mental Representation Experiment Schema
-- Combines Mental Scanning (Kosslyn) and Mental Rotation (Shepard & Metzler)

-- Create the mental_rep_results table
CREATE TABLE IF NOT EXISTS mental_rep_results (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL,
  participant_name TEXT,
  experiment_type TEXT NOT NULL CHECK (experiment_type IN ('scanning', 'rotation')),
  trial_number INTEGER NOT NULL,

  -- Scanning-specific fields
  from_landmark TEXT,
  to_landmark TEXT,
  distance FLOAT,
  found_target BOOLEAN,

  -- Rotation-specific fields
  figure_id TEXT,
  left_angle INTEGER,
  right_angle INTEGER,
  is_same BOOLEAN,
  rotation_difference INTEGER,
  response TEXT,
  is_correct BOOLEAN,
  is_practice BOOLEAN,

  -- Common fields
  reaction_time_ms FLOAT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_mental_rep_session_id ON mental_rep_results(session_id);
CREATE INDEX IF NOT EXISTS idx_mental_rep_experiment_type ON mental_rep_results(experiment_type);
CREATE INDEX IF NOT EXISTS idx_mental_rep_created_at ON mental_rep_results(created_at);

-- Enable Row Level Security (RLS)
ALTER TABLE mental_rep_results ENABLE ROW LEVEL SECURITY;

-- Create policy to allow inserts from anonymous users
DROP POLICY IF EXISTS "Allow anonymous inserts" ON mental_rep_results;
CREATE POLICY "Allow anonymous inserts" ON mental_rep_results
  FOR INSERT
  WITH CHECK (true);

-- Create policy to allow reads from anonymous users
DROP POLICY IF EXISTS "Allow anonymous reads" ON mental_rep_results;
CREATE POLICY "Allow anonymous reads" ON mental_rep_results
  FOR SELECT
  USING (true);

-- Create policy to allow deletes from anonymous users (for clearing own data)
DROP POLICY IF EXISTS "Allow anonymous deletes" ON mental_rep_results;
CREATE POLICY "Allow anonymous deletes" ON mental_rep_results
  FOR DELETE
  USING (true);

-- Grant necessary permissions to anon role
GRANT INSERT, SELECT, DELETE ON mental_rep_results TO anon;
GRANT USAGE ON SCHEMA public TO anon;


-- ---- summary-stats.sql ---------------------------------------------

-- Summary Statistics / Ensemble Perception – Supabase Schema (v2)
-- Run this in the Supabase SQL editor.
-- If upgrading from v1, use the ALTER TABLE section at the bottom instead.

-- ──────────────────────────────────────────────────────────────────────────
-- FRESH INSTALL (no existing table)
-- ──────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS summary_stats_results (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id       UUID NOT NULL,
  participant_name TEXT,
  trial_type       TEXT NOT NULL CHECK (trial_type IN ('ensemble', 'recognition', '2afc')),
  trial_number     INT  NOT NULL,
  stimulus_type    TEXT NOT NULL CHECK (stimulus_type IN ('circles', 'line-lengths', 'line-orientations')),

  -- Ensemble-only fields
  stat_type        TEXT   CHECK (stat_type IN ('mean', 'max', 'min')),
  n_items          INT,
  true_value       FLOAT,
  response_value   FLOAT,
  signed_error     FLOAT,
  absolute_error   FLOAT,
  is_practice      BOOLEAN,

  -- Recognition-only fields
  probe_value      FLOAT,
  probe_is_target  BOOLEAN,
  response_yes     BOOLEAN,
  is_correct       BOOLEAN,

  -- 2AFC-only fields (foil_value, correct_is_a, chose_a; is_correct shared above)
  foil_value       FLOAT,
  correct_is_a     BOOLEAN,
  chose_a          BOOLEAN,

  -- Common
  reaction_time_ms FLOAT NOT NULL,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE summary_stats_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon inserts on summary_stats_results" ON summary_stats_results;
CREATE POLICY "Allow anon inserts on summary_stats_results"
  ON summary_stats_results FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon reads on summary_stats_results" ON summary_stats_results;
CREATE POLICY "Allow anon reads on summary_stats_results"
  ON summary_stats_results FOR SELECT USING (true);

CREATE INDEX IF NOT EXISTS idx_summary_stats_session
  ON summary_stats_results (session_id);


-- ──────────────────────────────────────────────────────────────────────────
-- UPGRADE from v1 (table already exists without 2AFC columns)
-- Run ONLY this block if you already ran the v1 schema.
-- ──────────────────────────────────────────────────────────────────────────

-- ALTER TABLE summary_stats_results
--   ADD COLUMN IF NOT EXISTS foil_value   FLOAT,
--   ADD COLUMN IF NOT EXISTS correct_is_a BOOLEAN,
--   ADD COLUMN IF NOT EXISTS chose_a      BOOLEAN;
--
-- -- Drop & recreate the trial_type check to include '2afc'
-- ALTER TABLE summary_stats_results
--   DROP CONSTRAINT IF EXISTS summary_stats_results_trial_type_check;
-- ALTER TABLE summary_stats_results
--   ADD CONSTRAINT summary_stats_results_trial_type_check
--   CHECK (trial_type IN ('ensemble', 'recognition', '2afc'));


-- ---- posner-cueing.sql ---------------------------------------------

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
DROP POLICY IF EXISTS "allow_insert" ON posner_results;
CREATE POLICY "allow_insert" ON posner_results FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS "allow_select" ON posner_results;
CREATE POLICY "allow_select" ON posner_results FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "allow_delete" ON posner_results;
CREATE POLICY "allow_delete" ON posner_results FOR DELETE TO anon USING (true);


-- ---- visual-search.sql ---------------------------------------------

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
DROP POLICY IF EXISTS "allow_insert" ON visual_search_results;
CREATE POLICY "allow_insert" ON visual_search_results FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS "allow_select" ON visual_search_results;
CREATE POLICY "allow_select" ON visual_search_results FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "allow_delete" ON visual_search_results;
CREATE POLICY "allow_delete" ON visual_search_results FOR DELETE TO anon USING (true);


-- ---- composite-face.sql --------------------------------------------

-- Composite Face Task results table
CREATE TABLE IF NOT EXISTS composite_face_results (
  id                UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  session_id        TEXT    NOT NULL,
  participant_name  TEXT,
  trial_index       INTEGER NOT NULL,
  condition         TEXT    NOT NULL,  -- 'aligned' | 'small-misaligned' | 'large-misaligned'
  is_same           BOOLEAN NOT NULL,  -- true = test top half IS same person as study face
  response          TEXT    NOT NULL,  -- 'same' | 'different'
  is_correct        BOOLEAN NOT NULL,
  reaction_time_ms  INTEGER NOT NULL,
  study_face        TEXT    NOT NULL,
  test_top_face     TEXT    NOT NULL,
  test_bottom_face  TEXT    NOT NULL,
  is_practice       BOOLEAN DEFAULT FALSE
);

ALTER TABLE composite_face_results ENABLE ROW LEVEL SECURITY;

-- Participants can insert their own results
DROP POLICY IF EXISTS "anon insert" ON composite_face_results;
CREATE POLICY "anon insert" ON composite_face_results
  FOR INSERT TO anon WITH CHECK (true);

-- Teacher dashboard reads all rows (password protected in UI)
DROP POLICY IF EXISTS "anon select" ON composite_face_results;
CREATE POLICY "anon select" ON composite_face_results
  FOR SELECT TO anon USING (true);


-- ---- word-superiority.sql ------------------------------------------

CREATE TABLE IF NOT EXISTS word_superiority_results (
  id                UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  session_id        TEXT    NOT NULL,
  participant_name  TEXT,
  trial_index       INTEGER NOT NULL,
  condition         TEXT    NOT NULL,  -- 'word' | 'pseudoword' | 'single-letter'
  stimulus          TEXT    NOT NULL,
  correct_letter    TEXT    NOT NULL,
  response_letter   TEXT    NOT NULL,
  is_correct        BOOLEAN NOT NULL,
  reaction_time_ms  INTEGER NOT NULL,
  is_practice       BOOLEAN DEFAULT FALSE
);

ALTER TABLE word_superiority_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon insert" ON word_superiority_results;
CREATE POLICY "anon insert" ON word_superiority_results
  FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "anon select" ON word_superiority_results;
CREATE POLICY "anon select" ON word_superiority_results
  FOR SELECT TO anon USING (true);


-- ---- srt.sql -------------------------------------------------------

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
DROP POLICY IF EXISTS "allow insert" ON srt_results;
CREATE POLICY "allow insert" ON srt_results FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "allow select" ON srt_results;
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
DROP POLICY IF EXISTS "allow insert" ON srt_generation;
CREATE POLICY "allow insert" ON srt_generation FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "allow select" ON srt_generation;
CREATE POLICY "allow select" ON srt_generation FOR SELECT USING (true);


-- ---- two-step-task.sql ---------------------------------------------

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
DROP POLICY IF EXISTS "allow insert" ON two_step_results;
CREATE POLICY "allow insert" ON two_step_results FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "allow select" ON two_step_results;
CREATE POLICY "allow select" ON two_step_results FOR SELECT USING (true);


-- ---- serial-order.sql ----------------------------------------------

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
DROP POLICY IF EXISTS "allow insert" ON serial_order_study;
CREATE POLICY "allow insert" ON serial_order_study FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "allow select" ON serial_order_study;
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
DROP POLICY IF EXISTS "allow insert" ON serial_order_distractor;
CREATE POLICY "allow insert" ON serial_order_distractor FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "allow select" ON serial_order_distractor;
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
DROP POLICY IF EXISTS "allow insert" ON serial_order_recall;
CREATE POLICY "allow insert" ON serial_order_recall FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "allow select" ON serial_order_recall;
CREATE POLICY "allow select" ON serial_order_recall FOR SELECT USING (true);


-- ---- testing-effect.sql --------------------------------------------

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
DROP POLICY IF EXISTS "allow insert" ON testing_effect_results;
CREATE POLICY "allow insert" ON testing_effect_results FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "allow select" ON testing_effect_results;
CREATE POLICY "allow select" ON testing_effect_results FOR SELECT USING (true);


-- ---- logics.sql ----------------------------------------------------

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
DROP POLICY IF EXISTS "allow insert" ON logics_results;
CREATE POLICY "allow insert" ON logics_results FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "allow select" ON logics_results;
CREATE POLICY "allow select" ON logics_results FOR SELECT USING (true);

GRANT SELECT, INSERT ON logics_results TO anon, authenticated;


-- ---- creativity.sql ------------------------------------------------

-- Creativity Battery: Alternative Uses Task
CREATE TABLE IF NOT EXISTS creativity_aut_results (
  id               bigint generated always as identity primary key,
  created_at       timestamptz default now() not null,
  session_id       text not null,
  participant_name text,
  language         text,
  object_index     int not null,
  object_name      text not null,
  use_index        int not null,
  use_text         text not null,
  time_in_task_ms  int,
  is_practice      boolean default false
);

ALTER TABLE creativity_aut_results ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow insert" ON creativity_aut_results;
CREATE POLICY "allow insert" ON creativity_aut_results FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "allow select" ON creativity_aut_results;
CREATE POLICY "allow select" ON creativity_aut_results FOR SELECT USING (true);
GRANT SELECT, INSERT ON creativity_aut_results TO anon, authenticated;

-- Creativity Battery: Thirty Circles Task
CREATE TABLE IF NOT EXISTS creativity_circles_results (
  id               bigint generated always as identity primary key,
  created_at       timestamptz default now() not null,
  session_id       text not null,
  participant_name text,
  language         text,
  circle_index     int not null,
  label            text not null,
  drawing_data     text,
  response_time_ms int,
  time_in_task_ms  int,
  is_practice      boolean default false
);

ALTER TABLE creativity_circles_results ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow insert" ON creativity_circles_results;
CREATE POLICY "allow insert" ON creativity_circles_results FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "allow select" ON creativity_circles_results;
CREATE POLICY "allow select" ON creativity_circles_results FOR SELECT USING (true);
GRANT SELECT, INSERT ON creativity_circles_results TO anon, authenticated;

-- Creativity Battery: Remote Associates Test
CREATE TABLE IF NOT EXISTS creativity_rat_results (
  id               bigint generated always as identity primary key,
  created_at       timestamptz default now() not null,
  session_id       text not null,
  participant_name text,
  language         text,
  triplet_index    int not null,
  triplet_words    text not null,
  response         text,
  is_correct       boolean,
  skipped          boolean default false,
  response_time_ms int,
  is_practice      boolean default false
);

ALTER TABLE creativity_rat_results ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow insert" ON creativity_rat_results;
CREATE POLICY "allow insert" ON creativity_rat_results FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "allow select" ON creativity_rat_results;
CREATE POLICY "allow select" ON creativity_rat_results FOR SELECT USING (true);
GRANT SELECT, INSERT ON creativity_rat_results TO anon, authenticated;


-- ---- brms-emotion.sql ----------------------------------------------

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

DROP POLICY IF EXISTS "Allow anonymous inserts" ON brms_emotion_results;
CREATE POLICY "Allow anonymous inserts" ON brms_emotion_results
  FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anonymous selects" ON brms_emotion_results;
CREATE POLICY "Allow anonymous selects" ON brms_emotion_results
  FOR SELECT TO anon USING (true);

GRANT SELECT, INSERT ON brms_emotion_results TO anon, authenticated;


-- ==========================================================================
-- 2. Migrations applied after those tables were first created
-- ==========================================================================


-- ---- drm-v2.sql ----------------------------------------------------

-- Run this in Supabase SQL Editor to update the schema
-- Go to: https://supabase.com/dashboard/project/dmbisztetqdygihmibtj/sql

-- Update serial_position constraint (from 1-15 to 1-12)
ALTER TABLE drm_results
DROP CONSTRAINT IF EXISTS drm_results_serial_position_check;

ALTER TABLE drm_results
ADD CONSTRAINT drm_results_serial_position_check
CHECK (serial_position >= 1 AND serial_position <= 12);

-- Update confidence constraint (from 1-5 to 1-4)
ALTER TABLE drm_results
DROP CONSTRAINT IF EXISTS drm_results_confidence_check;

ALTER TABLE drm_results
ADD CONSTRAINT drm_results_confidence_check
CHECK (confidence >= 1 AND confidence <= 4);


-- ---- posner-v2.sql -------------------------------------------------

-- Posner Cueing schema update: add exo_invalid validity type
-- Run these statements in your Supabase SQL editor

-- Drop the old check constraint
ALTER TABLE posner_results
  DROP CONSTRAINT IF EXISTS posner_results_validity_check;

-- Add updated constraint including exo_invalid
ALTER TABLE posner_results
  ADD CONSTRAINT posner_results_validity_check
  CHECK (validity IN ('valid', 'invalid', 'catch', 'exo_invalid'));


-- ---- summary-stats-v2.sql ------------------------------------------

-- Summary Statistics / Ensemble Perception – Schema migration v2
-- Adds probe_type and foil_type columns, updates constraints
-- Run in the Supabase SQL editor.

-- Add new columns (safe to run if they already exist)
ALTER TABLE summary_stats_results
  ADD COLUMN IF NOT EXISTS probe_type TEXT,
  ADD COLUMN IF NOT EXISTS foil_type  TEXT;

-- Update stimulus_type check: drop old constraint, add new (circles + line-lengths only)
ALTER TABLE summary_stats_results
  DROP CONSTRAINT IF EXISTS summary_stats_results_stimulus_type_check;
ALTER TABLE summary_stats_results
  ADD CONSTRAINT summary_stats_results_stimulus_type_check
  CHECK (stimulus_type IN ('circles', 'line-lengths', 'line-orientations'));
-- Note: kept 'line-orientations' in constraint for backward compatibility with old rows.

-- Update stat_type check: allow 'mean' only (plus NULL for non-ensemble rows)
-- Old rows may have 'max'/'min' values so we keep them valid here:
-- (no change to stat_type constraint to preserve backward compatibility)


-- ---- visual-search-v2.sql ------------------------------------------

-- Visual Search schema v2: redesigned IVs (target SS × distractor SS)
-- WARNING: This drops the existing table and all data. Only run once.

DROP TABLE IF EXISTS visual_search_results;

CREATE TABLE visual_search_results (
  id                          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id                  UUID NOT NULL,
  participant_name            TEXT,
  trial_number                INT NOT NULL,
  target_set_size             INT NOT NULL,
  distractor_set_size         INT NOT NULL,
  target_present              BOOLEAN NOT NULL,
  target_color                TEXT NOT NULL CHECK (target_color IN ('red', 'blue')),
  response                    TEXT NOT NULL CHECK (response IN ('present', 'absent', 'timeout')),
  correct                     BOOLEAN NOT NULL,
  rt_ms                       FLOAT NOT NULL,
  target_distance_from_center FLOAT,
  is_practice                 BOOLEAN NOT NULL DEFAULT false,
  created_at                  TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE visual_search_results ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert
DROP POLICY IF EXISTS "allow_insert" ON visual_search_results;
CREATE POLICY "allow_insert" ON visual_search_results
  FOR INSERT WITH CHECK (true);

-- Allow anyone to read
DROP POLICY IF EXISTS "allow_select" ON visual_search_results;
CREATE POLICY "allow_select" ON visual_search_results
  FOR SELECT USING (true);


-- ==========================================================================
-- 3. The definition pipeline — shared results, definitions, stimulus images
-- ==========================================================================


-- ---- experiment-results.sql ----------------------------------------

-- One table for every definition-based experiment.
--
-- Run this once. No experiment created through /create will ever need another table, and
-- no refine will ever need a migration: anything experiment-specific goes in `payload`,
-- so adding, renaming or removing a measured field changes no schema at all.
--
-- This is what removes the failure mode where a refine changed the columns, CREATE TABLE
-- IF NOT EXISTS quietly did nothing, and a whole class then collected no data.

CREATE TABLE IF NOT EXISTS experiment_results (
  id               bigint generated always as identity primary key,
  created_at       timestamptz default now() not null,

  -- Which experiment this row belongs to.
  experiment_slug  text not null,

  -- The spine every experiment shares.
  session_id       text not null,
  participant_name text,
  trial_index      int,
  is_practice      boolean default false,
  response         text,
  is_correct       boolean,          -- null for tasks with no correct answer
  reaction_time_ms int,

  -- Everything paradigm-specific: conditions, stimuli, extra responses.
  payload          jsonb default '{}'::jsonb
);

-- The dashboard always filters by slug and practice, and orders by time.
CREATE INDEX IF NOT EXISTS experiment_results_slug_idx
  ON experiment_results (experiment_slug, is_practice, created_at);

ALTER TABLE experiment_results ENABLE ROW LEVEL SECURITY;

-- Matches the rest of the site: participants insert, teachers read. Both go through the
-- public anon key, so this is a UI-level boundary rather than a security one — the same
-- interim position as every other table here, to be replaced by real auth alongside them.
DROP POLICY IF EXISTS "allow insert" ON experiment_results;
DROP POLICY IF EXISTS "allow insert" ON experiment_results;
CREATE POLICY "allow insert" ON experiment_results FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "allow select" ON experiment_results;
DROP POLICY IF EXISTS "allow select" ON experiment_results;
CREATE POLICY "allow select" ON experiment_results FOR SELECT USING (true);


-- ---- experiment-definitions.sql ------------------------------------

-- Published experiment definitions.
--
-- Run once, alongside experiment-results.sql.
--
-- Until an experiment is here it exists only in the browser session that generated it, so
-- publishing without this table produces a homepage link that works for one person until
-- they close the tab. This is what makes a generated experiment real.

CREATE TABLE IF NOT EXISTS experiment_definitions (
  slug         text primary key,
  created_at   timestamptz default now() not null,
  updated_at   timestamptz default now() not null,
  title        text not null,
  title_he     text,
  category     text,
  -- The whole ExperimentDefinition. Versioned inside the JSON, so a schema change does
  -- not need a migration here.
  definition   jsonb not null,
  -- Off until a lecturer publishes it, so a half-finished experiment is not visible.
  is_published boolean default false
);

ALTER TABLE experiment_definitions ENABLE ROW LEVEL SECURITY;

-- Read by anyone (the runtime needs it to run an experiment). The write policies below are
-- what the table was first created with; protect-writes-2-close.sql removes them, after
-- which the only way to write is publish_definition() from protect-writes-1-functions.sql,
-- which checks the site password. When accounts arrive, that check becomes ownership.
DROP POLICY IF EXISTS "allow select" ON experiment_definitions;
DROP POLICY IF EXISTS "allow select" ON experiment_definitions;
CREATE POLICY "allow select" ON experiment_definitions FOR SELECT USING (true);
DROP POLICY IF EXISTS "allow insert" ON experiment_definitions;
DROP POLICY IF EXISTS "allow insert" ON experiment_definitions;
CREATE POLICY "allow insert" ON experiment_definitions FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "allow update" ON experiment_definitions;
DROP POLICY IF EXISTS "allow update" ON experiment_definitions;
CREATE POLICY "allow update" ON experiment_definitions FOR UPDATE USING (true);


-- ---- experiment-assets.sql -----------------------------------------

-- Storage for experiment stimulus images.
--
-- Run once, alongside experiment-definitions.sql and experiment-results.sql.
--
-- Most experiments need no files at all — shapes and text are drawn inline so that adding
-- an experiment never means adding an asset. But some effects ARE the image: mental
-- rotation needs those block figures, face inversion needs faces. Those files cannot live
-- in the repo, because a lecturer adding stimuli must not require a commit and a deploy.
--
-- Public read, because a participant's browser fetches them mid-trial with no session.

INSERT INTO storage.buckets (id, name, public)
VALUES ('experiment-assets', 'experiment-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Written through the same anon key as everything else. When accounts arrive, the write
-- policies narrow to the folder named after an experiment the lecturer owns — the paths
-- are already laid out as <slug>/<filename> for exactly that.
DROP POLICY IF EXISTS "read experiment assets" ON storage.objects;
DROP POLICY IF EXISTS "read experiment assets" ON storage.objects;
CREATE POLICY "read experiment assets" ON storage.objects
  FOR SELECT USING (bucket_id = 'experiment-assets');

DROP POLICY IF EXISTS "upload experiment assets" ON storage.objects;
DROP POLICY IF EXISTS "upload experiment assets" ON storage.objects;
CREATE POLICY "upload experiment assets" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'experiment-assets');

DROP POLICY IF EXISTS "replace experiment assets" ON storage.objects;
DROP POLICY IF EXISTS "replace experiment assets" ON storage.objects;
CREATE POLICY "replace experiment assets" ON storage.objects
  FOR UPDATE USING (bucket_id = 'experiment-assets');


-- ---- protect-writes-1-functions.sql --------------------------------

-- Password-checked writes, part 1 of 2: the functions.
--
-- The public (anon) Supabase key is in every visitor's browser, so any table it can write
-- to is a table anyone can write to. Two of those change what students see: published
-- experiment definitions, and which experiments are locked. This file adds the only way
-- those tables will be written once part 2 has run — functions that first check the site
-- password, comparing its SHA-256 with the same hash lib/auth.ts checks in the browser.
--
-- No extra secret exists anywhere: the password a lecturer already types is the credential.
--
-- SAFE TO RUN AT ANY TIME. It only adds functions; every existing policy stays as it is.
-- Order on an existing project:
--   1. run this file;
--   2. deploy the site code that calls these functions;
--   3. run protect-writes-2-close.sql.
--
-- Changing the site password means changing the hash here AND in lib/auth.ts.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Internal: not callable through the API, only by the functions below.
CREATE OR REPLACE FUNCTION public.cognitives_password_ok(p_password text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT encode(digest(coalesce(p_password, ''), 'sha256'), 'hex')
       = '5b62a2261ca0fd6b8f499335c0d1a2e8857c9b2077caa2718170e02b82f3bc3c';
$$;

REVOKE ALL ON FUNCTION public.cognitives_password_ok(text) FROM PUBLIC, anon, authenticated;

-- Publish (or replace) an experiment definition.
CREATE OR REPLACE FUNCTION public.publish_definition(
  p_password     text,
  p_slug         text,
  p_title        text,
  p_title_he     text,
  p_category     text,
  p_definition   jsonb,
  p_is_published boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT public.cognitives_password_ok(p_password) THEN
    RAISE EXCEPTION 'Incorrect password' USING ERRCODE = '42501';
  END IF;
  IF coalesce(btrim(p_slug), '') = '' THEN
    RAISE EXCEPTION 'A definition needs a slug' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.experiment_definitions
    (slug, title, title_he, category, definition, is_published, updated_at)
  VALUES
    (p_slug, p_title, p_title_he, p_category, p_definition, p_is_published, now())
  ON CONFLICT (slug) DO UPDATE SET
    title        = excluded.title,
    title_he     = excluded.title_he,
    category     = excluded.category,
    definition   = excluded.definition,
    is_published = excluded.is_published,
    updated_at   = now();
END;
$$;

REVOKE ALL ON FUNCTION public.publish_definition(text, text, text, text, text, jsonb, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.publish_definition(text, text, text, text, text, jsonb, boolean) TO anon, authenticated;

-- Take an experiment down, or put it back, without touching its definition.
-- Returns false when there is no experiment under that slug.
CREATE OR REPLACE FUNCTION public.set_definition_published(
  p_password     text,
  p_slug         text,
  p_is_published boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT public.cognitives_password_ok(p_password) THEN
    RAISE EXCEPTION 'Incorrect password' USING ERRCODE = '42501';
  END IF;

  UPDATE public.experiment_definitions
     SET is_published = p_is_published, updated_at = now()
   WHERE slug = p_slug;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.set_definition_published(text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_definition_published(text, text, boolean) TO anon, authenticated;

-- Lock or unlock an experiment.
CREATE OR REPLACE FUNCTION public.set_experiment_lock(
  p_password      text,
  p_experiment_id text,
  p_is_locked     boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT public.cognitives_password_ok(p_password) THEN
    RAISE EXCEPTION 'Incorrect password' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.experiment_locks (experiment_id, is_locked, updated_at)
  VALUES (p_experiment_id, p_is_locked, now())
  ON CONFLICT (experiment_id) DO UPDATE SET
    is_locked  = excluded.is_locked,
    updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.set_experiment_lock(text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_experiment_lock(text, text, boolean) TO anon, authenticated;

-- Make the new functions callable through the API straight away.
NOTIFY pgrst, 'reload schema';


-- ---- definition-revisions.sql --------------------------------------

-- Version history for published experiments, and results that remember which version they
-- ran under.
--
-- Publishing replaces the live definition, so before this a refine overwrote the only copy
-- there was: no way back from a bad edit, and no way to tell which version a result came
-- from. A class that ran the experiment on Monday and again after a change on Wednesday
-- ended up in one dashboard with nothing to separate them.
--
-- Two additions:
--   • every publish bumps experiment_definitions.revision and appends the whole definition
--     to experiment_definition_revisions, so any earlier version can be restored;
--   • experiment_results.definition_revision records the version a trial ran under.
--
-- SAFE TO RUN AT ANY TIME, and safe to run again. Existing rows get revision 1 and a null
-- definition_revision (they ran before this existed, which is exactly what null means).
-- Run it before deploying the site code that uses it; nothing breaks in between.

-- ── The revision counter ─────────────────────────────────────────────────────
ALTER TABLE public.experiment_definitions
  ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 1;

-- ── The history ──────────────────────────────────────────────────────────────
-- Append-only: a restore writes a NEW revision rather than deleting anything, so the trail
-- of what was live when can never be rewritten.
CREATE TABLE IF NOT EXISTS public.experiment_definition_revisions (
  slug        text not null,
  revision    integer not null,
  created_at  timestamptz default now() not null,
  title       text,
  title_he    text,
  category    text,
  definition  jsonb not null,
  -- Says where this revision came from: a normal publish, or a restore of an older one.
  restored_from integer,
  primary key (slug, revision)
);

CREATE INDEX IF NOT EXISTS experiment_definition_revisions_slug_idx
  ON public.experiment_definition_revisions (slug, revision DESC);

ALTER TABLE public.experiment_definition_revisions ENABLE ROW LEVEL SECURITY;

-- Readable by anyone (the history is shown in the builder and the terminal); written only
-- by the password-checked functions below, which run as the table's owner.
DROP POLICY IF EXISTS "allow select" ON public.experiment_definition_revisions;
DROP POLICY IF EXISTS "allow select" ON public.experiment_definition_revisions;
CREATE POLICY "allow select" ON public.experiment_definition_revisions FOR SELECT USING (true);

-- ── Results remember their version ───────────────────────────────────────────
ALTER TABLE public.experiment_results
  ADD COLUMN IF NOT EXISTS definition_revision integer;

-- ── Publishing, now with history ─────────────────────────────────────────────
-- Dropped first because the return type changes: it now answers with the revision it wrote,
-- so the lecturer can be told "published as revision 3".
DROP FUNCTION IF EXISTS public.publish_definition(text, text, text, text, text, jsonb, boolean);

CREATE FUNCTION public.publish_definition(
  p_password     text,
  p_slug         text,
  p_title        text,
  p_title_he     text,
  p_category     text,
  p_definition   jsonb,
  p_is_published boolean DEFAULT true
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_revision integer;
BEGIN
  IF NOT public.cognitives_password_ok(p_password) THEN
    RAISE EXCEPTION 'Incorrect password' USING ERRCODE = '42501';
  END IF;
  IF coalesce(btrim(p_slug), '') = '' THEN
    RAISE EXCEPTION 'A definition needs a slug' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.experiment_definitions
    (slug, title, title_he, category, definition, is_published, updated_at, revision)
  VALUES
    (p_slug, p_title, p_title_he, p_category, p_definition, p_is_published, now(), 1)
  ON CONFLICT (slug) DO UPDATE SET
    title        = excluded.title,
    title_he     = excluded.title_he,
    category     = excluded.category,
    definition   = excluded.definition,
    is_published = excluded.is_published,
    updated_at   = now(),
    revision     = public.experiment_definitions.revision + 1
  RETURNING revision INTO v_revision;

  INSERT INTO public.experiment_definition_revisions
    (slug, revision, title, title_he, category, definition)
  VALUES
    (p_slug, v_revision, p_title, p_title_he, p_category, p_definition)
  ON CONFLICT (slug, revision) DO NOTHING;

  RETURN v_revision;
END;
$$;

REVOKE ALL ON FUNCTION public.publish_definition(text, text, text, text, text, jsonb, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.publish_definition(text, text, text, text, text, jsonb, boolean) TO anon, authenticated;

-- ── Restoring an earlier version ─────────────────────────────────────────────
-- Brings an old revision back as a new one, so the history stays append-only and the
-- restore itself is part of the record. Returns the new revision number.
CREATE OR REPLACE FUNCTION public.restore_definition_revision(
  p_password text,
  p_slug     text,
  p_revision integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_old   public.experiment_definition_revisions%ROWTYPE;
  v_new   integer;
BEGIN
  IF NOT public.cognitives_password_ok(p_password) THEN
    RAISE EXCEPTION 'Incorrect password' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_old
    FROM public.experiment_definition_revisions
   WHERE slug = p_slug AND revision = p_revision;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No revision % of "%"', p_revision, p_slug USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.experiment_definitions
     SET title      = v_old.title,
         title_he   = v_old.title_he,
         category   = v_old.category,
         definition = v_old.definition,
         updated_at = now(),
         revision   = revision + 1
   WHERE slug = p_slug
  RETURNING revision INTO v_new;

  IF v_new IS NULL THEN
    RAISE EXCEPTION 'Nothing published under "%"', p_slug USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.experiment_definition_revisions
    (slug, revision, title, title_he, category, definition, restored_from)
  VALUES
    (p_slug, v_new, v_old.title, v_old.title_he, v_old.category, v_old.definition, p_revision);

  RETURN v_new;
END;
$$;

REVOKE ALL ON FUNCTION public.restore_definition_revision(text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.restore_definition_revision(text, text, integer) TO anon, authenticated;

-- ── Seed history for what is already published ───────────────────────────────
-- Without this, an experiment published before today has no revision 1 to restore.
INSERT INTO public.experiment_definition_revisions (slug, revision, title, title_he, category, definition)
SELECT d.slug, d.revision, d.title, d.title_he, d.category, d.definition
  FROM public.experiment_definitions d
ON CONFLICT (slug, revision) DO NOTHING;

NOTIFY pgrst, 'reload schema';


-- ---- protect-writes-2-close.sql ------------------------------------

-- Password-checked writes, part 2 of 2: close direct writes.
--
-- Removes the policies that let the public (anon) key insert and update published
-- experiment definitions and lock state. Reading stays open — the runtime and middleware
-- need it — and every write now has to go through the password-checked functions from
-- protect-writes-1-functions.sql.
--
-- RUN THIS ONLY AFTER part 1 has run AND the site code that calls those functions is
-- deployed. Before that, publishing and the lock toggles would stop working.
--
-- To undo, re-run the CREATE POLICY lines from experiment-definitions.sql and locks.sql.

DROP POLICY IF EXISTS "allow insert" ON public.experiment_definitions;
DROP POLICY IF EXISTS "allow update" ON public.experiment_definitions;

DROP POLICY IF EXISTS "allow insert" ON public.experiment_locks;
DROP POLICY IF EXISTS "allow update" ON public.experiment_locks;


-- ==========================================================================
-- 4. Lock state for every experiment on the homepage
-- ==========================================================================
-- locks.sql seeds only the nine that existed when it was written; the homepage now
-- lists eighteen, and an experiment missing here simply cannot be locked.

INSERT INTO experiment_locks (experiment_id, is_locked) VALUES
  ('stroop', false), ('drm', false), ('bouba-kiki', false), ('mentalRep', false),
  ('summaryStats', false), ('posnerCueing', false), ('visualSearch', false),
  ('CompositeFace', false), ('wordSuperiority', false), ('srt', false),
  ('twoStepTask', false), ('serialOrder', false), ('testingEffect', false),
  ('logics', false), ('creativity', false), ('bRMS', false),
  ('boubaKikiDemo', false), ('flanker', false)
ON CONFLICT (experiment_id) DO NOTHING;
