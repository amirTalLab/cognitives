# Cognitives — Classroom Cognitive Psychology Experiments

A bilingual (Hebrew/English) web platform of **16 cognitive-psychology experiments**
built for the Cognitive Processes course. Students run experiments in the browser;
lecturers view class-wide statistics on password-gated teacher dashboards.

## Experiments

| Category | Experiments |
|---|---|
| Perception | Ensemble Perception (`summaryStats`), Composite Face (`CompositeFace`), Word Superiority (`wordSuperiority`) |
| Attention | Visual Search (`visualSearch`), Spatial Cueing (`posnerCueing`) |
| Language | Bouba-Kiki (`bouba-kiki`) |
| Executive Control | Stroop (`stroop`) |
| Imagination | Mental Representation — scanning + rotation (`mentalRep`) |
| Memory | DRM False Memory (`drm`), Serial Position (`serialOrder`), Testing Effect (`testingEffect`) |
| Learning | Serial Reaction Time (`srt`), Two-Step Task (`twoStepTask`) |
| Consciousness | bRMS Emotion (`bRMS`) |
| Reasoning | Reasoning Biases (`logics`) |
| Creativity | Creativity Battery (`creativity`) |

Every experiment follows the same route convention under `app/<slug>/`:
landing page → (practice) → experiment → thanks, plus a `teacher/` dashboard.

## Tech stack

- **Next.js 16** (App Router) · **React 19** · **TypeScript 5**
- **Tailwind CSS 4** · Framer Motion · Recharts · Lucide icons
- **Supabase** (Postgres) — accessed from the browser with the anon key; one table per experiment
- **Playwright** E2E tests · GitHub Actions CI (tests, lint, typecheck)

## Getting started

```bash
npm install
cp .env.local.example .env.local   # fill in Supabase URL + anon key
npm run dev                        # http://localhost:3000
```

Without `.env.local` the app runs, but nothing is saved and teacher dashboards
stay empty. For a fresh Supabase project, create the tables by running the files
in [`supabase/schemas/`](supabase/schemas/) in the Supabase SQL Editor
(see the README there for ordering).

The homepage (`/`) is a password-gated admin hub with per-experiment lock
toggles. Individual experiments are reachable directly at `/<slug>`
(e.g. `/stroop`, `/drm`). Locks are enforced by `middleware.ts` against the
`experiment_locks` table; teacher pages are never blocked.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / serve |
| `npm run lint` | ESLint |
| `npm test` | Playwright E2E suite (first time: `npx playwright install chromium`) |
| `npm run test:ui` / `test:headed` / `test:report` | Interactive / visible-browser / report view |

## Project layout

```
app/<slug>/           # one folder per experiment (pages: landing, experiment, teacher, thanks…)
components/<slug>/    # experiment-specific components (charts, displays)
lib/<slug>/           # stimuli, trial generation, analysis logic
lib/supabase.ts       # shared browser-side Supabase client
types/<slug>.ts       # TypeScript types per experiment
middleware.ts         # experiment-lock enforcement
supabase/schemas/     # SQL to create the database tables
docs/                 # historical implementation notes per experiment
tests/                # Playwright E2E smoke tests
```

## CI

GitHub Actions (`.github/workflows/test.yml`) runs three jobs on every push/PR
to `main`: Playwright tests, ESLint, and `tsc --noEmit`. Supabase credentials
come from repo secrets `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

## Known technical debt

- React strictness lint rules (`react-hooks/set-state-in-effect` etc.) are
  downgraded to warnings in `eslint.config.mjs` pending the planned
  experiment-shell refactor — do not add new violations.
- Teacher/admin password gates are client-side only and the database is open
  via the anon key; a proper auth + RLS redesign is planned.
- SQL schemas are applied manually; migration tooling (Supabase CLI) is planned.
