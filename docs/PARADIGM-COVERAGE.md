# Paradigm coverage

How much of classic cognitive psychology could the "experiment as a definition" approach
actually build?

The pipeline at `/create` currently generates code. The proposal is to generate a
*definition* instead — a validated row in the database, rendered by one runtime page. That
is faster, cheaper and scales to many lecturers, but it can only run experiments the
renderer understands. This document puts a number on that.

**Method.** The capability model below is derived from the 16 experiments already in this
repo — they are working, class-tested code, so they show what actually matters rather than
what a description of a paradigm suggests. Each classic paradigm is then scored against
that model. The scoring is a judgement call per paradigm, not a measurement.

---

## The capability model, read off the existing 16

**Trial generation** — conditions crossed into a trial list, counterbalanced, randomised
(Fisher–Yates), practice block optional.

**Per-trial phase machine** — `fixation → stimulus → (mask) → response → (feedback)`, each
phase with a duration in ms.

**Stimuli in use** — text (words, letters, digits), coloured text, inline SVG shapes,
images, composite/overlaid images, generated arrays of items, spatial layouts, directional
cues.

**Responses in use** — two-alternative buttons, multi-choice buttons, keypress,
same/different, present/absent, numeric estimate, rating scale, free text, drawing.

**Measures** — accuracy, reaction time, choice proportion, estimate error.

**Data** — one row per trial: a fixed spine (`session_id`, `participant_name`, trial index,
`is_practice`, `reaction_time_ms`, `is_correct`, `response`) plus a per-paradigm payload.

**Dashboard** — bar by condition with SEM error bars, line by level, scatter of individual
vs group, histogram, one point per participant placed by two measures (`xy`); the figures a
paper reported drawn beside the class's own (`original`); every chart behind a Reveal button.

**Block structure** — an experiment may be a sequence of blocks, and a run of blocks may
repeat once per item drawn from a pool, in an order drawn per participant. A block can
present without asking (a study list), be bounded by a clock rather than a trial count (a
filled delay), keep its trials in a fixed order, and score a typed recall list into a row
per studied item.

### What the 16 never needed

1. **Trial history** — the next trial depending on preceding ones
2. **Adaptive difficulty** — staircases, spans that grow until failure
3. ~~**Withheld responses**~~ — built, see below
4. ~~**Block structure**~~ — built, see below
5. **Audio** — generated tones, stereo presentation
6. **Within-trial sequences** — RSVP streams, alternating displays

> **Update — one block, two kinds of trial.** The runtime assumed every trial in a block
> was the same kind of trial. `trial.response.sets` was the first exception to that, added
> for bouba-kiki; porting ensemble perception finished the job, because its whole design is
> that a participant cannot predict which of two questions is coming. So a display can
> branch per trial (`kind: 'switch'`), a scoring rule can (`trial.correct` takes a `by`/`sets`
> form), and the two key on the same factor the response does, so the three move together.
>
> With them: `kind: 'within'`, which counts a numeric estimate correct inside a tolerance —
> for any task answered on a scale, where "correct" has to mean "close enough"; `kind:
> 'slider'`, a dragged scale whose `preview` is redrawn from its own position, so a
> magnitude is answered by matching rather than by arithmetic; an `array` display driven by
> a list in the data, for a set whose members differ in the way the trial specifies; and
> `textHe`, because a task whose QUESTION is on screen cannot ask it in English on a Hebrew
> run. Interleaving, estimation and staircases all become expressible together.
>
> **Update — slopes, and practising a later block.** Two additions from porting mental
> representation, neither of which changes the count above because both paradigms were
> already reachable — what they change is whether the RESULT can be stated.
>
> `StatSpec.measure: 'correlation'`, with `against` naming a stored number, reports the mean
> within-participant correlation between that number and reaction time. A large family of
> findings is a slope rather than a contrast — time against rotation angle, against distance
> scanned, against set size, against memory load — and a bar chart of group means cannot say
> what an r says. Computed per participant and then averaged, because one uniformly slow
> person sits above everyone else at every value of x, so pooling the class would read their
> slowness as a relationship.
>
> `Stage.practice` now actually runs. It was in the type and in the validator from the day
> stages were added, and nothing ever executed it: only the definition's first block was
> practised, so any session whose second half is a different task sent participants into it
> cold. Declared, silently skipped, and nothing said so — the failure mode this project keeps
> meeting, and the reason the browser test matters more than the offline one here.
>
> **Update — withheld responses.** `timeoutMs` on a response phase, with `trial.earlyFrom`
> for too-early presses and `trial.feedback` for per-outcome messages. Built to port Posner
> cueing, whose catch trials need them. Go/No-Go is buildable; stop-signal still needs an
> adaptive stop-signal delay.
>
> **Update — block structure.** Built to port DRM, which is five repeats of
> study → filled delay → free recall, followed by one recognition test. An experiment may
> now be a SEQUENCE of blocks (`stages`), and a run of blocks may REPEAT once per item drawn
> from a pool (`forEach` / `as`), in an order drawn per participant. Each block is a design
> in its own right — its own factors, phases, response and stored fields — and every row
> carries the block it came from, so one results table holds them all and a chart can ask
> about one of them.
>
> This is the largest single widening so far, because several things a block needs came with
> it, each of which is independently useful:
>
> - `response: {kind: "none"}` — a block that PRESENTS and asks nothing, for a study list
> - `endsAfterMs` — a block measured in TIME, for a filled delay that must last the same for
>   a fast participant as a slow one
> - `order: "fixed"` — no shuffle, where the order IS the manipulation (a study list's serial
>   positions, a repeating motor sequence)
> - `trial.recall` — one typed list scored into a row per studied item, so a serial-position
>   curve or a false-recall rate is an ordinary chart
> - `sample` + `per` — stratified draws, e.g. two probes at every serial position
> - `fromEach` — one item set composed of several pools, which is what a recognition test is
> - multi-value `expect` and `ofResponse` — one button carrying a decision AND a confidence
> - `Stage.autoAdvanceMs` — pacing between blocks, including none at all
>
> The implicit association test becomes buildable on this (its blocks are the mapping
> switches). Digit span still needs adaptive difficulty, not block structure.

