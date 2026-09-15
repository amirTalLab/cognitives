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
    for (const slug of ['stroopClassic', 'flanker', 'posnerClassic', 'boubaKiki', 'visualSearch', 'navonPrecedence', 'posnerCueing']) {
      await asTeacher(page, slug);
      const mock = page.getByRole('button', { name: 'Mock Data' });
      if (!(await mock.isVisible().catch(() => false))) continue;
      await mock.click();
      await expect(page.getByText(/[1-9]\d* participants/)).toBeVisible({ timeout: 15_000 });
      expect(await page.locator('text=/No experiment named/').count()).toBe(0);
    }
  });
});

// ── Timeouts, withheld responses, early presses ─────────────────────────────
//
// Added with the Posner port. The unit tests pin down the rules; these check the runner
// actually applies them in a browser — the part a timer bug or a double-fired key would
// break — and what reaches the database for each outcome.
//
// Each scenario is a one- or two-trial definition handed to /run through the preview store,
// the same channel /create uses, so no timing depends on a long real experiment.

type Row = Record<string, unknown>;

function speeded(slug: string, kind: 'go' | 'nogo', trialOver: Record<string, unknown> = {}) {
  return {
    version: 1, slug, title: 'Speeded', titleHe: 'מהירות', category: 'ATTENTION',
    instructions: { en: 'Press when you see go.', he: 'לחצו כשמופיע go.' },
    factors: [{ name: 'kind', levels: [kind] }],
    repetitions: 1,
    trial: {
      phases: [
        { name: 'wait', display: { kind: 'fixation' }, durationMs: 300 },
        { name: 'go', display: { kind: 'text', text: '{kind}' }, awaitsResponse: true, startsClock: true, timeoutMs: 700 },
      ],
      response: { kind: 'choice', options: [{ value: 'press', label: 'Press', labelHe: 'לחצו', key: 'space' }] },
      correct: { kind: 'mapping', factor: 'kind', expect: { go: 'press', nogo: 'none' } },
      itiMs: 100,
      feedback: {
        durationMs: 1200, inMain: true,
        timeout: { en: 'Missed', he: 'פספוס' },
        incorrect: { en: 'Wrong', he: 'שגוי' },
        early: { en: 'Too early', he: 'מוקדם מדי' },
      },
      ...trialOver,
    },
    store: ['kind'],
    dashboard: { charts: [{ title: 'c', kind: 'bar', groupBy: 'kind', measure: 'accuracy' }] },
  };
}

/** Runs a definition from the preview store, in English, returning every row it saves. */
async function runPreview(page: Page, def: { slug: string } & Row): Promise<Row[]> {
  const saved: Row[] = [];
  // Registered after the suite's isolation route, so it wins for this table.
  await page.route('**/rest/v1/experiment_results**', async route => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      saved.push(...(Array.isArray(body) ? body : [body]));
    }
    return route.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
  });
  await page.addInitScript(([key, value]) => sessionStorage.setItem(key, value),
    ['cognitives_preview_definitions', JSON.stringify({ [def.slug]: def })] as const);

  await open(page, `/run/${def.slug}`);
  await page.getByRole('button', { name: 'English' }).click();
  await page.getByPlaceholder('Name').fill('E2E Tester');
  await page.getByRole('button', { name: 'Begin' }).click();
  return saved;
}

const thanks = (page: Page) => page.getByRole('heading', { name: /thank you/i });

