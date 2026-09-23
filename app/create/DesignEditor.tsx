'use client';

// Hand edits to the numbers a lecturer nudges most — how many trials, how much practice,
// the pause between trials — without paying for a Refine round-trip to change one digit.
//
// Same contract as the instruction boxes on the page: the definition is edited in place and
// handed back whole, so the preview store, the saved draft, a later refine and Finish all
// see it with nothing else to keep in sync. What the edit produced is shown straight back —
// the validator's verdict and the trial count the runtime actually builds — so nobody has to
// work out in their head what "repetitions: 3" comes to.

import { useMemo, useState } from 'react';
import type { ExperimentDefinition, Stage, TrialDesign } from '@/lib/experiment-runtime/schema';
import { validate, ValidationIssue } from '@/lib/experiment-runtime/validate';
import { buildTrials, isStageGroup, planStages, seededRandom } from '@/lib/experiment-runtime/trials';

/** The Runner's pause when a design names none. Mirrored here only to label the empty box. */
const DEFAULT_ITI_MS = 300;

/** Which block an edit is for: the definition's own design, a stage, or a stage in a group. */
type BlockRef = { stage: null } | { stage: number; inner?: number };

type Patch = Partial<Pick<TrialDesign, 'repetitions' | 'endsAfterMs' | 'practice' | 'trial'>>;

function applyPatch(def: ExperimentDefinition, ref: BlockRef, patch: (d: TrialDesign) => Patch): ExperimentDefinition {
  if (ref.stage === null) return { ...def, ...patch(def) };
  const stages = [...(def.stages ?? [])];
  const entry = stages[ref.stage];
  if (isStageGroup(entry)) {
    const inner = [...entry.stages];
    inner[ref.inner!] = { ...inner[ref.inner!], ...patch(inner[ref.inner!]) };
    stages[ref.stage] = { ...entry, stages: inner };
  } else {
    stages[ref.stage] = { ...entry, ...patch(entry) };
  }
  return { ...def, stages };
}

/** One editable block, with where it sits and what the runtime made of it. */
interface BlockRow {
  ref: BlockRef;
  design: TrialDesign;
  label: string;
  /** Set for a block inside a group: how many passes the group makes over it. */
  passes?: { count: number; pool: string };
  /** Trials per pass, one entry per time the block runs. Null when it could not be built. */
  built: number[] | null;
  buildError?: string;
}

/**
 * What a participant would actually get.
 *
 * Built through the real planner and trial builder rather than multiplied out here, so
 * exclusions, sampled pools and a group's `take` are all counted the way the run page will
 * count them. A fixed seed keeps the numbers from flickering between renders; only which
 * items are drawn depends on it, never how many.
 */
function describe(def: ExperimentDefinition): { rows: BlockRow[]; practice: number | null; planError?: string } {
  const rows: BlockRow[] = [{ ref: { stage: null }, design: def, label: def.stageName ?? 'main', built: [] }];
  (def.stages ?? []).forEach((entry, i) => {
    if (isStageGroup(entry)) {
      entry.stages.forEach((stage: Stage, j) => rows.push({
        ref: { stage: i, inner: j }, design: stage, label: stage.name, built: [],
        passes: { count: 0, pool: entry.forEach },
      }));
    } else {
      rows.push({ ref: { stage: i }, design: entry, label: entry.name, built: [] });
    }
  });

  const rng = seededRandom(1);
  let planError: string | undefined;
  try {
    for (const block of planStages(def, rng)) {
      // `block.source`, not `block.design`: a block inside a group is handed a copy with the
      // experiment's pools merged in, so comparing against `design` matches nothing and every
      // later block silently counts as zero trials.
      const row = rows.find(r => r.design === block.source);
      if (!row || !row.built) continue;
      if (row.passes) row.passes.count++;
      try {
        row.built.push(buildTrials(block.design, { rng, context: block.context }).length);
      } catch (e) {
        row.built = null;
        row.buildError = e instanceof Error ? e.message : String(e);
      }
    }
  } catch (e) {
    planError = e instanceof Error ? e.message : String(e);
  }

  let practice: number | null = null;
  if (def.practice) {
    try { practice = buildTrials(def, { practice: true, rng }).length; } catch { practice = null; }
  }
  return { rows, practice, planError };
}

