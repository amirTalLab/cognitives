import { test, expect, Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

// End-to-end cover for the create wizard's crash protection.
//
// Every stage of /create is a metered API call held only in React state, so a refresh, a
// closed tab or a crash threw away both the work and the money that paid for it. These
// tests assert that it comes back — and, just as importantly, that it cannot be destroyed
// by the two clicks that would otherwise silently overwrite it.
//
// No API key and no database are needed: restoring a draft re-runs no stage, which is the
// whole point of it.

// One worker for this file. /create is by far the largest page on the site, and spreading
// these six tests across workers made four of them race the dev server's first compile of
// it — which starved the /run tests running alongside until they timed out. Pinned to one
// worker, the first test pays the compile and the rest reuse it. Nothing here is slow
// enough for the parallelism to have been worth that.
test.describe.configure({ mode: 'serial' });

const DRAFT_KEY = 'cognitives_create_draft';
const PREVIEW_KEY = 'cognitives_preview_definitions';

// Read from disk rather than inlined, so the fixture cannot drift into a definition the
// runtime would refuse to render. Playwright runs from the project root.
const DEFINITION = JSON.parse(
  readFileSync('experiments/memoryScanning.json', 'utf8'),
) as { slug: string; title: string; titleHe: string; instructions: { en: string; he: string } };

/** Matches the run page's heading, which shows the Hebrew title unless English is chosen. */
const TITLE_RE = new RegExp(
  [DEFINITION.title, DEFINITION.titleHe].map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
);

/** The spec the wizard would be holding alongside that definition. */
const SPEC = {
  slug: DEFINITION.slug,
  title: DEFINITION.title,
  titleHe: 'סריקת זיכרון',
  category: 'MEMORY',
  buildTarget: 'definition',
  fields: [{ key: 'design', label: 'Design description', value: 'Sternberg item recognition.', source: 'paper' }],
};

function draft(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    version: 1,
    savedAt: Date.now() - 4 * 60_000,
    stage: 'refine',
    pdfName: 'science.153.3736.652.pdf',
    analysis: null,
    candidate: null,
    spec: SPEC,
    assets: null,
    definition: DEFINITION,
    files: [],
    notes: '',
    problems: [],
    // Deliberately not one of the example phrases in the Refine help text, which is on the
    // same screen and would match the same locator.
    messages: [
      { role: 'user', content: 'shorten the retention interval to 900ms' },
      { role: 'assistant', content: 'Done — the retention interval is now 900ms.' },
    ],
    usage: [{ stage: 'Generate definition', model: 'strong', input: 12000, output: 3000, cacheWrite: 0, cacheRead: 0 }],
    staged: true,
    compileState: { ok: true, message: 'Valid and ready to run.' },
    finishResult: null,
    ...overrides,
  });
}

/**
 * Gets past the password gate without knowing the password.
 *
 * The page auto-unlocks when both session keys are present, and only the metered API routes
 * actually verify the key server-side. Nothing here calls one, so a placeholder is enough —
 * and it keeps the site password out of the test suite, where it does not belong.
 */
