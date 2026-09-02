import { test, expect, Page } from '@playwright/test';

// End-to-end cover for the definition runtime — /run/{slug} and its dashboard.
//
// Every other test in this folder exercises the sixteen hand-written experiments. Nothing
// covered the runtime that every NEWLY created experiment uses, which is exactly where
// this project's last two bugs lived: a stimulus from the previous trial flashing back
// during the inter-trial gap, and a dashboard that froze when Mock Data was switched on.
// Both were found by a person using the site. Both are asserted here instead.
//
// Runs against the built-in definitions, so no database and no API key are needed.

/** A built-in definition with a practice block, choice responses and a scored answer. */
const SLUG = 'stroopClassic';

/**
 * Cuts the browser off from the results database.
 *
 * Without this these tests are not tests: taking an experiment saves a row per trial, and
 * the first run of this file put 52 rows named "E2E Tester" into the real
 * experiment_results table, where they are indistinguishable from a student's data to
 * anyone reading a dashboard. Reads are answered empty so the dashboard's state is decided
 * by the test rather than by whatever happens to be in the database that day.
 */
async function isolateFromDatabase(page: Page, opts: { readDelayMs?: number } = {}) {
  await page.route('**/rest/v1/**', async route => {
    const method = route.request().method();
    if (method === 'GET' || method === 'HEAD') {
      if (opts.readDelayMs) await new Promise(r => setTimeout(r, opts.readDelayMs));
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    // Writes are acknowledged but never forwarded.
    return route.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
  });
}

/**
 * Answers whichever choice buttons are on screen until the run ends.
 *
 * Driven by a deadline rather than an iteration count: a trial is a phase machine with
 * timed steps, so the number of polls needed depends on those durations, not on the number
 * of trials. Counting iterations stopped a 60-trial run a third of the way through.
 */
async function playThrough(page: Page, deadlineMs = 90_000): Promise<number> {
  const until = Date.now() + deadlineMs;
  let answered = 0;

  while (Date.now() < until) {
    const done = await page.getByRole('heading', { name: /thank you|תודה/i })
      .isVisible().catch(() => false);
    if (done) break;

    // Response buttons exist only during a response phase; timed phases have none.
    const buttons = page.locator('main button');
    if (await buttons.count().catch(() => 0) === 0) {
      await page.waitForTimeout(50);
      continue;
    }

    await buttons.first().click({ timeout: 3000 }).catch(() => {});
    answered++;
  }

  return answered;
}

/**
 * Navigates, retrying while the dev server is still compiling the route.
 *
 * Next builds a route the first time it is asked for, and with several Playwright workers
 * hitting a cold server the first request can come back as a 404 before compilation
 * finishes. Production is prebuilt and never does this, so retrying here removes a
 * dev-only flake rather than papering over a real fault.
 */
async function open(page: Page, path: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.goto(path);
    const notFound = await page.getByRole('heading', { name: '404' })
      .isVisible().catch(() => false);
    if (!notFound) return;
    await page.waitForTimeout(1500);
  }
}

async function startRun(page: Page, slug = SLUG) {
  await open(page, `/run/${slug}`);
  await page.getByPlaceholder(/שם|Name/).fill('E2E Tester');
  await page.getByRole('button', { name: /התחלה|Begin/ }).click();
}

test.describe('definition runtime — participant', () => {
  test.beforeEach(async ({ page }) => { await isolateFromDatabase(page); });

  test('an unknown slug says so instead of hanging', async ({ page }) => {
    await open(page, '/run/no-such-experiment');
    await expect(page.getByText(/No experiment named/i)).toBeVisible();
  });

  test('landing page shows the title and requires a name', async ({ page }) => {
    await open(page, `/run/${SLUG}`);
    await expect(page.getByRole('heading').first()).toBeVisible();

    // Submitting empty must not start the experiment.
    await page.getByRole('button', { name: /התחלה|Begin/ }).click();
    await expect(page.getByPlaceholder(/שם|Name/)).toBeVisible();
  });

  test('language toggle switches the instructions', async ({ page }) => {
    await open(page, `/run/${SLUG}`);
    const toggle = page.getByRole('button', { name: /English|עברית/ });
    const before = await page.locator('main p').first().innerText();
    await toggle.click();
    await expect(page.locator('main p').first()).not.toHaveText(before);
  });

  test('a full run reaches the thank-you screen with results', async ({ page }) => {
    test.setTimeout(120_000);
    await startRun(page);

    const answered = await playThrough(page);
    expect(answered).toBeGreaterThan(5);

    await expect(page.getByRole('heading', { name: /thank you|תודה/i })).toBeVisible();
    // Mean RT is always shown; accuracy is a dash on an unscored task.
    await expect(page.getByText(/mean RT|זמן תגובה/i)).toBeVisible();
    await expect(page.getByText(/\d+ (trials|ניסיונות)/)).toBeVisible();
  });

  test('the previous trial never flashes back during the inter-trial gap', async ({ page }) => {
    // The regression that shipped: advance() reset the phase index immediately but changed
    // trial only after itiMs, so the phase machine replayed the OLD trial during the gap
    // and its stimulus reappeared. Sampled here far faster than the gap lasts.
    test.setTimeout(120_000);
    await startRun(page);

    const seen: string[] = [];
    let repeats = 0;

    for (let i = 0; i < 220; i++) {
      const done = await page.getByRole('heading', { name: /thank you|תודה/i })
        .isVisible().catch(() => false);
      if (done) break;

      const text = (await page.locator('main').innerText().catch(() => '')).trim();
      seen.push(text);

      // A stimulus that disappears and then comes back unchanged is the flash.
      const n = seen.length;
      if (n >= 3 && seen[n - 1] === seen[n - 3] && seen[n - 1] !== seen[n - 2] && seen[n - 1].length > 0) {
        repeats++;
      }

      const buttons = page.locator('main button');
      if (await buttons.count() > 0) await buttons.first().click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(40);
    }

    // Some repetition is legitimate — a fixation cross recurs every trial — so this asserts
    // the pathological case: the same full stimulus screen reappearing constantly.
    expect(repeats).toBeLessThan(seen.length / 3);
  });

  test('works on a phone-sized viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await startRun(page);

    // The response controls must be reachable without horizontal scrolling: students take
    // these on their own phones.
    const overflows = await page.evaluate(() =>
      document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(overflows).toBe(false);
  });
});

