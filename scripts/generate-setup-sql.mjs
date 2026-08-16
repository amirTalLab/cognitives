// Regenerates supabase/schemas/00-fresh-project.sql from the individual files.
//
// Kept as a script rather than a one-off because the consolidated file must not be edited
// by hand — it would drift from the files it is made of, and then a fresh project and an
// existing one would no longer get the same schema. Change a file, run this.
//
//   node scripts/generate-setup-sql.mjs

import { readFileSync, writeFileSync } from 'node:fs';

const dir = 'supabase/schemas/';

// Order matters: a table has to exist before a migration alters it, and
// visual-search-v2 drops and recreates its table.
const base = [
  'locks', 'stroop', 'drm-base', 'drm', 'bouba-kiki', 'bouba-kiki-demo', 'mental-rep',
  'summary-stats', 'posner-cueing', 'visual-search', 'composite-face',
  'word-superiority', 'srt', 'two-step-task', 'serial-order', 'testing-effect',
  'logics', 'creativity', 'brms-emotion',
];
const v2 = ['drm-v2', 'posner-v2', 'summary-stats-v2', 'visual-search-v2'];
const pipeline = ['experiment-results', 'experiment-definitions', 'experiment-assets'];

/** Trailing verification SELECTs are noise here, and the policies need a guard. */
function clean(sql) {
  return sql
    .replace(/^-- ?Verify[\s\S]*$/gmi, '')
    // Some files put the table on the next line, so the gap has to be part of the match
    // and preserved — matching only the single-line form silently misses those.
    .replace(
      /^CREATE POLICY "([^"]+)"(\s*)ON ([\w.]+)/gm,
      (_m, name, gap, table) => `DROP POLICY IF EXISTS "${name}" ON ${table};\nCREATE POLICY "${name}"${gap}ON ${table}`,
    )
    .trim();
}

const HEADER = `-- Everything this site needs, on a fresh Supabase project.
--
-- Run this ONCE, in the SQL editor, on a project that has nothing in it. It is the
-- concatenation of every file in this folder in dependency order, with the policy
-- statements guarded so the whole thing is safe to run again.
--
-- It creates the schema only. No student data comes with it — the results tables start
-- empty, and the lock table is seeded with every experiment unlocked.
--
-- Afterwards, check it worked with:  npm run exp:doctor
`;

const out = [HEADER];

function section(title, files) {
  out.push(`\n\n-- ${'='.repeat(74)}\n-- ${title}\n-- ${'='.repeat(74)}`);
  for (const f of files) {
    out.push(`\n\n-- ---- ${f}.sql ${'-'.repeat(Math.max(3, 58 - f.length))}\n`);
    out.push(clean(readFileSync(dir + f + '.sql', 'utf8')));
  }
}

section('1. One results table per experiment', base);
section('2. Migrations applied after those tables were first created', v2);
section('3. The definition pipeline — shared results, definitions, stimulus images', pipeline);

// locks.sql seeds only the nine experiments that existed when it was written.
out.push(`\n\n-- ${'='.repeat(74)}
-- 4. Lock state for every experiment on the homepage
-- ${'='.repeat(74)}
-- locks.sql seeds only the nine that existed when it was written; the homepage now
-- lists eighteen, and an experiment missing here simply cannot be locked.

INSERT INTO experiment_locks (experiment_id, is_locked) VALUES
  ('stroop', false), ('drm', false), ('bouba-kiki', false), ('mentalRep', false),
  ('summaryStats', false), ('posnerCueing', false), ('visualSearch', false),
  ('CompositeFace', false), ('wordSuperiority', false), ('srt', false),
  ('twoStepTask', false), ('serialOrder', false), ('testingEffect', false),
  ('logics', false), ('creativity', false), ('bRMS', false),
  ('boubaKikiDemo', false), ('flankerLetterTask', false)
ON CONFLICT (experiment_id) DO NOTHING;
`);

writeFileSync(dir + '00-fresh-project.sql', out.join('\n'));
console.log('wrote', dir + '00-fresh-project.sql');
