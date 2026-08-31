// Structural validation for a definition.
//
// This exists because of a bug the runtime tests caught: a factor asking for 20 items from
// a pool holding 3 produced a 3-trial experiment, silently. Nothing was thrown, the pages
// rendered, and the only symptom would have been a class finishing suspiciously fast.
//
// That is the definition path's version of the failure the SQL allow-list guards against
// on the code path — a mismatch that only shows up as missing data after the fact. So the
// rule is the same: catch it before anyone runs the experiment, and say exactly what is
// wrong.

// `import type` rather than a plain import so this module can also be loaded by
// scripts/definition.mjs, which runs the real validator from the terminal under Node's
// type stripping — that leaves a value import of a types-only module behind and fails.
import type { ExperimentDefinition, ResponseStep } from './schema';
import { excluded } from './trials';

export interface ValidationIssue {
  severity: 'error' | 'warning';
  message: string;
}

const REF = /^\{([^}]+)\}$/;

/** Factor names a definition makes available, including pool item fields as `factor.field`. */
function availableNames(def: ExperimentDefinition): Set<string> {
  const names = new Set<string>();
  for (const factor of def.factors) {
    names.add(factor.name);
    if (factor.from) {
      const item = def.pools?.[factor.from]?.[0];
      for (const key of Object.keys(item ?? {})) names.add(`${factor.name}.${key}`);
    }
  }
  return names;
}

/** Every `{reference}` inside a nested structure. */
function referencesIn(node: unknown, out: string[] = []): string[] {
  if (typeof node === 'string') {
    const whole = node.match(REF);
    if (whole) out.push(whole[1]);
    else for (const m of node.matchAll(/\{([^}]+)\}/g)) out.push(m[1]);
  } else if (Array.isArray(node)) {
    for (const item of node) referencesIn(item, out);
  } else if (node && typeof node === 'object') {
    for (const value of Object.values(node)) referencesIn(value, out);
  }
  return out;
}

/** Every `src` on an image display, however deeply nested inside pairs, stacks and arrays. */
function imageSources(node: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) {
    for (const item of node) imageSources(item, out);
  } else if (node && typeof node === 'object') {
    const rec = node as Record<string, unknown>;
    if (rec.kind === 'image' && typeof rec.src === 'string') out.push(rec.src);
    for (const value of Object.values(rec)) imageSources(value, out);
  }
  return out;
}

/** The values a `{reference}` can take, or null when they cannot be enumerated. */
function valuesFor(def: ExperimentDefinition, ref: string): string[] | null {
  const [name, field] = ref.split('.');
  const factor = def.factors.find(f => f.name === name);
  if (!factor) return null;

  if (field) {
    const pool = factor.from ? def.pools?.[factor.from] : undefined;
    if (!pool) return null;
    const values = pool.map(item => item[field]).filter(v => v !== undefined);
    return values.length === pool.length ? values.map(String) : null;
  }
  if (factor.levels) return factor.levels.map(String);
  if (factor.mapping) return Object.values(factor.mapping).map(String);
  return null;
}

/**
 * Every filename one `src` can produce.
 *
 * Null when the answer is "cannot tell" — an unknown reference, or a cross too large to be
 * worth enumerating. Reported as a warning rather than guessed at: a false "this file is
 * missing" would send someone hunting for a problem that is not there.
 */
const MAX_EXPANSION = 500;

function expandSrc(def: ExperimentDefinition, src: string): string[] | null {
  const refs = [...new Set(referencesIn(src))];
  if (refs.length === 0) return [src];

  let candidates = [src];
  for (const ref of refs) {
    const options = valuesFor(def, ref);
    if (!options || options.length === 0) return null;
    candidates = candidates.flatMap(s => options.map(v => s.split(`{${ref}}`).join(v)));
    if (candidates.length > MAX_EXPANSION) return null;
  }
  return candidates;
}

/** Already addressable — an absolute URL, a data URI, or a path this site already serves. */
const ADDRESSABLE = /^(https?:|data:|blob:|\/)/;

