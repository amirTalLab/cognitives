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

// DRM end to end is fifteen minutes, so this walks the parts a browser can break: the
// passive study block (which deadlocked before it could end itself), the clock-bounded
// filler, and the timed recall box that has to submit what was typed rather than discard it.
test.describe('DRM, the ported experiment', () => {
  test('practice plays its words, the filler counts down, and recall keeps what was typed', async ({ page }) => {
    const saved: Record<string, unknown>[] = [];
    await page.route('**/rest/v1/experiment_results*', async route => {
      saved.push(JSON.parse(route.request().postData() ?? '{}'));
      await route.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
    });

    await page.goto('/run/drm');
    await page.getByPlaceholder(/Name|שם/).fill('E2E DRM');
    await page.getByRole('button', { name: /Begin|התחלה/ }).click();

    // Three practice words, shown and not asked about.
    await expect(page.getByText('apple')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('main button')).toHaveCount(0);
    await expect(page.getByText('grape')).toBeVisible({ timeout: 10_000 });

    // The filler arrives by itself and is measured in seconds, not trials.
    // Exact: "זוגי" is a substring of "אי-זוגי", so a loose match finds both buttons.
    const even = page.getByRole('button', { name: /^(Even|זוגי)$/ });
    await expect(even).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/^\d+s$/).first()).toBeVisible();
    await even.click();

    // Recall: a countdown and a box. Type a word and finish early.
    await expect(page.locator('main input')).toBeVisible({ timeout: 20_000 });
    await page.locator('main input').fill('apple');
    await page.locator('main input').press('Enter');
    await page.getByRole('button', { name: /Done|סיימתי/ }).click();

    // The first real list follows, announced and starting on its own.
    await expect(page.getByRole('heading', { name: /Get ready|התכונני/ })).toBeVisible({ timeout: 15_000 });

    await page.waitForTimeout(500);
    const practice = saved.filter(r => r.payload && (r.payload as Record<string, unknown>).stage === 'practiceRecall');
    expect(practice.length, 'recall wrote no rows').toBeGreaterThan(0);
    const recalled = practice.find(r => (r.payload as Record<string, unknown>).word === 'apple');
    expect(recalled?.response, 'the typed word was not scored as recalled').toBe('recalled');
  });

  test('the teacher dashboard draws every figure from mock data', async ({ page }) => {
    await page.route('**/rest/v1/**', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await page.addInitScript(() => sessionStorage.setItem('ss_teacher_authed', '1'));
    await page.goto('/run/drm/teacher');

    await page.getByRole('button', { name: 'Mock Data' }).click();

    await expect(page.getByText('Figure 1: Recognition Rates by Item Type (DRM Classic Contrast)'))
      .toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Figure 7: Math Task Performance (Individual)')).toBeVisible();
    // Every figure drew something rather than an empty frame.
    await expect(page.locator('.recharts-surface')).toHaveCount(7, { timeout: 15_000 });
  });
});

