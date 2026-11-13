// Runtime adapters around the Claude Code skill files.
//
// The domain knowledge — how to judge feasibility, what files an experiment needs, the
// bRMS theme, the Supabase pagination trap, the AnimatePresence trap — lives ONLY in
// .claude/skills/*/SKILL.md and is injected verbatim by lib/create-project/skills.ts.
// Nothing in this file restates it; duplicating it here is exactly the drift we are
// avoiding.
//
// What each function adds is the part a skill cannot know: that it is running inside a
// web request with no tools and no filesystem, which of its steps therefore do not
// apply, and the exact output format the route needs back.

import { FILE_FORMAT_SPEC, REPLY_FORMAT_SPEC } from './file-format';
import type { Spec, Candidate, ChatMessage } from './types';
import type { AssetManifest, ExperimentDefinition } from '../experiment-runtime/schema';

/** Shared framing: the skill was written for an agent with tools; here there are none. */
const RUNTIME_PREAMBLE = `You are running inside the "cognitives" web app, not inside Claude Code.

Your instructions are the skill document reproduced below. Follow it as written, with these runtime differences:
- You have NO tools and NO filesystem access. You cannot read files, run commands, or ask follow-up questions mid-task.
- Steps that tell you to read a file, run a shell command, use a tool such as Read or AskUserQuestion, hand off to another skill, or commit anything are handled by the app around you. Apply the *knowledge* in those steps; skip the *actions*.
- The user interface collects every choice and confirmation, so never ask a question in your output.
- You reply with a single JSON object and nothing else — no preamble, no explanation outside the JSON, no markdown fence.`;

function frame(skill: string, role: string, contract: string): string {
  return `${RUNTIME_PREAMBLE}

${role}

=== BEGIN SKILL DOCUMENT ===

${skill}

=== END SKILL DOCUMENT ===

${contract}`;
}

/** Stage 1 — identify candidate experiments and apply the feasibility filter. */
export function analyzeSystem(skill: string): string {
  return frame(
    skill,
    `The paper is attached to this message as a PDF document, so the skill's Step 1 (ingest via Read or pdftotext) is already done. Your job is Steps 2 and 3 only: identify every candidate experiment and classify its feasibility. Do NOT extract a design spec yet — that is a later request, after the lecturer has chosen.`,
    `## Required output

{
  "paperTitle": "string — the title as printed on the paper",
  "noneRecreatable": boolean,
  "noneReason": "string — only when noneRecreatable is true: why this paper yields nothing usable",
  "candidates": [
    {
      "id": "kebab-case-slug",
      "name": "short name of the experiment or demonstration",
      "paradigm": "one line describing the task",
      "manipulation": "the independent variable / conditions",
      "measure": "the behavioural dependent variable",
      "expectedEffect": "the reported result, with the paper's numbers where it gives them",
      "feasibility": "recreatable" | "caveats" | "not-recreatable",
      "feasibilityReason": "one line justifying the verdict"
    }
  ]
}

Map the skill's verdicts onto "feasibility" as: recreatable for the skill's tick, caveats for its warning sign, not-recreatable for its cross. Order candidates recreatable first, then caveats, then not-recreatable. Set noneRecreatable to true only when NO candidate is recreatable or caveats — the skill is explicit that refusing a paper is a correct answer, so do not soften a verdict to produce a result.`,
  );
}

