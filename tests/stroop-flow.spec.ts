import { test, expect, Page } from '@playwright/test';

const PRACTICE_TRIALS = 5;
const REAL_TRIALS = 36;

// Font colors from types/stroop.ts COLORS, as computed rgb() strings,
// mapped to the keyboard shortcut for that color.
const RGB_TO_KEY: Record<string, string> = {
  'rgb(244, 63, 94)': 'r',  // #f43f5e red
  'rgb(52, 211, 153)': 'g', // #34d399 green
  'rgb(251, 191, 36)': 'y', // #fbbf24 yellow
};

// The stimulus word span (rendered by TrialDisplay with an inline color style).
const STIMULUS = 'main span.select-none';

/** Wait for the next stimulus, read its font color, press the matching key. */
async function answerTrialCorrectly(page: Page): Promise<void> {
  const stimulus = page.locator(STIMULUS);
  await expect(stimulus).toBeVisible({ timeout: 5000 });
  const color = await stimulus.evaluate((el) => getComputedStyle(el).color);
  const key = RGB_TO_KEY[color];
  expect(key, `unexpected stimulus color ${color}`).toBeTruthy();
  await page.keyboard.press(key);
  // Inter-trial blank is 500ms; wait it out so the next read sees a fresh trial.
  await page.waitForTimeout(650);
}

test('full Stroop participant flow: landing → practice → 36 trials → thanks', async ({ page }) => {
  // 5 practice (must be correct) + 36 real trials + transitions ≈ 30-40s.
  test.setTimeout(180_000);

  await page.goto('/stroop');
  await expect(page.locator('h1')).toContainText('ניסוי סטרופ');

  // Start button without a name shows a validation alert instead of navigating.
  page.once('dialog', (dialog) => dialog.accept());
  await page.click('text=התחל ניסוי');
  await expect(page).toHaveURL('/stroop');

  // Enter a name and start.
  await page.fill('#fullName', 'Playwright Tester');
  await page.click('text=התחל ניסוי');
  await expect(page).toHaveURL('/stroop/experiment');

  // Practice phase — banner visible; wrong answers repeat the trial, so answer correctly.
  // The banner follows the language chosen on the landing page, and Hebrew is the default.
  await expect(page.locator('text=ניסוי אימון')).toBeVisible();
  for (let i = 0; i < PRACTICE_TRIALS; i++) {
    await answerTrialCorrectly(page);
  }

  // Real phase — practice banner gone.
  await expect(page.locator('text=ניסוי אימון')).toHaveCount(0);
  for (let i = 0; i < REAL_TRIALS; i++) {
    if (page.url().endsWith('/stroop/thanks')) break;
    await answerTrialCorrectly(page);
  }

  await expect(page).toHaveURL('/stroop/thanks', { timeout: 10_000 });
});

test('the language toggle carries English through the whole run', async ({ page }) => {
  // Stroop used to be Hebrew on the landing and English inside, so a participant could not
  // run it in one language. The toggle now sets the language for every page of the run.
  await page.goto('/stroop');
  await page.click('text=English');
  await expect(page.locator('h1')).toContainText('Stroop Experiment');

  await page.fill('#fullName', 'Playwright Tester');
  await page.click('text=Start experiment');
  await expect(page).toHaveURL('/stroop/experiment');

  // The experiment page reads the choice back out of sessionStorage.
  await expect(page.locator('text=Practice Trial')).toBeVisible();
  await expect(page.locator('text=font colour')).toBeVisible();
});
