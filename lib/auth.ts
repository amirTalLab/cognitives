// Shared access-gate logic for the admin hub and teacher dashboards.
//
// NOTE: This is an INTERIM, client-side-only gate. The SHA-256 comparison runs
// in the browser, so it protects the UI but not the data (the database is still
// reachable with the anon key). Phase 2 replaces this entirely with Supabase
// Auth + row-level security. Keeping the hash and verification in one place here
// is what makes that swap a single-file change instead of an 18-file change.

// SHA-256 hash of the shared access password (the plaintext is never stored in source).
const PW_HASH = 'b98872f6e170a5aa3faba5e6d154a16629c20092ae36f3f59e4da043e0a8f061';

async function sha256(str: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Returns true when the supplied password matches the shared access hash. */
export async function verifyPassword(input: string): Promise<boolean> {
  return (await sha256(input)) === PW_HASH;
}
