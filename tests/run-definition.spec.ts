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

  // The Stroop port's dashboard is the first to use two-measure scatters, where a point is
  // one participant placed by two different measures. Computing them right is covered by
  // unit tests; this is that they actually draw.
  test('the Stroop port draws its three charts, including the two-measure scatters', async ({ page }) => {
    await asTeacher(page, 'stroop');
    await page.getByRole('button', { name: 'Mock Data' }).click();
    await expect(page.getByText(/[1-9]\d* participants/)).toBeVisible({ timeout: 15_000 });

    await expect(page.getByText('Reaction Time by Language Group')).toBeVisible();
    await expect(page.getByText('Individual Subject Averages')).toBeVisible();
    await expect(page.getByText('Speed-Accuracy Tradeoff')).toBeVisible();

    // Reveal them all, re-querying each time: revealing one re-renders the cards, which
    // detaches any handles collected up front.
    for (let i = 0; i < 5; i++) {
      const reveal = page.getByRole('button', { name: 'Reveal' });
      if (await reveal.count() === 0) break;
      await reveal.first().click();
    }
    // Counted rather than checked for visibility: a series with no value in a group — the
    // congruent bar for non-words — renders as a zero-height rect, which is not "visible".
    expect(await page.locator('.recharts-bar-rectangle').count()).toBeGreaterThan(0);
    expect(await page.locator('.recharts-scatter-symbol').count()).toBeGreaterThan(0);

    // Non-words carry their own condition, so the bar chart shows it as its own series.
    await expect(page.locator('.recharts-legend-item-text', { hasText: 'baseline' }).first()).toBeVisible();
  });

  test('every built-in experiment has a dashboard that renders with mock data', async ({ page }) => {
    // Cheap breadth: a definition whose charts reference a factor that does not exist would
    // otherwise only surface when a lecturer opened it in front of a class.
    test.setTimeout(180_000);
    for (const slug of ['stroopClassic', 'flanker', 'posnerClassic', 'boubaKiki', 'visualSearch', 'navonPrecedence', 'posnerCueing', 'stroop', 'wordSuperiority', 'bouba-kiki']) {
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

/**
 * Rows the runner sent, and whether the server could send any at all.
 *
 * The runner only saves when a Supabase client exists: getSupabase() returns null without
 * credentials, and saving is then silently a no-op. CI runs without credentials on purpose
 * — no test may write to the real database — so there a row is never sent and there is
 * nothing to intercept. `databaseOff` records that, from the warning getSupabase() logs,
 * so a test can tell "saved nothing" apart from "could not have saved anything".
 */
type Saved = Row[] & { databaseOff?: boolean };

/**
 * Waits for `count` rows, or for proof that none could be sent, and says which.
 *
 * What the participant SAW is asserted either way. Only what would have been stored goes
 * unchecked on a server with no database, and the report is annotated so it cannot pass
 * for a check that ran.
 */
async function rowsSent(saved: Saved, count: number): Promise<boolean> {
  await expect.poll(() => saved.length >= count || saved.databaseOff === true, {
    message: 'no row was sent, and no "Supabase credentials not configured" warning either',
  }).toBe(true);
  if (saved.databaseOff) {
    test.info().annotations.push({
      type: 'note',
      description: 'Supabase is not configured on this server, so the rows the runner would save were not checked.',
    });
    return false;
  }
  return true;
}

/** Runs a definition from the preview store, in English, returning every row it saves. */
async function runPreview(page: Page, def: { slug: string } & Row): Promise<Saved> {
  const saved: Saved = [];
  page.on('console', msg => {
    if (msg.text().includes('Supabase credentials not configured')) saved.databaseOff = true;
  });
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
    if (await rowsSent(saved, 1)) {
      expect(saved[0]).toMatchObject({ response: 'none', is_correct: false, reaction_time_ms: null });
    }
  });

  test('a no-go trial left alone is correct, and shows no message', async ({ page }) => {
    const saved = await runPreview(page, speeded('e2eWithhold', 'nogo'));
    await expect(thanks(page)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('100%')).toBeVisible();
    if (await rowsSent(saved, 1)) {
      expect(saved[0]).toMatchObject({ response: 'none', is_correct: true, reaction_time_ms: null });
    }
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
    if (await rowsSent(saved, 1)) {
      expect(saved[0]).toMatchObject({ response: 'early', is_correct: false, reaction_time_ms: null });
    }
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
    if (await rowsSent(saved, 2)) {
      // A moment longer, so a duplicate row sent late would still be caught.
      await page.waitForTimeout(500);
      expect(saved.map(r => r.trial_index)).toEqual([0, 1]);
      for (const r of saved) {
        expect(r).toMatchObject({ response: 'press', is_correct: true });
        expect(typeof r.reaction_time_ms).toBe('number');
      }
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
    if (await rowsSent(saved, 1)) {
      expect(saved[0]).toMatchObject({ is_practice: false });
    }
  });

  // Practice that drills the response mapping rather than sampling the design — Stroop's,
  // where a wrong answer keeps the same trial up with the right key marked. The runner must
  // not settle, save or advance on that answer, and must never do this in the main block.
  test('practice can retry until correct, marking the right option and keeping the trial', async ({ page }) => {
    const def = {
      version: 1, slug: 'e2eRetry', title: 'Retry practice', titleHe: 'תרגול', category: 'EXECUTIVE CONTROL',
      instructions: { en: 'Press the colour of the word.', he: 'לחצו על הצבע.' },
      factors: [{ name: 'colour', levels: ['red'] }],
      repetitions: 1,
      practice: { count: 1, feedback: true, retryUntilCorrect: true, record: false },
      trial: {
        phases: [{ name: 'go', display: { kind: 'text', text: '{colour}' }, awaitsResponse: true, startsClock: true }],
        response: {
          kind: 'choice', layout: 'row',
          options: [{ value: 'red', label: 'RED' }, { value: 'blue', label: 'BLUE' }],
        },
        correct: { kind: 'matchesFactor', factor: 'colour' },
      },
      store: ['colour'],
      dashboard: { charts: [{ title: 'RT', kind: 'bar', groupBy: 'colour', measure: 'meanRt' }] },
    };
    const saved = await runPreview(page, def);

    await expect(page.getByText('Practice · 1 / 1')).toBeVisible({ timeout: 10_000 });

    // Wrong answer: the trial does NOT advance, and the correct option is marked.
    await page.getByRole('button', { name: 'BLUE' }).click();
    await expect(page.getByRole('button', { name: 'RED' })).toHaveClass(/border-emerald-400/);
    await expect(page.getByText('Practice · 1 / 1')).toBeVisible();
    await expect(page.getByText('red', { exact: true })).toBeVisible();
    // Still waiting on an answer, so no feedback overlay and no Next button. Exact, because
    // the dev server's own "Next.js Dev Tools" button otherwise matches a substring search.
    await expect(page.getByRole('button', { name: 'Next', exact: true })).toHaveCount(0);

    // The right answer settles it the usual way.
    await page.getByRole('button', { name: 'RED' }).click();
    await expect(page.getByText('Correct')).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Practice complete!' })).toBeVisible({ timeout: 10_000 });

    // Retried practice is still practice: nothing reached the database.
    expect(saved).toHaveLength(0);
  });

  // The Stroop port in a real browser. Its practice will not advance on a wrong answer, so
  // the only way through is to read the ink colour off the screen and press that key —
  // which is also the strongest check that the stimulus is coloured by the definition.
  test('the Stroop port runs: practice is answered by ink colour, not by the word', async ({ page }) => {
    const RGB_TO_KEY: Record<string, string> = {
      'rgb(244, 63, 94)': 'r',   // #f43f5e
      'rgb(52, 211, 153)': 'g',  // #34d399
      'rgb(251, 191, 36)': 'y',  // #fbbf24
    };

    await open(page, '/run/stroop');
    await page.getByRole('button', { name: 'English' }).click();
    await page.getByPlaceholder(/שם|Name/).fill('E2E Tester');
    await page.getByRole('button', { name: 'Begin' }).click();

    for (let i = 0; i < 5; i++) {
      const word = page.locator('div.select-none').first();
      await expect(word).toBeVisible({ timeout: 10_000 });
      const rgb = await word.evaluate(el => getComputedStyle(el).color);
      const key = RGB_TO_KEY[rgb];
      expect(key, `practice trial ${i + 1} had an unexpected ink colour: ${rgb}`).toBeTruthy();
      await page.keyboard.press(key);
      await page.getByRole('button', { name: 'Next', exact: true }).click();
    }

    await expect(page.getByRole('heading', { name: 'Practice complete!' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('36 trials')).toBeVisible();
  });

  // The word-superiority port: a 150ms flash, then a mask of # that must replace it, then
  // two letters. The flash is the whole experiment — if an animation swallowed it, or the
  // mask failed to cover it, the task would measure something else entirely.
  test('the word superiority port flashes a string and masks it', async ({ page }) => {
    await open(page, '/run/wordSuperiority');
    await page.getByRole('button', { name: 'English' }).click();
    await page.getByPlaceholder(/שם|Name/).fill('E2E Tester');
    await page.getByRole('button', { name: 'Begin' }).click();

    // The mask is one # per letter, and it is on screen long enough (500ms) to catch.
    await expect(page.getByText(/^#{3,4}$/)).toBeVisible({ timeout: 10_000 });

    // Then two single-letter buttons — the forced choice.
    const letters = page.locator('main button').filter({ hasText: /^.$/ });
    await expect(letters).toHaveCount(2, { timeout: 10_000 });

    // Practice scores each answer, so the next trial waits behind the feedback.
    await letters.first().click();
    await expect(page.getByText(/Correct|Incorrect/)).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/Practice · 1 \/ 6/)).toBeVisible();

    // On to the next one. The mask is only up for 500ms, so the stable signal that the
    // trial advanced is the counter and the letters coming back — catching the mask a
    // second time would just be a race with the poll interval.
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.getByText(/Practice · 2 \/ 6/)).toBeVisible({ timeout: 10_000 });
    await expect(letters).toHaveCount(2, { timeout: 10_000 });
  });

  // Bouba-kiki mixes two kinds of trial in one block: most offer two SHAPES to choose
  // between, its control trials two WORDS. The options differ in kind, not just in value,
  // so this is the check that a definition can swap the whole set per trial.
  test('bouba-kiki offers shapes on a main trial and words on a control trial', async ({ page }) => {
    await open(page, '/run/bouba-kiki');
    await page.getByRole('button', { name: 'English' }).click();
    await page.getByPlaceholder(/שם|Name/).fill('E2E Tester');
    await page.getByRole('button', { name: 'Begin' }).click();

    let sawShapes = false;
    let sawWords = false;

    // 16 trials, shuffled, four of which are control trials — both kinds turn up well
    // inside a full pass.
    for (let i = 0; i < 16 && !(sawShapes && sawWords); i++) {
      const options = page.locator('main button');
      await expect(options).toHaveCount(2, { timeout: 10_000 });

      if (await page.getByRole('button', { name: /^(BOUBA|KIKI)$/ }).count() === 2) sawWords = true;
      else if (await page.locator('main button svg path').count() === 2) sawShapes = true;

      await options.first().click();
    }

    expect(sawShapes, 'never saw a main trial offering two shapes').toBe(true);
    expect(sawWords, 'never saw a control trial offering BOUBA / KIKI').toBe(true);
  });

  // Several hand-built experiments are not one block but a sequence of them: DRM studies a
  // list then asks for recall, serial order puts a distractor between, SRT follows its main
  // task with a generation test. Each block asks a different question and stores different
  // fields, so this walks a two-block definition end to end and checks the rows can be told
  // apart afterwards.
  test('an experiment can run several blocks, and each row says which it came from', async ({ page }) => {
    const def = {
      version: 1, slug: 'e2eStages', title: 'Two blocks', titleHe: 'שני שלבים', category: 'MEMORY',
      instructions: { en: 'Remember the word.', he: 'זכרו את המילה.' },
      stageName: 'study',
      factors: [{ name: 'word', levels: ['APPLE'] }],
      repetitions: 1,
      trial: {
        phases: [{ name: 'show', display: { kind: 'text', text: '{word}' }, awaitsResponse: true, startsClock: true }],
        response: { kind: 'choice', options: [{ value: 'seen', label: 'Seen it' }] },
        correct: { kind: 'none' },
      },
      store: ['word'],
      stages: [{
        name: 'recall',
        title: { en: 'Recall', he: 'היזכרות' },
        instructions: { en: 'Now say whether you saw it.', he: 'עכשיו אמרו אם ראיתם.' },
        factors: [{ name: 'probe', levels: ['APPLE'] }],
        repetitions: 1,
        trial: {
          phases: [{ name: 'ask', display: { kind: 'text', text: 'Saw {probe}?' }, awaitsResponse: true, startsClock: true }],
          response: { kind: 'choice', options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] },
          correct: { kind: 'none' },
        },
        store: ['probe'],
      }],
      dashboard: { charts: [{ title: 'Trials per block', kind: 'bar', groupBy: 'stage', measure: 'count' }] },
    };

    const saved = await runPreview(page, def);

    // Block one: the study word, and its own single button.
    await expect(page.getByText('APPLE')).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Seen it' }).click();

    // Between blocks: what is coming, and a button to start it.
    await expect(page.getByRole('heading', { name: 'Recall' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Now say whether you saw it.')).toBeVisible();
    await page.getByRole('button', { name: 'Continue' }).click();

    // Block two asks a different question, with different options.
    await expect(page.getByText('Saw APPLE?')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'Yes' })).toBeVisible();
    await page.getByRole('button', { name: 'Yes' }).click();

    await expect(thanks(page)).toBeVisible({ timeout: 10_000 });

    if (await rowsSent(saved, 2)) {
      const byStage = Object.fromEntries(saved.map(r => [
        (r.payload as Record<string, unknown>).stage,
        (r.payload as Record<string, unknown>),
      ]));
      expect(Object.keys(byStage).sort()).toEqual(['recall', 'study']);
      // Each block stored its own fields, not the other's.
      expect(byStage.study).toMatchObject({ word: 'APPLE' });
      expect(byStage.recall).toMatchObject({ probe: 'APPLE' });
      expect(saved.map(r => r.response).sort()).toEqual(['seen', 'yes']);
    }
  });

  // A study list asks nothing: each word is shown and the trial ends by itself. Worth an
  // end-to-end test rather than an offline one because the failure was never in the data —
  // the phase index walked off the end of the list and the runner rendered nothing for ever,
  // which no amount of checking the built trials would have shown.
  test('a block that asks nothing plays its phases, ends by itself, and records what was shown', async ({ page }) => {
    const def = {
      version: 1, slug: 'e2ePassive', title: 'Study list', titleHe: 'רשימה', category: 'MEMORY',
      instructions: { en: 'Remember these words.', he: 'זכרו את המילים.' },
      stageName: 'study',
      factors: [{ name: 'word', levels: ['BED', 'REST', 'AWAKE'] }],
      repetitions: 1,
      order: 'fixed',
      trial: {
        phases: [
          { name: 'word', display: { kind: 'text', text: '{word}' }, durationMs: 400 },
          { name: 'blank', display: { kind: 'blank' }, durationMs: 100 },
        ],
        response: { kind: 'none' },
        correct: { kind: 'none' },
      },
      itiMs: 100,
      store: ['word'],
      stages: [{
        name: 'recall',
        title: { en: 'Recall', he: 'היזכרות' },
        instructions: { en: 'Which did you see?', he: 'מה ראיתם?' },
        factors: [{ name: 'probe', levels: ['BED'] }],
        repetitions: 1,
        trial: {
          phases: [{ name: 'ask', display: { kind: 'text', text: 'Saw {probe}?' }, awaitsResponse: true, startsClock: true }],
          response: { kind: 'choice', options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] },
          correct: { kind: 'none' },
        },
        store: ['probe'],
      }],
      dashboard: { charts: [{ title: 'Shown', kind: 'bar', groupBy: 'word', measure: 'count' }] },
    };

    const saved = await runPreview(page, def);

    // The words play themselves, in the order written, with nothing to press.
    await expect(page.getByText('BED')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('main button')).toHaveCount(0);
    await expect(page.getByText('AWAKE')).toBeVisible({ timeout: 10_000 });

    // The block ended on its own — this is the assertion the deadlock would have failed.
    await expect(page.getByRole('heading', { name: 'Recall' })).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Yes' }).click();
    await expect(thanks(page)).toBeVisible({ timeout: 10_000 });

    if (await rowsSent(saved, 4)) {
      const shown = saved.filter(r => (r.payload as Record<string, unknown>).stage === 'study');
      expect(shown.map(r => (r.payload as Record<string, unknown>).word)).toEqual(['BED', 'REST', 'AWAKE']);
      // Presented, not answered: a recorded reaction time here would be the milliseconds
      // since the block began, dressed up as a response.
      expect(shown.every(r => r.response === 'shown')).toBe(true);
      expect(shown.every(r => r.reaction_time_ms === null)).toBe(true);
      expect(shown.every(r => r.is_correct === null)).toBe(true);
    }
  });

  // A filled delay is measured in seconds, not trials: it has to last the same time for a
  // fast participant as for a slow one, which is the whole reason it is there.
  test('a block bounded by a clock ends itself, however many trials were answered', async ({ page }) => {
    const def = {
      version: 1, slug: 'e2eTimed', title: 'Filled delay', titleHe: 'השהיה', category: 'MEMORY',
      instructions: { en: 'Odd or even?', he: 'זוגי או אי-זוגי?' },
      stageName: 'distractor',
      factors: [{ name: 'n', levels: Array.from({ length: 40 }, (_, i) => i + 10) }],
      repetitions: 1,
      endsAfterMs: 3000,
      trial: {
        phases: [{ name: 'ask', display: { kind: 'text', text: '{n}' }, awaitsResponse: true, startsClock: true }],
        response: { kind: 'choice', options: [{ value: 'odd', label: 'Odd' }, { value: 'even', label: 'Even' }] },
        correct: { kind: 'none' },
      },
      itiMs: 50,
      store: ['n'],
      dashboard: { charts: [{ title: 'Answered', kind: 'bar', groupBy: 'n', measure: 'count' }] },
    };

    const saved = await runPreview(page, def);

    // A countdown, not "trial 1 of 40" — there is no list to get through.
    await expect(page.getByText(/^\d+s$/)).toBeVisible({ timeout: 10_000 });

    // Answer a couple, then simply wait: the block has to end on its own.
    for (let i = 0; i < 2; i++) {
      await page.getByRole('button', { name: 'Odd' }).click();
      await page.waitForTimeout(150);
    }

    await expect(thanks(page)).toBeVisible({ timeout: 10_000 });

    // Only the answered trials were kept — the one on screen when the clock ran out was
    // abandoned, since nobody answered it.
    await page.waitForTimeout(500);
    expect(saved.length).toBe(2);
    expect(saved.every(r => r.response === 'odd')).toBe(true);
  });

  // The whole shape DRM and serial order are built from: study a list, then recall it. One
  // typed answer has to arrive as a row per studied word, or the serial-position curve and
  // the lure rate have nothing to group by.
  test('a typed recall list is saved as one row per studied word', async ({ page }) => {
    const studied = [
      { word: 'BED', serialPosition: 1, itemType: 'studied' },
      { word: 'REST', serialPosition: 2, itemType: 'studied' },
      { word: 'SLEEP', serialPosition: 0, itemType: 'lure' },
    ];
    const def = {
      version: 1, slug: 'e2eRecall', title: 'Recall', titleHe: 'היזכרות', category: 'MEMORY',
      instructions: { en: 'Remember the words.', he: 'זכרו את המילים.' },
      stageName: 'study',
      pools: { studied },
      // The study block shows the two real words — never the lure, which is the point.
      factors: [{ name: 'item', from: 'studied' }],
      exclude: [{ 'item.itemType': 'lure' }],
      repetitions: 1,
      order: 'fixed',
      trial: {
        phases: [
          { name: 'word', display: { kind: 'text', text: '{item.word}' }, durationMs: 400 },
          { name: 'blank', display: { kind: 'blank' }, durationMs: 100 },
        ],
        response: { kind: 'none' },
        correct: { kind: 'none' },
      },
      store: ['item.word'],
      stages: [{
        name: 'recall',
        title: { en: 'Recall', he: 'היזכרות' },
        instructions: { en: 'Type what you remember.', he: 'הקלידו מה שזכרתם.' },
        pools: { studied },
        factors: [{ name: 'listTheme', levels: ['SLEEP'] }],
        repetitions: 1,
        trial: {
          phases: [{ name: 'recall', display: { kind: 'text', text: 'What do you remember?' }, awaitsResponse: true, startsClock: true }],
          response: { kind: 'wordList' },
          correct: { kind: 'none' },
          recall: { against: 'studied', match: 'word', intrusions: true },
        },
        store: ['listTheme'],
      }],
      dashboard: {
        charts: [{
          title: 'Recall by position', kind: 'bar', groupBy: 'serialPosition',
          measure: 'proportion', ofResponse: 'recalled', filter: { stage: 'recall' },
        }],
      },
    };

    const saved = await runPreview(page, def);

    await expect(page.getByText('BED')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('heading', { name: 'Recall' })).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Continue' }).click();

    // Recall one studied word, miss the other, and volunteer the lure plus an intrusion.
    const box = page.locator('main input');
    for (const word of ['bed', 'sleep', 'banana']) {
      await box.fill(word);
      await box.press('Enter');
    }
    await page.getByRole('button', { name: /Done|סיימתי/ }).click();
    await expect(thanks(page)).toBeVisible({ timeout: 10_000 });

    if (await rowsSent(saved, 6)) {
      const recall = saved.filter(r => (r.payload as Record<string, unknown>).stage === 'recall');
      const byWord = Object.fromEntries(
        recall.map(r => [(r.payload as Record<string, unknown>).word, r]),
      );
      expect(byWord.BED.response).toBe('recalled');
      expect(byWord.REST.response).toBe('missed');
      expect(byWord.SLEEP.response).toBe('recalled');
      expect((byWord.SLEEP.payload as Record<string, unknown>).itemType).toBe('lure');
      // The typed word matching nothing is kept as an intrusion.
      expect(byWord.banana.response).toBe('recalled');
      expect((byWord.banana.payload as Record<string, unknown>).intrusion).toBe(true);
      // Not right or wrong, and no reaction time — one answer covered every word.
      expect(recall.every(r => r.is_correct === null)).toBe(true);
      expect(recall.every(r => r.reaction_time_ms === null)).toBe(true);
    }
  });

  // DRM's shape: study a themed list, recall it, then do it again with the next list. The
  // order of the lists is drawn per participant, so the thing that must hold is that the
  // recall block of a pass is scored against the list that same pass studied.
  test('a stage group runs once per list, and each recall matches the list just studied', async ({ page }) => {
    const lists = [
      { theme: 'SLEEP', words: [{ word: 'BED' }, { word: 'REST' }] },
      { theme: 'CHAIR', words: [{ word: 'TABLE' }, { word: 'SIT' }] },
    ];
    const def = {
      version: 1, slug: 'e2eGroups', title: 'Lists', titleHe: 'רשימות', category: 'MEMORY',
      instructions: { en: 'Ready?', he: 'מוכנים?' },
      pools: { lists },
      stageName: 'intro',
      factors: [{ name: 'go', levels: ['start'] }],
      repetitions: 1,
      trial: {
        phases: [{ name: 'ask', display: { kind: 'text', text: 'Begin' }, awaitsResponse: true, startsClock: true }],
        response: { kind: 'choice', options: [{ value: 'ok', label: 'Begin' }] },
        correct: { kind: 'none' },
      },
      store: ['go'],
      stages: [{
        forEach: 'lists',
        as: 'list',
        stages: [
          {
            name: 'study',
            title: { en: 'Study', he: 'למידה' },
            factors: [{ name: 'item', from: '{list.words}' }],
            repetitions: 1,
            order: 'fixed',
            trial: {
              phases: [
                { name: 'word', display: { kind: 'text', text: '{item.word}' }, durationMs: 300 },
                { name: 'gap', display: { kind: 'blank' }, durationMs: 80 },
              ],
              response: { kind: 'none' },
              correct: { kind: 'none' },
            },
            itiMs: 80,
            store: ['item.word', 'list.theme'],
          },
          {
            name: 'recall',
            title: { en: 'Recall', he: 'היזכרות' },
            factors: [{ name: 'probe', levels: ['now'] }],
            repetitions: 1,
            trial: {
              phases: [{ name: 'say', display: { kind: 'text', text: 'Type what you remember' }, awaitsResponse: true, startsClock: true }],
              response: { kind: 'wordList' },
              correct: { kind: 'none' },
              recall: { against: '{list.words}', match: 'word' },
            },
            store: ['list.theme'],
          },
        ],
      }],
      dashboard: {
        charts: [{
          title: 'Recall', kind: 'bar', groupBy: 'list_theme',
          measure: 'proportion', ofResponse: 'recalled', filter: { stage: 'recall' },
        }],
      },
    };

    const saved = await runPreview(page, def);
    await page.getByRole('button', { name: 'Begin' }).click();

    // Two passes: study, then recall, then the same again for the other list.
    const seen: string[] = [];
    for (let pass = 0; pass < 2; pass++) {
      await expect(page.getByRole('heading', { name: 'Study' })).toBeVisible({ timeout: 10_000 });
      await page.getByRole('button', { name: 'Continue' }).click();

      // Whichever list this pass drew, remember its first word so the recall can use it.
      const first = page.locator('main').getByText(/^(BED|REST|TABLE|SIT)$/).first();
      await expect(first).toBeVisible({ timeout: 10_000 });
      seen.push((await first.textContent())!.trim());

      await expect(page.getByRole('heading', { name: 'Recall' })).toBeVisible({ timeout: 10_000 });
      await page.getByRole('button', { name: 'Continue' }).click();

      const box = page.locator('main input');
      await box.fill(seen[pass]);
      await box.press('Enter');
      await page.getByRole('button', { name: /Done|סיימתי/ }).click();
    }

    await expect(thanks(page)).toBeVisible({ timeout: 10_000 });

    if (await rowsSent(saved, 9)) {
      const recall = saved.filter(r => (r.payload as Record<string, unknown>).stage === 'recall');
      // Both lists were run, each exactly once.
      const themes = recall.map(r => (r.payload as Record<string, unknown>).list_theme);
      expect([...new Set(themes)].sort()).toEqual(['CHAIR', 'SLEEP']);
      expect(recall).toHaveLength(4);

      // The word typed in each pass was scored against that pass's own list.
      for (const word of seen) {
        const row = recall.find(r => (r.payload as Record<string, unknown>).word === word);
        expect(row, `${word} was not scored in any recall block`).toBeDefined();
        expect(row!.response).toBe('recalled');
      }

      // And the passes are numbered, so they can be told apart.
      expect([...new Set(recall.map(r => (r.payload as Record<string, unknown>).repetition))].sort())
        .toEqual([1, 2]);
    }
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

// ── The original study, beside the class's own data ─────────────────────────
//
// A class of thirty is noisy, so the question a lecturer wants on screen is "did we get what
// they got?". A chart can carry the figures a paper reported, drawn as a second series. The
// fixture below invents its own numbers on purpose: no shipped experiment should carry a
// figure nobody published.

test.describe('definition runtime — the original study beside the class', () => {
  const withOriginalChart = {
    version: 1, slug: 'e2eOriginal', title: 'Comparison demo', titleHe: 'השוואה', category: 'EXECUTIVE CONTROL',
    instructions: { en: 'Press a key.', he: 'לחצו.' },
    factors: [{ name: 'congruency', levels: ['congruent', 'incongruent'] }],
    repetitions: 1,
    trial: {
      phases: [{ name: 'go', display: { kind: 'text', text: '{congruency}' }, awaitsResponse: true, startsClock: true }],
      response: { kind: 'choice', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] },
      correct: { kind: 'matchesFactor', factor: 'congruency' },
    },
    store: ['congruency'],
    dashboard: {
      charts: [{
        title: 'RT by congruency', kind: 'bar', groupBy: 'congruency', measure: 'meanRt',
        original: { source: 'Illustrative (1935), Exp. 2', values: { congruent: 650, incongruent: 850 } },
      }],
    },
  };

  // Driven by Mock Data, like every other dashboard test here. The first version of this
  // test served rows through a mocked REST route, which passed locally and failed in CI:
  // with no Supabase credentials the client is never built, so no request is made and the
  // stub never lands. Mock rows are generated from the definition itself, so this renders
  // the same way with or without a database.
  test('the paper\'s reported figures are drawn as a second series, with the citation', async ({ page }) => {
    await isolateFromDatabase(page);
    await page.addInitScript(def => {
      sessionStorage.setItem('ss_teacher_authed', '1');
      sessionStorage.setItem('cognitives_preview_definitions', JSON.stringify({ e2eOriginal: def }));
    }, withOriginalChart);

    await open(page, '/run/e2eOriginal/teacher');
    // Let the first (empty) read settle before switching mock data on. Where credentials
    // exist the fetch is real and where they do not it is a stub, but either way a read
    // that resolves after the click replaces the mock rows with an empty set.
    await expect(page.getByText(/No data yet/i)).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Mock Data' }).click();
    await expect(page.getByText(/[1-9]\d* participants/)).toBeVisible({ timeout: 15_000 });

    // The citation is on screen whether or not the chart is revealed: it says what the
    // comparison is, which the lecturer needs before showing it to a room.
    await expect(page.getByText('Original study: Illustrative (1935), Exp. 2')).toBeVisible();

    // BEFORE revealing: the published result is already on screen, and the class's is not.
    // This is the whole point of the arrangement — a room reads the original, predicts, and
    // then their own data appears beside it. One bar per group, the paper's.
    await expect(page.locator('.recharts-legend-item-text', { hasText: 'Original study' })).toBeVisible();
    await expect(page.locator('.recharts-legend-item-text', { hasText: 'RT (ms)' })).toHaveCount(0);
    await expect(page.locator('.recharts-bar-rectangle')).toHaveCount(2);

    await page.getByRole('button', { name: 'Reveal' }).first().click();
    // Both series in the legend: the class's measure, and the study.
    await expect(page.locator('.recharts-legend-item-text', { hasText: 'Original study' })).toBeVisible();
    await expect(page.locator('.recharts-legend-item-text', { hasText: 'RT (ms)' })).toBeVisible();
    // Two bars per group — the class's and the paper's — across two groups.
    await expect(page.locator('.recharts-bar-rectangle')).toHaveCount(4);
  });
});

// A real experiment carrying real figures, as opposed to the fixture above: Sternberg's
// line drawn beside a class's, on a chart that is ALREADY split into two series by
// probeType. Three lines is the busiest this gets, and it is the combination a definition
// file relies on, so it is checked against the shipped definition rather than a stand-in.
test('a built-in experiment renders the paper\'s figures beside two existing series', async ({ page }) => {
  await isolateFromDatabase(page);
  await page.addInitScript(() => sessionStorage.setItem('ss_teacher_authed', '1'));
  await open(page, '/run/memoryScanning/teacher');

  await expect(page.getByText(/No data yet/i)).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Mock Data' }).click();
  await expect(page.getByText(/[1-9]\d* participants/)).toBeVisible({ timeout: 15_000 });

  await expect(page.getByText(/Sternberg \(1966\), Exp\. 2 — computed from the reported regression/)).toBeVisible();

  await page.getByRole('button', { name: 'Reveal' }).first().click();
  // The class's two series, plus the paper's — named, so a silent drop would fail here.
  await expect(page.locator('.recharts-legend-item-text', { hasText: 'Sternberg (1966)' }).first()).toBeVisible();
  await expect(page.locator('.recharts-legend-item-text', { hasText: 'present' }).first()).toBeVisible();
});

// ── Results from more than one published version ────────────────────────────
//
// Refining a published experiment creates a new version, and results collected before and
// after it land in the same dashboard. A change between versions — different timings, an
// extra condition — can read as an effect of the experiment, so the dashboard has to say so
// and be able to narrow to the newest. Saying it is the point: silently filtering would
// hide data the lecturer collected.

test.describe('definition runtime — teacher dashboard across versions', () => {
  /** Rows as the database returns them: three from version 1, three from version 2. */
  const rowsAcrossVersions = [1, 1, 1, 2, 2, 2].map((revision, i) => ({
    id: i + 1,
    experiment_slug: 'stroopClassic',
    session_id: `s${revision}`,
    participant_name: revision === 1 ? 'Before' : 'After',
    trial_index: i,
    is_practice: false,
    response: 'red',
    is_correct: true,
    reaction_time_ms: 500 + i * 10,
    definition_revision: revision,
    created_at: new Date(Date.UTC(2026, 0, revision, 12, i)).toISOString(),
    payload: { congruency: i % 2 === 0 ? 'congruent' : 'incongruent' },
  }));

  async function openWithRows(page: Page, rows: unknown[]) {
    await isolateFromDatabase(page);
    // Registered after the isolation route so it wins for this table.
    await page.route('**/rest/v1/experiment_results**', route => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify(rows),
    }));
    await page.addInitScript(() => sessionStorage.setItem('ss_teacher_authed', '1'));
    await open(page, '/run/stroopClassic/teacher');
  }

  test('says when results span versions, and can narrow to the newest', async ({ page }) => {
    await openWithRows(page, rowsAcrossVersions);

    await expect(page.getByText('2 versions')).toBeVisible();
    await expect(page.getByText(/come from 2 published versions/)).toBeVisible();
    await expect(page.getByText(/2 participants · 6 trials/)).toBeVisible();

    await page.getByRole('button', { name: 'All versions' }).click();
    await expect(page.getByRole('button', { name: 'Version 2 only' })).toBeVisible();
    await expect(page.getByText(/1 participants · 3 trials/)).toBeVisible();
    await expect(page.getByText(/come from 2 published versions/)).toHaveCount(0);
  });

  test('a single version says nothing and offers no filter', async ({ page }) => {
    await openWithRows(page, rowsAcrossVersions.filter(r => r.definition_revision === 2));

    await expect(page.getByText(/1 participants · 3 trials/)).toBeVisible();
    await expect(page.getByText(/published versions/)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'All versions' })).toHaveCount(0);
  });
});
