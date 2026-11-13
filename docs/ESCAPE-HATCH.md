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

## How it turned out

Built 2026-09-24 and used by both candidates the same day.

**Wason's rule task** (logics) — one phase of a 23-question battery. The other 22 questions
are ordinary data a lecturer can edit, which is exactly what the second-template design would
have cost.

**bRMS** — two custom surfaces, a suppression phase and a calibration gate, around an
entirely ordinary experiment: 108 trials from crossed factors in three blocks, a
spine-and-payload row, four charts the runtime already drew. Nothing about its results,
dashboard or publishing needed anything new. This was the case that would have justified a
second platform, and it did not need one.

**The drawing task** (creativity) turned out not to be an escape-hatch case at all, as
predicted below: `{ kind: 'drawing' }` is a response kind. Two occupants, not three.

## Still open

bRMS's suppression might still reduce to a `flicker` display kind one day — a mask stream and
a ramping overlay are not obviously undeclarable. It was not attempted, because the timing
contract is the experiment and a display kind that got it slightly wrong would shorten every
breakthrough time in the dataset without anyone noticing.

One ordering rule is still inexpressible: bRMS reshuffles until no two consecutive trials
share an identity or a condition. Declared as a simplification on that port rather than
worked around.

---

## Update — 2026-11-13: a phase may be a sandboxed script

**What changed.** The rule above — "a definition cannot introduce code, so an experiment
that needs a new kind of phase has to be built by hand" — left the live site with no way to
build a paper whose stimulus is motion, flicker, sound, or a staircase. The `/create`
wizard sent those down the generated-pages path, which cannot finish on a deployed server
(three long model calls past the 5-minute function limit, and a deployed site cannot add
pages to itself). Found with a random-dot motion paper (Watanabe et al. 2001).

**The decision.** A phase may now carry `custom: { script, responds? }` — the body of a
function, written by the pipeline, run in an `<iframe sandbox="allow-scripts">` with no
`allow-same-origin` and a CSP of `default-src 'none'; connect-src 'none'`. It gets an opaque
origin, so it cannot read the site's storage, cookies or DOM, cannot reach Supabase, and
cannot fetch anything. It draws in its own frame and posts results back; the runner checks
the sender and a per-frame token, coerces the response to a capped string, and keeps only
safely named JSON columns, merged UNDER the definition's own stored columns.

**Why this does not undo the original reasoning.** The worry was code shipping with the site
and being impossible to edit or regenerate. A custom display is neither: it is data in the
definition (versioned, validated, editable through Refine), and it is confined to the one
phase that needs it — factors, scoring, saving and the dashboard stay declarative.

**Safeguards.**
- `validate` parses every script (`new Function`, never run), caps its size, and checks that
  a script which answers the trial calls `exp.done`.
- `/create` runs every custom display for 2.5s on real planned trials, out of sight, after
  each build and refine. An error goes back to the model as a repair request (twice at most),
  and publishing is blocked while any is known. Errors hit while previewing are reported up
  from the preview frame the same way.
- For students: a script that throws ends its phase (no response recorded, `display_error`
  stored on the row), and a phase waiting on a silent script offers "Continue" after two
  minutes. Nobody is left on a blank screen.

The named components (`wasonRuleDiscovery`, `bRMSSuppression`) stay: they are hand-written,
reviewed code for the ported experiments. New experiments use `custom`.