// Serial order is two twenty-word lists with a two-and-a-half-minute delay, so the whole
// run is far too long for a test. This walks as far as the parts a browser can break: the
// passive Hebrew study list, and the typed arithmetic that follows it on a clock.
test.describe('Serial position, the ported experiment', () => {
  test('the study list plays itself, then the arithmetic starts on a clock', async ({ page }) => {
    await page.route('**/rest/v1/experiment_results*', route =>
      route.fulfill({ status: 201, contentType: 'application/json', body: '[]' }));

    await page.goto('/run/serialOrder');
    await page.getByPlaceholder(/Name|שם/).fill('E2E SO');
    await page.getByRole('button', { name: /Begin|התחלה/ }).click();

    // Words present themselves, with nothing to press.
    await expect(page.getByText('סולם')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('main button')).toHaveCount(0);

    // Twenty words at 3s each is a minute, so this only checks the block is still running
    // and shows the list in order rather than sitting through all of it.
    await expect(page.getByText('תפוז')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('מראה')).toBeVisible({ timeout: 10_000 });
  });

  test('the teacher dashboard draws all eight figures from mock data', async ({ page }) => {
    await page.route('**/rest/v1/**', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await page.addInitScript(() => sessionStorage.setItem('ss_teacher_authed', '1'));
    await page.goto('/run/serialOrder/teacher');

    await page.getByRole('button', { name: 'Mock Data' }).click();

    await expect(page.getByText('Serial position curve — session 1 (delayed recall)'))
      .toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Arithmetic: problems attempted against accuracy')).toBeVisible();
    await expect(page.locator('.recharts-surface')).toHaveCount(8, { timeout: 15_000 });
  });
});

// SRT is 648 trials, so this walks the part a browser can break: the four boxes laid out as
// a diamond, the dot drawn inside the one that answers the trial, and a press moving
// straight on with no gap.
test.describe('Serial reaction time, the ported experiment', () => {
  test('four boxes in a diamond, the dot in one of them, and a press moves straight on', async ({ page }) => {
    const saved: Record<string, unknown>[] = [];
    await page.route('**/rest/v1/experiment_results*', async route => {
      saved.push(JSON.parse(route.request().postData() ?? '{}'));
      await route.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
    });

    await page.goto('/run/srt');
    await page.getByPlaceholder(/Name|שם/).fill('E2E SRT');
    await page.getByRole('button', { name: /Begin|התחלה/ }).click();

    const boxes = page.locator('main button');
    await expect(boxes).toHaveCount(4, { timeout: 10_000 });

    // A diamond, not a row: one box above the others, one below, two level in between.
    const spots = await boxes.evaluateAll(els => els.map(el => {
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    }));
    const xs = spots.map(s => s.x);
    const ys = spots.map(s => s.y);
    expect(new Set(xs).size, 'all four boxes share too few columns for a diamond').toBeGreaterThan(1);
    expect(Math.max(...ys) - Math.min(...ys), 'the boxes are not spread vertically').toBeGreaterThan(200);
    expect(Math.max(...xs) - Math.min(...xs), 'the boxes are not spread horizontally').toBeGreaterThan(200);

    // Exactly one box holds the dot, and pressing it is answering the trial.
    const withDot = page.locator('main button svg');
    await expect(withDot).toHaveCount(4);

    for (let i = 0; i < 3; i++) {
      const lit = await boxes.evaluateAll(els => els.findIndex(el => {
        const fill = el.querySelector('svg circle, svg path')?.getAttribute('fill') ?? '';
        return fill !== '' && fill !== 'transparent' && fill !== 'none';
      }));
      expect(lit, 'no box was showing the dot').toBeGreaterThanOrEqual(0);
      await boxes.nth(lit).click();
      await page.waitForTimeout(120);
    }

    await page.waitForTimeout(400);
    expect(saved.length, 'presses were not recorded').toBeGreaterThanOrEqual(3);
    const first = saved[0].payload as Record<string, unknown>;
    expect(first.stage).toBe('block1');
    expect(first.group_label === 'A' || first.group_label === 'B').toBe(true);
    expect(saved.slice(0, 3).every(r => r.is_correct === true)).toBe(true);
  });

  test('the teacher dashboard draws every figure, including the awareness pie', async ({ page }) => {
    await page.route('**/rest/v1/**', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await page.addInitScript(() => sessionStorage.setItem('ss_teacher_authed', '1'));
    await page.goto('/run/srt/teacher');

    await page.getByRole('button', { name: 'Mock Data' }).click();

    await expect(page.getByText('Mean RT by Block (correct trials)')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Did participants notice a regularity?')).toBeVisible();
    // Six, not seven: the pie draws nothing until it is revealed, which is the point of
    // hiding a result a class is meant to predict first.
    await expect(page.locator('.recharts-surface')).toHaveCount(6, { timeout: 15_000 });

    // The pie is behind its own Reveal, like every other chart. Found by its card rather
    // than by text position: several nested divs contain the heading, and only the card
    // carries the button.
    const pieCard = page.locator('div.rounded-2xl').filter({ hasText: 'Did participants notice' });
    await pieCard.getByRole('button', { name: 'Reveal' }).click();
    await expect(page.locator('.recharts-pie').first()).toBeVisible({ timeout: 10_000 });
  });
});

// The composite display is the whole reason this port needed new runtime code, and it is
// pure geometry — two halves flush, the lower one slid. Only a browser can check that.
test.describe('Composite face, the ported experiment', () => {
  test('a face, then a composite whose halves are flush and the same size as the face', async ({ page }) => {
    await page.route('**/rest/v1/experiment_results*', route =>
      route.fulfill({ status: 201, contentType: 'application/json', body: '[]' }));

    await page.goto('/run/CompositeFace');
    await page.getByPlaceholder(/Name|שם/).fill('E2E CF');
    await page.getByRole('button', { name: /Begin|התחלה/ }).click();

    // Practice first, as the original has.
    const faces = page.locator('main img');
    await expect(faces.first()).toBeVisible({ timeout: 10_000 });

    // The composite: two images stacked, not side by side.
    await expect(faces).toHaveCount(2, { timeout: 10_000 });
    const boxes = await faces.evaluateAll(els => els.map(el => {
      const r = el.getBoundingClientRect();
      return { top: Math.round(r.top), left: Math.round(r.left), width: Math.round(r.width) };
    }));
    expect(boxes[0].width, 'the halves are different widths').toBe(boxes[1].width);

    // Their containers are what is clipped, so compare those: one sits below the other.
    const halves = await page.locator('main img').evaluateAll(els => els.map(el => {
      const r = (el.parentElement as HTMLElement).getBoundingClientRect();
      return { top: Math.round(r.top), left: Math.round(r.left), height: Math.round(r.height) };
    }));
    expect(halves[1].top, 'the lower half is not below the upper one').toBeGreaterThan(halves[0].top);
    // Flush: the lower half starts exactly where the upper one ends.
    expect(Math.abs((halves[0].top + halves[0].height) - halves[1].top))
      .toBeLessThanOrEqual(1);

    await expect(page.getByRole('button', { name: /Same|אותו אדם/ })).toBeVisible();
  });

  test('the teacher dashboard draws every figure from mock data', async ({ page }) => {
    await page.route('**/rest/v1/**', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await page.addInitScript(() => sessionStorage.setItem('ss_teacher_authed', '1'));
    await page.goto('/run/CompositeFace/teacher');

    await page.getByRole('button', { name: 'Mock Data' }).click();

    // Exact: a third chart is titled "Accuracy by alignment and correct answer", so a
    // substring match finds two headings and resolves to neither.
    await expect(page.getByText('Accuracy by alignment', { exact: true }))
      .toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('The composite effect, per participant')).toBeVisible();
    await expect(page.locator('.recharts-surface')).toHaveCount(5, { timeout: 15_000 });
  });
});

// The search array is the part that needed new runtime code: three kinds of item at once,
// each distractor turned its own way. Only a browser can check what is actually drawn.
test.describe('Visual search, the ported experiment', () => {
  test('the array holds two colours and both letters, with distractors turned', async ({ page }) => {
    await page.route('**/rest/v1/experiment_results*', route =>
      route.fulfill({ status: 201, contentType: 'application/json', body: '[]' }));

    await page.goto('/run/visualSearch');

    // The landing page must say which colour this participant hunts. Without it the whole
    // task is unanswerable, and nothing offline can tell: the assignment is drawn in the
    // browser and the instructions are a static string until they are resolved against it.
    const sample = page.locator('main *').filter({ hasText: /^T$/ });
    await expect(sample.first()).toBeVisible({ timeout: 10_000 });
    // Any of them, not the first: an ancestor whose only text is "T" matches too, and it
    // inherits its colour rather than carrying the one under test.
    const colours = await sample.evaluateAll(els => els.map(el => getComputedStyle(el).color));
    const hunted = colours.find(c => c === 'rgb(239, 68, 68)' || c === 'rgb(59, 130, 246)');
    expect(hunted, `no sample T was red or blue; saw ${colours.join(', ')}`).toBeTruthy();
    // And the words must name it too, rather than leaving a "{group.targetName}" on screen.
    // Hebrew by default, so the colour is named there — אדומה (red) or כחולה (blue).
    await expect(page.getByText(/אדומה|כחולה/).first()).toBeVisible();
    await expect(page.getByText('{group')).toHaveCount(0);

    await page.getByPlaceholder(/Name|שם/).fill('E2E VS');
    await page.getByRole('button', { name: /Begin|התחלה/ }).click();

    // Walk practice trials until one is crowded enough to show the design off. The set size
    // is drawn per trial, so a one-item display is a legitimate thing to skip past.
    let seen: { letters: Set<string>; colours: Set<string>; angles: Set<string> } | null = null;

    // Twenty, and through the practice-complete screen if it comes up. Practice is eight
    // trials and the set size is drawn per trial, so there is no guarantee any of those
    // eight is crowded — the loop used to run out and fail on a button that was no longer
    // there, which read as a broken array rather than as a test that had not looked far
    // enough. The main block has 128 trials, so a crowded one arrives quickly.
    for (let attempt = 0; attempt < 20 && !seen; attempt++) {
      const practiceDone = page.getByRole("button", { name: /^(Start|התחל)$/ });
      if (await practiceDone.count() > 0) {
        await practiceDone.click();
        await page.waitForTimeout(600);
      }
      const items = page.locator('main div[style*="rotate"]');
      await expect(items.first()).toBeVisible({ timeout: 10_000 });

      const found = await items.evaluateAll(els => els.map(el => ({
        text: (el.textContent ?? '').trim(),
        colour: (el.firstElementChild as HTMLElement | null)?.style.color ?? '',
        angle: /rotate\(([-\d.]+)deg\)/.exec(el.style.transform)?.[1] ?? '0',
      })).filter(x => x.text === 'T' || x.text === 'L'));

      if (found.length >= 6) {
        seen = {
          letters: new Set(found.map(f => f.text)),
          colours: new Set(found.map(f => f.colour).filter(Boolean)),
          angles: new Set(found.map(f => f.angle)),
        };
        break;
      }

      // Anchored: "קיימת" is a substring of "לא קיימת", so an unanchored match resolves to
      // both buttons and Playwright refuses to click either.
      await page.getByRole("button", { name: /^(Present|קיימת)/ }).click();
      await page.waitForTimeout(1400);
    }

    expect(seen, 'never reached a display with enough items to check').not.toBeNull();
    // A conjunction search: both letters, in both colours, or it is a feature search.
    expect([...seen!.letters].sort()).toEqual(['L', 'T']);
    expect(seen!.colours.size, 'the array used only one colour').toBe(2);
    // And the distractors are not all standing the same way up.
    expect(seen!.angles.size, 'every item was drawn at the same angle').toBeGreaterThan(1);
  });

  test('the teacher dashboard draws every figure from mock data', async ({ page }) => {
    await page.route('**/rest/v1/**', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await page.addInitScript(() => sessionStorage.setItem('ss_teacher_authed', '1'));
    await page.goto('/run/visualSearch/teacher');

    await page.getByRole('button', { name: 'Mock Data' }).click();

    await expect(page.getByText('Search time by set size, target present vs absent'))
      .toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.recharts-surface')).toHaveCount(6, { timeout: 15_000 });
  });
});

test.describe('a later block brings its own practice', () => {
  test.beforeEach(async ({ page }) => { await isolateFromDatabase(page); });

  /**
   * Two blocks, and it is the SECOND one that practises.
   *
   * The shape mentalRep has: a session whose second half is a different task, which a
   * participant meets after finishing the first. `Stage.practice` typechecked and validated
   * long before anything ran it — only the definition's own first block was ever practised —
   * so the practice was declared, silently skipped, and nothing anywhere said so.
   */
  const twoPart = {
    version: 1,
    slug: 'e2eStagePractice',
    title: 'Two part',
    titleHe: 'שני חלקים',
    category: 'MEMORY',
    instructions: { en: 'Part one, then part two.', he: 'חלק ראשון, ואז שני.' },
    factors: [{ name: 'colour', levels: ['red'] }],
    repetitions: 1,
    stageName: 'partOne',
    trial: {
      phases: [{ name: 'stim', display: { kind: 'text', text: 'ONE' }, awaitsResponse: true, startsClock: true }],
      response: { kind: 'choice', layout: 'row', options: [{ value: 'red', label: 'Red' }] },
      correct: { kind: 'matchesFactor', factor: 'colour' },
      itiMs: 0,
    },
    store: ['colour'],
    stages: [{
      name: 'partTwo',
      title: { en: 'Part two', he: 'חלק שני' },
      instructions: { en: 'A different task now.', he: 'משימה אחרת.' },
      factors: [{ name: 'shape', levels: ['square', 'circle'] }],
      repetitions: 1,
      practice: { count: 2, feedback: true, record: false },
      trial: {
        phases: [{ name: 'stim', display: { kind: 'text', text: 'TWO' }, awaitsResponse: true, startsClock: true }],
        response: {
          kind: 'choice',
          layout: 'row',
          options: [{ value: 'square', label: 'Square' }, { value: 'circle', label: 'Circle' }],
        },
        correct: { kind: 'matchesFactor', factor: 'shape' },
        feedback: { durationMs: 300, correct: { en: 'Correct', he: 'נכון' }, incorrect: { en: 'Incorrect', he: 'לא נכון' } },
        itiMs: 0,
      },
      store: ['shape'],
    }],
    thanks: { showResults: false },
    dashboard: { charts: [{ title: 'Shapes', kind: 'bar', groupBy: 'shape', measure: 'accuracy' }] },
  };

  test('part two practises first, and its practice is not saved', async ({ page }) => {
    const saved = await runPreview(page, twoPart as never);

    // Part one: one trial, no practice of its own.
    await page.getByRole('button', { name: 'Red' }).click();

    // Then part two's intro, and only then its practice.
    await expect(page.getByRole('heading', { name: 'Part two' })).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: /continue|start|המשך/i }).click();

    // Two practice trials, each giving feedback — which is how a participant can tell this
    // is practice at all.
    for (let i = 0; i < 2; i++) {
      await page.getByRole('button', { name: 'Square' }).first().click();
      await expect(page.getByText(/Correct|Incorrect/)).toBeVisible({ timeout: 5000 });
    }

    // The screen that says the practice did not count. Before this fix a participant went
    // straight from part one's last trial into part two's real trials.
    await expect(page.getByRole('heading', { name: 'Practice complete!' })).toBeVisible({ timeout: 10_000 });
    // And it counts the block that is about to run, not the definition's first block.
    await expect(page.getByText('2 trials')).toBeVisible();
    await page.getByRole('button', { name: 'Start' }).click();

    for (let i = 0; i < 2; i++) {
      await page.getByRole('button', { name: /Square|Circle/ }).first().click();
      await page.waitForTimeout(400);
    }

    await expect(page.getByRole('heading', { name: /thank you/i })).toBeVisible({ timeout: 15_000 });

    // Three rows: part one's single trial and part two's two real trials. The practice is
    // `record: false`, so if it were saved the class's accuracy would include trials taken
    // before the participant knew the task.
    if (await rowsSent(saved, 3)) {
      const stages = saved.map(r => {
        const row = r as { stage?: string; payload?: { stage?: string } };
        return row.stage ?? row.payload?.stage;
      });
      expect(stages.filter(s => s === 'partTwo')).toHaveLength(2);
      expect(saved).toHaveLength(3);
    }
  });
});

test.describe('Ensemble perception, the ported experiment', () => {
  test.beforeEach(async ({ page }) => { await isolateFromDatabase(page); });

  /**
   * One block, two kinds of trial, and the participant cannot tell which is coming.
   *
   * Nothing offline can see this. The definition can branch correctly and still put the
   * wrong control on screen, or draw a slider with no preview, or ask the question in the
   * wrong language — and a participant would meet all three before any test noticed.
   */
  test('a trial asks for an average with a slider, or about one item with yes/no', async ({ page }) => {
    await open(page, '/run/summaryStats');
    await page.getByRole('button', { name: 'English' }).click();
    await page.getByPlaceholder('Name').fill('E2E Tester');
    await page.getByRole('button', { name: 'Begin' }).click();

    const seen = { ensemble: false, recognition: false };

    // Practice is ten trials and covers both questions by construction, so both kinds must
    // turn up well inside it.
    for (let i = 0; i < 10 && !(seen.ensemble && seen.recognition); i++) {
      const slider = page.locator('input[type="range"]');
      // The key hint is inside the button, so its accessible name is "Yes F", not "Yes".
      const yes = page.getByRole('button', { name: /^Yes/ });

      await expect(slider.or(yes).first()).toBeVisible({ timeout: 15_000 });

      if (await slider.count() > 0) {
        // An estimate trial: the question, a scale, and a shape that follows it.
        await expect(page.getByText(/What was the average (circle size|line length)\?/)).toBeVisible();
        const preview = page.locator('svg, [data-shape]').first();
        await expect(preview).toBeVisible();

        // The scale belongs to the stimulus: circles run 15-75, lines 40-200. A single
        // scale stretched over both would make the same drag mean different things.
        const min = Number(await slider.getAttribute('min'));
        const max = Number(await slider.getAttribute('max'));
        expect([15, 40]).toContain(min);
        expect([75, 200]).toContain(max);

        await slider.fill(String(Math.round((min + max) / 2)));
        await page.getByRole('button', { name: 'Confirm' }).click();
        seen.ensemble = true;
      } else {
        // A recognition trial: one shape, and whether it was there.
        await expect(page.getByText('Did this item appear in the display?')).toBeVisible();
        await yes.click();
        seen.recognition = true;
      }
      // Feedback, then the inter-trial gap.
      await page.waitForTimeout(1300);
    }

    expect(seen.ensemble, 'no trial ever asked for an average').toBe(true);
    expect(seen.recognition, 'no trial ever asked about a single item').toBe(true);
  });

  test('the question is asked in Hebrew on a Hebrew run', async ({ page }) => {
    // Displays carry a stimulus, which is never translated — but this one carries the
    // QUESTION, and a Hebrew run that asks it in English is not the same experiment.
    await open(page, '/run/summaryStats');
    await page.getByPlaceholder('שם').fill('בודק');
    await page.getByRole('button', { name: 'התחלה' }).click();

    await expect(
      page.getByText(/מהו גודל העיגול הממוצע\?|מהו אורך הקו הממוצע\?|האם פריט זה הופיע בתצוגה\?/),
    ).toBeVisible({ timeout: 15_000 });
  });
});

test.describe('a phase that is code', () => {
  test.beforeEach(async ({ page }) => { await isolateFromDatabase(page); });

  /**
   * The escape hatch, end to end.
   *
   * Wason's 2-4-6: the participant is given a triple that fits a rule and may test five of
   * their own to work out what it is. It is here rather than in a definition because the
   * participant AUTHORS the stimulus — there are no trials to plan, and the answer is a
   * predicate on what they typed.
   *
   * What this proves that nothing offline can: the component reaches the screen, its answer
   * lands in the ordinary response column, and the extra columns it observed reach the row.
   */
  const ruleTask = {
    version: 1,
    slug: 'e2eWason',
    title: 'Rule discovery',
    titleHe: 'גילוי כלל',
    category: 'REASONING',
    instructions: { en: '2-4-6 fits a rule. Work out what it is.', he: 'x' },
    factors: [{ name: 'task', levels: ['rule'] }],
    repetitions: 1,
    trial: {
      phases: [{
        name: 'rule',
        display: { kind: 'text', text: '2 – 4 – 6' },
        component: 'wasonRuleDiscovery',
        awaitsResponse: true,
        startsClock: true,
      }],
      response: { kind: 'text' },
      correct: { kind: 'none' },
      itiMs: 0,
    },
    store: ['task'],
    thanks: { showResults: false },
    dashboard: { charts: [{ title: 'Guesses', kind: 'bar', groupBy: 'task', measure: 'count' }] },
  };

  test('the participant tests triples, guesses the rule, and every triple is recorded', async ({ page }) => {
    const saved = await runPreview(page, ruleTask as never);

    // Two triples: one that fits the rule and one that does not. A participant who only ever
    // tests triples they expect to fit is the finding — so the row has to be able to tell
    // the difference, which means both have to work.
    for (const [a, b, c] of [[1, 2, 3], [9, 5, 1]]) {
      await page.getByPlaceholder('#1').fill(String(a));
      await page.getByPlaceholder('#2').fill(String(b));
      await page.getByPlaceholder('#3').fill(String(c));
      await page.getByRole('button', { name: 'Test' }).click();
    }

    await expect(page.getByText('1 – 2 – 3')).toBeVisible();
    await expect(page.getByText('Fits ✓')).toBeVisible();
    await expect(page.getByText('9 – 5 – 1')).toBeVisible();
    await expect(page.getByText("Doesn't fit ✗")).toBeVisible();
    await expect(page.getByText('2/5 sequences tested')).toBeVisible();

    await page.getByRole('button', { name: 'I am ready to guess the rule' }).click();
    await page.getByPlaceholder('The rule is...').fill('each number is larger than the last');
    await page.getByRole('button', { name: 'Submit' }).click();

    await expect(page.getByRole('heading', { name: /thank you/i })).toBeVisible({ timeout: 10_000 });

    if (await rowsSent(saved, 1)) {
      const row = saved[0] as { response?: string; payload?: Record<string, unknown> };
      // The answer is in the ordinary column, not a shape only one dashboard understands.
      expect(row.response).toBe('each number is larger than the last');
      // And the columns the component observed came with it.
      expect(row.payload?.triples_tested).toBe(2);
      expect(row.payload?.disconfirming_tests).toBe(1);
      expect(row.payload?.found_rule).toBe(true);
      expect(JSON.parse(String(row.payload?.rule_triples))).toHaveLength(2);
      // The stored factor is still there: a component adds columns, it does not replace them.
      expect(row.payload?.task).toBe('rule');
    }
  });

  test('a component this site does not have says so instead of showing nothing', async ({ page }) => {
    // A definition can name anything — it is data, and a published one comes from a
    // database. The failure to avoid is a blank screen a participant assumes is intentional.
    const missing = {
      ...ruleTask,
      slug: 'e2eMissingComponent',
      trial: {
        ...ruleTask.trial,
        phases: [{ ...ruleTask.trial.phases[0], component: 'noSuchComponent' }],
      },
    };
    await runPreview(page, missing as never);

    await expect(page.getByText(/needs a component named .noSuchComponent./)).toBeVisible({ timeout: 10_000 });
  });
});


/** Opens a BUILT-IN experiment (no preview stub) in English, capturing every row it saves. */
async function runBuiltIn(page: Page, slug: string): Promise<Saved> {
  const saved: Saved = [];
  await page.route("**/rest/v1/experiment_results**", async route => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      saved.push(...(Array.isArray(body) ? body : [body]));
    }
    return route.fulfill({ status: 201, contentType: "application/json", body: "[]" });
  });
  await open(page, `/run/${slug}`);
  await page.getByRole("button", { name: "English" }).click();
  await page.getByPlaceholder("Name").fill("E2E Tester");
  await page.getByRole("button", { name: "Begin" }).click();
  return saved;
}

