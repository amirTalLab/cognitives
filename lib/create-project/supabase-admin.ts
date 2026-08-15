// Applies a generated experiment's SQL schema to Supabase automatically, so a lecturer
// never has to copy a file into the SQL editor.
//
// This is the most dangerous surface in the whole feature: it runs model-written DDL
// against the live database the course actually collects data into. The Management API
// endpoint it uses executes arbitrary SQL with owner privileges — there is no row-level
// security standing between it and every table on the project.
//
// So the SQL is not trusted. Every statement must match one of four exact shapes, and
// every one of them must name a table belonging to the slug being created. A DROP, a
// DELETE, a GRANT, or any reference to another experiment's table is refused before
// anything is sent.

export class SchemaError extends Error {}

/** camelCase or kebab slug -> the snake_case prefix its tables must start with. */
export function tablePrefix(slug: string): string {
  return slug
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[-\s]+/g, '_')
    .toLowerCase();
}

/** Removes comments and blank statements so the shape checks see only real SQL. */
function statements(sql: string): string[] {
  return sql
    .replace(/--[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(';')
    .map(s => s.trim().replace(/\s+/g, ' '))
    .filter(Boolean);
}

/**
 * Returns the statements to run, or throws if any of them is not a plain
 * create-this-experiment's-table operation.
 */
export function validateSchemaSql(sql: string, slug: string): { sql: string[]; tables: string[] } {
  const prefix = tablePrefix(slug);
  // Table names this schema is allowed to touch: <prefix> or <prefix>_something.
  const table = `(${prefix}(?:_[a-z0-9_]+)?)`;

  const ALLOWED: RegExp[] = [
    new RegExp(`^CREATE TABLE IF NOT EXISTS ${table} \\(.+\\)$`, 'i'),
    new RegExp(`^ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY$`, 'i'),
    // Additive only. ADD COLUMN cannot destroy data; DROP COLUMN and ALTER COLUMN can, so
    // they stay refused and surface as drift for a human to decide about.
    new RegExp(`^ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS [a-z0-9_]+ .+$`, 'i'),
    new RegExp(`^CREATE POLICY "[^"]+" ON ${table} FOR (INSERT|SELECT) (WITH CHECK|USING) \\(true\\)$`, 'i'),
    new RegExp(`^CREATE INDEX IF NOT EXISTS [a-z0-9_]+ ON ${table} \\(.+\\)$`, 'i'),
  ];

  const out: string[] = [];
  const tables = new Set<string>();

  for (const stmt of statements(sql)) {
    const match = ALLOWED.map(re => stmt.match(re)).find(Boolean);
    if (!match) {
      throw new SchemaError(
        `Refused to run this statement automatically, because it is not a plain "create the ${prefix} table" operation:\n\n${stmt.slice(0, 200)}\n\nRun the SQL by hand in the Supabase editor if it is correct.`,
      );
    }
    tables.add(match[1].toLowerCase());
    out.push(stmt);
  }

  if (out.length === 0) throw new SchemaError('The generated schema file contained no SQL statements.');
  return { sql: out, tables: [...tables] };
}

export function hasSchemaAccess(): boolean {
  return !!process.env.SUPABASE_ACCESS_TOKEN && !!projectRef();
}

/** The project ref is the subdomain of the Supabase URL already configured for the site. */
export function projectRef(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  return url.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/i)?.[1] ?? null;
}

/**
 * Sends SQL to the Management API.
 *
 * Every caller either passes an app-authored constant or SQL that validateSchemaSql has
 * already cleared. That split is the whole safety model: model-written SQL goes through
 * the allow-list, app-written SQL is a fixed string in this file and does not need to.
 */
async function query<T>(sql: string): Promise<T> {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const ref = projectRef();
  if (!token || !ref) {
    throw new SchemaError(
      'Automatic table management needs SUPABASE_ACCESS_TOKEN in .env.local (a personal access token from the Supabase dashboard, Account → Access Tokens).',
    );
  }

  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query: sql }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new SchemaError(`Supabase rejected the query (${res.status}): ${detail.slice(0, 300)}`);
  }
  return await res.json() as T;
}

