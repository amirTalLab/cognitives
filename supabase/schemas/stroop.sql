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
CREATE POLICY "Allow anonymous inserts" ON stroop_results
  FOR INSERT TO anon WITH CHECK (true);

-- Allow anonymous selects (for viewing results)
CREATE POLICY "Allow anonymous selects" ON stroop_results
  FOR SELECT TO anon USING (true);

-- Allow anonymous deletes (for clearing session results)
CREATE POLICY "Allow anonymous deletes" ON stroop_results
  FOR DELETE TO anon USING (true);
