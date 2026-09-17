import { test, expect, Page } from '@playwright/test';

// The QR code a lecturer projects so a room full of students can open an experiment.
//
// It used to live on every /teacher page, which meant putting the class's results on the
// projector to get the link on screen. It now opens from the homepage — behind the
// password, where the experiments are already listed — so these tests pin both halves:
// that each card can produce its own code, and that dashboards no longer carry one.

async function asLecturer(page: Page) {
  await page.route('**/rest/v1/**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.addInitScript(() => {
    sessionStorage.setItem('ss_home_authed', '1');
    sessionStorage.setItem('ss_create_key', 'placeholder');
  });
  await page.goto('/');
}

test('each experiment card opens its own QR code, with the link students would scan', async ({ page }) => {
  await asLecturer(page);

  await page.getByRole('button', { name: 'QR code for students — Stroop Effect' }).click();

  // Scoped to the dialog: the card behind it carries the same name, which is the point —
  // the lecturer is looking at the experiment they clicked. Anchored on the heading AND the
  // code itself, so it cannot match the dialog's header row or the page around it.
  const dialog = page.locator('div')
    .filter({ hasText: 'Scan to take the experiment' })
    .filter({ has: page.locator('canvas[data-qr]') })
    .last();
  await expect(page.getByRole('heading', { name: 'Scan to take the experiment' })).toBeVisible();
  await expect(dialog.getByText('Stroop Effect', { exact: true })).toBeVisible();
  // The URL is the experiment itself — never the dashboard.
  await expect(dialog.getByText(/\/stroop$/)).toBeVisible();
  await expect(page.locator('canvas[data-qr]')).toBeVisible();
});

test('a /run experiment gets its /run link, not the old route', async ({ page }) => {
  await asLecturer(page);

  await page.getByRole('button', { name: /QR code for students — Word Pair Lexical Decision/ }).click();
  await expect(page.getByText(/\/run\/lexicalDecisionPairs$/)).toBeVisible();
});

test('the code closes on Escape, because it is opened in front of a room', async ({ page }) => {
  await asLecturer(page);

  await page.getByRole('button', { name: 'QR code for students — Stroop Effect' }).click();
  await expect(page.locator('canvas[data-qr]')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.locator('canvas[data-qr]')).toHaveCount(0);
});

test('teacher dashboards no longer carry a QR button', async ({ page }) => {
  await page.route('**/rest/v1/**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.addInitScript(() => sessionStorage.setItem('ss_teacher_authed', '1'));
  await page.goto('/run/stroopClassic/teacher');

  await expect(page.getByRole('button', { name: 'Mock Data' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Student QR/ })).toHaveCount(0);
  await expect(page.locator('canvas[data-qr]')).toHaveCount(0);
});