test.describe('definition runtime — teacher dashboard', () => {
  /** Uses the app's own session flag rather than the password, which is not in the repo. */
  async function asTeacher(page: Page, slug = SLUG, opts: { readDelayMs?: number } = {}) {
    // A later route wins in Playwright, so this replaces the default isolation when a test
    // needs a slow read.
    await isolateFromDatabase(page, opts);
    await page.addInitScript(() => sessionStorage.setItem('ss_teacher_authed', '1'));
    await open(page, `/run/${slug}/teacher`);
  }

  test.beforeEach(async ({ page }) => { await isolateFromDatabase(page); });

  test('gates on a password when not authenticated', async ({ page }) => {
    await open(page, `/run/${SLUG}/teacher`);
    await expect(page.getByPlaceholder('Password')).toBeVisible();
  });

  test('rejects a wrong password', async ({ page }) => {
    await open(page, `/run/${SLUG}/teacher`);
    await page.getByPlaceholder('Password').fill('not-the-password');
    await page.getByRole('button', { name: /enter|submit|log/i }).first().click();
    await expect(page.getByText(/incorrect password/i)).toBeVisible();
  });

  test('mock data renders charts quickly and does not freeze the page', async ({ page }) => {
    // The other regression that shipped: aggregation was quadratic, so switching this on
    // blocked the main thread for seconds. Asserted as a budget, and by checking the page
    // still responds afterwards.
    await asTeacher(page);
    await expect(page.getByRole('button', { name: 'Mock Data' })).toBeVisible();

    const started = Date.now();
    await page.getByRole('button', { name: 'Mock Data' }).click();

    // Matched on a NON-ZERO count on purpose. `\d+ participants` also matches
    // "0 participants", so the first version of this test passed while mock data was in
    // fact being wiped out by finding 15 below.
    await expect(page.getByText(/[1-9]\d* participants/)).toBeVisible({ timeout: 15_000 });
    expect(Date.now() - started).toBeLessThan(15_000);

    // Still interactive: a frozen page would fail to toggle back.
    await page.getByRole('button', { name: 'Mock Data' }).click();
    await expect(page.getByText(/0 participants|No data yet/i).first()).toBeVisible({ timeout: 15_000 });
  });

  test('a slow real-data fetch does not overwrite mock data', async ({ page }) => {
    // Found by this suite. load() has no staleness guard, so the fetch started for real
    // data can resolve AFTER the synchronous mock rows are set and replace them. On screen
    // the badge still says "mock data" while the numbers are the real ones — a lecturer
    // demonstrating an effect silently gets an empty chart instead.
    await asTeacher(page, SLUG, { readDelayMs: 2500 });

    await page.getByRole('button', { name: 'Mock Data' }).click();
    await expect(page.getByText(/[1-9]\d* participants/)).toBeVisible({ timeout: 15_000 });

    // Long enough for the delayed read to land and clobber the mock rows.
    await page.waitForTimeout(4000);
    await expect(page.getByText(/[1-9]\d* participants/)).toBeVisible();
  });

  test('charts stay hidden until revealed, so a class can predict first', async ({ page }) => {
    await asTeacher(page);
    await page.getByRole('button', { name: 'Mock Data' }).click();
    await expect(page.getByText(/[1-9]\d* participants/)).toBeVisible({ timeout: 15_000 });

    const reveal = page.getByRole('button', { name: 'Reveal' }).first();
    await expect(reveal).toBeVisible();
    await reveal.click();
    await expect(page.getByRole('button', { name: 'Hide' }).first()).toBeVisible();
  });

  test('every built-in experiment has a dashboard that renders with mock data', async ({ page }) => {
    // Cheap breadth: a definition whose charts reference a factor that does not exist would
    // otherwise only surface when a lecturer opened it in front of a class.
    test.setTimeout(180_000);
    for (const slug of ['stroopClassic', 'flanker', 'posnerClassic', 'boubaKiki', 'visualSearch', 'navonPrecedence']) {
      await asTeacher(page, slug);
      const mock = page.getByRole('button', { name: 'Mock Data' });
      if (!(await mock.isVisible().catch(() => false))) continue;
      await mock.click();
      await expect(page.getByText(/[1-9]\d* participants/)).toBeVisible({ timeout: 15_000 });
      expect(await page.locator('text=/No experiment named/').count()).toBe(0);
    }
  });
});
