// Writes that change what students see — publishing an experiment, locking one — go
// through database functions that check the site password.
//
// The public Supabase key is in every visitor's browser, so a table it can write to is a
// table anyone can write to. For these two tables the key is read-only
// (supabase/schemas/protect-writes-2-close.sql), and the only way in is a function that
// compares the password's SHA-256 with the site's (protect-writes-1-functions.sql). No
// extra secret exists anywhere: the password the lecturer already typed is the credential.

import { getSupabase } from '@/lib/supabase';

/** Where the site keeps the password a lecturer typed — this tab only, gone when it closes. */
export const PASSWORD_KEY = 'ss_create_key';

export function storedPassword(): string {
  try {
    return sessionStorage.getItem(PASSWORD_KEY) ?? '';
  } catch {
    return '';
  }
}

/** A refused write, in words a lecturer can act on. */
export function describeWriteError(error: { message?: string; code?: string } | null | undefined): string {
  const message = error?.message ?? '';
  if (/incorrect password/i.test(message)) {
    return 'The password was not accepted. Log in again and try once more.';
  }
  if (error?.code === 'PGRST202' || /could not find the function|function .* does not exist/i.test(message)) {
    return 'The database has not been updated for protected writes yet. Run supabase/schemas/protect-writes-1-functions.sql in the Supabase SQL editor.';
  }
  return message || 'The database refused the change.';
}

export async function setExperimentLock(experimentId: string, locked: boolean): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: 'Supabase is not configured.' };

  const { error } = await sb.rpc('set_experiment_lock', {
    p_password: storedPassword(),
    p_experiment_id: experimentId,
    p_is_locked: locked,
  });
  return error ? { ok: false, error: describeWriteError(error) } : { ok: true };
}
