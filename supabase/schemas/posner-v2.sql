-- Posner Cueing schema update: add exo_invalid validity type
-- Run these statements in your Supabase SQL editor

-- Drop the old check constraint
ALTER TABLE posner_results
  DROP CONSTRAINT IF EXISTS posner_results_validity_check;

-- Add updated constraint including exo_invalid
ALTER TABLE posner_results
  ADD CONSTRAINT posner_results_validity_check
  CHECK (validity IN ('valid', 'invalid', 'catch', 'exo_invalid'));
