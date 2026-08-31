# Pipeline test harness

Three layers, only one of which costs money:

| Layer | Tests | Cost |
|---|---|---|
| `npm run test:pipeline` | the plumbing — parsing, truncation, stream reading, validation | **free**, no key, seconds |
| record + replay (below) | the whole app flow against a real recorded reply | **free** after one capture |
| `npm run exp:prompt` (below) | model judgement, on the Claude Code subscription | **free** |
| the live `/create` page | the real thing, end to end | paid |

## The plumbing suite

```bash
npm run test:pipeline
```

Every production failure so far lived here, not in the model: a missing comma, a reply cut
off mid-array, an empty reply, a stop reason nobody checked, a validator that threw on a
half-written definition. None needed an API call to reproduce — each was found by paying
for one. The suite reproduces them offline so they can only ever be found once. Run it
before any deploy.

## Record and replay — the whole flow, free

A real run can be captured and then replayed forever, which exercises the routes, parsing,
validation, preview, publishing and dashboard without touching the API.

**Capture** (once, during a real paid run). In `.env.local`:

```
CREATE_RECORD=1
```

Run `npm run dev`, build an experiment as normal. Each reply is saved to
`prompt-tests/recordings/<stage>.<timestamp>.txt`. Replies that FAILED are saved too —
those are the valuable ones.

**Replay** (unlimited, free). In `.env.local`:

```
CREATE_REPLAY=1
```

Now every stage serves its newest recording instead of calling the API. Rebuild the same
experiment as many times as you like. If a stage has no recording it refuses rather than
quietly spending money.

Both are development-only, and ignored in production — a deployment must never serve a
canned reply as if it were real.


Testing the paper → spec → definition → refine pipeline **without spending Anthropic API
credits**, by running the same prompts on the Claude Code subscription.

## Why this is faithful

Both the paid web path (`/api/create/*`) and this free path read the *same* files:

| Stage | Shared source (identical on both paths) | Live model | Free proxy |
|-------|------------------------------------------|-----------|------------|
| analyze | `experiment-from-paper` skill | `claude-sonnet-5` | this session |
| spec | `experiment-from-paper` skill | `claude-sonnet-5` | this session |
| definition | `new-cognitive-experiment` skill + `schema.ts` | `claude-opus-5` | this session |
| refine | same as definition | `claude-opus-5` | this session |
| validation | `lib/experiment-runtime/validate.ts` | — | **identical** (`exp:check`) |
| running it | `/run/{slug}` renderer | — | **identical** |

`scripts/emit-prompt.mjs` imports the *actual* prompt-builder functions
(`lib/create-project/prompts.ts`) and the *actual* skill/schema files, so the prompt is
reproduced byte-for-byte. The **only** thing that differs from production is the model — so
free runs are exact for structure, schema-coverage, validation and runtime behaviour, and a
strong proxy (not a perfect one) for the model's judgement.

**Caveat worth remembering:** production extracts on `sonnet-5`; this session is a stronger
model. So a free run may *overestimate* extraction/spec quality. Calibrate with a small
paid sample (Tier 2) before trusting absolute numbers.

## The loop (per paper, $0)

```bash
# 1. ANALYZE — what experiments are in the paper, and are they buildable?
npm run exp:prompt -- analyze
#    → follow prompt-tests/emitted/analyze.prompt.txt against the PDF → pick a candidate,
#      save it as prompt-tests/emitted/<slug>.candidate.json

# 2. SPEC — extract the editable design spec
npm run exp:prompt -- spec prompt-tests/emitted/<slug>.candidate.json
#    → follow → save prompt-tests/emitted/<slug>.spec.json

# 3. DEFINITION — build the experiment as data
npm run exp:prompt -- definition prompt-tests/emitted/<slug>.spec.json
#    → follow → save prompt-tests/emitted/<slug>.definition.json
npm run exp:check -- prompt-tests/emitted/<slug>.definition.json   # the REAL validator

# 4. PREVIEW + REFINE — change it the way a lecturer would after seeing it run
#    (copy the definition to experiments/<slug>.json and open /run/<slug> in dev)
npm run exp:prompt -- refine prompt-tests/emitted/<slug>.definition.json "make the mask 300ms"
#    → follow → save the updated definition → exp:check again
```

## The rubric — score every run, log to `RESULTS.md`

Score three things **independently**, 1–5, because a run can nail one and fail another:

- **Extraction (E)** — did the spec capture the paper's factors, levels, DV, design and the
  reported effect? Penalise inferred values passed off as reported.
- **Buildability (B)** — did it produce a valid definition (`exp:check` clean)? If it fell
  back to `code`, was that *correct* (a genuine schema gap) or a missed simplification?
  Note *which* schema gap when relevant.
- **Fidelity (F)** — does the running experiment actually reproduce the paper's method and
  effect? Check the `mock` reproduces the published finding.

Also record: whether refine did what was asked without collateral damage, and any
**systematic** weakness (a paradigm class that keeps failing) — those are what justify
engineering work on the skills/schema.
