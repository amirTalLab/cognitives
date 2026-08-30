#!/usr/bin/env node
//
// Verifies that the live Supabase project actually has every column the setup SQL declares.
//
// Why this exists: the experiments save with a fire-and-forget client insert that only
// console.errors on failure (see any app/<exp>/.../page.tsx). So a table that is missing a
// column loses data silently — the student finishes normally and nothing lands. After a
// migration to a fresh project, "the SQL ran" is not the same as "the columns are there";
// this proves the second thing without writing a single row.
//
// How: for each table the setup file creates, it works out the full column set the file
// intends (CREATE TABLE body + later ADD COLUMN), then asks PostgREST to SELECT exactly
// those columns with limit=0. PostgREST validates column names before touching any row, so
// a 200 means every column exists and a 400 names the ones that do not. Read-only — no
// probe rows, nothing to clean up, safe to run against production any time.
//
//   node --env-file-if-exists=.env.local scripts/verify-schema.mjs
//
// Exit code is non-zero if any table is missing a column, so it can gate a deploy.

import { readFileSync } from 'node:fs';

const SQL_PATH = 'supabase/schemas/00-fresh-project.sql';
const sql = readFileSync(SQL_PATH, 'utf8');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set.');
  process.exit(1);
}
const headers = { apikey: key, Authorization: `Bearer ${key}` };

/** Columns the setup file ends up with for a table: last CREATE TABLE body + any ADD COLUMN. */
function declaredColumns(table) {
  const cols = new Set();

  // The LAST create wins — a table that is dropped and recreated with a new shape (e.g.
  // visual-search-v2) ends up as the second definition, not the first.
  const creates = [...sql.matchAll(new RegExp(`CREATE TABLE (?:IF NOT EXISTS )?${table}\\s*\\(([\\s\\S]*?)\\n\\s*\\);`, 'gi'))];
  const create = creates[creates.length - 1];
  if (create) {
    for (const raw of create[1].split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('--')) continue;
      const m = /^"?([a-z_][a-z0-9_]*)"?\s+/i.exec(line);
      // Skip table-level constraint clauses, which start with a keyword not a column name.
      if (m && !/^(constraint|primary|unique|check|foreign|exclude)$/i.test(m[1])) cols.add(m[1]);
    }
  }

  for (const m of sql.matchAll(new RegExp(`ALTER TABLE ${table}([\\s\\S]{0,600}?);`, 'gi'))) {
    // Optional "IF NOT EXISTS" — captured as a non-capturing group so the column name never
    // comes back as the literal "IF".
    for (const c of m[1].matchAll(/ADD COLUMN (?:IF NOT EXISTS )?([a-z_][a-z0-9_]*)/gi)) cols.add(c[1]);
  }

  return [...cols];
}

// Require the opening "(" so prose like "-- the table that ..." after CREATE TABLE in a
// comment is never mistaken for a real table, and skip commented-out DDL.
const tables = [...new Set(
  [...sql.matchAll(/^(?!\s*--).*?CREATE TABLE (?:IF NOT EXISTS )?([a-z_][a-z0-9_]*)\s*\(/gim)].map(m => m[1])
)];

console.log(`\n  project: ${url}`);
console.log(`  source:  ${SQL_PATH}\n`);

let broken = 0, unreachable = 0, ok = 0;

for (const table of tables) {
  const cols = declaredColumns(table);
  if (cols.length === 0) { console.log(`  ?  ${table.padEnd(30)} no columns parsed — skipped`); continue; }

  // Ask for every declared column at once. PostgREST validates names before RLS/rows,
  // so limit=0 returns [] on success and 400 (naming the bad column) on the first miss.
  const res = await fetch(`${url}/rest/v1/${table}?select=${cols.join(',')}&limit=0`, { headers });

  if (res.ok) { ok++; console.log(`  ✓  ${table.padEnd(30)} ${cols.length} columns present`); continue; }

  const body = await res.json().catch(() => ({}));
  // Table missing entirely, or anon lacks select — either way we cannot confirm columns.
  if (res.status === 404 || /does not exist|find the table/i.test(body.message || '')) {
    broken++; console.log(`  ✗  ${table.padEnd(30)} TABLE MISSING (${body.message || res.status})`); continue;
  }
  if (res.status === 401 || res.status === 403) {
    unreachable++; console.log(`  ·  ${table.padEnd(30)} exists, but anon cannot SELECT (cannot check columns)`); continue;
  }

  // A 400 means at least one column is missing. Re-probe each individually to name them all.
  const missing = [];
  for (const c of cols) {
    const r = await fetch(`${url}/rest/v1/${table}?select=${c}&limit=0`, { headers });
    if (!r.ok) missing.push(c);
  }
  broken++;
  console.log(`  ✗  ${table.padEnd(30)} MISSING: ${missing.join(', ') || body.message}`);
}

console.log('');
if (broken) {
  console.log(`  ${broken} table(s) are missing columns or absent — inserts to these will fail silently.`);
  console.log(`  Re-run ${SQL_PATH} against the project, then run this again.\n`);
  process.exitCode = 1;
} else {
  console.log(`  All ${ok} checkable tables have every column the setup file declares.`);
  if (unreachable) console.log(`  (${unreachable} table(s) exist but anon cannot SELECT, so their columns were not checked.)`);
  console.log('');
}
