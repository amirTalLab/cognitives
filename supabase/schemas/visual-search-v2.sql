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
CREATE POLICY "allow_insert" ON visual_search_results
  FOR INSERT WITH CHECK (true);

-- Allow anyone to read
CREATE POLICY "allow_select" ON visual_search_results
  FOR SELECT USING (true);
