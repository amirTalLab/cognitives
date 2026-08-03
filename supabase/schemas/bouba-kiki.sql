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
CREATE POLICY "Allow anonymous inserts" ON bouba_kiki_results
  FOR INSERT TO anon WITH CHECK (true);

-- Allow anonymous selects (for viewing results)
CREATE POLICY "Allow anonymous selects" ON bouba_kiki_results
  FOR SELECT TO anon USING (true);

-- Allow anonymous deletes (for clearing session results)
CREATE POLICY "Allow anonymous deletes" ON bouba_kiki_results
  FOR DELETE TO anon USING (true);