/**
 * A number box that lets the lecturer clear it and retype.
 *
 * Fully controlled by the definition, an emptied box would have nothing valid to hold and
 * snap straight back. So the text is local and only a whole number in range is committed;
 * anything else stays on screen, marked, until it is fixed.
 */
function NumberField({ label, value, min, max, onCommit, disabled, placeholder, suffix }: {
  label: string; value: number | undefined; min: number; max?: number;
  onCommit: (n: number) => void; disabled?: boolean; placeholder?: string; suffix?: string;
}) {
  const [text, setText] = useState(value === undefined ? '' : String(value));
  // Follows the definition when something else changes it — a refine reply, a restore.
  // Adjusted during render rather than in an effect, so the stale text never paints.
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    if (!(text.trim() !== '' && Number(text) === value)) setText(value === undefined ? '' : String(value));
  }

  const n = Number(text);
  const valid = text.trim() !== '' && Number.isInteger(n) && n >= min && (max === undefined || n <= max);
  // An empty box is only fine when the definition never had a value — the ITI left at its default.
  const pending = !valid && !(text.trim() === '' && value === undefined);

  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="flex items-center gap-2">
        <input type="number" inputMode="numeric" min={min} max={max} step={1} value={text}
          placeholder={placeholder} disabled={disabled} aria-label={label} aria-invalid={pending}
          onChange={e => {
            setText(e.target.value);
            const next = Number(e.target.value);
            if (e.target.value.trim() !== '' && Number.isInteger(next) && next >= min && (max === undefined || next <= max)) {
              onCommit(next);
            }
          }}
          className={`w-28 px-3 py-2 bg-gray-800 border rounded-lg text-sm text-gray-200 outline-none disabled:opacity-50
            ${pending ? 'border-red-500' : 'border-gray-600 focus:border-purple-400'}`} />
        {suffix && <span className="text-xs text-gray-500">{suffix}</span>}
      </span>
      {pending && (
        <span className="text-xs text-red-400">
          A whole number{max === undefined ? ` of at least ${min}` : ` from ${min} to ${max}`} — not applied yet.
        </span>
      )}
    </label>
  );
}

function plural(n: number, word: string) {
  return `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`;
}