async function openCreate(page: Page, localStorageSeed?: string) {
  await page.route('**/rest/v1/**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));

  await page.addInitScript(([seed, key]) => {
    sessionStorage.setItem('ss_home_authed', '1');
    sessionStorage.setItem('ss_create_key', 'placeholder');
    // Once only. This runs on every navigation, and these tests reload the page to prove
    // a draft survived — re-seeding there would assert nothing at all.
    if (sessionStorage.getItem('__draft_seeded')) return;
    sessionStorage.setItem('__draft_seeded', '1');
    if (seed) localStorage.setItem(key as string, seed as string);
    else localStorage.removeItem(key as string);
  }, [localStorageSeed ?? '', DRAFT_KEY] as const);

  await page.goto('/create');
  await expect(page.getByRole('heading', { name: 'Create New Project' })).toBeVisible();
}

test('an unfinished experiment is offered back, naming what it is and when it stopped', async ({ page }) => {
  await openCreate(page, draft());

  const banner = page.locator('div').filter({ hasText: /^Unfinished experiment found/ }).first();
  await expect(page.getByText('Unfinished experiment found')).toBeVisible();
  await expect(page.getByText(/Memory Scanning/)).toBeVisible();
  await expect(page.getByText(/4 minutes ago/)).toBeVisible();
  await expect(banner.getByRole('button', { name: 'Restore' })).toBeVisible();
});

test('restoring brings back the stage, the paid work and the spend, and re-arms the preview', async ({ page }) => {
  await openCreate(page, draft());
  await page.getByRole('button', { name: 'Restore' }).click();

  // The wizard is back where it was, not at the start.
  await expect(page.getByRole('heading', { name: 'Refine' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Preview' })).toBeVisible();

  // The refine conversation — one Opus call per turn — survived.
  await expect(page.getByText('shorten the retention interval to 900ms')).toBeVisible();
  await expect(page.getByText('Done — the retention interval is now 900ms.')).toBeVisible();

  // So did the running spend, so the meter does not reset to zero after a crash.
  await expect(page.getByText('Spend so far')).toBeVisible();

  // The preview iframe reads the definition out of sessionStorage, which a closed tab
  // empties. Restoring has to put it back or the pane loads an experiment that no longer
  // exists — a restored wizard that looks fine and previews nothing.
  const previewed = await page.evaluate(k => sessionStorage.getItem(k as string), PREVIEW_KEY);
  expect(previewed, 'restore must re-seed the preview store').toContain(DEFINITION.slug);

  const frame = page.frameLocator('iframe[title*="Preview"]');
  await expect(frame.getByRole('heading', { name: TITLE_RE })).toBeVisible({ timeout: 30_000 });
});

test('discarding removes the draft for good', async ({ page }) => {
  await openCreate(page, draft());
  await page.getByRole('button', { name: 'Discard' }).click();

  await expect(page.getByText('Unfinished experiment found')).toBeHidden();
  expect(await page.evaluate(k => localStorage.getItem(k as string), DRAFT_KEY)).toBeNull();

  await page.reload();
  await expect(page.getByText('Unfinished experiment found')).toBeHidden();
});

test('an empty wizard does not overwrite the draft before it is offered', async ({ page }) => {
  // The first render writes empty state. If that were saved, the draft would be destroyed
  // on the very load that was supposed to hand it back.
  await openCreate(page, draft());
  await expect(page.getByText('Unfinished experiment found')).toBeVisible();

  const stored = await page.evaluate(k => localStorage.getItem(k as string), DRAFT_KEY);
  expect(stored).toContain(DEFINITION.slug);
});

test('opening the blank spec form does not destroy a saved draft', async ({ page }) => {
  // "No paper — describe it myself" installs a spec with every field empty. Treating that
  // as work would mean one harmless-looking click wiped a paid-for experiment.
  await openCreate(page, draft());
  await page.getByRole('button', { name: 'No paper — describe it myself' }).click();
  await expect(page.getByRole('heading', { name: 'Design spec' })).toBeVisible();

  const stored = await page.evaluate(k => localStorage.getItem(k as string), DRAFT_KEY);
  expect(stored, 'the draft must still be there').toContain(DEFINITION.slug);
});

test('work is saved as it happens, without any explicit save', async ({ page }) => {
  await openCreate(page);
  expect(await page.evaluate(k => localStorage.getItem(k as string), DRAFT_KEY)).toBeNull();

  await page.getByRole('button', { name: 'No paper — describe it myself' }).click();
  await page.getByLabel('English title').fill('Attentional Blink');

  await expect.poll(async () =>
    await page.evaluate(k => localStorage.getItem(k as string), DRAFT_KEY),
  ).toContain('Attentional Blink');

  // The real test of it: reload, and the typing is still there to be taken back.
  await page.reload();
  await page.getByRole('button', { name: 'Restore' }).click();
  await expect(page.getByLabel('English title')).toHaveValue('Attentional Blink');
});

// ── Leaving while a stage is running ──────────────────────────────────────────
//
// The one loss the draft cannot prevent: the API call has been billed and its reply will
// never reach a page that is no longer there. The guard is scoped to exactly that window,
// so both halves matter — it has to fire mid-call, and it has to stay quiet the rest of
// the time, or it would be nagging about exits that now cost nothing.

/**
 * Starts a generate that never comes back, leaving the wizard busy.
 *
 * The route is stalled rather than answered so the page sits in the state this guard is
 * about. Nothing reaches Anthropic — the request is intercepted in the browser.
 */
async function startStalledGenerate(page: Page) {
  await page.route('**/api/create/definition', () => { /* never fulfilled */ });
  await page.getByRole('button', { name: 'Generate the experiment' }).click();
  await expect(page.getByText('Designing the experiment…')).toBeVisible();
}

/** Closes the tab as a user would, reporting whether the browser challenged it. */
async function closeAndReportDialog(page: Page): Promise<boolean> {
  let asked = false;
  page.on('dialog', d => { asked = true; void d.dismiss(); });
  await page.close({ runBeforeUnload: true });
  // A plain sleep, not page.waitForTimeout: when no dialog is raised the page is already
  // gone by now, and waiting on it would throw instead of reporting the "no" this is for.
  await new Promise(r => setTimeout(r, 500));
  return asked;
}

test('leaving mid-call is challenged, because that reply can never be recovered', async ({ page }) => {
  await openCreate(page, draft({ stage: 'spec' }));
  await page.getByRole('button', { name: 'Restore' }).click();
  await startStalledGenerate(page);

  expect(await closeAndReportDialog(page), 'a billed call in flight should be defended').toBe(true);
});

test('leaving when idle is not challenged, because the draft already has it', async ({ page }) => {
  await openCreate(page, draft({ stage: 'spec' }));
  // A real gesture, so the browser would allow a prompt if one were registered — otherwise
  // this test would pass for the wrong reason.
  await page.getByRole('button', { name: 'Restore' }).click();
  await expect(page.getByRole('heading', { name: 'Design spec' })).toBeVisible();

  expect(await closeAndReportDialog(page), 'an idle wizard must not nag on the way out').toBe(false);
});

test('the challenge is dropped once the call finishes', async ({ page }) => {
  await openCreate(page, draft({ stage: 'spec' }));
  await page.getByRole('button', { name: 'Restore' }).click();

  // Answered this time, so busy clears and the guard should unregister with it. A guard
  // that only ever went up would turn every later exit into a false alarm.
  await page.route('**/api/create/definition', route => route.fulfill({
    status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'stopped for the test' }),
  }));
  await page.getByRole('button', { name: 'Generate the experiment' }).click();
  await expect(page.getByText('stopped for the test')).toBeVisible();

  expect(await closeAndReportDialog(page), 'the guard must come down with the spinner').toBe(false);
});

// ── Editing the instructions by hand ──────────────────────────────────────────
//
// Kept in this file for the same one-worker reason as above: a second /create spec would
// race this one for the dev server's compile. The draft fixture is also exactly what these
// need — a generated definition on the Refine stage, reached without paying for one.

/** Puts the wizard on Refine holding the fixture definition. */
async function openRefine(page: Page) {
  await openCreate(page, draft());
  await page.getByRole('button', { name: 'Restore' }).click();
  await expect(page.getByRole('heading', { name: 'Instructions' })).toBeVisible();
}

test('the instruction boxes start with what was generated', async ({ page }) => {
  const def = JSON.parse(readFileSync('experiments/memoryScanning.json', 'utf8')) as
    { instructions: { en: string; he: string } };
  await openRefine(page);

  await expect(page.getByLabel('English instructions')).toHaveValue(def.instructions.en);
  await expect(page.getByLabel('Hebrew instructions')).toHaveValue(def.instructions.he);
});

test('edited instructions reach the running experiment, in both languages, with no API call', async ({ page }) => {
  // Any call to a metered route would mean this was not the free path it claims to be.
  const apiCalls: string[] = [];
  page.on('request', r => { if (r.url().includes('/api/create/')) apiCalls.push(r.url()); });

  await openRefine(page);
  // Two paragraphs, to prove the landing page keeps the break rather than running them together.
  await page.getByLabel('English instructions').fill('Remember the letters.\nThen answer quickly.');
  await page.getByLabel('Hebrew instructions').fill('זכרו את האותיות.');
  await page.getByRole('button', { name: 'Update preview' }).click();

  const frame = page.frameLocator('iframe[title*="Preview"]');
  // The landing page opens in Hebrew.
  await expect(frame.getByText('זכרו את האותיות.')).toBeVisible({ timeout: 30_000 });
  await frame.getByRole('button', { name: 'English' }).click();
  const english = frame.getByText(/Remember the letters\./);
  await expect(english).toBeVisible();
  expect(await english.evaluate(el => (el as HTMLElement).innerText)).toContain('letters.\nThen');

  expect(apiCalls.filter(u => !u.includes('/api/create/status')), 'editing must not call the API').toEqual([]);
});

test('edited instructions survive a refresh with the rest of the draft', async ({ page }) => {
  await openRefine(page);
  await page.getByLabel('English instructions').fill('Edited before the refresh.');

  await expect.poll(async () =>
    await page.evaluate(k => localStorage.getItem(k as string), DRAFT_KEY),
  ).toContain('Edited before the refresh.');

  await page.reload();
  await page.getByRole('button', { name: 'Restore' }).click();
  await expect(page.getByLabel('English instructions')).toHaveValue('Edited before the refresh.');
});

test('publishing sends the edited instructions, not the generated ones', async ({ page }) => {
  // Mock mode refuses to publish at all, so this needs a server that is not in it.
  await serverNotInMock(page);
  await openRefine(page);
  await page.getByLabel('Hebrew instructions').fill('הוראות שנערכו ביד.');

  // Captured and refused, so nothing reaches the database.
  let published = '';
  await page.route('**/api/create/publish', route => {
    published = route.request().postData() ?? '';
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: false, error: 'stopped for the test' }),
    });
  });
  await page.getByRole('button', { name: 'Finish & publish' }).click();
  await expect(page.getByText(/stopped for the test/)).toBeVisible();

  expect(published).toContain('הוראות שנערכו ביד.');
});

