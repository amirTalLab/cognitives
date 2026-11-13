import { test, expect, Page, Route } from '@playwright/test';

// /create's safety net for custom displays (sandboxed scripts).
//
// After every build and refine, the wizard runs each custom display for a moment out of
// sight. A script that crashes is sent back to the model as a repair request — at most
// twice — and publishing is refused while any failure is known. Here the model is the
// route below, so nothing is metered and the "repair" is whatever the test says it is.

test.describe.configure({ mode: 'serial' });

const DRAFT_KEY = 'cognitives_create_draft';

/** Parses fine — the validator passes it — and throws the moment it runs. */
const BROKEN = 'const n = exp.values.missing.length;\nexp.root.textContent = n;';
const FIXED = 'exp.root.textContent = String(exp.values.direction);';

function definition(script: string) {
  return {
    slug: 'e2eCreateCustom',
    version: 1,
    title: 'Custom display check',
    titleHe: 'בדיקת תצוגה',
    category: 'PERCEPTION',
    description: { en: 'Test', he: 'בדיקה' },
    instructions: { en: 'Test.', he: 'בדיקה.' },
    factors: [{ name: 'direction', levels: ['left', 'right'] }],
    repetitions: 4,
    trial: {
      phases: [
        { name: 'show', display: { kind: 'blank' }, durationMs: 500, custom: { script } },
        { name: 'response', display: { kind: 'blank' }, awaitsResponse: true, startsClock: true },
      ],
      response: { kind: 'choice', options: [{ label: 'Left', labelHe: 'שמאל', value: 'left' }, { label: 'Right', labelHe: 'ימין', value: 'right' }] },
      correct: { kind: 'matchesFactor', factor: 'direction' },
    },
    store: ['direction'],
    dashboard: { charts: [{ title: 'Accuracy', groupBy: 'direction', measure: 'accuracy' }] },
  };
}

function draft(script: string) {
  return JSON.stringify({
    version: 1,
    savedAt: Date.now() - 60_000,
    stage: 'refine',
    pdfName: 'paper.pdf',
    analysis: null,
    candidate: null,
    spec: {
      slug: 'e2eCreateCustom', title: 'Custom display check', titleHe: 'בדיקת תצוגה', category: 'PERCEPTION',
      buildTarget: 'definition',
      fields: [{ key: 'design', label: 'Design description', value: 'Test.', source: 'inferred' }],
    },
    assets: null,
    definition: definition(script),
    files: [],
    notes: '',
    problems: [],
    messages: [],
    usage: [],
    staged: true,
    compileState: { ok: true, message: 'Valid and ready to run.' },
    finishResult: null,
  });
}

/** Opens /create past the gate with a draft, and answers refine calls with `reply`. */
async function openWith(page: Page, script: string, reply: (body: { messages: { content: string }[] }) => string) {
  const refines: string[] = [];
  await page.route('**/rest/v1/**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route('**/api/create/refine', async (route: Route) => {
    const body = route.request().postDataJSON() as { messages: { content: string }[] };
    refines.push(body.messages[body.messages.length - 1].content);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ definition: definition(reply(body)), issues: [], reply: 'Fixed the script.' }),
    });
  });
  await page.addInitScript(([seed, key]) => {
    sessionStorage.setItem('ss_home_authed', '1');
    sessionStorage.setItem('ss_create_key', 'placeholder');
    if (sessionStorage.getItem('__seeded')) return;
    sessionStorage.setItem('__seeded', '1');
    localStorage.setItem(key, seed);
  }, [draft(script), DRAFT_KEY] as const);
  await page.goto('/create');
  await page.getByRole('button', { name: 'Restore' }).click();
  return refines;
}

test('a crashing script is found and repaired without the lecturer asking', async ({ page }) => {
  test.setTimeout(90_000);
  const refines = await openWith(page, BROKEN, () => FIXED);

  // The repair request names the failure, and the model's fix is checked again.
  await expect.poll(() => refines.length, { timeout: 20_000 }).toBe(1);
  expect(refines[0]).toMatch(/\[Automatic check\]/);
  expect(refines[0]).toMatch(/phase "show"/);
  await expect(page.getByText('The custom display runs without errors and draws something on screen')).toBeVisible({ timeout: 20_000 });
});

test('a script that cannot be repaired stops after two tries and blocks publishing', async ({ page }) => {
  test.setTimeout(90_000);
  const refines = await openWith(page, BROKEN, () => BROKEN);

  await expect(page.getByRole('button', { name: 'Fix it automatically' })).toBeVisible({ timeout: 30_000 });
  // Two automatic attempts, then it waits for a person rather than spending in a loop.
  await page.waitForTimeout(4000);
  expect(refines.length).toBe(2);

  await page.getByRole('button', { name: /Finish & publish/ }).click();
  await expect(page.getByText(/Not published — a custom display is failing/)).toBeVisible();
});

/** Runs cleanly and paints the frame the page's own colour: nothing a participant could see. */
const BLANK = "const { ctx, width, height } = exp.canvas();\nctx.fillStyle = '#0f172a';\nctx.fillRect(0, 0, width, height);";

test('a script that runs but shows nothing is caught, and the cause goes with the next request', async ({ page }) => {
  test.setTimeout(90_000);
  const refines = await openWith(page, BLANK, () => BLANK);

  // Caught by the check like a crash — this is "you cannot see the dots at all".
  await expect.poll(() => refines.length, { timeout: 20_000 }).toBe(1);
  expect(refines[0]).toMatch(/shows NOTHING on screen/);
  expect(refines[0]).toMatch(/canvas/);
  await expect(page.getByRole('button', { name: 'Fix it automatically' })).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(3000);
  expect(refines.length).toBe(2);

  // The lecturer describes the symptom; what the frame reported is attached for the model.
  await page.getByPlaceholder('What should change?').fill('I cannot see the dots');
  await page.getByPlaceholder('What should change?').press('Enter');
  await expect.poll(() => refines.length, { timeout: 20_000 }).toBe(3);
  expect(refines[2]).toMatch(/^I cannot see the dots/);
  expect(refines[2]).toMatch(/\[Automatic note[\s\S]*shows NOTHING on screen/);
});