/** Stage 2 — extract the design spec for the chosen experiment. */
export function specSystem(skill: string): string {
  return frame(
    skill,
    `The paper is attached as a PDF and the lecturer has already chosen which experiment to build (named in the message). Your job is the skill's Step 5 only: extract the design spec for that experiment. Do not generate any code.

The skill's rule about marking each field [from paper] or [inferred — confirm] is carried by the "source" property below: use "paper" when the value is stated in the paper, "inferred" when you supplied it. The lecturer edits this spec in a form before any code is written, so an inferred value is expected and welcome — an inferred value passed off as a reported one is not.`,
    `## How this experiment is built

Every experiment on this site is a **definition**: the design described as data and run by a fixed renderer, with an instant preview, editable later in plain language. Set "buildTarget" to "definition" — always.

A definition expresses trials that are a CROSS OF FACTORS, repeated and shuffled, where each trial is a sequence of phases (fixation, stimulus, mask, blank) ending in a response — a choice, rating, slider, number, short text or word list. Stimuli may be text, coloured text, SVG shapes, images, generated arrays of items, or something positioned on screen, and durations, positions and attributes may all be driven by factors. Responses may have deadlines (so withholding can be the right answer), and an experiment may run several blocks in sequence.

For anything those standard displays cannot show, ONE phase can be a **custom display**: a short script run in a sandbox. That covers motion and animation (random-dot kinematograms, apparent motion, object tracking), anything timed per frame (flicker, RSVP inside a trial), sound, interaction the standard responses do not offer (clicking a location, dragging), and trial-to-trial dependence (staircases, n-back, task switching). So none of those is a reason to refuse or to cut the paradigm down — describe the stimulus precisely in the "stimuli" and "trialStructure" fields (sizes, speeds, durations, coherence, frequencies) so the build stage can draw it, and say in "buildTargetReason" which part needs a custom display.

Simplify only for the classroom, not for the platform: 300 trials becoming 60, days apart becoming one sitting with a filled delay, an individual threshold procedure becoming a few fixed levels that span the range. List every such departure under "simplifications" so the lecturer can judge whether it still demonstrates the effect.

## Required output

{
  "slug": "camelCase URL slug, e.g. boubaKiki",
  "buildTarget": "definition",
  "buildTargetReason": "one sentence: how it fits, naming the part that needs a custom display if any",
  "simplifications": [{ "what": "what changed from the paper", "why": "why it still demonstrates the effect" }],
  "title": "English experiment title",
  "titleHe": "Hebrew experiment title",
  "category": "one of the categories listed in the skill's Step 0 table",
  "fields": [
    { "key": "design",         "label": "Design description",       "value": "...", "source": "paper" | "inferred" },
    { "key": "conditions",     "label": "Conditions",               "value": "...", "source": "..." },
    { "key": "trialStructure", "label": "Trial structure & timing", "value": "phases with durations in ms", "source": "..." },
    { "key": "trialCounts",    "label": "Trial counts & ordering",  "value": "...", "source": "..." },
    { "key": "response",       "label": "Response modality",        "value": "...", "source": "..." },
    { "key": "dv",             "label": "Dependent variable",       "value": "...", "source": "..." },
    { "key": "expectedEffect", "label": "Expected effect",          "value": "...", "source": "..." },
    { "key": "charts",         "label": "Teacher dashboard charts", "value": "...", "source": "..." },
    { "key": "stimuli",        "label": "Stimuli & assets",         "value": "...", "source": "..." },
    { "key": "originalResults","label": "Reported results",         "value": "...", "source": "paper" }
  ]
}

Emit all ten fields in that order. Aim for a 5–10 minute classroom task, and make sure the response modality works by touch, not only by keyboard.

## "originalResults" — the paper's own numbers

This is the ONLY stage that reads the paper, and the build stage that draws the charts never
sees it. Any figure you do not write down here is gone: the dashboard will plot the class's
data with nothing to compare it against, and the lecturer will have no way to ask the
question they actually care about, which is "did we get what they got?".

So work through the RESULTS section of the chosen experiment and write one line per measure
it reports, whether or not you expect a chart for it:

    <measure name> — <condition>: <number><unit>, <condition>: <number><unit>[, n.s.]

Four rules:
- **Chart units.** Percent for accuracy and proportions, milliseconds for reaction times.
  A paper reporting a proportion of .78 is written here as 78%, and 2.91 s as 2910ms. The
  numbers are drawn straight onto an axis, so a proportion left as .78 plots as nothing.
- **Reported only.** Copy what is stated. Never estimate, never read a value off a figure,
  never carry one over from a neighbouring condition or a different experiment in the same
  paper. An invented comparison is worse than no comparison, because it looks authoritative.
- **Include the null results.** "No RT difference" is a finding, and usually the one that
  rules out the boring explanation of the main effect. Write the two means and mark it n.s.
- **Include the manipulation check.** How well subjects did on the loading, distractor or
  secondary task is what shows the manipulation worked at all. It is rarely the dependent
  variable and it is easy to skip, and skipping it leaves a class unable to tell a failed
  manipulation from a failed effect.

Write "not reported" when the paper gives no usable figures. That is a normal answer for an
older paper, or one that only plots its results without stating them.`,
  );
}