// ── Live mock toggle (temporary) ──────────────────────────────────────────────
//
// Lets the deployed builder be clicked through for free. Status is faked as "not mock"
// so these hold whether or not the test server happens to have CREATE_MOCK=1 set.

async function serverNotInMock(page: Page) {
  await page.route('**/api/create/status', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ configured: true, canWriteFiles: false, canCreateTables: false, skills: [], mock: false }),
  }));
}

test('the mock header does not get past the password', async ({ request }) => {
  const res = await request.post('/api/create/analyze', {
    headers: { 'x-cognitives-mock': '1', 'x-cognitives-access': 'not-the-password' },
    data: { pdfBase64: 'JVBERi0=', filename: 'x.pdf' },
  });
  expect(res.status(), 'mock mode must never become a way around the gate').toBe(401);
});

test('the mock toggle is off by default, and marks builder calls once switched on', async ({ page }) => {
  await serverNotInMock(page);
  const sent: (string | undefined)[] = [];
  await page.route('**/api/create/analyze', route => {
    sent.push(route.request().headers()['x-cognitives-mock']);
    return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'stopped' }) });
  });
  await openCreate(page);
  await page.locator('input[type=file]').first().setInputFiles({
    name: 'paper.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 test'),
  });

  const toggle = page.getByRole('button', { name: /^Mock mode/ });
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'Find experiments' }).click();
  await expect.poll(() => sent.length).toBe(1);

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('Mock mode — no API calls, no cost.')).toBeVisible();
  await page.getByRole('button', { name: 'Find experiments' }).click();
  await expect.poll(() => sent.length).toBe(2);

  expect(sent).toEqual([undefined, '1']);
});

