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
CREATE POLICY "Allow anonymous inserts" ON mental_rep_results
  FOR INSERT
  WITH CHECK (true);

-- Create policy to allow reads from anonymous users
CREATE POLICY "Allow anonymous reads" ON mental_rep_results
  FOR SELECT
  USING (true);

-- Create policy to allow deletes from anonymous users (for clearing own data)
CREATE POLICY "Allow anonymous deletes" ON mental_rep_results
  FOR DELETE
  USING (true);

-- Grant necessary permissions to anon role
GRANT INSERT, SELECT, DELETE ON mental_rep_results TO anon;
GRANT USAGE ON SCHEMA public TO anon;
