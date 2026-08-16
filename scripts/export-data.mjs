#!/usr/bin/env node
//
// Exports every results table to CSV.
//
// Written for a specific situation — the Supabase project the site grew up on belongs to
// an account we no longer control, and read access through the anon key is all that is
// left of it. That access ends whenever the owner rotates a key, or whenever Supabase
// pauses the project for inactivity, which becomes likely the moment the site stops
// pointing at it. This is the insurance.
//
// It is also just a data export, and useful whenever someone wants a semester's results
// in R or SPSS.
//
//   node --env-file-if-exists=.env.local scripts/export-data.mjs [outputDir]
//
// Output is CSV per table plus a manifest of row counts. Rows contain participant names,
// so the default directory is gitignored — keep it that way.

import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const TABLES = [
  'experiment_locks',
  'stroop_results', 'drm_results', 'drm_recall_results', 'bouba_kiki_results',
  'bouba_kiki_demo_results', 'mental_rep_results', 'summary_stats_results',
  'posner_results', 'visual_search_results', 'composite_face_results',
  'word_superiority_results', 'srt_results', 'srt_generation', 'two_step_results',
  'serial_order_study', 'serial_order_recall', 'serial_order_distractor',
  'testing_effect_results', 'logics_results',
  'creativity_aut_results', 'creativity_circles_results', 'creativity_rat_results',
  'brms_emotion_results',
  'experiment_definitions', 'experiment_results',
];

/** PostgREST caps a select at 1000 rows server-side whatever limit is asked for. */
const PAGE = 1000;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set.');
  process.exit(1);
}
const headers = { apikey: key, Authorization: `Bearer ${key}` };

/** RFC 4180: quote when the value contains a delimiter, a quote or a newline. */
function csvCell(value) {
  if (value === null || value === undefined) return '';
  const s = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows) {
  // Union of keys, not the first row's: a JSONB column can be absent from an early row.
  const columns = [...new Set(rows.flatMap(Object.keys))];
  const lines = [columns.join(',')];
  for (const row of rows) lines.push(columns.map(c => csvCell(row[c])).join(','));
  return `${lines.join('\n')}\n`;
}

async function fetchAll(table) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const res = await fetch(`${url}/rest/v1/${table}?select=*&order=id.asc`, {
      headers: { ...headers, Range: `${from}-${from + PAGE - 1}` },
    });
    // Some tables have no id column; fall back to an unordered read for those. Without
    // any order the same row can appear on two pages, so it is worth trying id first.
    if (!res.ok && from === 0) {
      const plain = await fetch(`${url}/rest/v1/${table}?select=*`, {
        headers: { ...headers, Range: `0-${PAGE - 1}` },
      });
      if (!plain.ok) return null;
      const page = await plain.json();
      rows.push(...page);
      if (page.length < PAGE) return rows;
      continue;
    }
    if (!res.ok) break;
    const page = await res.json();
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return rows;
}

const outDir = resolve(process.cwd(), process.argv[2] ?? 'exports');
await mkdir(outDir, { recursive: true });

console.log(`\n  from ${url}`);
console.log(`  to   ${outDir}\n`);

const manifest = { source: url, exportedAt: new Date().toISOString(), tables: {} };
let total = 0;

for (const table of TABLES) {
  const rows = await fetchAll(table);
  if (rows === null) { console.log(`  ${'—'} ${table.padEnd(30)} not on this project`); continue; }
  if (rows.length === 0) { console.log(`  ${'·'} ${table.padEnd(30)} empty`); manifest.tables[table] = 0; continue; }

  await writeFile(resolve(outDir, `${table}.csv`), toCsv(rows), 'utf8');
  manifest.tables[table] = rows.length;
  total += rows.length;
  console.log(`  ✓ ${table.padEnd(30)} ${String(rows.length).padStart(6)} rows`);
}

await writeFile(resolve(outDir, '_manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(`\n  ${total} rows written. Manifest in _manifest.json.\n`);
