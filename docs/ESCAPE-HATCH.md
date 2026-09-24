# When a phase is allowed to be code

**Decided 2026-09-24.** Recorded because the alternative was reasonable and the reasoning
will not be obvious later.

## The question

Three of the remaining hand-built experiments looked like they could not move to `/run`:
`logics` (Wason's 2-4-6 rule task), `creativity` (a freehand drawing task) and `bRMS`
(continuous flash suppression). The proposal on the table was a **second template** — a
parallel, code-heavy way to build an experiment, for the ones the definition runtime cannot
express.

## What reading them actually showed

Not one of the three is a different *kind* of experiment. Each is an ordinary experiment
with one exotic surface.

| | Structure | Results | Dashboard | The exotic part |
|---|---|---|---|---|
| `logics` | 20 questions, 7 with between-subject framing splits — `assign` already does that | ordinary | ordinary | Wason's rule task |
| `creativity` | three timed sub-tasks | ordinary | ordinary | the drawing canvas |
| `bRMS` | blocks, trials, choice responses | ordinary spine + payload | two bar charts and a scatter, all existing `ChartSpec` kinds | frame-accurate flicker, and a calibration gate |

**17 of the 20 logics questions are already expressible today.** `max_contrast` in bRMS is a
constant, not a staircase, so there is no adaptive-difficulty gap hiding in it either.

## The decision

**One runtime, with a named escape hatch — not a second platform.**

A phase may name a component from a fixed in-code list. Everything else about the experiment
stays ordinary: the same results table, the same dashboard, the same publish flow, the same
lock, and — the point of the whole migration — the same edit list in `/create`.

### Why not the second template

- It would take `logics` out of `/create` **whole**, to accommodate one widget. Twenty
  questions of pure editable data — wording, options, framing splits — is exactly what a
  lecturer most wants to change.
- Multi-tenancy is on the roadmap. Under one runtime that work happens once. Under two it
  happens twice, and so does every future change to storage, export, locking and dashboards.
- It is where this project started. The 18 hand-built experiments *were* the "minimal
  template, longer and more specific" approach, and the cost was every experiment carrying
  its own copy of the same bugs.

## The rule

The runtime **plans trials in advance, renders declarative displays, and compares responses
to planned values.** A phase may be a component only when it genuinely breaks one of those:

1. **The participant authors the stimulus**, so there are no trials to plan — Wason's 2-4-6.
2. **The display cannot be declared** — frame-accurate animation, flash suppression.
3. **The input is not an HTML control** — freehand drawing, audio capture.

Never because a design is merely hard. The rule lives in `schema.ts` as well as here,
because that file is read from disk and passed to the model verbatim, so it is the only
place the boundary can be stated where *generation* will see it.

**The worked example against reaching for it:** ensemble perception looked like a perfect
candidate — two interleaved tasks, a slider, a per-trial scoring rule. Building it
declaratively is what gave the runtime interleaving, estimation, sliders, list-driven arrays
and bilingual display text, all of which every experiment can now use. A component would have
bought one experiment and taught the system nothing. Hard ports are what make the runtime
worth having.

## What it costs, honestly

- **A component cannot be generated.** The pipeline writes JSON; a component is code. So an
  experiment needing one is an experiment to say no to rather than approximate — a lookalike
  that drops the timing or the drawing is not the experiment. The validator says so by name.
- **A component phase cannot be edited from `/create`.** The rest of its experiment can.
- **It creates two tiers**: built-ins can do things generated experiments cannot. Accepted
  knowingly.

## Safety

A definition names a component; it never names a path and never carries code. A published
definition is a row in a database, so the worst a wrong or hostile value can do is match
nothing — which the validator reports and the runner renders as a visible message rather than
a blank screen. Nothing is imported, evaluated or fetched from what a definition says. That
property is not negotiable.

## Guards

- `component-names.ts` holds the names; `components.tsx` holds the components. A test fails
  if they drift, because a name in one and not the other is either a definition that
  validates and renders nothing, or a component nothing may use.
- A test fails if the list grows past five. Not a style rule — if the number climbs, the
  trade above is being made repeatedly and silently.
- A test asserts the boundary is still stated in `schema.ts`, where the generator reads it.

## Still open

The drawing task is probably **not** an escape-hatch case: "draw something" is a response
kind, no less declarative than the `wordList` response DRM's recall already uses. It should
be tried as `{ kind: 'drawing' }` before anyone writes a component for it. bRMS may similarly
reduce to a `flicker` display kind; that one has not been examined closely enough to promise.
