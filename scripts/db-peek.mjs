// Read-only look at what is actually in the database.
//
// Every check of "did that publish land", "what shape are these rows", "how many test rows
// are in here" used to be a one-off `node -e "…"` with the whole query inlined. Each one is
// a different command string, so each one asks for permission again, and none of them is
// reviewable afterwards. This is the same queries, named and committed.
//
//   node scripts/db-peek.mjs count experiment_results experiment_slug=eq.stroop
//   node scripts/db-peek.mjs rows  stroop_results "select=participant_name&limit=5"
//   node scripts/db-peek.mjs shape experiment_results experiment_slug=eq.posnerCueing
//   node scripts/db-peek.mjs def   lexicalDecisionPairs
//
// GET only, on purpose: nothing here can write, and the anon key could not delete anyway.
// Run it through npm so .env.local is loaded:  npm run db -- count <table>

const [, , command, target, ...rest] = process.argv;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('No Supabase credentials. Run via "npm run db -- …" so .env.local is loaded.');
  process.exit(1);
}

const headers = { apikey: key, Authorization: `Bearer ${key}` };
const query = rest.join('&');

async function get(path, extraHeaders = {}) {
  const res = await fetch(`${url}/rest/v1/${path}`, { headers: { ...headers, ...extraHeaders } });
  if (!res.ok) {
    console.error(`${res.status} ${res.statusText}`);
    console.error((await res.text()).slice(0, 400));
    process.exit(1);
  }
  return res;
}

function usage() {
  console.error('usage: node scripts/db-peek.mjs <count|rows|shape|def> <table|slug> [filters…]');
  process.exit(1);
}

if (!command || !target) usage();

if (command === 'count') {
  const res = await get(`${target}?select=id&${query}`, { Prefer: 'count=exact', Range: '0-0' });
  console.log(res.headers.get('content-range')?.split('/')[1] ?? '?');

} else if (command === 'rows') {
  const res = await get(`${target}?${query || 'select=*&limit=10'}`);
  console.log(JSON.stringify(await res.json(), null, 1));

} else if (command === 'shape') {
  // What distinct payload shapes and participants are in a results table — the question
  // asked before every migration or cleanup.
  const res = await get(`${target}?select=*&${query}`);
  const rows = await res.json();
  console.log('rows:', rows.length);
  // No process.exit here: exiting while the fetch's handles are still closing trips a libuv
  // assertion on Windows, so an empty table would report itself as a crash.
  if (rows.length) {
    console.log('columns:', Object.keys(rows[0]).join(', '));
    const names = {};
    const shapes = new Map();
    for (const r of rows) {
      names[r.participant_name ?? '(none)'] = (names[r.participant_name ?? '(none)'] ?? 0) + 1;
      const keys = Object.keys(r.payload ?? {}).sort().join(',');
      shapes.set(keys, (shapes.get(keys) ?? 0) + 1);
    }
    console.log('participants:', JSON.stringify(names));
    for (const [keys, n] of shapes) console.log(`  ${n} rows · payload: ${keys || '(none)'}`);
  }

} else if (command === 'def') {
  // A published definition: which revision is live, and what each chart carries.
  const res = await get(`experiment_definitions?slug=eq.${target}&select=revision,is_published,updated_at,definition`);
  const [row] = await res.json();
  if (!row) {
    console.log(`nothing published under "${target}"`);
  } else {
    console.log(`revision: ${row.revision} | published: ${row.is_published} | updated: ${row.updated_at}`);
    for (const [i, c] of (row.definition.dashboard?.charts ?? []).entries()) {
      const original = c.original ? `${Object.keys(c.original.values).length} figures` : 'no figures';
      const ref = c.referenceLine !== undefined ? `, refLine ${c.referenceLine}` : '';
      console.log(`  ${i + 1}. ${c.title} — ${original}${ref}`);
    }
  }

} else {
  usage();
}