---

## Scoring

✅ buildable with the model as-is · ⚙ needs one of the gaps above ·
◐ buildable as a declared simplification · ❌ out of scope

### ✅ Buildable now — 31

| Paradigm | Notes |
|---|---|
| Stroop | in repo |
| Simon | spatial S–R mapping; same shape as Stroop |
| Eriksen flanker | |
| Lexical decision | |
| Semantic priming | prime → target, both timed phases |
| Masked priming | mask phase already exists |
| Mental rotation | in repo |
| Visual search | in repo |
| Posner cueing | in repo |
| Composite face | in repo |
| Face inversion | |
| Own-race effect | needs face images sourced |
| Thatcher illusion | |
| Bouba–kiki | in repo |
| Müller-Lyer / Ebbinghaus / Ponzo | as 2AFC judgement |
| Signal detection / d′ | confidence rating already used in DRM |
| Sternberg memory scanning | study set → probe |
| Serial position / free recall | in repo |
| DRM false memory | in repo |
| Affective priming | |
| Delay discounting | choice between amounts |
| Risky choice / prospect theory | |
| Anchoring | in repo, between-subject groups |
| Framing effects | in repo |
| Wason selection | in repo, multi-select |
| Cognitive reflection test | in repo |
| Conjunction fallacy | in repo |
| Remote associates | in repo, free text |
| Alternative uses | in repo, timed free text |
| Two-step task | in repo — proves nested within-trial stages work |
| Go/No-Go | withheld response, built for Posner cueing |
| Implicit association test | its blocks are the mapping switches |

### ⚙ Needs one of the remaining gaps — 10

| Paradigm | Missing |
|---|---|
| Task switching | trial history (switch vs repeat) |
| N-back | trial history |
| Iowa gambling task | trial history + running score feedback |
| Probabilistic reversal learning | trial history |
| Stop-signal | adaptive stop-signal delay |
| Digit span / Corsi | adaptive span + ordered-sequence response |
| Weber / JND | adaptive staircase |
| Dichotic listening | stereo audio |
| Attentional blink | RSVP stream within a trial |
| Change blindness | alternating display within a trial |

**Trial history alone unlocks 4**, and is now the single largest remaining gap. Adaptive
difficulty unlocks 3. Those two are what is left worth building.

### ◐ Buildable as a declared simplification — 4

| Paradigm | Simplification |
|---|---|
| Testing effect | single session with a filled delay instead of days apart |
| Spacing effect | compressed intervals within one session |
| Method-of-adjustment illusions | 2AFC instead of a continuous slider |
| Ultimatum / dictator game | simulated partner instead of a second participant |

These still demonstrate the effect. The spec must say so explicitly — a third field marker
alongside `[from paper]` and `[inferred]`: `[simplified — not supported]` — so the lecturer
decides whether the simplification is acceptable.

### ❌ Out of scope — 4

| Paradigm | Blocker |
|---|---|
| Inattentional blindness | requires video |
| McGurk effect | requires synchronised audio + video |
| Tower of London / Hanoi | interactive problem-solving state |
| Mouse tracking | continuous trajectory capture |

---

## The number

| | Count | Share |
|---|---|---|
| Buildable now | 31 | 63% |
| + the remaining gaps | 41 | 84% |
| + declared simplifications | 45 | 92% |
| Out of scope | 4 | 8% |

**63% with the model as it stands. 92% after the remaining additive features.**

Two of the original six gaps are closed — withheld responses and block structure — which
moved Go/No-Go and the implicit association test into "buildable now". The prediction that
these would be ADDITIVE held: neither required rethinking the factors-crossed-and-shuffled
core, and every experiment built before them runs unchanged.

Two caveats worth keeping in view. This is a catalogue of *classic* paradigms, so it is
biased toward things that became classic partly because they are simple to run — real
papers will be messier. And the scoring is judgement, not measurement; the honest test is
whether the schema, once written, can express Stroop, Posner cueing and bouba–kiki as they
already exist in this repo.

## What follows from it

1. **Build the definition schema against the 29.** They share one shape; that shape is the
   schema.
2. **Design the six gaps as additive extensions**, not core structure — stimulus and
   response types as an open registry, and a version on every definition.
3. **Add the `[simplified]` marker** to the spec stage. It is the cheapest coverage in the
   list: four more paradigms for no renderer work at all.
4. **Refuse the remaining 8% at the spec stage** — seconds in, before any generation is
   paid for, with the blocker named.