test('mock mode never publishes, so a fake experiment cannot reach students', async ({ page }) => {
  await serverNotInMock(page);
  let published = false;
  await page.route('**/api/create/publish', route => { published = true; return route.abort(); });
  await openCreate(page, draft());

  await page.getByRole('button', { name: /^Mock mode/ }).click();
  await page.getByRole('button', { name: 'Restore' }).click();
  await page.getByRole('button', { name: 'Finish & publish' }).click();

  await expect(page.getByText(/Mock mode — nothing was published/)).toBeVisible();
  expect(published).toBe(false);
});

test('an empty language is flagged, since those participants would read nothing', async ({ page }) => {
  await openRefine(page);
  await expect(page.getByText(/One language is empty/)).toBeHidden();
  await page.getByLabel('English instructions').fill('');
  await expect(page.getByText(/One language is empty/)).toBeVisible();
});

// ── Editing something already published ─────────────────────────────────────
//
// An experiment stops being finished once it can be changed: the builder lists what is live
// and opens it on the same Refine screen a new experiment ends on. Nothing is generated and
// nothing is paid for, which is the whole point — so the test also proves no metered route
// is called.

test('a published experiment opens for editing on Refine, with no API call', async ({ page }) => {
  const apiCalls: string[] = [];
  page.on('request', r => {
    const url = r.url();
    if (url.includes('/api/create/') && !url.includes('/status')) apiCalls.push(url);
  });

  await serverNotInMock(page);
  // Broad first, specific second: the later route wins, so the definitions table is served
  // by the second one while everything else still reads empty.
  await page.route('**/rest/v1/**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  // Published under a slug the homepage links, because that is the only kind the edit list
  // offers: a row nobody can reach from the homepage is an abandoned draft, and listing it
  // invites someone to refine an experiment no student will ever run.
  const EDITED = { ...DEFINITION, slug: 'drm' };
  await page.route('**/rest/v1/experiment_definitions*', route => {
    const url = route.request().url();
    // maybeSingle() asks for one object; the listing asks for an array.
    const body = url.includes('slug=eq.')
      ? JSON.stringify({ definition: EDITED, revision: 4 })
      : JSON.stringify([
          { slug: EDITED.slug, title: EDITED.title, category: 'MEMORY',
            updated_at: new Date().toISOString(), revision: 4 },
          // And one that is published but linked nowhere, which must NOT appear below.
          { slug: 'kanizsaWordPrime', title: 'Kanizsa word priming', category: 'PERCEPTION',
            updated_at: new Date().toISOString(), revision: 1 },
        ]);
    return route.fulfill({ status: 200, contentType: 'application/json', body });
  });
  await page.addInitScript(() => {
    sessionStorage.setItem('ss_home_authed', '1');
    sessionStorage.setItem('ss_create_key', 'placeholder');
  });

  await page.goto('/create');
  await expect(page.getByRole('heading', { name: 'Or edit one that is already live' })).toBeVisible();
  // A published row wins over the built-in of the same slug, and says which version it is.
  await expect(page.getByText(`/run/${EDITED.slug} · version 4 · MEMORY`)).toBeVisible();

  // The ported experiments are listed too, and they are the ones a class actually runs.
  // Before this, the list read published rows alone and none of them could be opened.
  await expect(page.getByText('/run/visualSearch · built in · editing publishes version 1')).toBeVisible();
  await expect(page.getByText('/run/srt · built in · editing publishes version 1')).toBeVisible();

  // But nothing the homepage does not link, however live its row is.
  await expect(page.getByText('/run/kanizsaWordPrime')).toBeHidden();
  await expect(page.getByText('Kanizsa word priming')).toBeHidden();

  // Scoped to its own row: there is an Edit button per experiment now. Found by the card
  // class rather than by text depth — several nested divs contain the slug, and only the
  // card carries the button.
  const row = page.locator('div.rounded-xl').filter({ hasText: `/run/${EDITED.slug} ·` });
  await row.getByRole('button', { name: 'Edit' }).click();

  // The Refine screen, holding the live experiment — and saying what publishing again does.
  await expect(page.getByRole('heading', { name: 'Refine' })).toBeVisible();
  await expect(page.getByText(/version 4\. Publishing again makes version 5/)).toBeVisible();
  await expect(page.getByLabel('English instructions')).toHaveValue(DEFINITION.instructions.en);
  await expect(page.getByRole('heading', { name: 'Preview' })).toBeVisible();

  expect(apiCalls, 'opening a published experiment must not call a metered route').toEqual([]);
});

// ── Publishing goes through the password check ──────────────────────────────
//
// The public key can no longer write published definitions, so publishing is a call to a
// database function that checks the site password first. What matters on this side is that
// the password the lecturer typed at the gate goes with it.

test('publishing sends the definition to the password-checked function, with the typed password', async ({ page }) => {
  await serverNotInMock(page);
  const databaseOff = { value: false };
  page.on('console', msg => {
    if (msg.text().includes('Supabase credentials not configured')) databaseOff.value = true;
  });
  await openRefine(page);

  // Registered after openCreate's catch-all /rest/v1/ route, or that route would win.
  const sent: Record<string, unknown>[] = [];
  await page.route('**/api/create/publish', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }),
  }));
  await page.route('**/rest/v1/rpc/publish_definition', route => {
    sent.push(route.request().postDataJSON());
    return route.fulfill({ status: 204, body: '' });
  });

  await page.getByRole('button', { name: 'Finish & publish' }).click();
  await expect(page.getByText(/Published\.|Supabase is not configured/)).toBeVisible();
  if (!sent.length && databaseOff.value) {
    test.info().annotations.push({ type: 'note', description: 'Supabase is not configured on this server, so no request could be checked.' });
    return;
  }

  expect(sent).toHaveLength(1);
  expect(sent[0]).toMatchObject({ p_password: 'placeholder', p_slug: DEFINITION.slug, p_is_published: true });
  expect((sent[0].p_definition as { slug: string }).slug).toBe(DEFINITION.slug);
});


