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

-- Verify the changes
SELECT constraint_name, check_clause
FROM information_schema.check_constraints
WHERE constraint_name LIKE 'drm_results%'
ORDER BY constraint_name;
