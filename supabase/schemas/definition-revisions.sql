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
