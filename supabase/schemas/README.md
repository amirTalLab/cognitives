# Database schemas

One SQL file per experiment table, applied manually via the Supabase SQL Editor
(Dashboard → SQL Editor → paste → Run). `locks.sql` creates the shared
`experiment_locks` table used by the homepage lock toggles and `middleware.ts`.

Files named `*-v2.sql` are later alterations and must be applied **after** the
base file of the same experiment (e.g. `drm.sql` first, then `drm-v2.sql`).

> **Note:** these are snapshot scripts, not migrations — there is no tooling
> that tracks which have been applied. Adopting Supabase CLI migrations is
> planned; until then, treat the production database as the source of truth
> and keep these files in sync by hand.