test.describe("Reasoning biases, the ported battery", () => {
  test.beforeEach(async ({ page }) => { await isolateFromDatabase(page); });

  /**
   * A questionnaire is where per-item options either work or are silently empty.
   *
   * Nothing offline can see a button. Twenty questions each bring their own answers, one
   * brings a multi-select, and each participant is given one wording of the split questions
   * — all of which is invisible until it is on screen.
   */
  test('each question brings its own answers, and one takes several', async ({ page }) => {
    const saved = await runBuiltIn(page, 'logics');

    let sawMultiSelect = false;
    let answered = 0;

    // Through the first block: nineteen questions, in a shuffled order, so the test cannot
    // know which is next and has to answer whatever is on screen.
    for (let i = 0; i < 19; i++) {
      const confirm = page.getByRole('button', { name: 'Confirm' });
      const submit = page.getByRole('button', { name: 'Submit' });
      const numberBox = page.locator('input[type="number"]');
      const choices = page.locator('main button').filter({ hasNotText: /^(Confirm|Submit)$/ });

      await expect(numberBox.or(choices.first())).toBeVisible({ timeout: 15_000 });

      if (await numberBox.count() > 0) {
        // A free-number question — the reflection test, or an estimate.
        await numberBox.fill('5');
        await submit.click();
      } else if (await confirm.count() > 0) {
        // The multi-select: tick two and confirm. Nothing else in this battery uses it.
        sawMultiSelect = true;
        await choices.nth(0).click();
        await choices.nth(3).click();
        await confirm.click();
      } else {
        // Multiple choice or a rating scale: every question brings its own buttons, so the
        // only safe thing is to press the first.
        await choices.first().click();
      }
      answered++;
      await page.waitForTimeout(420);
    }

    expect(answered).toBe(19);
    expect(sawMultiSelect, 'the card task never offered more than one answer').toBe(true);

    // Rows carry which question was asked and which wording this participant was given —
    // without the group, a split question's two halves cannot be told apart in the data.
    if (await rowsSent(saved, 19)) {
      const row = saved[0] as { payload?: Record<string, unknown> };
      expect(String(row.payload?.q_code)).toMatch(/^Q-/);
      expect(['A', 'B']).toContain(String(row.payload?.group_label));
    }
  });

  test('a participant sees one wording of a split question, never both', async ({ page }) => {
    // The framing questions are the same fact worded two ways. Someone shown both would
    // notice, and there would be no effect left to measure.
    await runBuiltIn(page, 'logics');

    const bodies: string[] = [];
    for (let i = 0; i < 19; i++) {
      const main = page.locator('main');
      await expect(main).toBeVisible({ timeout: 15_000 });
      bodies.push((await main.innerText()).trim());

      const numberBox = page.locator('input[type="number"]');
      const confirm = page.getByRole('button', { name: 'Confirm' });
      const choices = page.locator('main button').filter({ hasNotText: /^(Confirm|Submit)$/ });
      if (await numberBox.count() > 0) {
        await numberBox.fill('5');
        await page.getByRole('button', { name: 'Submit' }).click();
      } else if (await confirm.count() > 0) {
        await choices.first().click();
        await confirm.click();
      } else {
        await choices.first().click();
      }
      await page.waitForTimeout(420);
    }

    const seen = bodies.join('\n');
    // The medical framing question, in its two forms. Exactly one may appear.
    const survival = seen.includes('90% survival rate');
    const mortality = seen.includes('10% mortality rate');
    expect(survival || mortality, 'the framing question never appeared').toBe(true);
    expect(survival && mortality, 'a participant was shown both wordings').toBe(false);
  });
});

