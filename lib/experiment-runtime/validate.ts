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
import type { ExperimentDefinition, Factor, ResponseStep, Stage } from './schema';
import { excluded, MAX_TRIALS, NO_RESPONSE } from './trials';
import { ONBOARDING_COMPONENTS, PHASE_COMPONENTS } from './component-names';

export interface ValidationIssue {
  severity: 'error' | 'warning';
  message: string;
}

const REF = /^\{([^}]+)\}$/;

/** Factor names a definition makes available, including pool item fields as `factor.field`. */
function availableNames(def: ExperimentDefinition): Set<string> {
  const names = new Set<string>();

  const fromFactors = (factors: Factor[] | undefined, pools: ExperimentDefinition['pools']) => {
    for (const factor of factors ?? []) {
      if (!factor?.name) continue;
      names.add(factor.name);
      // Both spellings, since a chart may be written either way and the aggregator flattens
      // dots to underscores before it looks.
      const draws = [
        ...(factor.from ? [factor.from] : []),
        ...(factor.fromEach ?? []).map(p => p?.pool).filter(Boolean),
      ];
      for (const name of draws) {
        const item = pools?.[name as string]?.[0];
        for (const key of Object.keys(item ?? {})) names.add(`${factor.name}.${key}`);
      }
    }
  };

  fromFactors(def.factors, def.pools);

  // The between-subject item is in scope everywhere, exactly like a factor, so a display
  // saying "{group.target}" is referring to something real.
  if (def.assign?.as) {
    names.add(def.assign.as);
    const item = def.pools?.[def.assign.pool]?.[0];
    for (const key of Object.keys(item ?? {})) names.add(`${def.assign.as}.${key}`);
  }

  // Later blocks store their OWN fields, and a chart is usually about one of them. Reading
  // only the first block's `store` made every chart of a multi-block experiment look like it
  // would show nothing — nine such warnings on a correct definition, which is the kind of
  // false alarm that makes someone abandon a design that was never wrong.
  if (def.stages?.length) {
    names.add('stage');
    names.add('repetition');

    const walk = (stage: Stage) => {
      fromFactors(stage.factors, { ...def.pools, ...stage.pools });
      for (const key of stage.store ?? []) names.add(key);

      // A recall block writes a row per studied item, carrying that item's own fields
      // rather than the block's factors — that is where `serialPosition` and `itemType`
      // come from, and no `store` entry mentions them.
      const recall = stage.trial?.recall;
      if (!recall) return;
      names.add('outputPosition');
      if (recall.intrusions) names.add('intrusion');
      const pool = recall.against.startsWith('{')
        // "{list.words}" — the list is a pool item, so look inside the pool it comes from.
        ? Object.values({ ...def.pools, ...stage.pools })
          .flat()
          .map(entry => (entry as Record<string, unknown>)[recall.against.slice(1, -1).split('.')[1]])
          .find(Array.isArray) as Record<string, unknown>[] | undefined
        : { ...def.pools, ...stage.pools }[recall.against];
      for (const key of Object.keys(pool?.[0] ?? {})) names.add(key);
    };

    for (const entry of def.stages) {
      const group = entry as unknown as { forEach?: unknown; stages?: Stage[]; as?: string };
      if (group.forEach === undefined) { walk(entry as Stage); continue; }
      if (typeof group.as === 'string') names.add(group.as);
      for (const inner of group.stages ?? []) walk(inner);
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

/**
 * How many values a factor contributes to the cross.
 *
 * A stratified draw takes `sample` at EACH level of `per`, so it yields the number of
 * distinct levels times the sample; a plain sample yields the sample; several pools yield
 * the sum of their draws. Counting a stratified draw as `sample` would report DRM's
 * fifty-item recognition test as two trials.
 */
function levelCount(f: Factor, pools: ExperimentDefinition['pools']): number {
  if (f.levels) return f.levels.length;

  const drawSize = (name: string, sample?: number, per?: string): number => {
    const pool = pools?.[name];
    if (!pool) return sample ?? 1;
    if (!sample) return pool.length;
    if (!per) return Math.min(sample, pool.length);
    const levels = new Set(pool.map(item => String(
      per.split('.').reduce<unknown>((a, k) => (a as Record<string, unknown>)?.[k], item) ?? '',
    )));
    return levels.size * sample;
  };

  if (f.fromEach) {
    return Array.isArray(f.fromEach)
      ? f.fromEach.reduce((n: number, p) => n + (p && typeof p.pool === 'string' ? drawSize(p.pool, p.sample, p.per) : 0), 0)
      : 1;
  }
  if (f.from) return drawSize(f.from, f.sample, f.per);
  return 1;
}

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

  // ── Shapes ─────────────────────────────────────────────────────────────────
  //
  // Every check past this point reads a field by its shape — `factor.name.replace`,
  // `levels.map`, `chart.groupBy.replace` — so a field of the wrong TYPE throws a
  // TypeError instead of producing a message. The definition is written by a model, and
  // one that emits `"levels": "x"` or `"groupBy": 3` has to be told which field is wrong;
  // a stack trace reaches the lecturer as a 500 with nothing to act on.
  //
  // Fuzzing found ten distinct crashes of exactly this kind, and one shape the validator
  // ACCEPTED and the trial builder then choked on — a factor whose `levels` was not an
  // array. So this pass is also what makes "validated" mean "buildable": stop here when
  // anything is the wrong type, and everything downstream can trust what it reads.
  const isStr = (v: unknown): v is string => typeof v === 'string';
  const isObj = (v: unknown) => !!v && typeof v === 'object' && !Array.isArray(v);
  const label = (i: number, name: unknown) => (isStr(name) && name ? `"${name}"` : `#${i + 1}`);
  const shapes: string[] = [];
  const bad = (what: string, expected: string) => shapes.push(`${what} must be ${expected}.`);

  def.factors.forEach((f, i) => {
    if (!isObj(f)) return bad(`Factor #${i + 1}`, 'an object');
    const at = `Factor ${label(i, f.name)}`;
    if (!isStr(f.name) || !f.name) bad(`${at}'s "name"`, 'a non-empty string');
    if (f.levels !== undefined && !Array.isArray(f.levels)) bad(`${at}'s "levels"`, 'an array');
    if (f.from !== undefined && !isStr(f.from)) bad(`${at}'s "from"`, 'a pool name');
    if (f.sample !== undefined && !Number.isFinite(f.sample)) bad(`${at}'s "sample"`, 'a number');
    if (f.derivedFrom !== undefined && (!Array.isArray(f.derivedFrom) || !f.derivedFrom.every(isStr))) {
      bad(`${at}'s "derivedFrom"`, 'an array of factor names');
    }
    if (f.mapping !== undefined && !isObj(f.mapping)) bad(`${at}'s "mapping"`, 'an object');
  });

  if (def.pools !== undefined) {
    if (!isObj(def.pools)) bad('"pools"', 'an object of named lists');
    else {
      for (const [name, pool] of Object.entries(def.pools)) {
        if (!Array.isArray(pool)) bad(`Pool "${name}"`, 'an array');
        else if (!pool.every(isObj)) bad(`Pool "${name}"`, 'an array of objects');
      }
    }
  }

  if (!Number.isFinite(def.repetitions) || def.repetitions < 1 || !Number.isInteger(def.repetitions)) {
    bad('"repetitions"', 'a whole number of at least 1');
  }

  // Checked rather than ignored: anything but "fixed" shuffles, so a typo here would quietly
  // scramble a design whose order is the whole point, and the data would look merely noisy.
  if (def.order !== undefined && def.order !== 'shuffled' && def.order !== 'fixed') {
    bad('"order"', 'either "shuffled" or "fixed"');
  }

  if (def.endsAfterMs !== undefined
      && (!Number.isFinite(def.endsAfterMs) || (def.endsAfterMs as number) <= 0)) {
    bad('"endsAfterMs"', 'a number of milliseconds above zero');
  }

  // A between-subject condition drawn from nothing would leave every participant in no
  // condition at all, and every reference to it blank — the kind of failure that looks like
  // a design flaw rather than a typo.
  if (def.assign !== undefined) {
    if (!isObj(def.assign) || !isStr(def.assign.pool) || !isStr(def.assign.as) || !def.assign.as) {
      bad('"assign"', 'an object naming the pool to draw from ("pool") and a name for it ("as")');
    } else {
      const pool = def.pools?.[def.assign.pool];
      if (!pool) {
        err(`Participants are assigned from pool "${def.assign.pool}", which this experiment does not have.`);
      } else if (pool.length === 0) {
        err(`Participants are assigned from pool "${def.assign.pool}", which is empty, so nobody would be in any condition.`);
      } else if (pool.length === 1) {
        warn(`Every participant is assigned the only item in pool "${def.assign.pool}", so this is not a between-subject manipulation.`);
      }
      if (def.factors.some(f => f.name === def.assign!.as)) {
        err(`"${def.assign.as}" is both an assigned condition and a factor, so one would silently overwrite the other.`);
      }
    }
  }

  def.store.forEach((key, i) => { if (!isStr(key)) bad(`Entry #${i + 1} of "store"`, 'a string'); });

  def.trial.phases.forEach((p, i) => {
    if (!isObj(p)) return bad(`Phase #${i + 1}`, 'an object');
    if (!isStr(p.name) || !p.name) bad(`Phase ${label(i, p.name)}'s "name"`, 'a non-empty string');
    if (!isObj(p.display)) bad(`Phase ${label(i, p.name)}'s "display"`, 'an object');

    // The escape hatch is a fixed guest list. A name that is not on it renders nothing, and
    // a blank screen in the middle of an experiment is the failure a participant cannot
    // report — they assume it is meant to be like that.
    //
    // This is also the line the PIPELINE cannot cross: a component is code that ships with
    // the site, and generation writes JSON. A model asked for continuous flash suppression
    // might reasonably invent `"component": "flashSuppression"`, and the honest answer is
    // that this site cannot run that experiment — not a definition that silently shows an
    // empty box for 200ms a hundred times.
    if (p.component !== undefined) {
      if (!isStr(p.component)) {
        bad(`Phase ${label(i, p.name)}'s "component"`, 'the name of a built-in component');
      } else if (!(PHASE_COMPONENTS as readonly string[]).includes(p.component)) {
        issues.push({
          severity: 'error',
          message: `Phase ${label(i, p.name)} asks for a component named "${p.component}", which `
            + `this site does not have. The ones that exist are: ${PHASE_COMPONENTS.join(', ') || 'none'}. `
            + 'A component is code, so a definition cannot introduce one — an experiment that '
            + 'needs a new kind of phase has to be built by hand rather than generated.',
        });
      }
    }
    if (p.timeoutMs !== undefined && !Number.isFinite(p.timeoutMs) && !isStr(p.timeoutMs)) {
      bad(`Phase ${label(i, p.name)}'s "timeoutMs"`, 'a number of milliseconds');
    }
    if (p.jitterMs !== undefined && !Number.isFinite(p.jitterMs) && !isStr(p.jitterMs)) {
      bad(`Phase ${label(i, p.name)}'s "jitterMs"`, 'a number of milliseconds');
    }
  });

  if (def.trial.earlyFrom !== undefined && !isStr(def.trial.earlyFrom)) {
    bad('"trial.earlyFrom"', 'a phase name');
  }
  if (def.trial.feedback !== undefined) {
    const fb = def.trial.feedback as unknown as Record<string, unknown>;
    if (!isObj(fb)) bad('"trial.feedback"', 'an object');
    else {
      if (!Number.isFinite(fb.durationMs)) bad('"trial.feedback.durationMs"', 'a number of milliseconds');
      for (const key of ['correct', 'incorrect', 'timeout', 'early']) {
        const message = fb[key] as Record<string, unknown> | undefined;
        if (message !== undefined && (!isObj(message) || !isStr(message.en) || !isStr(message.he))) {
          bad(`"trial.feedback.${key}"`, 'an object with "en" and "he" text');
        }
      }
      if (fb.display !== undefined && !isObj(fb.display)) bad('"trial.feedback.display"', 'a display object');
    }
  }
  if (def.trial.itiDisplay !== undefined && !isObj(def.trial.itiDisplay)) {
    bad('"trial.itiDisplay"', 'a display object');
  }
  if (def.trial.recordEarly !== undefined && typeof def.trial.recordEarly !== 'boolean') {
    bad('"trial.recordEarly"', 'true or false');
  }
  if (def.nameOptional !== undefined && typeof def.nameOptional !== 'boolean') {
    bad('"nameOptional"', 'true or false');
  }
  if (def.thanks !== undefined) {
    const th = def.thanks as unknown as Record<string, unknown>;
    if (!isObj(th)) bad('"thanks"', 'an object');
    else {
      const title = th.title as Record<string, unknown> | undefined;
      if (title !== undefined && (!isObj(title) || !isStr(title.en) || !isStr(title.he))) {
        bad('"thanks.title"', 'an object with "en" and "he" text');
      }
      if (th.showResults !== undefined && typeof th.showResults !== 'boolean') bad('"thanks.showResults"', 'true or false');
    }
  }
  if (def.practice !== undefined) {
    const pr = def.practice as unknown as Record<string, unknown>;
    if (!isObj(pr)) bad('"practice"', 'an object with "count" and "feedback"');
    else {
      if (!Number.isFinite(pr.count)) bad('"practice.count"', 'a number');
      if (pr.record !== undefined && typeof pr.record !== 'boolean') bad('"practice.record"', 'true or false');
      if (pr.retryUntilCorrect !== undefined && typeof pr.retryUntilCorrect !== 'boolean') {
        bad('"practice.retryUntilCorrect"', 'true or false');
      }
      const from = pr.from as Record<string, unknown> | undefined;
      if (from !== undefined && (!isObj(from) || !isStr(from.factor) || !isStr(from.pool))) {
        bad('"practice.from"', 'an object with "factor" and "pool"');
      }
    }
  }
  if (def.dashboard.stats !== undefined) {
    if (!Array.isArray(def.dashboard.stats)) bad('"dashboard.stats"', 'an array');
    else def.dashboard.stats.forEach((s, i) => {
      if (!isObj(s)) return bad(`Stat #${i + 1}`, 'an object');
      const at = `Stat ${label(i, s.label)}`;
      if (!isStr(s.label)) bad(`${at}'s "label"`, 'text');
      if (!isStr(s.measure)) bad(`${at}'s "measure"`, 'a measure name');
      if (s.filter !== undefined && !isObj(s.filter)) bad(`${at}'s "filter"`, 'an object of field values');
      if (s.correctOnly !== undefined && typeof s.correctOnly !== 'boolean') bad(`${at}'s "correctOnly"`, 'true or false');
      if (s.difference !== undefined) {
        const d = s.difference as unknown as Record<string, unknown>;
        if (!isObj(d) || !isStr(d.factor) || d.level === undefined || d.minus === undefined) {
          bad(`${at}'s "difference"`, 'an object with "factor", "level" and "minus"');
        }
      }
      // A correlation needs something to correlate against. Whether that field is actually
      // stored is checked further down, where every block's `store` is in scope.
      if (s.measure === 'correlation' && !isStr((s as { against?: unknown }).against)) {
        bad(`${at}'s "against"`, 'the name of a stored number to correlate RT against');
      }
    });
  }

  // Three forms, and the per-trial one carries its options one level deeper.
  const responseForm = def.trial.response as Record<string, unknown> | unknown[];
  const asSets = !Array.isArray(responseForm) && isObj(responseForm) && 'sets' in responseForm
    ? (responseForm as { by?: unknown; sets?: unknown })
    : null;
  if (asSets) {
    if (!isStr(asSets.by)) bad('"trial.response.by"', 'a factor name whose value picks the set');
    if (!isObj(asSets.sets) || Object.keys(asSets.sets as object).length === 0) {
      bad('"trial.response.sets"', 'an object with at least one named set of options');
    }
  }
  const responseShapes: unknown[] = asSets
    ? Object.values((asSets.sets ?? {}) as Record<string, unknown>).flatMap(s => (Array.isArray(s) ? s : [s]))
    : Array.isArray(def.trial.response) ? def.trial.response : [def.trial.response];
  responseShapes.forEach((s, i) => {
    if (!isObj(s)) return bad(`Response #${i + 1}`, 'an object');
    if (!isStr((s as ResponseStep).kind)) bad(`Response #${i + 1}'s "kind"`, 'a string');
  });

  // Same guest list for the gate before the first trial.
  if (def.onboarding !== undefined) {
    if (!isStr(def.onboarding)) {
      bad('"onboarding"', 'the name of a built-in gate');
    } else if (!(ONBOARDING_COMPONENTS as readonly string[]).includes(def.onboarding)) {
      issues.push({
        severity: 'error',
        message: `"onboarding" asks for a gate named "${def.onboarding}", which this site does `
          + `not have. The ones that exist are: ${ONBOARDING_COMPONENTS.join(', ') || 'none'}.`,
      });
    }
  }

  // One rule, or one per kind of trial for a block that interleaves two tasks.
  const correctForm = def.trial.correct as Record<string, unknown>;
  if (!isObj(correctForm)) {
    bad('"trial.correct"', 'an object with a "kind"');
  } else if ('sets' in correctForm) {
    if (!isStr(correctForm.by)) {
      bad('"trial.correct.by"', 'a factor name whose value picks the rule');
    }
    const sets = correctForm.sets;
    if (!isObj(sets) || Object.keys(sets as object).length === 0) {
      bad('"trial.correct.sets"', 'an object with at least one named rule');
    } else {
      for (const [name, rule] of Object.entries(sets as Record<string, unknown>)) {
        if (!isObj(rule) || !isStr((rule as { kind?: unknown }).kind)) {
          bad(`"trial.correct.sets.${name}"`, 'a rule with a "kind"');
        } else {
          checkWithin(rule as Record<string, unknown>, `"trial.correct.sets.${name}"`);
        }
      }
    }
  } else if (!isStr(correctForm.kind)) {
    bad('"trial.correct"', 'an object with a "kind"');
  } else {
    checkWithin(correctForm, '"trial.correct"');
  }

  /**
   * A tolerance rule with no tolerance scores every estimate wrong.
   *
   * Zero is the trap rather than a missing field: an estimate landing EXACTLY on the true
   * value is vanishingly rare, so a zero tolerance reads on the dashboard as a class that
   * could not do the task at all, which is indistinguishable from a real floor effect.
   */
  function checkWithin(rule: Record<string, unknown>, at: string) {
    if (rule.kind !== 'within') return;
    if (!isStr(rule.factor)) bad(`${at}'s "factor"`, 'the name of the value being estimated');
    // A reference is allowed and often necessary: the margin belongs to the stimulus, and a
    // circle's radius and a line's length are not measured on the same scale.
    if (isStr(rule.tolerance) && /^\{.+\}$/.test(rule.tolerance)) {
      // Checked with every other reference further down.
    } else if (typeof rule.tolerance !== 'number' || !Number.isFinite(rule.tolerance)) {
      bad(`${at}'s "tolerance"`, 'a number, or a reference to one — how far off an estimate may be and still count');
    } else if (rule.tolerance <= 0) {
      issues.push({
        severity: 'error',
        message: `${at} has a tolerance of ${rule.tolerance}, so only an exactly right estimate `
          + 'would count and the task would read as impossible. Give it a real margin — a '
          + 'quarter of the stimulus range puts chance at 50%.',
      });
    }
  }

  // Later blocks — DRM's recall, serial order's distractor. Each is a design in its own
  // right, so the essentials are checked here and the trials themselves are built by the
  // corpus tests, which is what catches a factor that refers to a pool it does not have.
  if (def.stages !== undefined) {
    if (!Array.isArray(def.stages) || def.stages.length === 0) {
      bad('"stages"', 'a non-empty list of blocks, or nothing at all');
    } else {
      const seen = new Set<string>([def.stageName ?? 'main']);

      const checkStage = (stage: Record<string, unknown>, label: string) => {
        const at = `Stage ${isStr(stage.name) ? `"${stage.name}"` : label}`;
        if (!isStr(stage.name)) bad(`${at}'s "name"`, 'a name, stored on every row of the block');
        else if (seen.has(stage.name)) {
          err(`Two blocks are called "${stage.name}", so their rows could not be told apart.`);
        } else seen.add(stage.name);

        if (!Array.isArray(stage.factors)) bad(`${at}'s "factors"`, 'a list of factors');
        if (!Number.isFinite(stage.repetitions)) bad(`${at}'s "repetitions"`, 'a number');
        if (stage.order !== undefined && stage.order !== 'shuffled' && stage.order !== 'fixed') {
          bad(`${at}'s "order"`, 'either "shuffled" or "fixed"');
        }
        if (stage.endsAfterMs !== undefined
            && (!Number.isFinite(stage.endsAfterMs) || (stage.endsAfterMs as number) <= 0)) {
          bad(`${at}'s "endsAfterMs"`, 'a number of milliseconds above zero');
        }
        if (!isObj(stage.trial)) bad(`${at}'s "trial"`, 'an object with phases and a response');
        else {
          const trial = stage.trial as Record<string, unknown>;
          if (!Array.isArray(trial.phases) || trial.phases.length === 0) {
            bad(`${at}'s "trial.phases"`, 'at least one phase');
          }
          if (trial.response === undefined) bad(`${at}'s "trial.response"`, 'a response');
          if (!isObj(trial.correct) || !isStr((trial.correct as Record<string, unknown>).kind)) {
            bad(`${at}'s "trial.correct"`, 'an object with a "kind"');
          }
        }
        if (!Array.isArray(stage.store)) bad(`${at}'s "store"`, 'a list of fields to save');
      };

      def.stages.forEach((s, i) => {
        const entry = s as unknown as Record<string, unknown>;
        if (!isObj(entry)) return bad(`Stage #${i + 1}`, 'an object');

        // A plain block, or a group that repeats its own blocks once per drawn item.
        if (entry.forEach === undefined) return checkStage(entry, `#${i + 1}`);

        const at = `Stage group #${i + 1}`;
        if (!isStr(entry.forEach)) {
          bad(`${at}'s "forEach"`, 'the name of the pool to repeat over');
        } else if (!def.pools?.[entry.forEach]) {
          err(`${at} repeats over pool "${entry.forEach}", which this experiment does not have.`);
        } else if (def.pools[entry.forEach].length === 0) {
          err(`${at} repeats over pool "${entry.forEach}", which is empty, so its blocks would never run.`);
        }

        if (!isStr(entry.as) || !entry.as) {
          bad(`${at}'s "as"`, 'a name for the drawn item, so its blocks can refer to it');
        }
        if (entry.take !== undefined
            && (!Number.isInteger(entry.take) || (entry.take as number) < 1)) {
          bad(`${at}'s "take"`, 'a whole number of at least 1');
        } else if (isStr(entry.forEach) && typeof entry.take === 'number'
                   && entry.take > (def.pools?.[entry.forEach]?.length ?? 0)) {
          // The same silent shortfall as a factor sampling more than its pool holds: the
          // experiment would simply run fewer passes than it says, and nothing would show it.
          err(`${at} takes ${entry.take} items from pool "${entry.forEach}", which holds only ${def.pools?.[entry.forEach]?.length ?? 0}.`);
        }

        if (!Array.isArray(entry.stages) || entry.stages.length === 0) {
          bad(`${at}'s "stages"`, 'at least one block to repeat');
        } else {
          entry.stages.forEach((inner, j) => {
            if (!isObj(inner)) return bad(`${at}, block #${j + 1}`, 'an object');
            checkStage(inner as Record<string, unknown>, `#${j + 1} of ${at}`);
          });
        }
      });
    }
  }
  if (def.stageName !== undefined && !isStr(def.stageName)) {
    bad('"stageName"', 'a name for the first block');
  }
  if (def.stageName !== undefined && !def.stages?.length) {
    warn('"stageName" names the first block, but this experiment has only one, so nothing reads it.');
  }

  def.dashboard.charts.forEach((c, i) => {
    if (!isObj(c)) return bad(`Chart #${i + 1}`, 'an object');
    const at = `Chart ${label(i, c.title)}`;
    if (!isStr(c.groupBy)) bad(`${at}'s "groupBy"`, 'a factor name');
    if (!isStr(c.measure)) bad(`${at}'s "measure"`, 'a measure name');
    // A kind the renderer does not know falls through to a bar chart, which looks like a
    // design choice rather than a typo. Named here so it reads as the mistake it is.
    if (c.kind !== undefined
        && !['bar', 'line', 'scatter', 'histogram', 'xy', 'pie'].includes(String(c.kind))) {
      bad(`${at}'s "kind"`, 'one of bar, line, scatter, histogram, xy or pie');
    }
    // A pie divides one whole, so it needs counts to divide — an average has no whole.
    if (c.kind === 'pie' && c.measure !== 'count') {
      err(`${at} is a pie, so it must measure "count" — a pie divides one whole, and an average of "${c.measure}" has no whole to divide.`);
    }
    if (c.seriesBy !== undefined && !isStr(c.seriesBy)) bad(`${at}'s "seriesBy"`, 'a factor name');
    if (c.filter !== undefined && !isObj(c.filter)) bad(`${at}'s "filter"`, 'an object of field values');
    if (c.correctOnly !== undefined && typeof c.correctOnly !== 'boolean') bad(`${at}'s "correctOnly"`, 'true or false');
    if (c.bin !== undefined && (!Number.isFinite(c.bin) || c.bin <= 0)) bad(`${at}'s "bin"`, 'a positive number');
    if (c.pooled !== undefined && typeof c.pooled !== 'boolean') bad(`${at}'s "pooled"`, 'true or false');
    if (c.description !== undefined && !isStr(c.description)) bad(`${at}'s "description"`, 'text');
    if (c.xLabel !== undefined && !isStr(c.xLabel)) bad(`${at}'s "xLabel"`, 'text');
    if (c.groups !== undefined
      && (!Array.isArray(c.groups) || !c.groups.every(g => isObj(g) && g.value !== undefined))) {
      bad(`${at}'s "groups"`, 'a list of { "value", "label" }');
    }
    if (c.kind === 'xy') {
      const axes = c.axes as unknown as { x?: unknown; y?: unknown } | undefined;
      const sides: [string, Record<string, unknown> | undefined][] = [
        ['x', axes?.x as Record<string, unknown> | undefined],
        ['y', axes?.y as Record<string, unknown> | undefined],
      ];
      if (!isObj(axes) || sides.some(([, axis]) => !isObj(axis))) {
        bad(`${at}'s "axes"`, 'an object with "x" and "y", each naming a measure');
      } else {
        for (const [side, axis] of sides) {
          const a = axis as Record<string, unknown>;
          if (!isStr(a.measure)) bad(`${at}'s "axes.${side}.measure"`, 'a measure name');
          // A list is as good as a single value: several responses may count as one answer.
          const named = isStr(a.ofResponse)
            || (Array.isArray(a.ofResponse) && a.ofResponse.length > 0 && a.ofResponse.every(isStr));
          if (a.measure === 'proportion' && !named) {
            bad(`${at}'s "axes.${side}"`, 'an "ofResponse" — a proportion has to be of some response');
          }
          if (a.filter !== undefined && !isObj(a.filter)) {
            bad(`${at}'s "axes.${side}.filter"`, 'an object of field values');
          }
        }
      }
    } else if (c.axes !== undefined) {
      bad(`${at}'s "axes"`, `only set on an "xy" chart, not a "${String(c.kind)}" one`);
    }
    if (c.original !== undefined) {
      const o = c.original as unknown as Record<string, unknown>;
      if (!isObj(o) || !isStr(o.source) || !isObj(o.values)) {
        bad(`${at}'s "original"`, 'an object with "source" and "values"');
      } else if (!Object.values(o.values as Record<string, unknown>).every(v => Number.isFinite(v))) {
        bad(`${at}'s "original.values"`, 'one number per group');
      }
    }
    if (c.difference !== undefined) {
      const d = c.difference as unknown as Record<string, unknown>;
      if (!isObj(d) || !isStr(d.factor) || d.level === undefined || d.minus === undefined) {
        bad(`${at}'s "difference"`, 'an object with "factor", "level" and "minus"');
      }
    }
  });

  if (def.exclude !== undefined) {
    if (!Array.isArray(def.exclude)) bad('"exclude"', 'an array of cells to drop');
    else def.exclude.forEach((cell, i) => {
      if (!isObj(cell)) bad(`Entry #${i + 1} of "exclude"`, 'an object of factor values');
    });
  }

  if (def.assets !== undefined) {
    if (!isObj(def.assets)) bad('"assets"', 'an object with "base" and "files"');
    else {
      if (!isStr(def.assets.base)) bad('"assets.base"', 'a URL ending in "/"');
      if (!Array.isArray(def.assets.files) || !def.assets.files.every(isStr)) {
        bad('"assets.files"', 'a list of filenames');
      }
    }
  }

  if (shapes.length) {
    for (const message of shapes) err(message);
    return issues;
  }

  // ── Factors and pools ──────────────────────────────────────────────────────
  if (def.factors.length === 0) err('The design has no factors, so there is nothing to vary.');

  const factorNames = new Set(def.factors.map(f => f.name));
  for (const factor of def.factors) {
    if (factor.derivedFrom) {
      for (const source of factor.derivedFrom) {
        // A dotted source names a FIELD of a pool-drawn factor — "item.location" — so the
        // factor is the part before the dot. Requiring the whole path to be a factor name
        // rejected every design that derives from a pool item, which is most of them once a
        // pool is reached through a stage group or an assignment.
        if (!factorNames.has(source.split('.')[0])) {
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
    if (!factor.levels && !factor.from && !factor.fromEach) {
      err(`Factor "${factor.name}" has neither levels nor a pool to draw from.`);
      continue;
    }
    if (factor.levels && factor.levels.length === 0) {
      err(`Factor "${factor.name}" has an empty list of levels.`);
    }

    /** One draw's pool: named, sized, and sampled no further than it goes. */
    const checkDraw = (name: string, sample?: number) => {
      // A "{list.words}" reference is resolved from the item a stage group drew, so there is
      // no pool of that name to find and nothing to check until the run.
      if (name.startsWith('{')) {
        // Resolved at run time from an item this experiment draws — either the one a stage
        // group drew for this pass, or the one assigned to this participant. With neither,
        // there is nothing for the reference to name and the factor would find no levels.
        const drawsItems = def.assign !== undefined
          || !!def.stages?.some(s => (s as { forEach?: unknown }).forEach !== undefined);
        if (!drawsItems) {
          err(`Factor "${factor.name}" draws from "${name}", which only means something inside a stage group or with "assign", and this experiment has neither.`);
        }
        return;
      }
      const pool = def.pools?.[name];
      if (!pool) {
        err(`Factor "${factor.name}" draws from pool "${name}", which is not defined.`);
      } else if (pool.length === 0) {
        err(`Pool "${name}" is empty.`);
      } else if (sample && sample > pool.length) {
        // The bug this file exists for.
        err(
          `Factor "${factor.name}" samples ${sample} items from pool "${name}", ` +
          `which holds only ${pool.length}. The experiment would silently run ${pool.length} of them.`,
        );
      }
    };

    if (factor.from) checkDraw(factor.from, factor.sample);

    if (factor.fromEach !== undefined) {
      if (!Array.isArray(factor.fromEach) || factor.fromEach.length === 0) {
        bad(`Factor "${factor.name}"'s "fromEach"`, 'a non-empty list of pools to draw from');
      } else {
        for (const part of factor.fromEach) {
          if (!isObj(part) || !isStr(part.pool)) {
            bad(`One of factor "${factor.name}"'s "fromEach" entries`, 'an object naming a "pool"');
            continue;
          }
          checkDraw(part.pool, typeof part.sample === 'number' ? part.sample : undefined);
        }
      }
    }
    if (factor.per !== undefined && !factor.sample) {
      warn(`Factor "${factor.name}" says "per" but takes no "sample", so it draws the whole pool and "per" does nothing.`);
    }
  }

  // ── Trial count ────────────────────────────────────────────────────────────
  //
  // How many values a factor contributes, for counting the trials a design will build. A
  // stratified draw takes `sample` at EACH level, so the count is the number of levels times
  // the sample — not the sample.
  const cells = def.factors
    .filter(f => !f.counterbalance && !f.derivedFrom)
    .reduce((n, f) => n * levelCount(f, def.pools), 1);
  const total = cells * def.repetitions;
  if (total === 0) err('The design produces no trials.');
  // Only where this block IS the session. In a multi-block experiment the first block is
  // often a short warm-up — DRM's is three practice words — and calling that too few trials
  // to show an effect would be advice about the wrong thing.
  else if (total < 8 && !def.stages?.length) {
    warn(`Only ${total} trials — too few to show an effect reliably.`);
  }
  else if (total > MAX_TRIALS) {
    // An error rather than a warning, because nothing downstream survives it. The trial
    // list is built in memory and the mock generator multiplies it by the participant
    // count, so a design this size does not run slowly — it exhausts the tab. Fuzzing
    // produced `repetitions: 1e9` on an otherwise valid definition and took the process
    // down with "JavaScript heap out of memory".
    err(`${total.toLocaleString()} trials is far more than any session can run, and building it would exhaust memory. Reduce the repetitions or the number of levels.`);
  } else if (total > 400 && !def.endsAfterMs) {
    // Not for a timed block: its list is deliberately longer than anyone can finish, and the
    // clock — not the count — decides how long the participant is there.
    warn(`${total} trials is a long session; consider fewer repetitions.`);
  }

  // A timed block stops on whichever comes first, clock or list. A list that runs out cuts
  // the delay short, and a filled delay whose length depends on how fast someone answers is
  // the one thing it must not be. One trial per second is faster than anyone sustains, so a
  // list shorter than that is certainly too short.
  if (typeof def.endsAfterMs === 'number' && def.endsAfterMs > 0 && total > 0
      && total < def.endsAfterMs / 1000) {
    warn(
      `This block runs for ${Math.round(def.endsAfterMs / 1000)}s but offers only ${total} trials, ` +
      `so a quick participant would run out and get a shorter delay than a slow one. Give it more trials.`,
    );
  }

  if (def.practice && def.practice.count > total) {
    warn(`Practice is ${def.practice.count} trials but the design only has ${total}.`);
  }

  // Retrying until correct needs a notion of correct. On a preference task there is none,
  // so the trial could never be answered "right" and practice would never end.
  const soleRule = 'sets' in def.trial.correct ? null : def.trial.correct;
  if (def.practice?.retryUntilCorrect && soleRule?.kind === 'none') {
    err('Practice is set to retry until correct, but this task has no correct answer ("correct" is "none"), so practice could never finish.');
  }
  if (def.practice?.retryUntilCorrect && def.practice.feedback !== true) {
    warn('Practice retries until correct but has no feedback, so a participant is given no clue what the right answer was.');
  }

  // ── Phases and responses ───────────────────────────────────────────────────
  const responsePhases = def.trial.phases.filter(p => p.awaitsResponse).map(p => p.name);
  // A study presentation asks nothing and so has no response phase — that is the point of
  // it. Every other trial needs one, or it would play its phases and then wait for an answer
  // it never offered any way to give.
  const passive = !Array.isArray(def.trial.response)
    && !('sets' in def.trial.response)
    && def.trial.response.kind === 'none';

  if (passive && responsePhases.length > 0) {
    err(`This block asks for no response, but phase "${responsePhases[0]}" awaits one. Remove "awaitsResponse", or give the block a response.`);
  } else if (!passive && responsePhases.length === 0) {
    err('No phase collects a response.');
  }
  if (!passive && !def.trial.phases.some(p => p.startsClock)) {
    warn('No phase starts the reaction-time clock, so RT will be measured from the response phase.');
  }
  if (passive && soleRule?.kind !== 'none') {
    err('This block asks for no response, so there is nothing to score. Its "trial.correct" must be {"kind": "none"}.');
  }
  if (passive && def.trial.earlyFrom !== undefined) {
    err('This block asks for no response, so no press can be too early. Remove "trial.earlyFrom".');
  }

  // Recall scoring compares typed words against a pool. Every way of getting that wrong
  // fails the same silent way — nothing matches, every item reads as "missed", and the
  // result looks like a class that remembered nothing rather than like a broken definition.
  const recall = def.trial.recall;
  if (recall !== undefined) {
    if (!isObj(recall) || !isStr(recall.against) || !isStr(recall.match)) {
      bad('"trial.recall"', 'an object naming the studied pool ("against") and the field holding each word ("match")');
    } else {
      const studied = def.pools?.[recall.against];
      if (!studied) {
        err(`Recall is scored against pool "${recall.against}", which this experiment does not have.`);
      } else if (studied.length === 0) {
        err(`Recall is scored against pool "${recall.against}", which is empty, so every word would count as an intrusion.`);
      } else if (!studied.some(item => isStr(item?.[recall.match]) && String(item[recall.match]).trim() !== '')) {
        err(`Recall matches on "${recall.match}", but no item in pool "${recall.against}" has that field, so nothing could ever be recalled.`);
      }
    }
  }

  // A per-trial form is checked through its first set: every set binds to the same phases,
  // and the options of all of them were shape-checked above.
  const primaryResponse = !Array.isArray(def.trial.response) && 'sets' in def.trial.response
    ? (Object.values(def.trial.response.sets)[0] ?? { kind: 'choice', options: [] })
    : def.trial.response;
  const steps: ResponseStep[] = Array.isArray(primaryResponse)
    ? primaryResponse
    : responsePhases.slice(0, 1).map(phase => ({ ...primaryResponse, phase } as ResponseStep));

  // Response phases that end by themselves. Not pressing is an answer there, which is the
  // only thing that makes a single "go" button a real choice rather than a trial that
  // cannot be failed.
  const timeoutPhases = new Set(
    def.trial.phases.filter(p => p.awaitsResponse && p.timeoutMs !== undefined).map(p => p.name),
  );

  for (const step of steps) {
    if (!responsePhases.includes(step.phase)) {
      err(`A response is bound to phase "${step.phase}", which does not await a response.`);
    }
    if (step.kind === 'choice') {
      if (timeoutPhases.has(step.phase) ? step.options.length < 1 : step.options.length < 2) {
        err(timeoutPhases.has(step.phase)
          ? `The choice in phase "${step.phase}" has no options.`
          : `The choice in phase "${step.phase}" has fewer than two options. A single "go" button needs "timeoutMs" on that phase, so that not pressing is also an answer.`);
      }
    }
  }
  for (const phase of responsePhases) {
    if (!steps.some(s => s.phase === phase)) {
      err(`Phase "${phase}" awaits a response but no response is defined for it.`);
    }
  }

  // Checked here rather than beside the rest of the recall rules, which run before `steps`
  // has been worked out.
  if (recall !== undefined && steps.length > 0 && !steps.some(s => s.kind === 'wordList')) {
    warn('Recall is scored but nothing collects a word list, so there would be no typed words to score.');
  }

  for (const phase of def.trial.phases) {
    if (!phase.awaitsResponse && phase.durationMs === undefined) {
      err(`Phase "${phase.name}" is timed but has no duration, so it would never advance.`);
    }
    if (typeof phase.durationMs === 'number' && phase.durationMs < 0) {
      err(`Phase "${phase.name}" has a negative duration.`);
    }
    if (phase.timeoutMs !== undefined) {
      if (!phase.awaitsResponse) {
        err(`Phase "${phase.name}" has "timeoutMs" but does not await a response — a timed phase already ends after its "durationMs".`);
      }
      if (typeof phase.timeoutMs === 'number' && phase.timeoutMs <= 0) {
        err(`Phase "${phase.name}" has a "timeoutMs" of ${phase.timeoutMs}; it must be above zero.`);
      }
    }
    if (phase.jitterMs !== undefined) {
      if (phase.awaitsResponse) {
        err(`Phase "${phase.name}" has "jitterMs" but awaits a response — only a timed phase has a duration to vary.`);
      }
      if (typeof phase.jitterMs === 'number' && phase.jitterMs < 0) {
        err(`Phase "${phase.name}" has a negative "jitterMs".`);
      }
    }
  }

  // A fixed practice set swaps one pool for another, so both ends of the swap must exist —
  // otherwise practice silently falls back to nothing at all.
  if (def.practice?.from) {
    const { factor, pool } = def.practice.from;
    const target = def.factors.find(f => f.name === factor);
    // `fromEach` counts: a factor composed of several pools is still drawn from pools, and
    // swapping the whole set for a practice pool is exactly as meaningful there.
    if (!target || (!target.from && !target.fromEach)) {
      err(`"practice.from" names "${factor}", which is not a factor drawn from a pool.`);
    }
    const items = def.pools?.[pool];
    if (!items) err(`"practice.from" uses pool "${pool}", which is not defined.`);
    else if (items.length === 0) err(`"practice.from" uses pool "${pool}", which is empty.`);
  }

  if (def.trial.earlyFrom !== undefined) {
    const at = def.trial.phases.findIndex(p => p.name === def.trial.earlyFrom);
    const first = def.trial.phases.findIndex(p => p.name === steps[0]?.phase);
    if (at === -1) {
      err(`"trial.earlyFrom" names "${def.trial.earlyFrom}", which is not a phase.`);
    } else if (first !== -1 && at >= first) {
      err(`"trial.earlyFrom" must name a phase before the response phase "${steps[0].phase}", or no press could ever count as too early.`);
    }
  }

  if (def.trial.feedback) {
    const fb = def.trial.feedback;
    if (fb.durationMs <= 0) {
      err('"trial.feedback.durationMs" must be above zero, or the message would never be seen.');
    }
    if (!fb.correct && !fb.incorrect && !fb.timeout && !fb.early) {
      warn('"trial.feedback" has no messages, so it shows nothing.');
    }
    if (!fb.inMain && !def.practice?.feedback) {
      warn('"trial.feedback" shows nowhere: it needs "inMain": true, or "practice.feedback": true.');
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
  const internal = new Set(['__seed', '__assetBase', '__language']);

  // Two scopes exist only while something is being drawn, so no factor provides them and
  // none should: the element of a list-driven array, and the live position of a slider
  // inside its own preview. Collected from the definition, so referencing a scope that was
  // never opened is still an error.
  const scopes = new Set<string>();
  const findScopes = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    const rec = node as Record<string, unknown>;
    if (rec.kind === 'array' && rec.from) scopes.add(String(rec.as ?? 'each'));
    if (rec.kind === 'slider' && rec.preview) scopes.add('value');
    for (const value of Object.values(rec)) findScopes(value);
  };
  findScopes(def.trial);

  for (const ref of referencesIn(def.trial)) {
    if (scopes.has(ref.split('.')[0])) continue;
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
  // A block interleaving two tasks carries a rule per kind; each is checked on its own, and
  // the shared structural checks below run against whichever single rule there is.
  const correctSets = def.trial.correct as Partial<{ by: string; sets: Record<string, { kind?: string; factor?: string }> }> | undefined;
  if (correctSets?.sets) {
    for (const [name, branch] of Object.entries(correctSets.sets)) {
      if (branch?.kind && branch.kind !== 'none' && branch.factor && !available.has(branch.factor)) {
        err(`Correctness rule "${name}" is judged against "${branch.factor}", which no factor provides.`);
      }
    }
  }
  const rule = (correctSets?.sets ? undefined : def.trial.correct) as Partial<{ kind: string; factor: string; expect: Record<string, string> }> | undefined;

  if (!correctSets?.sets && !rule?.kind) {
    err('trial.correct is missing. Use {"kind":"none"} when the task has no right answer.');
  } else if (rule && rule.kind !== 'none') {
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
      // Wherever a response phase can run out, "none" is a real answer — the right one on a
      // catch or no-go trial.
      if (timeoutPhases.size > 0 && literal.length > 0) literal.push(NO_RESPONSE);
      // A value may be a LIST where several answers are right — a recognition button says
      // "yes" and how sure at once — so each one is checked separately. Flattening with
      // String() would report the whole list as one unknown response.
      for (const value of Object.values(rule.expect)) {
        for (const expected of Array.isArray(value) ? value : [value]) {
          if (literal.length > 0 && !literal.includes(expected)) {
            err(`Correctness expects the response "${expected}", which is not one of the options.`);
          }
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
  // trial_index is on every row's spine, which is what lets a chart bin by position in the
  // session without the definition storing it.
  // "sequence" and "all" are computed by the aggregation itself rather than read off a row.
  const derived = new Set(['participant', 'is_correct', 'confidence', 'trial_index', 'sequence', 'all', 'response']);
  // Every block's stored fields, not just the first one's. A chart on a multi-block
  // experiment is usually about a LATER block, and reading only `def.store` reported nine
  // false alarms on a correct definition — each one saying a working chart "would show
  // nothing", which is exactly the advice that makes someone rewrite a design that was fine.
  const stored = [...available, ...def.store].map(s => s.replace(/\./g, '_'));
  const readable = (field: string) => stored.includes(field.replace(/\./g, '_')) || derived.has(field);

  // A branch with no case for some level of its factor falls back to the first one, which
  // on screen is a trial asking the wrong question and in the data is an answer scored by
  // the wrong rule. Neither looks like a fault — they look like a participant doing badly.
  const branches: { at: string; by: unknown; cases: unknown }[] = [];
  const collectBranches = (node: unknown, at: string) => {
    if (Array.isArray(node)) return node.forEach(n => collectBranches(n, at));
    if (!node || typeof node !== 'object') return;
    const rec = node as Record<string, unknown>;
    if (rec.kind === 'switch') branches.push({ at, by: rec.by, cases: rec.cases });
    Object.values(rec).forEach(v => collectBranches(v, at));
  };
  for (const [i, phase] of def.trial.phases.entries()) {
    collectBranches(phase.display, `Phase ${label(i, phase.name)}'s display`);
  }
  if ('sets' in def.trial.correct) {
    branches.push({ at: '"trial.correct"', by: def.trial.correct.by, cases: def.trial.correct.sets });
  }

  for (const branch of branches) {
    if (!isStr(branch.by) || !isObj(branch.cases)) continue;
    const levels = valuesFor(def, branch.by);
    if (!levels) continue;
    const named = new Set(Object.keys(branch.cases as object));
    const missing = [...new Set(levels)].filter(level => !named.has(level));
    if (missing.length) {
      warn(`${branch.at} branches on "${branch.by}" but has no case for `
        + `${missing.map(m => `"${m}"`).join(', ')}, so those trials fall back to `
        + `"${Object.keys(branch.cases as object)[0]}".`);
    }
  }

  // A correlation card reads one stored NUMBER off every row. Unstored, it is permanently
  // blank and reads as "no data yet" rather than as a definition that never asked for it.
  for (const stat of def.dashboard.stats ?? []) {
    if (stat.measure !== 'correlation') {
      if (stat.against !== undefined) {
        warn(`Stat "${stat.label}" names "against", which only "correlation" uses.`);
      }
      continue;
    }
    if (stat.against && !readable(stat.against)) {
      warn(`Stat "${stat.label}" correlates reaction time against "${stat.against}", which is `
        + 'not in the stored fields, so the card would always be blank.');
    }
  }

  for (const chart of def.dashboard.charts) {
    if (!readable(chart.groupBy)) {
      warn(`Chart "${chart.title}" groups by "${chart.groupBy}", which is not in the stored fields.`);
    }
    // A filter or difference over a field no row has matches nothing, so the chart is empty.
    for (const field of Object.keys(chart.filter ?? {})) {
      if (!readable(field)) {
        warn(`Chart "${chart.title}" filters on "${field}", which is not in the stored fields, so it would show nothing.`);
      }
    }
    if (chart.difference && !readable(chart.difference.factor)) {
      warn(`Chart "${chart.title}" takes a difference over "${chart.difference.factor}", which is not in the stored fields, so it would show nothing.`);
    }
    // The original study's figures are keyed by group. A name that matches no level of the
    // grouping factor draws nothing at all, and a comparison that silently is not there is
    // worse than none — the class reads the class's own bar as agreeing with the paper.
    if (chart.original) {
      const levels = def.factors.find(f => f.name === chart.groupBy)?.levels?.map(String);
      const labels = chart.groups?.map(g => (g.label ?? String(g.value))) ?? [];
      const known = new Set([...(levels ?? []), ...labels, ...(chart.groups?.map(g => String(g.value)) ?? [])]);
      if (known.size > 0) {
        for (const name of Object.keys(chart.original.values)) {
          if (!known.has(name)) {
            warn(`Chart "${chart.title}" has an original figure for "${name}", which is not one of its groups (${[...known].join(', ')}), so it would not be drawn.`);
          }
        }
      }
      if (chart.kind !== 'bar' && chart.kind !== 'histogram' && chart.kind !== 'line') {
        warn(`Chart "${chart.title}" carries the original study's numbers, but a ${chart.kind} chart cannot draw them. Use a bar or line chart.`);
      }
    }
  }

  return issues;
}

/** Convenience: true when nothing would stop the experiment running. */
export function isRunnable(def: ExperimentDefinition): boolean {
  return !validate(def).some(i => i.severity === 'error');
}