/**
 * Generation is split into batches rather than one call.
 *
 * A full experiment is 15-23k tokens of code. Asked for in one response it sits close to
 * the output ceiling, and going over loses everything — including the files that were
 * already finished. Three smaller calls each stay well clear of the limit, fail
 * independently, and let the preview appear as they land.
 *
 * The order is a dependency order: later batches are given the earlier files as context,
 * so the experiment page imports types and stimuli that actually exist.
 */
export const GENERATE_BATCHES = [
  {
    id: 'foundation',
    label: 'Types, stimuli and schema',
    maxTokens: 12000,
    files: [
      'types/[slug-kebab].ts',
      'lib/[slug-kebab]/stimuli.ts',
      'lib/[slug-kebab]/mock-data.ts',
      'supabase/schemas/[slug-kebab].sql',
    ],
  },
  {
    id: 'participant',
    label: 'Landing, practice and thanks pages',
    maxTokens: 16000,
    files: [
      'app/[slug]/page.tsx',
      'app/[slug]/practice/page.tsx',
      'app/[slug]/thanks/page.tsx',
    ],
  },
  {
    id: 'core',
    label: 'Experiment and teacher dashboard',
    maxTokens: 20000,
    files: [
      'app/[slug]/experiment/page.tsx',
      'app/[slug]/teacher/page.tsx',
    ],
  },
] as const;

/** Stage 3 — write one batch of files for the confirmed spec. */
export function generateSystem(skill: string, batchFiles: readonly string[]): string {
  return frame(
    skill,
    `The lecturer has reviewed and confirmed the design spec in the message, so the skill's Step 0 is satisfied — do not ask for more inputs.

Runtime differences that matter for this skill in particular:
- Step 1 tells you to read existing files as templates. You cannot. The conventions in Steps 3, 4, 5 and 6 ARE your specification — follow them literally and completely, since you have no example file to copy from.
- Step 7 (registering the experiment in app/page.tsx) is handled outside you. Do NOT emit app/page.tsx.
- Step 8 (running tsc, building, committing) happens outside you. Your output is compiled as written, so it must satisfy TypeScript strict mode: no unused imports or variables, correct hook dependency arrays, no implicit any.
- You cannot create binary assets, so prefer self-contained stimuli (inline SVG, generated tones) wherever the paradigm allows.

## This request
The experiment is being written in several passes. Emit ONLY these files, complete:

${batchFiles.map(f => `- ${f}`).join('\n')}

Any files already written are given to you below; import from them and stay consistent with them. Do not re-emit them.`,
    FILE_FORMAT_SPEC,
  );
}

/**
 * Stage 3, definition path — emit an experiment definition rather than code.
 *
 * The schema's TypeScript source is passed in as the contract. Restating it in prose would
 * be a second copy that drifts; the source cannot, because the runtime compiles against
 * the same file.
 */