test.describe('Creativity, the ported battery', () => {
  test.beforeEach(async ({ page }) => { await isolateFromDatabase(page); });

  /**
   * A drawing and a free list are both new kinds of answer, and neither exists until it is
   * on screen. Offline can check that the definition asks for them; only this can check that
   * a participant can give them.
   */
  test('ideas are listed one per row, and a circle can be drawn on and named', async ({ page }) => {
    // Six blocks, four of them a minute long, so the default 30s is not enough even though
    // submitting ends each block early.
    test.setTimeout(120_000);
    const saved = await runBuiltIn(page, 'creativity');

    // Part 1: a minute with an object. Three ideas, then submit.
    await expect(page.getByText('Brick')).toBeVisible({ timeout: 15_000 });
    const ideaBox = page.getByRole('textbox').first();
    for (const idea of ['door stop', 'paperweight', 'garden path']) {
      await ideaBox.fill(idea);
      await ideaBox.press('Enter');
    }
    await page.getByRole('button', { name: /Done|Submit|סיום/ }).first().click();

    // One row per idea, in the order they came — not one row holding a comma-blob.
    if (await rowsSent(saved, 3)) {
      const ideas = saved.filter(r => {
        const row = r as { payload?: Record<string, unknown> };
        return row.payload?.outputPosition !== undefined && row.payload?.outputPosition !== null;
      });
      expect(ideas.length).toBeGreaterThanOrEqual(3);
      expect(String((ideas[0] as { response?: string }).response)).toBe('door stop');
      // A two-word idea stayed one idea.
      expect(String((ideas[2] as { response?: string }).response)).toBe('garden path');
    }

    // Skip the remaining three objects and the intro screens between them, to reach the
    // circles. Each block ends by itself after a minute, so the intros are the way through.
    for (let i = 0; i < 4; i++) {
      const next = page.getByRole('button', { name: /Continue|Start|המשך|התחל/ });
      if (await next.count() > 0) await next.first().click();
      const box = page.getByRole('textbox').first();
      if (await box.count() > 0) {
        await box.fill('one idea');
        await box.press('Enter');
        await page.getByRole('button', { name: /Done|Submit|סיום/ }).first().click();
      }
      await page.waitForTimeout(400);
    }

    // Part 2: the circle. A canvas with a guide drawn into it, which is the prompt.
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible({ timeout: 20_000 });

    // Done stays disabled until something is actually drawn — an empty canvas is not an
    // answer, and a row holding a blank circle would be unratable.
    const done = page.getByRole('button', { name: 'Done' });
    await expect(done).toBeDisabled();

    const box = await canvas.boundingBox();
    await page.mouse.move(box!.x + 80, box!.y + 80);
    await page.mouse.down();
    await page.mouse.move(box!.x + 200, box!.y + 200, { steps: 8 });
    await page.mouse.up();

    await expect(done).toBeEnabled();
    await done.click();

    // Then what they called it.
    await expect(page.getByText('What is it?')).toBeVisible({ timeout: 10_000 });
    await page.getByPlaceholder('Name it').fill('a face');
    await page.getByRole('button', { name: 'Submit' }).click();

    // The drawing is stored as an image. Polled rather than counted: rows from the earlier
    // blocks are already in, so any count is satisfied before this one is even sent.
    await expect.poll(
      () => saved.some(r => String((r as { response?: string }).response ?? '').startsWith('data:image')),
      { message: 'the drawing was never stored as an image', timeout: 10_000 },
    ).toBe(true);
  });
});

