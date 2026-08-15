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
vs group, histogram; every chart behind a Reveal button.

### What the 16 never needed

1. **Trial history** — the next trial depending on preceding ones
2. **Adaptive difficulty** — staircases, spans that grow until failure
3. **Withheld responses** — "correct" meaning *do not press*
4. **Block structure** — blocked designs with block-level instructions and feedback
5. **Audio** — generated tones, stereo presentation
6. **Within-trial sequences** — RSVP streams, alternating displays

---

## Scoring

✅ buildable with the model as-is · ⚙ needs one of the gaps above ·
◐ buildable as a declared simplification · ❌ out of scope

### ✅ Buildable now — 29

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

### ⚙ Needs one of the six gaps — 12

| Paradigm | Missing |
|---|---|
| Task switching | trial history (switch vs repeat) |
| N-back | trial history |
| Iowa gambling task | trial history + running score feedback |
| Probabilistic reversal learning | trial history |
| Go/No-Go | withheld response |
| Stop-signal | withheld response + adaptive SSD |
| Digit span / Corsi | adaptive span + ordered-sequence response |
| Weber / JND | adaptive staircase |
| Implicit association test | block structure with mapping switches |
| Dichotic listening | stereo audio |
| Attentional blink | RSVP stream within a trial |
| Change blindness | alternating display within a trial |

**Trial history alone unlocks 4.** Adaptive difficulty unlocks 3 (one shared with
withheld responses). Those two are worth building first.

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
| Buildable now | 29 | 59% |
| + the six gaps | 41 | 84% |
| + declared simplifications | 45 | 92% |
| Out of scope | 4 | 8% |

**59% with the model as it stands. 92% after six additive features.**

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
