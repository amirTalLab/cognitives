-- Password-checked writes, part 2 of 2: close direct writes.
--
-- Removes the policies that let the public (anon) key insert and update published
-- experiment definitions and lock state. Reading stays open — the runtime and middleware
-- need it — and every write now has to go through the password-checked functions from
-- protect-writes-1-functions.sql.
--
-- RUN THIS ONLY AFTER part 1 has run AND the site code that calls those functions is
-- deployed. Before that, publishing and the lock toggles would stop working.
--
-- To undo, re-run the CREATE POLICY lines from experiment-definitions.sql and locks.sql.

DROP POLICY IF EXISTS "allow insert" ON public.experiment_definitions;
DROP POLICY IF EXISTS "allow update" ON public.experiment_definitions;

DROP POLICY IF EXISTS "allow insert" ON public.experiment_locks;
DROP POLICY IF EXISTS "allow update" ON public.experiment_locks;