test.describe('bRMS, the ported experiment', () => {
  test.beforeEach(async ({ page }) => { await isolateFromDatabase(page); });

  /**
   * The escape hatch's hardest case, end to end.
   *
   * Two custom surfaces — a calibration gate before the run and a frame-accurate suppression
   * phase inside it — with ordinary blocks, rows and charts around them. If this works, the
   * decision to add an escape hatch rather than a second platform holds.
   */
  test('the display is calibrated first, then a face breaks through and is answered', async ({ page }) => {
    test.setTimeout(90_000);
    const saved = await runBuiltIn(page, 'bRMS');

    // The gate: size a coin, check the frame rate, then start. It must not be skippable,
    // because a frame sized in pixels is a different experiment on every screen.
    await expect(page.getByText(/Hold a 1₪ coin/)).toBeVisible({ timeout: 15_000 });
    await page.locator('input[type="range"]').fill('90');
    await page.getByRole('button', { name: 'That looks right' }).click();

    // The frame check reports and lets through either way — a participant who cannot start
    // is worse than one whose data carries a caveat.
    await expect(page.getByText(/display is steady enough|not perfectly steady/)).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'That looks right' }).click();

    await expect(page.getByText(/Sit about \d+ cm/)).toBeVisible();
    await page.getByRole('button', { name: 'Start' }).click();

    // And what it measured is kept, in the place the hand-built pages keep it.
    const pxPerMm = await page.evaluate(() => sessionStorage.getItem('brms_px_per_mm'));
    expect(Number(pxPerMm)).toBeGreaterThan(0);

    // The suppression phase: a canvas of masks and a face image, and two answers.
    await expect(page.locator('canvas')).toBeVisible({ timeout: 20_000 });
    const left = page.getByRole('button', { name: 'Left', exact: true });
    await expect(left).toBeVisible();

    // The face really is being flashed rather than sitting there: its opacity changes
    // between frames, which is the whole manipulation.
    const opacities = new Set<string>();
    for (let i = 0; i < 12; i++) {
      opacities.add(await page.locator('main img').first().evaluate(el => (el as HTMLElement).style.opacity));
      await page.waitForTimeout(40);
    }
    expect(opacities.size, 'the face never changed opacity, so nothing was flickering').toBeGreaterThan(1);

    await left.click();

    // Practice comes first and is deliberately not recorded, so the first saved row is a
    // dozen answers away. Answer whatever is on screen — including the screen between
    // practice and the real block — until one arrives.
    for (let i = 0; i < 12; i++) {
      const start = page.getByRole("button", { name: /^(Start|התחל)$/ });
      if (await start.count() > 0) { await start.first().click(); await page.waitForTimeout(400); }
      // Waited for, not counted: a fixation cross runs between trials and there are no
      // buttons during it, so checking once finds nothing and stops after one answer.
      const button = page.getByRole("button", { name: "Left", exact: true });
      await expect(button).toBeVisible({ timeout: 25_000 });
      await button.click();
      await page.waitForTimeout(300);
    }

    // The row carries the ordinary spine plus what the component observed.
    await expect.poll(
      () => saved.some(r => {
        const row = r as { payload?: Record<string, unknown> };
        return row.payload?.timing_flag !== undefined;
      }),
      { message: 'no row carried the component\'s own columns', timeout: 10_000 },
    ).toBe(true);

    const row = saved.find(r => (r as { payload?: Record<string, unknown> }).payload?.timing_flag !== undefined) as
      { response?: string; payload?: Record<string, unknown> };
    expect(['left', 'right']).toContain(String(row.response));
    expect(['fearful', 'happy', 'neutral']).toContain(String(row.payload?.emotion));
    expect(['upright', 'inverted']).toContain(String(row.payload?.orientation));
    expect(row.payload?.rescue_triggered).toBe(false);
    expect(row.payload?.side_shown).toBeTruthy();
  });
});

