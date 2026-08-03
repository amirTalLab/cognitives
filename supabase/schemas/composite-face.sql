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
CREATE POLICY "anon insert" ON composite_face_results
  FOR INSERT TO anon WITH CHECK (true);

-- Teacher dashboard reads all rows (password protected in UI)
CREATE POLICY "anon select" ON composite_face_results
  FOR SELECT TO anon USING (true);
