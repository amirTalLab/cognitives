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

-- Read by anyone (the runtime needs it to run an experiment), written through the same
-- anon key as the rest of the site. When accounts arrive, the write policy narrows to the
-- owning lecturer and an owner_id column joins this table.
CREATE POLICY "allow select" ON experiment_definitions FOR SELECT USING (true);
CREATE POLICY "allow insert" ON experiment_definitions FOR INSERT WITH CHECK (true);
CREATE POLICY "allow update" ON experiment_definitions FOR UPDATE USING (true);