// ── Editing the title by hand ─────────────────────────────────────────────────

test('an edited title reaches the running experiment, with no API call', async ({ page }) => {
  const apiCalls: string[] = [];
  page.on('request', r => { if (r.url().includes('/api/create/')) apiCalls.push(r.url()); });

  await openRefine(page);
  await expect(page.getByLabel('Experiment title in English')).toHaveValue(DEFINITION.title);
  await page.getByLabel('Experiment title in English').fill('Letters in Memory');
  await page.getByLabel('Experiment title in Hebrew').fill('אותיות בזיכרון');
  await page.getByRole('button', { name: 'Update preview' }).click();

  const frame = page.frameLocator('iframe[title*="Preview"]');
  await expect(frame.getByRole('heading', { name: 'אותיות בזיכרון' })).toBeVisible({ timeout: 30_000 });
  await frame.getByRole('button', { name: 'English' }).click();
  await expect(frame.getByRole('heading', { name: 'Letters in Memory' })).toBeVisible();

  expect(apiCalls.filter(u => !u.includes('/api/create/status')), 'editing must not call the API').toEqual([]);
});

test('an edited title is saved in both copies — the definition and the spec', async ({ page }) => {
  await openRefine(page);
  await page.getByLabel('Experiment title in English').fill('Letters in Memory');

  // The spec's copy is what homepage registration sends, so it must not be left behind.
  await expect.poll(async () => {
    const saved = JSON.parse(await page.evaluate(k => localStorage.getItem(k as string) ?? '{}', DRAFT_KEY));
    return [saved.definition?.title, saved.spec?.title];
  }).toEqual(['Letters in Memory', 'Letters in Memory']);
});