/** Escapes a value for a SQL string literal. Only ever used on slug-derived identifiers. */
function lit(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** Columns a table currently has, or null when the table does not exist. App-authored SQL. */
export async function introspect(table: string): Promise<string[] | null> {
  const rows = await query<{ column_name: string }[]>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = ${lit(table)}
     ORDER BY ordinal_position`,
  );
  return rows.length ? rows.map(r => r.column_name) : null;
}

export interface SchemaPlan {
  table: string;
  action: 'create' | 'add-columns' | 'up-to-date';
  /** Columns the generated schema declares that the live table is missing. */
  missing: string[];
  /** Columns the live table has that the generated schema no longer declares. */
  extra: string[];
  statements: string[];
}

/** Parses the column names out of a validated CREATE TABLE statement. */
function declaredColumns(createStmt: string): string[] {
  const body = createStmt.slice(createStmt.indexOf('(') + 1, createStmt.lastIndexOf(')'));
  const cols: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of body) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { cols.push(current); current = ''; continue; }
    current += ch;
  }
  cols.push(current);

  return cols
    .map(c => c.trim().split(/\s+/)[0].toLowerCase())
    .filter(name => name && !['primary', 'foreign', 'unique', 'check', 'constraint'].includes(name));
}

/**
 * Works out what actually needs to happen, rather than firing CREATE TABLE IF NOT EXISTS
 * and hoping.
 *
 * That statement is a no-op against an existing table, so a refine that added a column
 * used to leave the live table stale — and the experiment would then insert a column the
 * database does not have. Since the generated pages do not surface insert errors, a whole
 * class could complete the task and save nothing. This diff is what prevents that.
 */
export async function planSchema(sql: string, slug: string): Promise<SchemaPlan> {
  const { sql: stmts } = validateSchemaSql(sql, slug);

  const createStmt = stmts.find(s => /^CREATE TABLE/i.test(s));
  if (!createStmt) throw new SchemaError('The generated schema has no CREATE TABLE statement.');

  const table = createStmt.match(/^CREATE TABLE IF NOT EXISTS ([a-z0-9_]+)/i)![1].toLowerCase();
  const wanted = declaredColumns(createStmt);
  const live = await introspect(table);

  if (live === null) {
    return { table, action: 'create', missing: wanted, extra: [], statements: stmts };
  }

  const missing = wanted.filter(c => !live.includes(c));
  const extra = live.filter(c => !wanted.includes(c) && c !== 'id' && c !== 'created_at');

  if (missing.length === 0) {
    return { table, action: 'up-to-date', missing, extra, statements: [] };
  }

  // Only additive migration is generated, and the column definitions come from the
  // already-validated CREATE TABLE body — never from free text.
  const body = createStmt.slice(createStmt.indexOf('(') + 1, createStmt.lastIndexOf(')'));
  const defs = missing.map(name => {
    const def = body.split(',').map(s => s.trim()).find(s => s.toLowerCase().startsWith(name + ' '));
    if (!def) throw new SchemaError(`Could not read the definition of the new column "${name}".`);
    return `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${def}`;
  });

  return { table, action: 'add-columns', missing, extra, statements: defs };
}

/** Applies a plan. Re-validates, so nothing reaches the database unchecked. */
export async function applyPlan(plan: SchemaPlan, slug: string): Promise<void> {
  if (plan.statements.length === 0) return;
  validateSchemaSql(plan.statements.join(';\n') + ';', slug);
  await query(plan.statements.join(';\n') + ';');
}

/**
 * Drops a discarded experiment's table — but only when it holds no data.
 *
 * Discarding used to remove the files and leave the table behind. Dropping unconditionally
 * would be worse: a table with rows in it is somebody's collected data, and no cleanup
 * step is worth risking that.
 */
export async function dropIfEmpty(slug: string, table: string): Promise<'dropped' | 'kept-has-rows' | 'absent'> {
  const prefix = tablePrefix(slug);
  if (!table.startsWith(prefix)) {
    throw new SchemaError(`Refused to drop "${table}": it does not belong to the "${slug}" experiment.`);
  }

  const live = await introspect(table);
  if (live === null) return 'absent';

  const rows = await query<{ n: number }[]>(`SELECT count(*)::int AS n FROM ${table}`);
  if ((rows[0]?.n ?? 0) > 0) return 'kept-has-rows';

  await query(`DROP TABLE IF EXISTS ${table}`);
  return 'dropped';
}