test.describe('definition runtime — timeouts and withheld responses', () => {
  test.beforeEach(async ({ page }) => { await isolateFromDatabase(page); });

  test('a go trial left unanswered times out as a miss, with no reaction time', async ({ page }) => {
    const saved = await runPreview(page, speeded('e2eMiss', 'go'));
    await expect(page.getByText('Missed')).toBeVisible({ timeout: 5000 });
    await expect(thanks(page)).toBeVisible({ timeout: 10_000 });
    await expect.poll(() => saved.length).toBe(1);
    expect(saved[0]).toMatchObject({ response: 'none', is_correct: false, reaction_time_ms: null });
  });

  test('a no-go trial left alone is correct, and shows no message', async ({ page }) => {
    const saved = await runPreview(page, speeded('e2eWithhold', 'nogo'));
    await expect(thanks(page)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('100%')).toBeVisible();
    await expect.poll(() => saved.length).toBe(1);
    expect(saved[0]).toMatchObject({ response: 'none', is_correct: true, reaction_time_ms: null });
  });

  test('pressing before the target is caught as too early', async ({ page }) => {
    const saved = await runPreview(page, speeded('e2eEarly', 'go', {
      phases: [
        { name: 'wait', display: { kind: 'fixation' }, durationMs: 4000 },
        { name: 'go', display: { kind: 'text', text: '{kind}' }, awaitsResponse: true, startsClock: true, timeoutMs: 700 },
      ],
      earlyFrom: 'wait',
    }));
    // Already on screen during the wait — which is what makes an early press possible at all.
    await page.getByRole('button', { name: /Press/ }).click();
    await expect(page.getByText('Too early')).toBeVisible();
    await expect(thanks(page)).toBeVisible({ timeout: 10_000 });
    await expect.poll(() => saved.length).toBe(1);
    expect(saved[0]).toMatchObject({ response: 'early', is_correct: false, reaction_time_ms: null });
  });

  test('without earlyFrom the button does not appear before the response phase', async ({ page }) => {
    await runPreview(page, speeded('e2eNoEarly', 'go', {
      phases: [
        { name: 'wait', display: { kind: 'fixation' }, durationMs: 1500 },
        { name: 'go', display: { kind: 'text', text: '{kind}' }, awaitsResponse: true, startsClock: true, timeoutMs: 3000 },
      ],
    }));
    await expect(page.getByText('+', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /Press/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Press/ })).toBeVisible({ timeout: 5000 });
  });

  test('space answers each trial exactly once, and never skips the next one', async ({ page }) => {
    const def = speeded('e2eSpace', 'go', {
      phases: [
        { name: 'wait', display: { kind: 'fixation' }, durationMs: 300 },
        { name: 'go', display: { kind: 'text', text: '{kind}' }, awaitsResponse: true, startsClock: true, timeoutMs: 5000 },
      ],
    });
    const saved = await runPreview(page, { ...def, repetitions: 2 });

    await expect(page.getByText('go', { exact: true })).toBeVisible();
    await page.keyboard.press('Space');
    await page.keyboard.press('Space');

    await expect(page.getByText('2 / 2')).toBeVisible();
    await expect(page.getByText('go', { exact: true })).toBeVisible();
    await page.keyboard.press('Space');

    await expect(thanks(page)).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(500);
    expect(saved.map(r => r.trial_index)).toEqual([0, 1]);
    for (const r of saved) {
      expect(r).toMatchObject({ response: 'press', is_correct: true });
      expect(typeof r.reaction_time_ms).toBe('number');
    }
  });
});

