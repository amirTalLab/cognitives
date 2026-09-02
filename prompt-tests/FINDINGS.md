# Pipeline robustness — findings

From 167 offline tests run on 2026-09-01. No code was changed: this is the list to work
through, in priority order. Every item is reproducible locally and for free.

```bash
node --test prompt-tests/pipeline.test.mjs   # 25 pass — transport and parsing
node --test prompt-tests/runtime.test.mjs    # 131/132 — corpus, trials, aggregation
node --test prompt-tests/fuzz.test.mjs       #   9/10  — truncation and mutation fuzzing
```

---

## HIGH — can take down a page

### 1. No upper bound on trial count: a valid definition can exhaust memory

`repetitions: 1e9` on an otherwise perfect definition passes validation with **zero
errors** — the trial count is only ever a *warning* (`validate.ts`, "is a long session;
consider fewer repetitions"). `buildTrials` then tries to allocate six billion rows.

This is not hypothetical: it killed the Node process during fuzzing with
`FATAL ERROR: JavaScript heap out of memory`.

Reaches three places: the lecturer's preview, a student's browser mid-experiment, and the
dashboard's mock generator (participants × trials).

*Options:* make an absurd trial count an **error** rather than a warning; and/or have
`buildTrials` refuse above a ceiling instead of trying.

### 2. `validate()` itself crashes on ~10% of malformed definitions

1,500 mutated definitions produced **155 crashes, 10 distinct**, all inside `validate()`:

| count | error |
|---|---|
| 87 | `s.replace is not a function` |
| 37 | `Cannot read properties of undefined (reading 'replace')` |
| 9 | `Cannot read properties of null (reading 'replace')` |
| 8 | `chart.groupBy.replace is not a function` |
| 5 | `Cannot read properties of null (reading 'name')` |
| 3 | `Cannot read properties of undefined (reading 'name')` |
| 2 | `Cannot read properties of null (reading 'groupBy')` |
| 2 | `Cannot read properties of undefined (reading 'groupBy')` |

Also found directly: `assets` arriving as a **string** throws
`Cannot read properties of undefined (reading 'endsWith')`.

The validator is the one thing standing between model output and a running experiment, so
it must never be the thing that breaks. Each of these surfaces as a 500 from
`/api/create/definition` with nothing the lecturer can act on — exactly the failure mode
that made this week's debugging slow.

*Root cause:* fields are read by shape (`.replace`, `.name`, `.length`) without checking
the type first. A model that writes `"factors": {}` or `"groupBy": 3` gets a stack trace
instead of "that field is the wrong type".

### 3. A definition the validator APPROVED can still crash at run time

Three mutations passed validation and then threw in `buildTrials`:
`levels.map is not a function` (a factor whose `levels` is not an array).

This is the worst category on the list. Validation says the experiment is fine, it gets
published, and it breaks in front of a class. Whatever `validate()` accepts, `buildTrials`
must be able to build.

---

## MEDIUM — correctness and consistency

### 4. Replies are truncated on the deployment but not locally

Recorded evidence: local definition replies are **12,164 and 14,693 bytes and complete**.
The same spec on the deployed site was cut at **2,862 bytes**. Same model, same prompt,
same key — so this is environmental, not a design that is too big.

Still unexplained, and it is the one open item that needs the Vercel side rather than the
code. Worth checking the function log for a duration or response-size limit on Hobby.

### 5. `derivedFrom` rejects dotted pool fields that everything else accepts

`groupBy`, `store`, `correct` and display interpolation all take `item.kind`. `derivedFrom`
does not — it takes factor names only, and fails with "is not a factor". The natural way to
express "group by this item's condition" is rejected, and the error does not say what to do
instead. Cost a build during the lexical-decision run.

*Options:* accept dotted references, or make the message name the fix.

### 6. Counterbalancing a factor that feeds the correctness rule silently unbalances it

Found while building bouba-kiki. `roundedSide` was counterbalanced and a derived
`conventionalSide` (the factor `correct` scores against) depended on it. The result was an
8/4 split instead of 6/6 — the dependent variable partly confounded with a left/right
button bias, with no warning anywhere. Crossing the factor instead fixed it.

Nothing detects this. A validator warning would.

### 7. Nothing warns at build time about a chart that cannot be read

A `groupBy` on a per-item field yields hundreds of bars. The dashboard now caps at 40 and
says so, but the definition stage happily produces such a chart. Warning when `groupBy` is
a high-cardinality field would catch it before a lecturer ever opens the dashboard.

---

## LOW — worth doing, not urgent

### 8. Password comparison is not constant-time

`verifyPassword` compares SHA-256 hex with `===`. Theoretical over HTTPS against a shared
password, but it now also guards API spend, so it is cheap insurance.

### 9. Two different save-failure behaviours

The definition runtime surfaces a failed save (`onSaveFailure`). The 16 hand-written
experiments only `console.error` — a student finishes normally and the data is gone. Same
platform, two behaviours; the older one is the dangerous one.

### 10. `maxDuration = 300` is unverified on the current plan

The routes ask for 300s. Whether Hobby honours that is untested, and it interacts with
finding 4.

---

## Verified good — no action needed

Worth recording, so these do not get "fixed" later without cause:

- **No XSS surface.** No `dangerouslySetInnerHTML` anywhere; markup in a stimulus
  round-trips as text.
- **No prototype pollution.** `__proto__` and `constructor.prototype` in a reply do not
  reach `Object.prototype`.
- **Truncation is classified correctly at every byte.** A valid definition cut at each of
  ~4,000 positions always produced a classified error, never a crash, and never the
  misleading "malformed" label.
- **All 15 definitions in the repo** validate clean, build trials, resolve every `{ref}`,
  score definitely, store every declared key, and drive every chart with finite numbers.
- **Aggregation is exact and fast**: identical to a reference implementation across 27
  chart/data combinations, 40k rows over 1,000 groups in well under a second.
- **Mock data reproduces the stated effect**, so the teaching toggle shows the real result.
- **Trials engine is correct**: counterbalancing splits evenly, `exclude` removes exactly
  the named cells, `sample` never exceeds its pool, derived factors compute from sources,
  and the same seed reproduces the same trials.
- **Unicode, Hebrew, emoji, escaped quotes and 5,000-character strings** all round-trip.

---

## Paper sweep — schema coverage across 8 papers

Run against the papers in `papers/`. **What this measures honestly:** whether the schema
can *express* each paradigm, and whether the skill's refusal rules are unambiguous. It does
NOT measure how well the production model reads a paper cold — that needs the paid
`sonnet-5` sample, because the verdicts below were produced by a model that already knows
these classics.

| Paper | Paradigm | Verdict | Expressible as a definition? |
|---|---|---|---|
| Eriksen & Eriksen 1974 | Flanker | ✅ | Yes — congruency × spacing, RT. Already in the probe set |
| Navon 1977 | Global/local precedence | ✅ | Yes — compound letters as mono text. Template exists |
| Sternberg 1966 | Memory scanning | ✅ | Yes — set shown as a timed phase, then probe; set size as a factor |
| Peterson & Peterson 1959 | Brown–Peterson | ⚠️ | Yes with one simplification: the counting-backwards distractor becomes an unscored timed phase; retention interval is a **bound phase duration** — exactly what `Bound<number>` is for |
| Shepard & Metzler 1971 | Mental rotation | ⚠️ | Yes, but needs the block figures as **uploaded images**; angular difference as a factor. Template exists |
| McGurk & MacDonald 1976 | Audio-visual fusion | ❌ | Correct refusal — the effect *is* audio+video, a known gap |
| Loftus & Palmer 1974 | Leading questions | ❌ | Correct refusal — one-shot between-subjects deception, plus video |
| Tversky & Kahneman 1981 | Framing | ❌ | Correct refusal — one-shot framing; the skill names this explicitly |

**5 of 8 buildable (2 needing a stated simplification), 3 correctly refused.** No paradigm
in this set needed a schema change, which is the encouraging half of the result.

### 11. Multi-article journal pages are an unguarded extraction hazard *(new)*

The Sternberg PDF is a *Science* page whose columns interleave an unrelated article on
behaviour genetics; the McGurk PDF is a *Nature* page carrying an article about Galápagos
flora. Extracted text mixes both. Nothing in the pipeline warns about this, and a model
could plausibly attribute a neighbouring article's method or numbers to the target paper —
a wrong experiment that still looks plausible.

Worth a check at the spec stage: does the extracted method actually belong to the paper
whose title was identified?

### 12. Two papers need the retention interval / SOA as a bound duration

Peterson & Peterson and Sternberg both manipulate *time* as the independent variable. The
schema supports this (`durationMs` is `Bound<number>`), and Posner already uses it — but
none of the worked examples in the skill show a **retention interval** driving recall
accuracy. Adding one would make this pattern discoverable rather than something the model
has to infer.

---

## E2E and replay — results

**Playwright: 23/23 pass** (1.6 min) — password gate, wrong password, 16 experiment landing
pages, 3 teacher gates, the locked page, and a full Stroop participant flow.

**Replay: 9/9 pass**, with `fetch` stubbed to throw, which proves no network call happened.
All four stages served their recordings; a stage with no recording refuses rather than
silently falling through to a paid call; and the replayed definition
(`lexicalDecisionPairs`, 60 trials) validates, builds trials, generates 1,440 mock rows and
drives all 5 of its charts.

**The gate holds over HTTP:** `POST /api/create/definition` returns 401 both with no
password header and with a wrong one.

### 15. A student saw a blank screen when the database was unreachable *(found by the new E2E, FIXED)*

`loadDefinition` handles an error *response* from Supabase, but a **throw** — an unreachable
host, which is exactly what a paused project produces — rejected all the way out of
`getDefinition`. The page awaits it with `.then()` alone, so nothing ever set the stage and
the participant was left on an empty dark screen with no message, indefinitely.

This site has already had a paused project once. Every student holding a link would have
seen nothing at all, with no way to tell a wrong link from an outage.

Fixed: the network call is caught in `registry.ts`, and the page also catches, so an
experiment that cannot be loaded says so instead of hanging.

### 16. Mock data was silently replaced by a slow real fetch *(found by the new E2E, FIXED)*

`load()` had no staleness guard. Mock rows are produced synchronously; a real fetch takes
as long as the network does. Switching Mock Data on set the mock rows, then the fetch
started a moment earlier resolved and overwrote them — the badge still read "mock data"
while the chart showed the real (usually empty) set. A lecturer demonstrating an effect
would watch it appear and vanish a second later.

Proven by a test that delays the read by 2.5s: it failed before the fix, passes after.
Fixed with a load id, so only the newest load may write rows.

Worth noting how close this came to being missed: the first version of the test asserted
`/\d+ participants/`, which **matches "0 participants"** — it passed while the bug was
live. The assertion now requires a non-zero count.

### 13. E2E covers none of the new runtime *(CLOSED)*

`tests/run-definition.spec.ts` adds 12 tests: unknown slug, landing validation, language
toggle, a full participant run to the thank-you screen, a phone viewport with no horizontal
overflow, the inter-trial flash regression, the password gate, mock data with a render
budget, the reveal control, and every built-in definition's dashboard rendering with mock
data. **35 E2E tests pass in total**, up from 23.

Two of them are regression tests for the bugs a person had to find by hand this week, and
writing them immediately surfaced findings 15 and 16.

All 23 tests exercise the sixteen hand-written experiments. Nothing covers `/run/{slug}`,
the definition teacher dashboard, the Mock Data toggle, the QR code, or a mobile viewport —
which is to say, nothing covers the part of the platform that every newly created
experiment now uses. The two bugs found by hand this week (the inter-trial flash and the
dashboard freeze) both live in exactly that uncovered area.

### 14. `/api/create/status` is ungated and discloses configuration *(new)*

It answers anyone, with no password: whether an API key is configured, the exact model
names, whether the server can write files, whether it has schema access, and the skill
names and byte sizes. None of it is a credential, and the endpoint exists so the wizard can
show a preflight banner — but confirming to an anonymous caller that a funded key sits
behind the other endpoints is free reconnaissance. Gating it costs nothing.

---

## Needs you: 52 test rows are in the production results table

The first run of the E2E suite took the Stroop experiment for real, and every trial saved a
row — 52 of them, named **"E2E Tester"** under `stroopClassic`, in the live
`experiment_results` table alongside genuine data. The suite now intercepts every request to
`/rest/v1/**` so it can never reach the database again, but the rows already written cannot
be removed with the anon key: there is no delete policy for `anon` on that table, so a
DELETE returns 200 and removes nothing.

Run this once in the Supabase SQL editor:

```sql
delete from experiment_results where participant_name = 'E2E Tester';
```

Related: **no results table can be cleaned from the app.** Only `mental_rep_results` grants
delete to `anon`. Every other table needs the SQL editor for any correction — a stray test
run, a student who asks to be removed. Worth deciding deliberately rather than by accident.

## Not yet run

- **The gated endpoints with a correct password.** The 401 path is verified; the success
  path is not, because the plaintext password is deliberately not in this transcript. With
  `CREATE_REPLAY=1` set, a lecturer could exercise the whole `/create` wizard in a browser
  for free — worth doing once by hand.
- **Paid `sonnet-5` calibration** — the only way to know how much the free paper verdicts
  above flatter the real extraction stage, which runs on a weaker model than produced them.