test('an empty title is flagged', async ({ page }) => {
  await openRefine(page);
  await page.getByLabel('Experiment title in Hebrew').fill('');
  await expect(page.getByText(/A title is empty/)).toBeVisible();
});

test('publishing sends the edited title', async ({ page }) => {
  await serverNotInMock(page);
  await openRefine(page);
  await page.getByLabel('Experiment title in English').fill('Letters in Memory');

  let published = '';
  await page.route('**/api/create/publish', route => {
    published = route.request().postData() ?? '';
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: false, error: 'stopped for the test' }),
    });
  });
  await page.getByRole('button', { name: 'Finish & publish' }).click();
  await expect(page.getByText(/stopped for the test/)).toBeVisible();

  expect(JSON.parse(published).definition.title).toBe('Letters in Memory');
});

// A ported experiment ships as code and has no published row until someone edits it. That
// is the case the edit list could not handle at all: it read published rows, so the nine
// experiments a class actually runs were missing, and the Edit button would have reported
// them as unpublished even if they had been listed.
test('a ported experiment can be opened for editing before it has ever been published', async ({ page }) => {
  const apiCalls: string[] = [];
  page.on('request', r => { if (r.url().includes('/api/create/')) apiCalls.push(r.url()); });

  await serverNotInMock(page);
  // Nothing published at all — the state a fresh database is in.
  await page.route('**/rest/v1/**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.addInitScript(() => {
    sessionStorage.setItem('ss_home_authed', '1');
    sessionStorage.setItem('ss_create_key', 'placeholder');
  });

  await page.goto('/create');
  await expect(page.getByRole('heading', { name: 'Or edit one that is already live' })).toBeVisible();

  // Listed, and honest about what editing it will do.
  const row = page.locator('div.rounded-xl').filter({ hasText: '/run/drm · built in' });
  await expect(row).toBeVisible({ timeout: 10_000 });
  await expect(row).toContainText('editing publishes version 1');

  await row.getByRole('button', { name: 'Edit' }).click();

  // The Refine screen, holding the built-in definition rather than an error.
  await expect(page.getByRole('heading', { name: 'Refine' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByLabel('English instructions')).not.toHaveValue('');
  await expect(page.getByRole('heading', { name: 'Preview' })).toBeVisible();

  // And the hand edits work on it, which is the point of listing it: the title and the
  // instructions come from the built-in and can be changed without running a stage.
  await expect(page.getByLabel('Experiment title in English')).toHaveValue(/DRM|Memory/);

  // /status is the free health check the page polls; everything else is billed per call.
  expect(
    apiCalls.filter(u => !u.includes('/api/create/status')),
    'opening a built-in experiment must not call a metered route',
  ).toEqual([]);
});
