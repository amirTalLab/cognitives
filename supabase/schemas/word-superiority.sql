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

CREATE POLICY "anon insert" ON word_superiority_results
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "anon select" ON word_superiority_results
  FOR SELECT TO anon USING (true);