test.describe('The two-step task, ported', () => {
  test.beforeEach(async ({ page }) => { await isolateFromDatabase(page); });

  /**
   * Within-trial contingency, on screen.
   *
   * Nothing offline can see whether the second half of a trial actually follows from the
   * first. The definition can declare its outcomes correctly and the runner can still show
   * the wrong world's symbols, or fail to resolve the reward — and either would look to a
   * participant like a task that simply works that way.
   */
  test('a choice leads to a world, and the world decides what is offered next', async ({ page }) => {
    test.setTimeout(120_000);
    const saved = await runBuiltIn(page, 'twoStepTask');

    const A = new Set(['ན', 'ཤ']);   // world A's symbols
    const B = new Set(['བ', 'ཇ']);   // world B's

    const seen = { A: false, B: false, rewarded: false, unrewarded: false };

    // Practice is ten trials and is not recorded; the real block follows. Twenty answers is
    // enough to meet both worlds and both outcomes several times over.
    for (let i = 0; i < 20; i++) {
      const start = page.getByRole('button', { name: /^(Start|התחל)$/ });
      if (await start.count() > 0) { await start.first().click(); await page.waitForTimeout(300); }

      const left = page.getByRole('button', { name: /^Left/ });
      await expect(left).toBeVisible({ timeout: 20_000 });
      await left.click();

      // The transition, then the second stage — whose symbols must belong to ONE world.
      await page.waitForTimeout(1700);
      const body = await page.locator('main').innerText();
      const inA = [...A].some(s => body.includes(s));
      const inB = [...B].some(s => body.includes(s));
      expect(inA || inB, 'the second stage showed neither world\'s symbols').toBe(true);
      expect(inA && inB, 'the second stage mixed both worlds').toBe(false);
      if (inA) seen.A = true;
      if (inB) seen.B = true;

      await page.getByRole('button', { name: /^Left/ }).click();

      // The reward screen: paid or not.
      await page.waitForTimeout(600);
      const after = await page.locator('main').innerText();
      if (after.includes('🪙')) seen.rewarded = true;
      if (after.includes('∅')) seen.unrewarded = true;

      await page.waitForTimeout(1600);
    }

    // Always choosing "left" still reaches both worlds, because the transition is
    // probabilistic — which is the whole design. If only one world ever appeared, the rare
    // transition would not be happening and the task would measure nothing.
    expect(seen.A && seen.B, 'always choosing left never reached the rare world').toBe(true);
    expect(seen.rewarded || seen.unrewarded, 'no reward outcome was ever shown').toBe(true);

    // And the row carries what followed from the choices, not just the choices.
    await expect.poll(
      () => saved.some(r => {
        const row = r as { payload?: Record<string, unknown> };
        return row.payload?.state !== undefined && row.payload?.transition !== undefined;
      }),
      { message: 'no row recorded which world the choice led to', timeout: 10_000 },
    ).toBe(true);

    const row = saved.find(r => (r as { payload?: Record<string, unknown> }).payload?.state !== undefined) as
      { payload?: Record<string, unknown> };
    expect(['A', 'B']).toContain(String(row.payload?.state));
    expect(['common', 'rare']).toContain(String(row.payload?.transition));
    expect(typeof row.payload?.rewarded).toBe('boolean');
    // The probabilities in force on that trial, so the drift is reconstructable afterwards.
    expect(Number(row.payload?.trial_probA1)).toBeGreaterThan(0);
  });
});

test.describe('The testing effect, ported', () => {
  test.beforeEach(async ({ page }) => { await isolateFromDatabase(page); });

  /**
   * Two sittings, a week apart, and the second one has to find the first.
   *
   * The refusal is the part worth testing hardest. A second sitting that quietly drew a
   * fresh assignment would test someone on pairs they never studied, and every row would
   * look perfectly valid — the failure would only ever show up as a weak effect.
   */
  test('the second sitting refuses when it cannot find the first', async ({ page }) => {
    // No earlier rows: the lookup finds nothing.
    await page.route('**/rest/v1/experiment_results**', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));

    await open(page, '/run/testingEffect');
    await page.getByRole('button', { name: 'English' }).click();

    // Both sittings are offered, as the hand-built version offers two buttons.
    await expect(page.getByText('Session 1: Learning')).toBeVisible();
    await expect(page.getByText('Session 2: Test')).toBeVisible();

    // Nothing can start until one is chosen.
    await expect(page.getByRole('button', { name: 'Begin' })).toBeDisabled();

    await page.getByText('Session 2: Test').click();
    await page.getByPlaceholder('Name').fill('Nobody At All');
    await page.getByRole('button', { name: 'Begin' }).click();

    // Refused, and told why — with the name that was looked for, because the usual cause is
    // a typo and the participant is the only one who can see it.
    await expect(page.getByText(/We have no earlier session under "Nobody At All"/))
      .toBeVisible({ timeout: 15_000 });
    // And still on the landing page rather than part-way into an experiment.
    await expect(page.getByRole('button', { name: 'Begin' })).toBeVisible();
  });

  test('a returning participant gets the group they had the first time', async ({ page }) => {
    // One earlier row, in group 3. The second sitting must test the pairs that group
    // studied, not a fresh draw.
    await page.route('**/rest/v1/experiment_results**', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ payload: { group_label: '3' } }]),
      }));

    await open(page, '/run/testingEffect');
    await page.getByRole('button', { name: 'English' }).click();
    await page.getByText('Session 2: Test').click();
    await page.getByPlaceholder('Name').fill('Returning Student');
    await page.getByRole('button', { name: 'Begin' }).click();

    // Straight into the test block — no study, no practice.
    await expect(page.getByRole('heading', { name: 'What do you remember?' }))
      .toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: /Continue|Start/ }).first().click();

    // A cue with no answer shown: this is the measure, so nothing gives it away.
    const input = page.getByPlaceholder('The second word');
    await expect(input).toBeVisible({ timeout: 15_000 });
    const shown = await page.locator('main').innerText();
    expect(shown).toContain('?');

    // In group 3, set A is the retrieval set — so a set-A cue must be among the pairs.
    await input.fill('something');
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(input).toBeVisible({ timeout: 10_000 });
  });

  test('two people under one name are refused rather than guessed between', async ({ page }) => {
    // Guessing would put one of them in the other's condition, and nothing downstream could
    // ever tell that it had happened.
    await page.route('**/rest/v1/experiment_results**', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ payload: { group_label: '1' } }, { payload: { group_label: '2' } }]),
      }));

    await open(page, '/run/testingEffect');
    await page.getByRole('button', { name: 'English' }).click();
    await page.getByText('Session 2: Test').click();
    await page.getByPlaceholder('Name').fill('Noa Cohen');
    await page.getByRole('button', { name: 'Begin' }).click();

    await expect(page.getByText(/More than one person is recorded under that name/))
      .toBeVisible({ timeout: 15_000 });
  });

  test('the first sitting starts without any lookup', async ({ page }) => {
    // It requires nothing, so a first-time participant is never asked to have been here
    // before.
    await page.route('**/rest/v1/experiment_results**', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));

    await open(page, '/run/testingEffect');
    await page.getByRole('button', { name: 'English' }).click();
    await page.getByText('Session 1: Learning').click();
    await page.getByPlaceholder('Name').fill('First Timer');
    await page.getByRole('button', { name: 'Begin' }).click();

    // Straight into studying: a pair, shown with its answer.
    await expect(page.locator('main')).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(1200);
    const shown = await page.locator('main').innerText();
    expect(shown.length).toBeGreaterThan(0);
    await expect(page.getByText(/We have no earlier session/)).toBeHidden();
  });
});

