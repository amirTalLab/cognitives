# Experiment definitions

One JSON file per experiment, each an `ExperimentDefinition` — the whole experiment as
data, run by the shared renderer at `/run/<slug>`. No pages, no build, no deploy.

These are the source of record. The published row in Supabase can always be rebuilt from
the file; the file cannot be rebuilt from anything, so it is committed.

```bash
npm run exp:check     -- experiments/stroop.json        # validate, and describe what it builds
npm run exp:assets    -- experiments/stroop.json ./imgs # upload stimulus images, record them
npm run exp:publish   -- experiments/stroop.json        # check, then make it live at /run/stroop
npm run exp:list                                        # what is published
npm run exp:unpublish -- stroop                         # take it down (the definition is kept)
```

**Previewing does not need publishing.** With `npm run dev` running, a file here is served
straight to `/run/<slug>` and `/run/<slug>/teacher` — edit, refresh, repeat, with no
database involved. A local file also overrides a published experiment of the same slug, so
revising a live one is safe. `exp:publish` is the deliberate step that makes it real for
everyone else.

`exp:check` runs `lib/experiment-runtime/validate.ts` — the same module the app's
`/api/create/definition` route runs, so the terminal and the web pipeline can never
disagree about what is valid.

**Writing one:** ask Claude Code, which has the `experiment-definition` skill for exactly
this. The contract is `lib/experiment-runtime/schema.ts`; eleven worked examples are in
`round-trips.ts` and `generality-probe.ts` beside it.

**Images:** most experiments need none — shapes and text are drawn inline. When the picture
*is* the stimulus, `exp:assets` uploads a folder and writes the `assets` manifest into the
definition. `exp:check` then cross-references every filename the design can produce against
that manifest, so a typo surfaces here instead of as a broken image during a class. Files
already served by this site (`/faces/`, `/brms-faces/`) need no upload at all.

**Why this folder is usually empty at first:** experiments created through the `/create`
page publish straight to Supabase without passing through here. Run
`npm run exp:list` to see everything that is live.