export default function DesignEditor({ definition, onChange, disabled }: {
  definition: ExperimentDefinition;
  onChange: (next: ExperimentDefinition) => void;
  disabled?: boolean;
}) {
  const { rows, practice, planError } = useMemo(() => describe(definition), [definition]);
  const issues = useMemo<ValidationIssue[]>(() => {
    try { return validate(definition); } catch (e) {
      return [{ severity: 'error', message: e instanceof Error ? e.message : String(e) }];
    }
  }, [definition]);

  const edit = (ref: BlockRef, patch: (d: TrialDesign) => Patch) => onChange(applyPatch(definition, ref, patch));

  const counted = rows.filter(r => !r.design.endsAfterMs);
  const total = counted.every(r => r.built)
    ? counted.reduce((sum, r) => sum + r.built!.reduce((a, b) => a + b, 0), 0)
    : null;
  const timedBlocks = rows.length - counted.length;
  const multi = rows.length > 1;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-gray-300" data-testid="design-total">
        {total === null
          ? 'The trial list cannot be built with these numbers — see below.'
          : <>A participant runs <strong className="text-gray-100">{plural(total, 'trial')}</strong>
            {practice !== null && <>, after {plural(practice, 'practice trial')}</>}
            {timedBlocks > 0 && <>, plus {plural(timedBlocks, 'timed block')} that {timedBlocks === 1 ? 'runs' : 'run'} for a set time</>}.</>}
      </p>

      {rows.map((row, i) => {
        const d = row.design;
        const runs = row.built?.length ?? 0;
        const perPass = row.built && runs > 0 ? row.built[0] : null;
        const blockTotal = row.built ? row.built.reduce((a, b) => a + b, 0) : null;
        const cycle = perPass !== null && d.repetitions > 0 ? perPass / d.repetitions : null;
        const key = row.ref.stage === null ? 'main' : `${row.ref.stage}.${'inner' in row.ref ? row.ref.inner ?? '' : ''}`;
        const name = multi ? `Block ${i + 1} · ${row.label}` : 'Trials';

        return (
          <div key={key} className={multi ? 'border border-gray-700 rounded-xl p-4' : ''}>
            {multi && (
              <p className="text-sm font-medium text-gray-200 mb-3">
                {name}
                {row.passes && (
                  <span className="text-gray-500 font-normal">
                    {' '}· repeats for each of {plural(row.passes.count, `"${row.passes.pool}" item`)} — edits apply to every pass
                  </span>
                )}
              </p>
            )}

            <div className="flex flex-wrap gap-4 items-start">
              {d.endsAfterMs ? (
                <NumberField label={multi ? `${row.label}: length` : 'Length'} min={1} max={3600}
                  value={Math.round(d.endsAfterMs / 1000)} suffix="seconds" disabled={disabled}
                  onCommit={s => edit(row.ref, () => ({ endsAfterMs: s * 1000 }))} />
              ) : (
                <NumberField label={multi ? `${row.label}: repetitions` : 'Repetitions'} min={1}
                  value={d.repetitions} disabled={disabled}
                  onCommit={n => edit(row.ref, () => ({ repetitions: n }))} />
              )}
              {row.ref.stage === null && d.practice && (
                <NumberField label="Practice trials" min={1} value={d.practice.count} disabled={disabled}
                  onCommit={n => edit(row.ref, x => ({ practice: { ...x.practice!, count: n } }))} />
              )}
              <NumberField label={multi ? `${row.label}: pause between trials` : 'Pause between trials'} min={0} max={60000}
                value={d.trial.itiMs} placeholder={String(DEFAULT_ITI_MS)} suffix="ms" disabled={disabled}
                onCommit={n => edit(row.ref, x => ({ trial: { ...x.trial, itiMs: n } }))} />
            </div>

            <div className="text-xs text-gray-400 mt-3 flex flex-col gap-1">
              {row.buildError && <p className="text-red-400">{row.buildError}</p>}
              {d.endsAfterMs ? (
                // Repetitions still exist on a timed block, but only to keep the list longer
                // than the clock — offering them as "the number of trials" would be a lie.
                <p>
                  Ends after {Math.round(d.endsAfterMs / 1000)}s, whatever trial it is on — this block is measured in
                  time, so it has no trial count to set.
                  {perPass !== null && <> Its list offers {plural(perPass, 'trial')} to fill that time.</>}
                </p>
              ) : blockTotal !== null && (
                <p>
                  {plural(blockTotal, 'trial')}
                  {cycle !== null && Number.isInteger(cycle) && <> ({plural(cycle, 'condition')} × {d.repetitions})</>}
                  {row.passes && runs > 1 && <>, across {runs} passes</>}
                  {d.order === 'fixed' ? '' : ', shuffled'}.
                </p>
              )}
              {d.order === 'fixed' && !d.endsAfterMs && cycle !== null && Number.isInteger(cycle) && (
                <p className="text-amber-400/90">
                  Fixed order: this sequence of {plural(cycle, 'trial')} runs {d.repetitions === 1 ? 'once' : `${d.repetitions} times over`}, in
                  the same order each time. Changing repetitions changes how often the sequence repeats, not the sequence itself.
                </p>
              )}
            </div>
          </div>
        );
      })}

      {planError && <p className="text-xs text-red-400">{planError}</p>}

      {issues.length > 0 ? (
        <ul className="flex flex-col gap-1" aria-label="Design check">
          {issues.map((issue, i) => (
            <li key={i} className={`text-xs ${issue.severity === 'error' ? 'text-red-400' : 'text-amber-400'}`}>
              {issue.severity === 'error' ? 'Error: ' : 'Warning: '}{issue.message}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-emerald-400">The design checks out.</p>
      )}
    </div>
  );
}