test.describe('On a phone', () => {
  // A real phone viewport. Everything below was reported by taking the experiments on one,
  // and none of it was visible to any test — they are all questions about pixels.
  test.use({ viewport: { width: 375, height: 667 } });

  test.beforeEach(async ({ page }) => { await isolateFromDatabase(page); });

  test('a Stroop word never runs off the side of the screen', async ({ page }) => {
    await runBuiltIn(page, 'stroop');

    // Through practice, checking every stimulus that appears. The longest Hebrew colour word
    // at the size this asks for is wider than the screen, and the half that does not fit is
    // simply missing — which a participant reads as part of the task.
    for (let i = 0; i < 6; i++) {
      const buttons = page.locator('main button');
      await expect(buttons.first()).toBeVisible({ timeout: 15_000 });

      const overflow = await page.evaluate(() => {
        const width = document.documentElement.clientWidth;
        return [...document.querySelectorAll('main div')]
          .map(el => el.getBoundingClientRect())
          .filter(r => r.width > 0)
          .some(r => r.left < -1 || r.right > width + 1);
      });
      expect(overflow, 'something on screen extends past the viewport').toBe(false);

      await buttons.first().click();
      await page.waitForTimeout(500);
    }
  });

  test('every serial-reaction-time box is fully on screen, and pressable', async ({ page }) => {
    await runBuiltIn(page, 'srt');

    // The four boxes sit in a diamond, two of them at the sides. At 375px wide a flat
    // 180px offset put those two partly past the edge — and in this task the box IS the
    // answer, so a participant cannot press what they cannot see.
    const boxes = page.locator('main button');
    await expect(boxes.first()).toBeVisible({ timeout: 20_000 });
    await expect(boxes).toHaveCount(4);

    const width = await page.evaluate(() => document.documentElement.clientWidth);
    for (let i = 0; i < 4; i++) {
      const box = await boxes.nth(i).boundingBox();
      expect(box, `box ${i} has no position`).toBeTruthy();
      expect(box!.x, `box ${i} starts off the left edge`).toBeGreaterThanOrEqual(-1);
      expect(box!.x + box!.width, `box ${i} runs past the right edge`).toBeLessThanOrEqual(width + 1);
    }

    // And one can actually be pressed.
    await boxes.nth(0).click();
  });

  test('the word-superiority marker points at the third letter in both languages', async ({ page }) => {
    // The stimuli here are HEBREW words, so a word runs right to left and its third letter
    // is the third FROM THE RIGHT. The marker is made entirely of directionally neutral
    // characters, so it has none of its own — left to right it would mark the third letter
    // from the END, which is a different letter and not the one in question.
    for (const language of ['he', 'en'] as const) {
      await isolateFromDatabase(page);
      await open(page, '/run/wordSuperiority');
      if (language === 'en') await page.getByRole('button', { name: 'English' }).click();
      await page.getByPlaceholder(/Name|שם/).fill('E2E');
      await page.getByRole('button', { name: /Begin|התחלה/ }).click();

      // Wait for the response screen, where the marker is shown.
      const marker = page.getByText(/[_?] [_?] [_?] [_?]/);
      await expect(marker).toBeVisible({ timeout: 20_000 });

      // Right to left, the way the Hebrew word runs, in either interface language — the
      // stimulus does not change when the buttons do.
      const direction = await marker.evaluate(el => getComputedStyle(el).direction);
      expect(direction, `the marker rendered ${direction} on a ${language} run`).toBe('rtl');

      const text = (await marker.innerText()).trim().split(/\s+/);
      expect(text).toHaveLength(4);
      expect(text.indexOf('?'), 'the marked position moved').toBe(2);
    }
  });
});

test.describe('A stimulus on a narrow screen', () => {
  test.use({ viewport: { width: 375, height: 667 } });
  test.beforeEach(async ({ page }) => { await isolateFromDatabase(page); });

  test('a one-word stimulus stays on one line, whatever its length', async ({ page }) => {
    // Shrinking a word until it fits is right; breaking it over two lines is not. A stimulus
    // split across lines is read in two fixations instead of one, and the time between them
    // is inside the reaction time this experiment exists to measure.
    //
    // AMARILLO is the longest word in the set at eight capitals, which is what overflowed.
    const def = {
      version: 1,
      slug: 'e2eLongWord',
      title: 'Long word',
      titleHe: 'מילה ארוכה',
      category: 'EXECUTIVE CONTROL',
      instructions: { en: 'Press the button.', he: 'לחצו על הכפתור.' },
      pools: {
        words: [
          { label: 'AMARILLO' },
          { label: 'TSAHOV' },
          { label: 'RED' },
        ],
      },
      factors: [{ name: 'item', from: 'words' }],
      repetitions: 1,
      order: 'fixed',
      trial: {
        phases: [{
          name: 'word',
          // The size Stroop asks for.
          display: { kind: 'text', text: '{item.label}', size: 96, color: '#f8fafc' },
          awaitsResponse: true,
          startsClock: true,
        }],
        response: { kind: 'choice', layout: 'row', options: [{ value: 'ok', label: 'OK' }] },
        correct: { kind: 'none' },
        itiMs: 0,
      },
      store: ['item.label'],
      thanks: { showResults: false },
      dashboard: { charts: [{ title: 'c', kind: 'bar', groupBy: 'item.label', measure: 'count' }] },
    };

    await runPreview(page, def as never);

    for (const word of ['AMARILLO', 'TSAHOV', 'RED']) {
      const stimulus = page.getByText(word, { exact: true });
      await expect(stimulus).toBeVisible({ timeout: 15_000 });

      const measured = await stimulus.evaluate(el => {
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return {
          height: rect.height,
          left: rect.left,
          right: rect.right,
          lineHeight: parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2,
          fontSize: parseFloat(style.fontSize),
          viewport: document.documentElement.clientWidth,
        };
      });

      // One line: the box is no taller than a single line of its own text.
      expect(measured.height, `"${word}" wrapped onto more than one line`)
        .toBeLessThan(measured.lineHeight * 1.6);
      // And still inside the screen.
      expect(measured.left, `"${word}" starts off the left edge`).toBeGreaterThanOrEqual(-1);
      expect(measured.right, `"${word}" runs past the right edge`)
        .toBeLessThanOrEqual(measured.viewport + 1);
      // A short word is not shrunk — the cap only ever takes size away when it has to.
      if (word === 'RED') expect(measured.fontSize).toBe(96);

      await page.getByRole('button', { name: 'OK' }).click();
      await page.waitForTimeout(300);
    }
  });
});

test.describe('A shape drawn inside a button', () => {
  test.beforeEach(async ({ page }) => { await isolateFromDatabase(page); });

  test('the serial-reaction-time dot sits in the middle of its square', async ({ page }) => {
    // The dot is drawn INSIDE the button, as an SVG with display:block — and a block element
    // sits at the left of its container however the text around it is aligned. That put every
    // dot off-centre in its square, which is the one thing a participant is aiming at.
    await runBuiltIn(page, 'srt');

    const boxes = page.locator('main button');
    await expect(boxes.first()).toBeVisible({ timeout: 20_000 });
    await expect(boxes).toHaveCount(4);

    // Whichever box currently holds the visible dot.
    const measured = await page.evaluate(() => {
      const buttons = [...document.querySelectorAll('main button')];
      return buttons.map(button => {
        const svg = button.querySelector('svg');
        if (!svg) return null;
        const b = button.getBoundingClientRect();
        const s = svg.getBoundingClientRect();
        return {
          dx: (s.left + s.width / 2) - (b.left + b.width / 2),
          dy: (s.top + s.height / 2) - (b.top + b.height / 2),
          size: s.width,
        };
      });
    });

    const found = measured.filter(Boolean) as { dx: number; dy: number; size: number }[];
    expect(found.length, 'no box drew a shape at all').toBe(4);

    for (const [i, m] of found.entries()) {
      // Within a pixel of the square's centre, both ways.
      expect(Math.abs(m.dx), `the shape in box ${i} is ${m.dx.toFixed(1)}px off centre horizontally`)
        .toBeLessThanOrEqual(1);
      expect(Math.abs(m.dy), `the shape in box ${i} is ${m.dy.toFixed(1)}px off centre vertically`)
        .toBeLessThanOrEqual(1);
    }
  });
});

