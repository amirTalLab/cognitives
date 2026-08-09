---
name: experiment-from-paper
description: "Turn a psychology/cognition academic PDF into a runnable experiment for the cognitives site. Use whenever the user gives a paper/PDF and wants to recreate an experiment from it — e.g. 'build the experiment from this paper', 'make an experiment out of this PDF', 'which experiments are in this paper?'. This skill reads the PDF, identifies the distinct experiments in it, filters them to the ones actually recreatable as a browser task for a general student population, lets the user pick one, extracts its design spec, and hands that spec to the new-cognitive-experiment skill to generate the code."
---

# Build an Experiment From a Paper

This is the **front-end** of the paper→project pipeline. It does everything up to a
confirmed design spec, then hands off to **`new-cognitive-experiment`** (the codegen
skill) to write the pages. Do NOT generate experiment code here — produce the spec and
delegate.

Pipeline: **ingest PDF → identify experiments → feasibility filter → user selects →
extract & confirm spec → hand off to `new-cognitive-experiment`.**

---

## Step 1 — Ingest the PDF (get reliable text)

1. Try the **Read** tool on the PDF first.
2. Many academic PDFs are old (pre-2005) or flagged as protected and the image reader
   refuses them even when they are **not** truly encrypted. When Read fails, fall back to
   command-line extraction (poppler is available in this environment):

   ```bash
   pdfinfo "<paper>.pdf"                                   # check Pages / Encrypted
   pdftotext -layout "<paper>.pdf" "<scratchpad>/paper.txt"
   ```
   Then read the `.txt`. `-layout` preserves columns/headings, which helps section detection.
3. If `pdftotext` yields almost no text, the PDF is a **scanned image** — OCR is out of
   scope. Tell the user and stop.

---

## Step 2 — Identify candidate experiments

A paper can contain: multiple numbered experiments ("Experiment 1/2/…", "Study N"),
informal **demonstrations** embedded in the discussion (e.g. the bouba/kiki figure), or
**none** (a review/theory/opinion article).

Scan for the signatures of a *recreatable behavioural experiment*:
- a **task/procedure** a person performs,
- **stimuli** (text, shapes, images, sounds, numbers…),
- a **manipulation / conditions** (the IV),
- a measured **behavioural DV** — choice, accuracy, reaction time, rating, estimate,
- a **result / expected effect** (ideally with a number, e.g. "95% chose…").

For each candidate, capture: **name · one-line paradigm · IV/manipulation · DV ·
expected effect**. Grep the extracted text for cue words to locate them
(`experiment`, `subjects`, `participants`, `forced-choice`, `we asked`, `%`, `reaction
time`, `condition`).

---

## Step 3 — Feasibility filter (the important part)

Classify every candidate. Most papers contain things we **cannot** recreate for a class,
so this filter is what makes the output trustworthy.

- ✅ **Recreatable** — a browser task runnable on the **general student population**:
  forced-choice, RT, accuracy, ratings/estimates, with stimuli we can render (text,
  shapes, images, audio).
- ⚠️ **Recreatable with caveats** — needs **assets we must source/generate** (specific
  images, audio, faces) or is unusually long/complex. Note what's needed.
- ❌ **Not recreatable** — requires a **special population** (synaesthetes, clinical
  patients, experts), **apparatus** (fMRI, EEG, eye-tracker, physical rig), physical
  materials, or is a theoretical claim with **no task**. State the blocker.

Always give the one-line reason for the verdict.

---

## Step 4 — Present & select

- Show a numbered list, **recreatable ones first**, each with paradigm + feasibility verdict.
- If **nothing** is recreatable, report that the paper has no recreatable experiment and
  say why (review paper / needs synaesthetes / apparatus-only). **Stop** — do not invent one.
- Otherwise ask the user which experiment to build (use AskUserQuestion when there are
  several; recommend the cleanest ✅ one).

---

## Step 5 — Extract & confirm the design spec

For the chosen experiment, fill the `new-cognitive-experiment` **Step-0 inputs** from the
paper:

| Field | Source |
|---|---|
| URL slug | propose from the effect name (e.g. `boubaKiki`) |
| Category | PERCEPTION · ATTENTION · LANGUAGE · MEMORY · … |
| Design description | what it measures + the effect |
| Conditions | the IV levels |
| Trial structure & timing (ms) | phases; **often omitted in papers — infer** |
| Trial counts & ordering | **often omitted — infer** |
| Response modality | keys / on-screen buttons / choice |
| DV | accuracy / RT / choice proportion / rating |
| Expected effect | the paper's result (e.g. "~95% rounded→bouba") |
| Teacher charts | what to aggregate (dashboard designed later) |

Mark every field **[from paper]** or **[inferred — confirm]**. Papers almost always omit
exact trial counts and timings — surface those as inferred and let the user adjust.
**Reviewing a spec is far easier than reviewing generated code**, so always show it and
get a confirmation before generating.

---

## Step 6 — Hand off to code generation

Once the spec is confirmed, invoke the **`new-cognitive-experiment`** skill with it.
For the first pass, generate the **experiment `page.tsx`** (the core trial loop) to
validate the flow end-to-end, then expand to landing / practice / thanks / teacher.

---

## Worked example (validation case)

- **`The_Phenomenology_of_Synaesthesia.pdf`** (Ramachandran & Hubbard 2003): a review
  article. Bouba/kiki appears once, as a citation, with no method → **"no recreatable
  experiment found."** (Negative case — the filter must refuse it.)
- **`RamachandranHubbard_JCS01.pdf`** (2001): contains several synaesthesia
  demonstrations. Only **Bouba/Kiki** (Fig. 7 — 2AFC rounded-vs-spiky shape ↔ "bouba"/
  "kiki", ~95% conventional mapping) is ✅ recreatable; the grapheme–colour pop-out and
  the other demos are ❌ (require actual synaesthetes). Correct output: offer Bouba/Kiki,
  refuse the rest.