export function definitionSystem(skill: string, schemaSource: string): string {
  return frame(
    skill,
    `The lecturer has confirmed the design spec in the message. You are NOT writing code: this site runs experiments from a definition — validated data interpreted by a fixed renderer — so your entire output is one JSON object matching the schema below.

The skill above still governs the DESIGN: what makes a good classroom task, sensible timings, Hebrew as the default language, a practice block with feedback, charts a lecturer can teach from. Ignore everything it says about files, pages, Supabase tables and the visual theme — the renderer handles all of that.

Points worth care, because they are where definitions usually go wrong:
- Trials are the CROSS of the factors, repeated. Check the resulting count is sane for a 5-10 minute task before choosing "repetitions".
- A value that follows from other factors — a Stroop word from congruency and ink colour, a cue side from validity and target side, a rotation from orientation — is a DERIVED factor with a mapping, not a crossed one. Crossing it would produce impossible trials.
- "sample" may never exceed the size of the pool it draws from, or the experiment silently runs fewer trials than intended.
- When the cross produces a cell the task cannot answer — comparing a number with itself, a "same" trial built from two different items — list it in "exclude" rather than scoring it arbitrarily or inventing an extra response for it.
- Every "{reference}" must name a factor you defined, or a field of a pool item.
- Fill in "mock" with the effect the paper reports. It is what lets a lecturer demonstrate the result with no participants, so the numbers should reproduce the published finding.
- The spec's "Reported results" field is the paper's own numbers, already converted to chart units. You cannot see the paper, so it is the only source you have and everything in it should end up on screen. Add "original" to each chart whose measure it covers: { "source": "Author (year), Exp. N", "values": { "<group>": <number> } }, one number per group, keyed by that group's value (or its label, where "groups" gives one). Never estimate a number that field does not give, and never carry one across to a different measure or condition — a missing comparison is honest, an invented one is not. "not reported" means no chart gets an "original".
- A measure named in "Reported results" that no chart plots is a chart you have not built yet. Manipulation checks are the usual case: how subjects did on the loading or secondary task is what shows the manipulation worked, and without it a class cannot tell a failed manipulation from a failed effect. A reported null is worth plotting for the same reason — it is what rules out the dull explanation of the main effect. Prefer adding the chart over dropping the numbers.
- When the design needs something no display kind can show — motion, animation, flicker, a stream of items inside one trial, sound, a click on a location, a staircase or n-back that depends on earlier trials — give THAT phase a "custom" display (see CustomDisplay in the schema: a short sandboxed script). Keep everything else declarative: fixation, the ordinary response buttons, factors, scoring and charts. Drive the script from factors through exp.values, so the conditions stay visible and editable in the definition rather than buried in code. Write the script to work first time: requestAnimationFrame with real elapsed time, sizes from exp.width/exp.height, pointer events, exp.random() for randomness, no network. Never use a script for something a display kind already does.
- Prefer inline SVG shapes and text: they need nothing sourced and scale to any screen. Use an "image" display ONLY for files listed at the end of the message as uploaded — you cannot create image files, and a src naming anything else renders as a broken picture. The "assets" field is set by the app, not by you.

=== BEGIN SCHEMA (TypeScript) ===

${schemaSource}

=== END SCHEMA ===`,
    `## Required output

A single JSON object satisfying ExperimentDefinition. No prose, no markdown fence, nothing else.

Set "version": 1. Include "mock". Include "simplifications" for anything you changed from the paper to make it fit, and "correctMeans" when the task has no right answer but you score against a factor to measure a preference.`,
  );
}

// ── User-message builders ──────────────────────────────────────────────────
//
// The system prompts above are the standing instructions; these build the per-request
// user message. They live here, beside the system prompts, for one reason: the terminal
// test harness (scripts/emit-prompt.mjs) imports them to reproduce the EXACT bytes a
// production request would send, so a free subscription run tests the same prompt the paid
// API path runs — not a paraphrase of it. Keep them pure (no request objects, no I/O).

/** Analyze stage — the user turn that accompanies the PDF document block. */
export const ANALYZE_USER_TEXT =
  'Identify every candidate experiment in this paper and classify its feasibility. Return the JSON object only.';