test.describe('Everything a trial needs is on screen at once', () => {
  test.use({ viewport: { width: 375, height: 667 } });
  test.beforeEach(async ({ page }) => { await isolateFromDatabase(page); });

  /** Nothing in `main` may extend past the viewport, in either direction. */
  async function nothingOffScreen(page: import('@playwright/test').Page) {
    return page.evaluate(() => {
      const w = document.documentElement.clientWidth;
      const h = document.documentElement.clientHeight;
      const bad: string[] = [];
      for (const el of document.querySelectorAll('main *')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.left < -1 || r.right > w + 1) bad.push(`${el.tagName} off the side`);
        if (r.bottom > h + 1) bad.push(`${el.tagName} below the fold`);
      }
      return bad.slice(0, 3);
    });
  }

  test('two figures side by side fit, and are not cut off at the bottom', async ({ page }) => {
    // Mental rotation shows two 200px block figures with a 48px gap — 448px, wider than a
    // phone — so the right-hand one ran off the edge and both were cut where the buttons
    // began. Tested directly rather than by walking the experiment, which opens with a
    // thirty-second map study and twenty-one scanning trials before the figures appear.
    const def = {
      version: 1,
      slug: 'e2ePair',
      title: 'Pair',
      titleHe: 'זוג',
      category: 'IMAGINATION',
      instructions: { en: 'Same or different?', he: 'זהה או שונה?' },
      factors: [{ name: 'only', levels: ['a'] }],
      repetitions: 1,
      trial: {
        phases: [{
          name: 'figures',
          // The real figures, at the size the port asks for.
          display: {
            kind: 'pair',
            gap: 48,
            left: { kind: 'image', src: '/mental-rep/figure_1_0.svg', size: 200 },
            right: { kind: 'image', src: '/mental-rep/figure_1_120.svg', size: 200 },
          },
          awaitsResponse: true,
          startsClock: true,
        }],
        response: {
          kind: 'choice',
          layout: 'row',
          options: [
            { value: 'same', label: 'Same' },
            { value: 'different', label: 'Different' },
          ],
        },
        correct: { kind: 'none' },
        itiMs: 0,
      },
      store: ['only'],
      thanks: { showResults: false },
      dashboard: { charts: [{ title: 'c', kind: 'bar', groupBy: 'only', measure: 'count' }] },
    };

    await runPreview(page, def as never);

    const figures = page.locator('main img');
    await expect(figures.first()).toBeVisible({ timeout: 15_000 });
    await expect(figures).toHaveCount(2);

    // Both on screen, side by side, with the answer buttons visible below them.
    expect(await nothingOffScreen(page), 'part of the trial is off screen').toEqual([]);
    await expect(page.getByRole('button', { name: 'Same' })).toBeVisible();

    const [a, b] = await figures.all();
    const boxA = await a.boundingBox();
    const boxB = await b.boundingBox();
    expect(boxA!.width, 'the figures were shrunk to nothing').toBeGreaterThan(60);
    // Still side by side rather than stacked.
    expect(Math.abs(boxA!.y - boxB!.y), 'the figures wrapped onto two rows').toBeLessThan(4);
  });

  test('the bRMS answer buttons are on screen with the frame', async ({ page }) => {
    // The frame was sized from the window alone, which filled the display and pushed LEFT and
    // RIGHT below the fold. Scrolling to answer is time inside the breakthrough measurement.
    await runBuiltIn(page, 'bRMS');

    await page.locator('input[type="range"]').fill('90');
    await page.getByRole('button', { name: 'That looks right' }).click();
    await expect(page.getByText(/display is steady enough|not perfectly steady/)).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'That looks right' }).click();
    await page.getByRole('button', { name: 'Start' }).click();

    const left = page.getByRole('button', { name: 'Left', exact: true });
    await expect(left).toBeVisible({ timeout: 20_000 });

    // Visible is not enough — it has to be in the viewport without scrolling.
    const box = await left.boundingBox();
    const height = await page.evaluate(() => document.documentElement.clientHeight);
    expect(box, 'the Left button has no position').toBeTruthy();
    expect(box!.y + box!.height, 'the answer buttons are below the fold')
      .toBeLessThanOrEqual(height + 1);

    // And the page does not scroll at all.
    const scrollable = await page.evaluate(() =>
      document.documentElement.scrollHeight > document.documentElement.clientHeight + 1);
    expect(scrollable, 'the trial screen scrolls').toBe(false);
  });

  test('a search array fits on the screen, with nothing to scroll to', async ({ page }) => {
    // Visual search lays its items out in a 600x500 field. That is wider than a phone, so
    // items near the right edge were simply off it and the page scrolled to reach them —
    // and an item a participant has to scroll to find is not one they searched for. The
    // array now scales as a whole, which keeps every item's position relative to the others.
    await runBuiltIn(page, 'visualSearch');

    for (let i = 0; i < 3; i++) {
      const answer = page.getByRole('button', { name: /^Present/ });
      await expect(answer).toBeVisible({ timeout: 20_000 });

      expect(await nothingOffScreen(page), 'part of the search array is unreachable').toEqual([]);
      const scrollable = await page.evaluate(() =>
        document.documentElement.scrollHeight > document.documentElement.clientHeight + 1);
      expect(scrollable, 'the search screen scrolls').toBe(false);

      // Scaled, not cropped: the items are all still drawn. A set size is drawn per trial
      // and can be as low as one, so this only asks that the array is not empty.
      const items = await page.locator('main div[style*="rotate"]').count();
      expect(items, 'the array lost its items').toBeGreaterThan(0);

      await answer.click();
      await page.waitForTimeout(1300);
    }
  });

  test('an ensemble array fits, and practice gives an estimate no verdict', async ({ page }) => {
    // Two things at once, because they are both about the same ten practice trials.
    //
    // The group of shapes is laid out in a 520x460 field, so it had the same problem the
    // search array had — and here a member that falls off the edge changes the average the
    // participant is being asked for.
    //
    // And an estimate is not right or wrong. The original never says so: it shows the true
    // average beside what was given. Calling a number inside a tolerance "correct" tells
    // someone their guess was right when it may have been well off.
    await runBuiltIn(page, 'summaryStats');

    let sawEstimate = false;
    let sawRecognition = false;

    for (let i = 0; i < 10 && !(sawEstimate && sawRecognition); i++) {
      const slider = page.locator('input[type="range"]');
      const yes = page.getByRole('button', { name: /^Yes/ });
      await expect(slider.or(yes).first()).toBeVisible({ timeout: 20_000 });

      expect(await nothingOffScreen(page), 'part of the trial is off screen').toEqual([]);

      if (await slider.count() > 0) {
        const min = Number(await slider.getAttribute('min'));
        await slider.fill(String(min));
        await page.getByRole('button', { name: 'Confirm' }).click();

        // The true average, and no verdict either way. The slider was dragged to the very
        // bottom of the scale, so a verdict here would almost certainly be the wrong one.
        await expect(page.getByText(/^The average was \d+$/)).toBeVisible({ timeout: 5000 });
        await expect(page.getByText(/^(Correct|Incorrect)$/)).toHaveCount(0);
        sawEstimate = true;
      } else {
        await yes.click();
        // Recognition DOES have a right answer, so it still gets one.
        await expect(page.getByText(/^(Correct|Incorrect)$/)).toBeVisible({ timeout: 5000 });
        sawRecognition = true;
      }
      await page.waitForTimeout(1400);
    }

    expect(sawEstimate, 'no practice trial asked for an average').toBe(true);
    expect(sawRecognition, 'no practice trial asked about a single item').toBe(true);
  });
});
