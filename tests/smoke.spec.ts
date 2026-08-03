import { test, expect } from '@playwright/test';

// All experiment slugs, matching middleware.ts and app/ folders.
const EXPERIMENT_SLUGS = [
  'stroop', 'drm', 'bouba-kiki', 'mentalRep', 'summaryStats',
  'posnerCueing', 'visualSearch', 'CompositeFace', 'wordSuperiority',
  'srt', 'twoStepTask', 'serialOrder', 'testingEffect', 'logics',
  'creativity', 'bRMS',
];

test.describe('Homepage', () => {
  test('shows the admin password gate', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('תהליכים קוגניטיביים');
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test('rejects a wrong password', async ({ page }) => {
    await page.goto('/');
    await page.fill('input[type="password"]', 'definitely-wrong');
    await page.click('button[type="submit"]');
    await expect(page.locator('text=Incorrect password')).toBeVisible();
  });
});

test.describe('Experiment landing pages', () => {
  for (const slug of EXPERIMENT_SLUGS) {
    test(`/${slug} renders`, async ({ page }) => {
      const response = await page.goto(`/${slug}`);
      expect(response, `no response for /${slug}`).not.toBeNull();
      expect(response!.ok(), `HTTP ${response!.status()} for /${slug}`).toBe(true);
      // Page hydrated and produced content (not a blank crash / error overlay)
      await expect(page.locator('body')).not.toBeEmpty();
      await expect(page.locator('text=Application error')).toHaveCount(0);
    });
  }
});

test.describe('Teacher dashboards', () => {
  // Spot-check that teacher pages are gated behind a password form.
  for (const slug of ['stroop', 'drm', 'visualSearch']) {
    test(`/${slug}/teacher shows a password gate`, async ({ page }) => {
      await page.goto(`/${slug}/teacher`);
      await expect(page.locator('input[type="password"]')).toBeVisible();
    });
  }
});

test('locked page renders', async ({ page }) => {
  const response = await page.goto('/locked?experiment=stroop');
  expect(response!.ok()).toBe(true);
  await expect(page.locator('body')).not.toBeEmpty();
});