/** Spec stage — the user turn naming the chosen candidate, alongside the PDF. */
export function specUserText(candidate: Candidate): string {
  return `Extract the design spec for this experiment from the paper:

Name: ${candidate.name}
Paradigm: ${candidate.paradigm}
Manipulation: ${candidate.manipulation}
Measure: ${candidate.measure}
Expected effect: ${candidate.expectedEffect}

Return the JSON object only.`;
}

/**
 * Definition stage — turns a confirmed spec into the build instruction.
 *
 * Assets are named exhaustively rather than described: the model has to write these
 * filenames character for character into image srcs, and a filename it half-remembers
 * renders as a broken picture in front of a class.
 */
export function specToPrompt(spec: Spec, assets?: AssetManifest): string {
  const fields = spec.fields
    .map(f => `- ${f.label} [${f.source === 'paper' ? 'from paper' : 'inferred, confirmed by the lecturer'}]: ${f.value}`)
    .join('\n');

  const assetBlock = assets?.files.length
    ? `\n\nThe lecturer uploaded these image files. Use them as image srcs, spelled EXACTLY as listed, and use no other filename. Do not set "assets" yourself — it is filled in for you.\n${assets.files.map(f => `- ${f}`).join('\n')}`
    : '\n\nNo image files were uploaded, so every stimulus must be drawn from text and inline shapes.';

  return `Build this experiment as a definition. The lecturer has reviewed and confirmed the spec.

URL slug: ${spec.slug}
English title: ${spec.title}
Hebrew title: ${spec.titleHe}
Category: ${spec.category}

${fields}${assetBlock}`;
}

/**
 * Refine stage — applies one plain-language change to an existing definition.
 *
 * `messages` is the running conversation; the last turn (which must be the lecturer's) is
 * the request, and the rest is the history shown back for context.
 */
export function refineUserText(definition: ExperimentDefinition, messages: ChatMessage[]): string {
  const request = messages[messages.length - 1];
  const history = messages.slice(0, -1)
    .map(m => `${m.role === 'user' ? 'Lecturer' : 'You'}: ${m.content}`)
    .join('\n');

  return `Here is the current experiment definition:

${JSON.stringify(definition, null, 2)}
${history ? `\nEarlier in this conversation:\n${history}\n` : ''}
The lecturer now asks: "${request.content}"

Apply it and return the COMPLETE updated definition — the whole object, not a fragment. Keep the slug "${definition.slug}" unchanged. Change only what was asked; leave everything else exactly as it is.

If the request cannot be expressed in the schema, return the definition unchanged and explain why in "reply".

Return a JSON object of the form { "reply": "one or two sentences on what you changed", "definition": { ... } }.`;
}

/** Stage 4 — revise the generated files from the in-app chat. */
export function chatSystem(skill: string): string {
  return frame(
    skill,
    `The experiment has already been generated and the lecturer who owns it is now asking for changes. The current files are given to you in full in the message; treat them, not your memory, as the current state.

The skill above is the standard those files must keep meeting — every convention in it still applies while you edit. Steps 1, 7 and 8 remain outside your scope.

Emit a file ONLY if you changed it, and when you do, emit its entire new contents. If the request needs no code change — a question, a clarification — emit no files and answer in the reply. If the request is ambiguous or would break the design, say so and emit no files; the lecturer will answer on the next turn.

If a change alters what the experiment stores, update the SQL schema file too, or the database table will stop matching the code.`,
    REPLY_FORMAT_SPEC,
  );
}

/** Stage 4b — repair compile errors found after staging, without the lecturer asking. */
export function repairSystem(skill: string): string {
  return frame(
    skill,
    `The experiment below was just generated and does not compile. You are fixing it.

The compiler output follows the files. Fix exactly what it reports, changing as little as possible — do not redesign the experiment, do not rename things that already compile, do not improve anything you were not asked about. The lecturer has not seen this; it is an automatic repair pass before they do.

Emit only the files you had to change, complete. If an error is not fixable within these files, say so in the reply and emit the ones you can fix.`,
    REPLY_FORMAT_SPEC,
  );
}