test.describe('definition runtime — practice, saving and endings', () => {
  test.beforeEach(async ({ page }) => { await isolateFromDatabase(page); });

  test('practice ends on a practice-complete screen, and unrecorded practice saves nothing', async ({ page }) => {
    const def = { ...speeded('e2ePractice', 'go'), practice: { count: 1, feedback: false, record: false } };
    const saved = await runPreview(page, def);

    // The one practice trial times out, and then the pause before the real block.
    await expect(page.getByRole('heading', { name: 'Practice complete!' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('1 trials')).toBeVisible();
    expect(saved).toHaveLength(0);

    await page.getByRole('button', { name: 'Start' }).click();
    await expect(thanks(page)).toBeVisible({ timeout: 10_000 });
    await expect.poll(() => saved.length).toBe(1);
    expect(saved[0]).toMatchObject({ is_practice: false });
  });

  test('a too-early press can be discarded: the message shows and nothing is saved', async ({ page }) => {
    const saved = await runPreview(page, speeded('e2eDiscardEarly', 'go', {
      phases: [
        { name: 'wait', display: { kind: 'fixation' }, durationMs: 4000 },
        { name: 'go', display: { kind: 'text', text: '{kind}' }, awaitsResponse: true, startsClock: true, timeoutMs: 700 },
      ],
      earlyFrom: 'wait',
      recordEarly: false,
    }));
    await page.getByRole('button', { name: /Press/ }).click();
    await expect(page.getByText('Too early')).toBeVisible();
    await expect(thanks(page)).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(500);
    expect(saved).toHaveLength(0);
  });

  test('itiDisplay stays up between trials, and feedback.display replaces the stimulus under a message', async ({ page }) => {
    const def = speeded('e2eScreens', 'go', {
      itiMs: 2000,
      itiDisplay: { kind: 'text', text: 'BETWEEN TRIALS' },
      feedback: {
        durationMs: 1500, inMain: true,
        timeout: { en: 'Missed', he: 'פספוס' },
        display: { kind: 'text', text: 'UNDER THE MESSAGE' },
      },
    });
    await runPreview(page, { ...def, repetitions: 2 });

    await expect(page.getByText('Missed')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('UNDER THE MESSAGE')).toBeVisible();
    await expect(page.getByText('go', { exact: true })).toHaveCount(0);

    await expect(page.getByText('BETWEEN TRIALS')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Missed')).toHaveCount(0);
  });

  test('a definition can make the name optional and end on a plain thank-you', async ({ page }) => {
    const def = {
      ...speeded('e2eEnding', 'nogo'),
      nameOptional: true,
      thanks: { title: { en: 'All done', he: 'סיימנו' }, showResults: false },
    };
    await page.addInitScript(([key, value]) => sessionStorage.setItem(key, value),
      ['cognitives_preview_definitions', JSON.stringify({ [def.slug]: def })] as const);
    await open(page, `/run/${def.slug}`);
    await page.getByRole('button', { name: 'English' }).click();
    // No name typed.
    await page.getByRole('button', { name: 'Begin' }).click();

    await expect(page.getByRole('heading', { name: 'All done' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/mean RT/i)).toHaveCount(0);
  });
});

test.describe('Posner cueing — definition port', () => {
  test.beforeEach(async ({ page }) => { await isolateFromDatabase(page); });

  async function begin(page: Page) {
    await open(page, '/run/posnerCueing');
    await page.getByRole('button', { name: 'English' }).click();
    await page.getByPlaceholder('Name').fill('E2E Tester');
    await page.getByRole('button', { name: 'Begin' }).click();
  }

  test('eight practice trials, then the practice-complete screen, with nothing from practice saved', async ({ page }) => {
    test.setTimeout(150_000);
    const saved: Row[] = [];
    await page.route('**/rest/v1/experiment_results**', async route => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        saved.push(...(Array.isArray(body) ? body : [body]));
      }
      return route.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
    });
    await begin(page);

    // Answer each target as it appears; catch trials simply time out.
    const done = page.getByRole('heading', { name: 'Practice complete!' });
    const target = page.getByText('●', { exact: true });
    const deadline = Date.now() + 100_000;
    while (Date.now() < deadline && !(await done.isVisible().catch(() => false))) {
      if (await target.isVisible().catch(() => false)) await page.keyboard.press('Space');
      await page.waitForTimeout(50);
    }

    await expect(done).toBeVisible();
    await expect(page.getByText('132 trials')).toBeVisible();
    expect(saved).toHaveLength(0);

    await page.getByRole('button', { name: 'Start' }).click();
    await expect(page.getByText('1 / 132')).toBeVisible();
  });

  test('its dashboard shows the original stat cards', async ({ page }) => {
    await page.addInitScript(() => sessionStorage.setItem('ss_teacher_authed', '1'));
    await open(page, '/run/posnerCueing/teacher');
    await page.getByRole('button', { name: 'Mock Data' }).click();
    await expect(page.getByText(/15 participants/)).toBeVisible({ timeout: 15_000 });

    for (const label of ['Avg Valid RT', 'Avg Invalid RT', 'Avg Validity Effect']) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }
    await expect(page.getByText(/^\+\d+ms$/)).toBeVisible();
  });

  test('the button is up from fixation, and pressing then is too early', async ({ page }) => {
    await begin(page);
    // Fixation is 800ms at its shortest, so a press straight away is an anticipation.
    await page.getByRole('button', { name: /Press/ }).click();
    await expect(page.getByText('Too early — wait for the ●!')).toBeVisible();
  });

  test('fits a phone without horizontal scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await begin(page);
    await expect(page.getByRole('button', { name: /Press/ })).toBeVisible();
    const overflows = await page.evaluate(() =>
      document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(overflows).toBe(false);
  });

  test('its dashboard draws all three charts from mock data', async ({ page }) => {
    await page.addInitScript(() => sessionStorage.setItem('ss_teacher_authed', '1'));
    await open(page, '/run/posnerCueing/teacher');
    await page.getByRole('button', { name: 'Mock Data' }).click();
    await expect(page.getByText(/15 participants/)).toBeVisible({ timeout: 15_000 });

    const reveals = page.getByRole('button', { name: 'Reveal' });
    await expect(reveals).toHaveCount(3);
    for (let i = 0; i < 3; i++) await reveals.first().click();
    await expect(page.getByRole('button', { name: 'Hide' })).toHaveCount(3);
    // One wrapper per chart. Not .recharts-surface: each legend icon is a surface too.
    await expect(page.locator('.recharts-wrapper')).toHaveCount(3);
  });
});