export function validate(def: ExperimentDefinition): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const err = (message: string) => issues.push({ severity: 'error', message });
  const warn = (message: string) => issues.push({ severity: 'warning', message });

  // ── Structure ──────────────────────────────────────────────────────────────
  //
  // A definition can arrive half-written: a model can stop anywhere, and a reply that was
  // cut off still reaches here. Every check below indexes into this shape, so a missing
  // piece has to be reported now — reading through it would throw a TypeError, which the
  // route turns into a 500 saying nothing the lecturer could act on.
  if (!def || typeof def !== 'object') {
    return [{ severity: 'error', message: 'The definition is empty.' }];
  }

  const required: [unknown, string][] = [
    [Array.isArray(def.factors) ? def.factors : undefined, '"factors"'],
    [def.trial && typeof def.trial === 'object' ? def.trial : undefined, '"trial"'],
    [Array.isArray(def.trial?.phases) ? def.trial.phases : undefined, '"trial.phases"'],
    [def.trial?.response, '"trial.response"'],
    [def.trial?.correct, '"trial.correct"'],
    [Array.isArray(def.store) ? def.store : undefined, '"store"'],
    [Array.isArray(def.dashboard?.charts) ? def.dashboard.charts : undefined, '"dashboard.charts"'],
  ];
  const missing = required.filter(([value]) => value === undefined).map(([, name]) => name);
  if (missing.length) {
    err(`The definition is incomplete — ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} missing. This usually means the reply was cut off before it finished.`);
    return issues;
  }

  // ── Factors and pools ──────────────────────────────────────────────────────
  if (def.factors.length === 0) err('The design has no factors, so there is nothing to vary.');

  const factorNames = new Set(def.factors.map(f => f.name));
  for (const factor of def.factors) {
    if (factor.derivedFrom) {
      for (const source of factor.derivedFrom) {
        if (!factorNames.has(source)) {
          err(`Factor "${factor.name}" is derived from "${source}", which is not a factor.`);
        }
      }
      // A missing key yields undefined at run time, which would render as a blank stimulus.
      const expected = factor.derivedFrom
        .map(name => def.factors.find(f => f.name === name)?.levels?.length ?? 0)
        .reduce((a, b) => a * b, 1);
      const given = Object.keys(factor.mapping ?? {}).length;
      if (expected > 0 && given < expected) {
        err(`Factor "${factor.name}" needs ${expected} mapping entries for every combination of ${factor.derivedFrom.join(' x ')}, but has ${given}.`);
      }
      continue;
    }
    if (!factor.levels && !factor.from) {
      err(`Factor "${factor.name}" has neither levels nor a pool to draw from.`);
      continue;
    }
    if (factor.levels && factor.levels.length === 0) {
      err(`Factor "${factor.name}" has an empty list of levels.`);
    }
    if (factor.from) {
      const pool = def.pools?.[factor.from];
      if (!pool) {
        err(`Factor "${factor.name}" draws from pool "${factor.from}", which is not defined.`);
      } else if (pool.length === 0) {
        err(`Pool "${factor.from}" is empty.`);
      } else if (factor.sample && factor.sample > pool.length) {
        // The bug this file exists for.
        err(
          `Factor "${factor.name}" samples ${factor.sample} items from pool "${factor.from}", ` +
          `which holds only ${pool.length}. The experiment would silently run ${pool.length} of them.`,
        );
      }
    }
  }

  // ── Trial count ────────────────────────────────────────────────────────────
  const cells = def.factors
    .filter(f => !f.counterbalance && !f.derivedFrom)
    .reduce((n, f) => n * (f.levels?.length ?? f.sample ?? def.pools?.[f.from ?? '']?.length ?? 1), 1);
  const total = cells * def.repetitions;
  if (total === 0) err('The design produces no trials.');
  else if (total < 8) warn(`Only ${total} trials — too few to show an effect reliably.`);
  else if (total > 400) warn(`${total} trials is a long session; consider fewer repetitions.`);

  if (def.practice && def.practice.count > total) {
    warn(`Practice is ${def.practice.count} trials but the design only has ${total}.`);
  }

  // ── Phases and responses ───────────────────────────────────────────────────
  const responsePhases = def.trial.phases.filter(p => p.awaitsResponse).map(p => p.name);
  if (responsePhases.length === 0) err('No phase collects a response.');
  if (!def.trial.phases.some(p => p.startsClock)) {
    warn('No phase starts the reaction-time clock, so RT will be measured from the response phase.');
  }

  const steps: ResponseStep[] = Array.isArray(def.trial.response)
    ? def.trial.response
    : responsePhases.slice(0, 1).map(phase => ({ ...def.trial.response, phase } as ResponseStep));

  for (const step of steps) {
    if (!responsePhases.includes(step.phase)) {
      err(`A response is bound to phase "${step.phase}", which does not await a response.`);
    }
    if (step.kind === 'choice' && step.options.length < 2) {
      err(`The choice in phase "${step.phase}" has fewer than two options.`);
    }
  }
  for (const phase of responsePhases) {
    if (!steps.some(s => s.phase === phase)) {
      err(`Phase "${phase}" awaits a response but no response is defined for it.`);
    }
  }

  for (const phase of def.trial.phases) {
    if (!phase.awaitsResponse && phase.durationMs === undefined) {
      err(`Phase "${phase.name}" is timed but has no duration, so it would never advance.`);
    }
    if (typeof phase.durationMs === 'number' && phase.durationMs < 0) {
      err(`Phase "${phase.name}" has a negative duration.`);
    }
  }

  // ── Exclusions ─────────────────────────────────────────────────────────────
  //
  // An exclusion that matches nothing is the dangerous case: the impossible trials stay in
  // the experiment and nothing says so. Every failure below is therefore named rather than
  // ignored, and the values are compared as strings because a JSON definition writes
  // numeric levels either way.
  if (def.exclude?.length) {
    const crossedFactors = new Map(
      def.factors.filter(f => !f.counterbalance && !f.derivedFrom).map(f => [f.name, f]),
    );

    for (const [i, pattern] of def.exclude.entries()) {
      const where = `Exclusion ${i + 1}`;
      const keys = Object.keys(pattern);
      if (keys.length === 0) {
        err(`${where} is empty, so it would drop every trial.`);
        continue;
      }

      for (const [name, value] of Object.entries(pattern)) {
        const factor = crossedFactors.get(name);
        if (!factor) {
          const other = def.factors.find(f => f.name === name);
          err(other
            ? `${where} names "${name}", which is ${other.derivedFrom ? 'derived' : 'counterbalanced'} — those are assigned after the cross, so excluding on them would do nothing.`
            : `${where} names "${name}", which is not a factor.`);
          continue;
        }
        // Pool-drawn factors hold whole items, and sampling means the levels differ per
        // participant, so there is nothing stable to check the value against.
        if (!factor.levels) continue;
        if (!factor.levels.some(level => String(level) === String(value))) {
          err(`${where} excludes ${name}=${JSON.stringify(value)}, which is not one of its levels (${factor.levels.join(', ')}).`);
        }
      }
    }

    // Does anything survive? Answered exactly by rebuilding the cross, using the SAME
    // matcher buildTrials uses — a validator that matched differently from the builder
    // would be worse than none. Skipped when a factor draws from a pool, since sampling
    // makes the levels a per-participant matter.
    const explicit = [...crossedFactors.values()];
    const cells = explicit.reduce((n, f) => n * (f.levels?.length ?? 0), 1);
    if (explicit.every(f => f.levels?.length) && cells > 0 && cells <= 20_000) {
      let rows: Record<string, unknown>[] = [{}];
      for (const factor of explicit) {
        rows = rows.flatMap(row => factor.levels!.map(level => ({ ...row, [factor.name]: level })));
      }
      const kept = rows.filter(row => !excluded(row, def.exclude!));

      if (kept.length === 0) {
        err('The exclusions remove every cell of the design, so there would be no trials.');
      } else if (kept.length < rows.length / 2) {
        warn(`The exclusions remove ${rows.length - kept.length} of ${rows.length} cells, leaving ${kept.length}. Check that is intended.`);
      }
    }
  }

  // ── References resolve ─────────────────────────────────────────────────────
  const available = availableNames(def);
  const internal = new Set(['__seed', '__assetBase']);
  for (const ref of referencesIn(def.trial)) {
    if (!available.has(ref) && !internal.has(ref)) {
      err(`"{${ref}}" is referenced but no factor provides it.`);
    }
  }

  // ── Assets ─────────────────────────────────────────────────────────────────
  //
  // A missing image is invisible until it is on screen in front of a class, and then it is
  // a broken-picture icon where the stimulus should be. Every filename a definition can
  // ask for is knowable in advance, so it is checked here instead.
  if (def.assets && !def.assets.base.endsWith('/')) {
    err(`The asset base "${def.assets.base}" must end with "/", or every filename will be joined onto the folder name.`);
  }

  // Expanded before being judged, because a src is usually a reference: pointing a pool at
  // images hosted elsewhere is a legitimate way to supply stimuli, and only the expanded
  // value shows whether that is what is happening.
  const needed = new Set<string>();
  let uncheckable = 0;

  for (const src of imageSources(def.trial)) {
    const expanded = expandSrc(def, src);
    if (!expanded) {
      if (!ADDRESSABLE.test(src)) uncheckable++;
      continue;
    }
    for (const name of expanded) if (!ADDRESSABLE.test(name)) needed.add(name);
  }

  if (needed.size > 0 && !def.assets) {
    const shown = [...needed].slice(0, 3).map(s => `"${s}"`).join(', ');
    err(
      `This experiment shows images (${shown}) but has no assets. ` +
      'Upload the files with `npm run exp:assets`, or point src at a full URL.',
    );
  } else if (def.assets) {
    const have = new Set(def.assets.files);
    const missing = [...needed].filter(name => !have.has(name));

    if (missing.length > 0) {
      const shown = missing.slice(0, 5).join(', ');
      const rest = missing.length > 5 ? ` (and ${missing.length - 5} more)` : '';
      err(`These image files are used but were not uploaded: ${shown}${rest}.`);
    }
    if (def.assets.files.length === 0) {
      warn('The assets manifest is empty, so nothing was uploaded.');
    }
  }

  if (uncheckable > 0) {
    warn(`${uncheckable} image source${uncheckable === 1 ? '' : 's'} could not be checked against a file list. Preview the experiment and look for broken images.`);
  }

  // ── Scoring ────────────────────────────────────────────────────────────────
  //
  // Checked field by field rather than trusting the declared type. Every caller feeds this
  // function JSON from outside the type system — a model's output, or a file someone
  // wrote by hand — so a missing key here has to become a message the author can act on.
  // Throwing instead would take down the API route that exists to catch exactly this.
  const rule = def.trial.correct as Partial<{ kind: string; factor: string; expect: Record<string, string> }> | undefined;

  if (!rule?.kind) {
    err('trial.correct is missing. Use {"kind":"none"} when the task has no right answer.');
  } else if (rule.kind !== 'none') {
    if (!rule.factor) {
      err(`Correctness rule "${rule.kind}" needs a "factor" naming what the response is judged against.`);
    } else if (!available.has(rule.factor)) {
      err(`Correctness is judged on "${rule.factor}", which no factor provides.`);
    }
  }

  if (rule?.kind === 'mapping') {
    if (!rule.expect || typeof rule.expect !== 'object') {
      err('Correctness rule "mapping" needs an "expect" object giving the correct response for each level of the factor.');
    } else {
      const responses = steps.flatMap(s => (s.kind === 'choice' ? s.options.map(o => o.value) : []));
      const literal = responses.filter(v => !v.includes('{'));
      for (const expected of Object.values(rule.expect)) {
        if (literal.length > 0 && !literal.includes(expected)) {
          err(`Correctness expects the response "${expected}", which is not one of the options.`);
        }
      }
    }
  }

  // ── Stored fields and charts ───────────────────────────────────────────────
  for (const key of def.store) {
    if (!available.has(key)) warn(`"${key}" is stored but no factor provides it.`);
  }
  if (def.dashboard.charts.length === 0) {
    warn('No dashboard charts, so the teacher view will have nothing to show.');
  }
  const derived = new Set(['participant', 'is_correct', 'confidence']);
  for (const chart of def.dashboard.charts) {
    const key = chart.groupBy.replace(/\./g, '_');
    const stored = def.store.map(s => s.replace(/\./g, '_'));
    if (!stored.includes(key) && !derived.has(chart.groupBy)) {
      warn(`Chart "${chart.title}" groups by "${chart.groupBy}", which is not in the stored fields.`);
    }
  }

  return issues;
}

/** Convenience: true when nothing would stop the experiment running. */
export function isRunnable(def: ExperimentDefinition): boolean {
  return !validate(def).some(i => i.severity === 'error');
}
