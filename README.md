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

## Adding an experiment

An experiment is **data, not code**: a validated JSON definition run by one shared runtime
at `/run/<slug>`. Adding one adds a file — no pages to write, nothing to build, no deploy.

There are two front ends onto the same pipeline, producing the same artifact:

| | `/create` page | Terminal + Claude Code |
|---|---|---|
| Cost | billed to the lab's Anthropic key | **free** — your Claude subscription |
| Setup | none | clone + `npm install`, once |
| Best for | a one-off | iterating, or several experiments |

### From a terminal

```bash
npm run exp:setup     # ready? if not, it prints the one thing to fix
claude                # start Claude Code in this folder
```

Then, inside Claude Code:

```
/experiment build a Stroop task
/experiment papers/sternberg-1966.pdf     # put PDFs in papers/ first
```

It runs the same stages as the web wizard and **stops for you at each decision**:

1. **Which experiment** — for a paper, the candidates found in it, each with a verdict on
   whether it can be recreated in a browser. A paper that yields nothing usable is refused
   rather than stretched into something.
2. **The spec** — the design as a table *before* any JSON, every value marked `[from paper]`
   or `[inferred]`. Correct anything wrong here; it is far cheaper than fixing it later.
3. **Build + check** — writes `experiments/<slug>.json` and runs `npm run exp:check`, the
   same validator the site runs. It reports what the design actually builds ("48 trials, 24
   per condition, ~6 min"), which is where you notice a design twice as long as you meant.
4. **Preview** — with `npm run dev` running, take it yourself at `/run/<slug>`, and open
   `/run/<slug>/teacher` with **Mock Data** on to judge the charts with no participants.
   Timings and wording read fine as JSON and turn out wrong on screen.
5. **Refine** — say what to change in plain language ("make the mask 300ms", "add a
   confidence rating", "halve the trials"). It edits, re-checks, you refresh. Free, so
   iterate.
6. **Publish** — `npm run exp:publish` makes it live at `/run/<slug>` immediately, for
   anyone with the link. `exp:unpublish` takes it back down.

Then hand students the link, or the QR code on the teacher dashboard.

**No Anthropic API key is needed for this path** — that is what the website uses and what
this avoids. The two Supabase keys are needed only to *publish*; building and previewing
work without them.

Full walkthrough for someone starting from a fresh clone, written for a lecturer rather than
a developer: **[docs/BUILD-AN-EXPERIMENT.md](docs/BUILD-AN-EXPERIMENT.md)**.

### Registering it on the homepage

Publishing makes an experiment reachable by link. To list it on the homepage as well, three
places must agree — ask Claude to *"list it on the homepage"* and it makes all three edits:

- `app/page.tsx` — the card, with `href: '/run/<slug>'`
- `middleware.ts` — the slug in `EXPERIMENT_SLUGS` **and** `'/run/<slug>/:path*'` in
  `config.matcher`

Both middleware entries are required. With the slug but no matcher, the lock toggle reports
success and does nothing — `npm run test:pipeline` now checks for exactly that.

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
| `npm run test:pipeline` | Offline tests for the create pipeline and runtime (no key, no network) |
| `npm run exp:setup` | Is this machine ready to build experiments? |
| `npm run exp:check -- experiments/<slug>.json` | Validate a definition and describe what it builds |
| `npm run exp:publish` / `exp:unpublish` / `exp:list` | Publish, retract, list |
| `npm run exp:doctor` / `exp:verify` | Database health / live schema matches the setup file |

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
