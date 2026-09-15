import { test, expect, Page } from '@playwright/test';

// Locking an experiment is one of the two writes that change what students see, and it now
// goes through a database function that checks the site password — the public key can read
// the lock table but no longer write it. These tests pin the browser side: that the password
// travels with the write, and that a refused write is undone on screen and explained rather
// than left looking as if it worked. (Publishing is covered in create-draft.spec.ts.)
//
// Nothing reaches the database: every request is intercepted. On a server with no Supabase
// configured — CI — the client never sends anything, which the tests detect and note.

const NOT_CONFIGURED = 'Supabase credentials not configured';

async function asLecturer(page: Page, opts: { withPassword?: boolean } = {}) {
  const databaseOff = { value: false };
  page.on('console', msg => { if (msg.text().includes(NOT_CONFIGURED)) databaseOff.value = true; });
  await page.route('**/rest/v1/experiment_locks**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.addInitScript(withPassword => {
    sessionStorage.setItem('ss_home_authed', '1');
    // A placeholder, never the real password: the function's check is what is being
    // routed around here, and the site password does not belong in the test suite.
    if (withPassword) sessionStorage.setItem('ss_create_key', 'placeholder');
  }, opts.withPassword ?? true);
  await page.goto('/');
  return databaseOff;
}

function noteNoDatabase() {
  test.info().annotations.push({
    type: 'note',
    description: 'Supabase is not configured on this server, so no request could be checked.',
  });
}

test('a session that remembers the login but not the password is asked to log in again', async ({ page }) => {
  await asLecturer(page, { withPassword: false });
  await expect(page.getByPlaceholder('Password')).toBeVisible();
});

test('locking an experiment sends the typed password to the checked function', async ({ page }) => {
  const sent: Record<string, unknown>[] = [];
  const databaseOff = await asLecturer(page);
  // After asLecturer, so this route wins over nothing broader; the lock table route above
  // does not match /rpc/.
  await page.route('**/rest/v1/rpc/set_experiment_lock', route => {
    sent.push(route.request().postDataJSON());
    return route.fulfill({ status: 204, body: '' });
  });

  await page.getByRole('button', { name: 'Lock experiment' }).first().click();
  await expect.poll(() => sent.length > 0 || databaseOff.value).toBe(true);
  if (!sent.length) return noteNoDatabase();

  expect(sent[0]).toMatchObject({ p_password: 'placeholder', p_is_locked: true });
  expect(typeof sent[0].p_experiment_id).toBe('string');
  await expect(page.getByRole('button', { name: 'Unlock experiment' })).toHaveCount(1);
});

test('a refused lock change is undone on screen and explained', async ({ page }) => {
  const databaseOff = await asLecturer(page);
  let asked = false;
  await page.route('**/rest/v1/rpc/set_experiment_lock', route => {
    asked = true;
    return route.fulfill({
      status: 403, contentType: 'application/json',
      body: JSON.stringify({ code: '42501', message: 'Incorrect password', details: null, hint: null }),
    });
  });

  await page.getByRole('button', { name: 'Lock experiment' }).first().click();
  await expect.poll(() => asked || databaseOff.value).toBe(true);
  if (!asked) return noteNoDatabase();

  await expect(page.getByText(/password was not accepted/i)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Unlock experiment' })).toHaveCount(0);
});
