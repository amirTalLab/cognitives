-- Password-checked writes, part 1 of 2: the functions.
--
-- The public (anon) Supabase key is in every visitor's browser, so any table it can write
-- to is a table anyone can write to. Two of those change what students see: published
-- experiment definitions, and which experiments are locked. This file adds the only way
-- those tables will be written once part 2 has run — functions that first check the site
-- password, comparing its SHA-256 with the same hash lib/auth.ts checks in the browser.
--
-- No extra secret exists anywhere: the password a lecturer already types is the credential.
--
-- SAFE TO RUN AT ANY TIME. It only adds functions; every existing policy stays as it is.
-- Order on an existing project:
--   1. run this file;
--   2. deploy the site code that calls these functions;
--   3. run protect-writes-2-close.sql.
--
-- Changing the site password means changing the hash here AND in lib/auth.ts.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Internal: not callable through the API, only by the functions below.
CREATE OR REPLACE FUNCTION public.cognitives_password_ok(p_password text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT encode(digest(coalesce(p_password, ''), 'sha256'), 'hex')
       = '5b62a2261ca0fd6b8f499335c0d1a2e8857c9b2077caa2718170e02b82f3bc3c';
$$;

REVOKE ALL ON FUNCTION public.cognitives_password_ok(text) FROM PUBLIC, anon, authenticated;

-- Publish (or replace) an experiment definition.
CREATE OR REPLACE FUNCTION public.publish_definition(
  p_password     text,
  p_slug         text,
  p_title        text,
  p_title_he     text,
  p_category     text,
  p_definition   jsonb,
  p_is_published boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT public.cognitives_password_ok(p_password) THEN
    RAISE EXCEPTION 'Incorrect password' USING ERRCODE = '42501';
  END IF;
  IF coalesce(btrim(p_slug), '') = '' THEN
    RAISE EXCEPTION 'A definition needs a slug' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.experiment_definitions
    (slug, title, title_he, category, definition, is_published, updated_at)
  VALUES
    (p_slug, p_title, p_title_he, p_category, p_definition, p_is_published, now())
  ON CONFLICT (slug) DO UPDATE SET
    title        = excluded.title,
    title_he     = excluded.title_he,
    category     = excluded.category,
    definition   = excluded.definition,
    is_published = excluded.is_published,
    updated_at   = now();
END;
$$;

REVOKE ALL ON FUNCTION public.publish_definition(text, text, text, text, text, jsonb, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.publish_definition(text, text, text, text, text, jsonb, boolean) TO anon, authenticated;

-- Take an experiment down, or put it back, without touching its definition.
-- Returns false when there is no experiment under that slug.
CREATE OR REPLACE FUNCTION public.set_definition_published(
  p_password     text,
  p_slug         text,
  p_is_published boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT public.cognitives_password_ok(p_password) THEN
    RAISE EXCEPTION 'Incorrect password' USING ERRCODE = '42501';
  END IF;

  UPDATE public.experiment_definitions
     SET is_published = p_is_published, updated_at = now()
   WHERE slug = p_slug;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.set_definition_published(text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_definition_published(text, text, boolean) TO anon, authenticated;

-- Lock or unlock an experiment.
CREATE OR REPLACE FUNCTION public.set_experiment_lock(
  p_password      text,
  p_experiment_id text,
  p_is_locked     boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT public.cognitives_password_ok(p_password) THEN
    RAISE EXCEPTION 'Incorrect password' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.experiment_locks (experiment_id, is_locked, updated_at)
  VALUES (p_experiment_id, p_is_locked, now())
  ON CONFLICT (experiment_id) DO UPDATE SET
    is_locked  = excluded.is_locked,
    updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.set_experiment_lock(text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_experiment_lock(text, text, boolean) TO anon, authenticated;

-- Make the new functions callable through the API straight away.
NOTIFY pgrst, 'reload schema';
