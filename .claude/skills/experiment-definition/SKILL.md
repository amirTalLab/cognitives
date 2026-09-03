---
name: experiment-definition
description: "Build a cognitive experiment for the cognitives site as a DEFINITION (validated JSON run by the shared runtime) instead of generated pages. Use this whenever the user wants a new experiment, task or study added — 'build a Stroop task', 'make the experiment from this paper', 'add a lexical decision experiment' — and especially when they want to avoid the metered /create pipeline and use the Claude Code subscription instead. Produces experiments/<slug>.json, validates it with npm run exp:check, and publishes it to /run/<slug>. Falls back to new-cognitive-experiment only for designs the schema cannot express."
---

# Build an Experiment as a Definition

The terminal path. Same artifact the `/create` page produces, made in a Claude Code
session instead — so it costs nothing beyond the session, and the result is a file in the
repo that can be reviewed, diffed and committed.

**An experiment here is data, not code.** One renderer runs every definition, so there are
no pages to write, nothing to build, and nothing to deploy: a definition previews the
moment it is published.

Same stages as the `/create` page, in the same order, so the two paths are one pipeline with
two front ends:

**analyze → choose → spec → build → check → preview → refine → publish**

The lecturer decides at three of those — which experiment, whether the spec is right, and
whether to publish. Stop and wait at each; do not run them together.

`/experiment` is the entry point for someone who does not know the skills exist. If a
command fails in a way that looks like setup rather than design — a missing dependency, no
database — run `npm run exp:setup` and give them the one line it prints.

---

## Step 1 — Read the contract

Read these before writing any JSON. Do not work from memory of them, and do not restate
them back to the user.

```
lib/experiment-runtime/schema.ts          # THE contract — every field, with the reasoning
lib/experiment-runtime/round-trips.ts     # 3 worked definitions rebuilt from live experiments
lib/experiment-runtime/generality-probe.ts # 8 more: Stroop, flanker, Posner, lexical decision,
                                           # semantic priming, delay discounting, face inversion, SDT
```

Eleven complete examples. Find the one closest to what you are building and follow its
shape — that is faster and far more reliable than composing from the type definitions.

The last section of `schema.ts`, **"Not yet expressible"**, is the boundary. Check the
design against it now, before writing anything.

---

## Step 2 — Get the design

**From a paper:** the PDF goes in `papers/` (tracked folder, ignored contents) or anywhere
the user names. Run the **`experiment-from-paper`** skill first — steps 1 to 5 — and stop
when the design spec is confirmed. Come back here with that spec instead of handing it to
`new-cognitive-experiment`.

**From the user directly:** you need all of these before writing JSON. Ask for whatever is
missing rather than inventing it, except timings and trial counts — propose those from the
closest example and say what you assumed.

| Input | Example |
|---|---|
| URL slug | `stroopClassic` — camelCase, unique |
| Title, Hebrew title | "Stroop Task" / "מטלת סטרופ" |
| Category | PERCEPTION · ATTENTION · LANGUAGE · MEMORY · EXECUTIVE CONTROL · … |
| Conditions | the IV levels — congruent / incongruent |
| Trial structure | phases and durations — fixation 500ms → stimulus until response |
| Trial counts | how many repetitions of the full cross, and practice trials |
| Response | keys, on-screen buttons, or a rating scale |
| Correctness | what counts as correct, or what the choice means when there is no right answer |
| Expected effect | the result, with numbers if known — this drives the mock data |
| Dashboard charts | what to plot |

---

## Step 3 — When to stop and use the other skill

Hand off to **`new-cognitive-experiment`** (which writes real pages, and needs review and a
deploy) only when the design genuinely needs one of the six dimensions listed at the bottom
of `schema.ts`:

trial history · adaptive difficulty · withheld response · block structure · audio ·
within-trial sequences

Say so plainly and explain the trade-off: generated pages take longer, need a deploy, and
cannot be edited by the lecturer afterwards.

**Before handing off, check whether a simplification saves it.** Most designs that look
out of reach are not: the catalogue in **`experiment-from-paper` Step 3b** lists the
standard ones — fixed difficulty levels instead of a staircase, recognition instead of free
recall, fewer trials, a filled interval instead of a week. Read it before concluding the
schema cannot express something.

The same section's limit applies: if the simplification removes what the study is *about*,
say so rather than building a lookalike. And whatever you do simplify goes into
`simplifications` as `what` + `why` — a psychologist can judge whether three fixed levels
still demonstrate the effect; the system cannot, so it must never make that call silently.

---

## Step 4 — Write the definition

Write `experiments/<slug>.json`. Plain JSON — no comments, no trailing commas.

Things that are easy to get wrong:

- **`slug` must match the filename and is the URL.** `/run/<slug>`.
- **Trials are the factors crossed, repeated `repetitions` times, then shuffled.** Total
  trials = product of all non-counterbalanced factor level counts × `repetitions`. Work it
  out before you write it — a 4×4×2 cross with `repetitions: 4` is 128 trials, which is a
  long class.
- **`"{factorName}"` is a lookup, not an expression.** `"{soa}"` reads that trial's value.
  There is no arithmetic, no concatenation, no conditionals. If you find yourself wanting
  them, you want a `derivedFrom` factor with an explicit `mapping` table.
- **Derived factors** compute from other factors after the cross: `derivedFrom: ["validity",
  "targetSide"]` with `mapping` keyed by the levels joined with `|`. See POSNER.
