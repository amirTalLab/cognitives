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
) as { slug: string; title: string; titleHe: string };

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
