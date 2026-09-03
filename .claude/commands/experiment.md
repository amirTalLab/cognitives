---
description: Build a classroom experiment — from a paper, or from a description. Same result as the /create page, on your Claude subscription instead of the metered API.
argument-hint: [a PDF path, or a description like "a Stroop task"]
---

Build an experiment for the cognitives site, following the same stages the `/create` page
uses so the result is identical: **analyze → choose → spec → build → preview → refine →
publish.**

The request: **$ARGUMENTS**

If that is empty, ask what they want to build — a paper in `papers/`, or a paradigm they can
describe — and stop until they answer.

Use the **`experiment-definition`** skill. When the request names a PDF, run
**`experiment-from-paper`** first for the paper stages, then come back to
`experiment-definition` to build. Follow those skills as written; the notes below are only
about how to run the conversation.

## Work the way the web wizard does

The lecturer using this is not reading the JSON. Give them the same decision points the web
page gives, in the same order, and wait at each one:

1. **Candidates** — for a paper, show every experiment found with a one-line paradigm and a
   feasibility verdict, recreatable ones first. Recommend one. Let them pick.
2. **Spec** — show the design as a short table before writing any JSON, with each value
   marked as taken from the paper or inferred by you. Invite corrections. **Wait for
   approval.** Reviewing a spec is far easier than reviewing a definition, and a wrong
   assumption caught here costs nothing.
3. **Build and check** — write `experiments/<slug>.json` and run `npm run exp:check`. Report
   what it says the design actually builds — trial count, trials per level — not just that
   it passed.
4. **Preview** — tell them to open `/run/<slug>` and take it for a few trials, and
   `/run/<slug>/teacher` with Mock Data on to see the charts. Say plainly that this is the
   step that catches what JSON cannot show: timings, wording, whether the task makes sense.
5. **Refine** — take changes in plain language ("make the mask 300ms", "add a confidence
   rating", "fewer trials"), edit the JSON, re-run `exp:check`, tell them to refresh. This
   is the terminal's version of the wizard's chat; expect several rounds.
6. **Publish** — only when they say it is right. `npm run exp:publish` makes it live for
   students immediately, so confirm before running it, and never run it just to look at
   something.

## Ground rules

- **Never skip the spec approval or the preview.** They are what make this trustworthy.
- **Do not invent stimuli the paper specifies.** If an effect needs particular images, say
  so and ask for the files rather than substituting shapes.
- **Say what you assumed.** Papers almost never state trial counts or timings; propose them
  from the closest worked example and mark them as yours.
- **Refusing is a valid answer.** Some paradigms genuinely do not fit — audio, one-shot
  deceptions, anything needing a special population. Say so and explain why instead of
  building a lookalike.
- If a command fails in a way that looks like setup rather than design, run
  `npm run exp:setup` and give them the one line it says to fix.