- **Pools** must hold at least as many items as any factor samples from them.
- **`exclude` drops cells the cross produces but the task has no answer for** — comparing
  two numbers crosses 2 against 2, and "which is larger" is unanswerable there. List the
  cells: `[{ "left": 2, "right": 2 }, …]`. Only crossed factors can be named; derived and
  counterbalanced values are assigned afterwards. A derived factor's `mapping` must still
  cover the excluded cells, because it is checked against the full cross.
- **Both languages, always.** `instructions.en` and `instructions.he`, and `titleHe`.
- **`mock`** drives the teacher dashboard's Mock Data toggle. Set `baseRtMs`,
  `baseAccuracy` and per-level `effects` from the effect the experiment is supposed to
  show, so the dashboard can be judged before a single student has run it.
- **`correctMeans`** when there is no right answer — bouba/kiki scores "chose the rounded
  shape", not accuracy, and the dashboard label has to say so.

---

## Step 5 — Images, if the experiment needs them

Skip this for most experiments. Shapes and text are drawn inline precisely so nothing has
to be sourced — reach for an image only when the picture **is** the stimulus: mental
rotation figures, faces, scenes, specific photographs.

You cannot create image files. The user supplies them, and there are three ways in:

**Already on this site.** `public/faces/` (52 faces) and `public/brms-faces/` are served
already. Point at them with no upload at all:

```json
"assets": { "base": "/faces/", "files": ["c2_1_1.jpg", "c2_1_10.jpg"] }
```

**A folder the user has.** Ask for the path, then:

```bash
npm run exp:assets -- experiments/<slug>.json ./their-folder
```

This uploads every image to storage under the slug and writes the `assets` manifest into
the JSON for you. Do not write `assets` by hand after running it.

**Hosted elsewhere.** An absolute `https://…` src is left alone, and needs no manifest.

Then reference the files. A pool is the usual shape:

```json
"pools": { "faces": [{ "file": "c2_1_1.jpg" }, { "file": "c2_1_10.jpg" }] },
"factors": [{ "name": "face", "from": "faces" }],
"display": { "kind": "image", "src": "{face.file}", "size": 200 }
```

`src` is a **filename from the manifest**, not a URL — the base is prepended at render
time. `exp:check` cross-references every filename the design can produce against the
manifest, so a typo is caught here rather than as a broken image in front of a class.

If the user has no files and the effect genuinely requires them, say so plainly instead of
substituting shapes. A mental rotation task with circles is not a mental rotation task.

---

## Step 6 — Check it

```bash
npm run exp:check -- experiments/<slug>.json
```

This runs the **same validator the app runs**, then describes what the definition actually
builds: total trials, trials per level of every factor, and the fixed timing per session.

Read that description, do not just look for the tick. It is where you find out that a
factor crossed the wrong way produced 8 trials instead of 80, or that a design runs for 20
minutes.

Fix every error. Read every warning — most of them are real.

---

## Step 7 — Preview it locally

With `npm run dev` running, the file in `experiments/` is served directly — **nothing has
to be published, and Supabase does not have to be reachable**:

- **`/run/<slug>`** — the experiment, exactly as a student gets it
- **`/run/<slug>/teacher`** — the dashboard; its Mock Data toggle fills the charts from
  the `mock` block, so they can be judged with no participants

Edit the JSON, refresh the page, see the change. That is the whole loop.

Tell the user to take the experiment for a few trials themselves. Timing, key labels and
instructions all look fine in JSON and turn out wrong on screen.

A local file also *overrides* a published experiment of the same slug in development, so
revising a live experiment is safe: pull its definition into `experiments/`, edit, preview,
and only then publish.

### Refining

This is where the wizard's chat happens instead. Take changes in the lecturer's own words —
"make the mask 300ms", "add a confidence rating", "too many trials" — edit the JSON, re-run
`exp:check`, and tell them to refresh. Expect several rounds; it costs nothing, so never
talk them out of one.

Change only what was asked. A refine that quietly also renumbers the trials or rewrites the
instructions destroys the lecturer's trust in every later round.

---

## Step 8 — Publish, when it is right

```bash
npm run exp:publish -- experiments/<slug>.json
```

This writes to the shared Supabase project, so the experiment becomes reachable **by URL on
the deployed site**, immediately, for everyone. It is a real action — do not run it to have
a look at something. `npm run exp:unpublish -- <slug>` takes it back down.

The slug is the primary key and there is no ownership yet, so publishing a slug someone
else published replaces theirs. Check `npm run exp:list` first if the slug is a common one.

---

## Step 9 — List it on the homepage (optional)

Only when the lecturer wants students to find it without a direct link. Two edits, both
reviewable in `git diff`:

**`app/page.tsx`** — add to the `EXPERIMENTS` array, and put the id in the right
`CATEGORIES` row. `href` is required: without it the card links to `/<slug>`, which does
not exist.

```ts
{ id: '<slug>', title: '<Title>', titleHe: '<כותרת>', icon: Shapes, color: 'text-purple-400', href: '/run/<slug>' },
```

Use an icon the file already imports, or add the import too.

**`middleware.ts`** — add `'<slug>'` to `EXPERIMENT_SLUGS` and `'/run/<slug>/:path*'` to
`config.matcher`. Both are needed for the lock/unlock toggle to work; without them locking
appears to succeed and does nothing.

These files are shared by every experiment on the site, so make the edits precisely and
show the diff.

---

## Step 10 — Commit

Commit `experiments/<slug>.json`. That file is the record of the experiment — the published
row can always be rebuilt from it, and nothing else can rebuild the file.

---

## What this path costs

Nothing metered. `/create` in the app calls the Anthropic API for each stage (roughly
$0.30–$0.60 to read a paper, and more per refine); this runs on the Claude Code
subscription instead. The lecturer-facing UI still exists for people who are not in a
terminal — this is the same pipeline for people who are.
