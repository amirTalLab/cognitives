# Pipeline test results

Scores are 1–5. See `README.md` for the rubric. **E** = extraction, **B** = buildability,
**F** = fidelity. "Path" is the build target chosen (definition / code). Free runs use this
session's model as a proxy for production's sonnet-5 (extract) / opus-5 (build).

| # | Paper | Experiment | Path | E | B | F | Refine ok? | Notes / systematic issues |
|---|-------|-----------|------|---|---|---|-----------|---------------------------|
| 1 | Ramachandran & Hubbard 2001 (JCS) | Bouba/Kiki shape–sound mapping | definition | 4* | 5 | 4† | ✅ | *Paper is in the skill's worked example → extraction partly "taught to the test"; also surfaced the numerical-distance effect as a valid 2nd candidate (not in the example) and correctly ❌'d the synaesthete demos. †Renderer/visual preview not done headless; confidence-rating storage unverified. |

| 2 | Meyer & Schvaneveldt 1971 (JEP) | Lexical decision (yes/no), associative priming | definition | 4 | 4 | 4† | _pending_ | **Not in the skill** — a real extraction test. Both experiments found with the paper's own numbers (85/117/183 ms, F values); correct definition path. Buildable after **one** validation fix (finding 5). †Not visually previewed yet. |

Run-2 detail (Lexical decision):
- **Extraction** — found both experiments, extracted the reported effects and F-tests from the
  paper, chose the definition path correctly, and flagged three honest simplifications
  (5 stimulus types → 3, fixed set vs 6-list rotation, dropped incentive). Better extraction
  test than run 1 because this paper is *not* referenced in the skill. Still me-as-model, so
  not a substitute for the paid sonnet-5 sample.
- **Buildability** — valid, but only after hitting finding 5 (a `derivedFrom` limitation). The
  natural "make a clean condition factor" encoding was rejected; grouping on `item.kind`
  directly works. Pool-of-pairs + per-item `correct` via `item.lexical` is a clean fit.
- **Fidelity** — reproduces the paradigm (stacked pairs, yes/no RT, association effect in the
  mock). Not visually previewed here.

Run-1 detail (Bouba/Kiki):
- **Extraction** — got the ~95% effect, the 2AFC paradigm, correctly refused the five
  synaesthete-only demos (special population), and independently flagged the numerical
  distance effect (line 661, normal subjects) as a second recreatable candidate. Discounted
  to 4 because this exact paper is named in the skill and the free run used a stronger model
  than production's `sonnet-5`.
- **Buildability** — valid definition, definition path correctly chosen. The validator's
  factor breakdown caught a real design flaw on the first attempt (see finding 2) which a
  one-line change fixed. Clean 5.
- **Fidelity** — reproduces the method and the ~95% mock; shapes are schematic blob/star
  rather than the paper's specific figures (acceptable). Not visually previewed here.
- **Refine** — "add a confidence rating after each choice" correctly restructured the single
  response into a two-step response bound to phases, added a `confidence` phase, changed
  nothing else, kept the slug, and re-validated.

## Systematic findings (roll-up)

Patterns worth engineering against as runs accumulate:

1. **Weak extraction test when the paper is in the skill.** `experiment-from-paper` names
   `RamachandranHubbard_JCS01.pdf` in its worked example, so run 1 can't cleanly measure
   extraction. **Real extraction testing needs papers NOT referenced in the skill** — that
   is what the "lots of different papers" batch is for.
2. **`counterbalance` can silently unbalance a derived correctness target.** Counterbalancing
   `roundedSide` (assigned globally) while a derived `conventionalSide` (the correctness
   factor) depends on it produced an 8/4 split instead of 6/6, partially confounding the DV
   with left/right button bias. Crossing the factor instead fixed it. *Candidate improvement:
   a validator warning when a counterbalanced factor feeds a derived factor used by the
   `correct` rule.*
3. **Multi-response storage unverified.** A `rating` step added alongside the `choice`
   validates, but whether the secondary response reaches the results payload isn't confirmed
   by validation alone — needs a preview/store check. Worth confirming before relying on
   multi-response designs.
4. **Free-run model caveat holds.** This session proxies `sonnet-5` (extract) and `opus-5`
   (build); extraction quality is likely *over*-estimated. Calibrate with a small paid Tier-2
   sample before trusting absolute extraction scores.
5. **`derivedFrom` rejects dotted pool fields** (`item.kind`), though `groupBy`, `store`,
   `correct`, `mock.effects.factor` and display interpolation all accept them. To group or
   score by a pool item's tag you must reference `item.field` directly, not route it through
   a derived factor. A model can reasonably try the derived route and hit a hard validation
   error. *Candidate improvement: allow dotted refs in `derivedFrom`, or make the validator's
   error name the fix ("reference item.kind directly in groupBy/store instead").* Seen in run 2.
