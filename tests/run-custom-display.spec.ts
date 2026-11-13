import { test, expect, Page } from '@playwright/test';

// Custom displays — a phase drawn by a sandboxed script — running in a real browser.
//
// The offline suite (prompt-tests/sandbox.test.mjs) covers validation and the parsing of
// what a script sends back. This covers what only a browser shows: that the frame really
// runs, that a script can answer a trial, that a crashing script never strands a
// participant, and that the sandbox really cannot reach the site.
//
// Definitions are handed to /run through the preview store, the same way /create shows a
// draft, so no database and no API key are involved.

type Def = Record<string, unknown>;

const CHOICE = {
  kind: 'choice',
  options: [
    { label: 'Left', labelHe: 'שמאל', value: 'left' },
    { label: 'Right', labelHe: 'ימין', value: 'right' },
  ],
};

function base(slug: string, trial: Def, extra: Def = {}): Def {
  return {
    slug,
    version: 1,
    title: { en: 'Custom display test', he: 'בדיקת תצוגה' },
    category: 'Perception',
    description: { en: 'Test', he: 'בדיקה' },
    instructions: { en: ['Test.'], he: ['בדיקה.'] },
    factors: [{ name: 'direction', levels: ['left', 'right'] }],
    repetitions: 2,
    trial,
    store: ['direction'],
    dashboard: { charts: [{ title: 'Accuracy', groupBy: 'direction', measure: 'accuracy' }] },
    ...extra,
  };
}

/** Moving dots for 600ms, then ordinary buttons. Records how many frames it drew. */
const DOTS = `
const { ctx, width, height } = exp.canvas();
const dir = exp.values.direction === 'left' ? -1 : 1;
const dots = Array.from({ length: 80 }, () => ({ x: exp.random() * width, y: exp.random() * height }));
let frames = 0, last = exp.now();
function frame() {
  const now = exp.now(), dt = (now - last) / 1000; last = now;
  ctx.clearRect(0, 0, width, height); ctx.fillStyle = '#f8fafc';
  for (const p of dots) { p.x = (p.x + dir * 120 * dt + width) % width; ctx.fillRect(p.x, p.y, 3, 3); }
  frames++; exp.record({ dots_frames: frames });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);`;

const motion = base('e2eMotion', {
  phases: [
    { name: 'fixation', display: { kind: 'fixation' }, durationMs: 200 },
    { name: 'dots', display: { kind: 'blank' }, durationMs: 600, custom: { script: DOTS } },
    { name: 'response', display: { kind: 'blank' }, awaitsResponse: true, startsClock: true },
  ],
  response: CHOICE,
  correct: { kind: 'matchesFactor', factor: 'direction' },
});

/** The script IS the response: a target to tap, scored by the script, counting via memory. */
const TAP = `
const count = (exp.memory && exp.memory.count) || 0;
const b = document.createElement('button');
b.id = 'target';
b.textContent = 'Tap ' + (count + 1);
b.addEventListener('pointerdown', () => {
  exp.keep({ count: count + 1 });
  exp.done('tapped', { correct: true, seen_before: count });
});
exp.root.appendChild(b);`;

const tapper = base('e2eTapper', {
  phases: [
    { name: 'tap', display: { kind: 'blank' }, awaitsResponse: true, startsClock: true, custom: { script: TAP, responds: true } },
  ],
  response: { kind: 'text' },
  correct: { kind: 'reported' },
});

/** Throws on every trial — once while answering, once while only displaying. */
const broken = base('e2eBroken', {
  phases: [
    { name: 'dots', display: { kind: 'blank' }, durationMs: 300, custom: { script: 'exp.values.nothing.here = 1;' } },
    { name: 'tap', display: { kind: 'blank' }, awaitsResponse: true, custom: { script: 'undefinedFunction();\nexp.done("x");', responds: true } },
  ],
  response: { kind: 'text' },
  correct: { kind: 'none' },
});

/** Tries everything a hostile script would, and reports what got through. */
const PROBE = `
const out = {};
try { out.parent_dom = String(!!parent.document.body); } catch (e) { out.parent_dom = 'blocked'; }
try { localStorage.setItem('x', '1'); out.storage = 'open'; } catch (e) { out.storage = 'blocked'; }
try { out.cookie = document.cookie === '' ? 'empty' : 'readable'; } catch (e) { out.cookie = 'blocked'; }
fetch('https://example.com/').then(() => exp.done('probe', { ...out, fetch: 'open' }), () => exp.done('probe', { ...out, fetch: 'blocked' }));`;

const probe = base('e2eProbe', {
  phases: [
    { name: 'probe', display: { kind: 'blank' }, awaitsResponse: true, custom: { script: PROBE, responds: true } },
  ],
  response: { kind: 'text' },
  correct: { kind: 'none' },
}, { repetitions: 1, factors: [{ name: 'direction', levels: ['left'] }] });

/** Every row the run tried to save, as the JSON body it posted. Nothing reaches the database. */
async function captureSaves(page: Page): Promise<unknown[]> {
  const saved: unknown[] = [];
  await page.route('**/rest/v1/**', async route => {
    const request = route.request();
    if (request.method() === 'GET' || request.method() === 'HEAD') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    try { saved.push(request.postDataJSON()); } catch { /* not JSON */ }
    return route.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
  });
  return saved;
}

async function start(page: Page, def: Def) {
  await page.addInitScript(d => {
    sessionStorage.setItem('cognitives_preview_definitions', JSON.stringify({ [d.slug as string]: d }));
  }, def);
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.goto(`/run/${def.slug}`);
    const notFound = await page.getByRole('heading', { name: '404' }).isVisible().catch(() => false);
    if (!notFound) break;
    await page.waitForTimeout(1500);
  }
  await page.getByPlaceholder(/שם|Name/).fill('E2E Tester');
  await page.getByRole('button', { name: /התחלה|Begin/ }).click();
}

const thanks = (page: Page) => page.getByRole('heading', { name: /thank you|תודה/i });

/** The saved rows that came from trials, flattened to one string for searching. */
const savedText = (saved: unknown[]) => JSON.stringify(saved);

/**
 * Waits for the saved rows to contain a pattern. Saves are fired per trial and do not hold
 * up the thank-you screen, so the last one can still be in flight when it appears.
 */
async function savedMatches(saved: unknown[], pattern: RegExp) {
  await expect.poll(() => savedText(saved), { timeout: 10_000 }).toMatch(pattern);
}

test.describe('custom displays', () => {
  test('moving dots run in a sandbox, then ordinary buttons answer', async ({ page }) => {
    test.setTimeout(90_000);
    const saved = await captureSaves(page);
    await start(page, motion);

    // The frame appears for the dots phase, sandboxed without same-origin.
    const frame = page.locator('iframe[title="stimulus"]');
    await expect(frame).toBeVisible({ timeout: 10_000 });
    await expect(frame).toHaveAttribute('sandbox', 'allow-scripts');

    for (let i = 0; i < 40 && !(await thanks(page).isVisible().catch(() => false)); i++) {
      const button = page.locator('main button', { hasText: /Left|שמאל/ });
      if (await button.isVisible().catch(() => false)) await button.click().catch(() => {});
      await page.waitForTimeout(150);
    }
    await expect(thanks(page)).toBeVisible();
    // The script's own column reached the saved row: it really ran and drew frames.
    await savedMatches(saved, /"dots_frames":\s*[1-9]/);
  });

  test('a script can answer the trial, score it, and remember across trials', async ({ page }) => {
    test.setTimeout(90_000);
    const saved = await captureSaves(page);
    await start(page, tapper);

    for (let i = 0; i < 4; i++) {
      const target = page.frameLocator('iframe[title="stimulus"]').locator('#target');
      await expect(target).toHaveText(`Tap ${i + 1}`, { timeout: 10_000 });
      await target.dispatchEvent('pointerdown');
    }
    await expect(thanks(page)).toBeVisible({ timeout: 10_000 });

    await savedMatches(saved, /"seen_before":\s*3/);
    const text = savedText(saved);
    // Scored by the script's own verdict through the `reported` rule.
    expect(text).toMatch(/"is_correct":\s*true/);
    expect(text).not.toMatch(/"is_correct":\s*false/);
  });

  test('a script that crashes never strands the participant, and the crash is recorded', async ({ page }) => {
    test.setTimeout(60_000);
    const saved = await captureSaves(page);
    await start(page, broken);

    await expect(thanks(page)).toBeVisible({ timeout: 30_000 });
    await savedMatches(saved, /display_error/);
  });

  test('the sandbox cannot reach the site, its storage or the network', async ({ page }) => {
    test.setTimeout(60_000);
    const saved = await captureSaves(page);
    await start(page, probe);

    await expect(thanks(page)).toBeVisible({ timeout: 20_000 });
    await savedMatches(saved, /"fetch":/);
    const text = savedText(saved);
    expect(text).toMatch(/"parent_dom":\s*"blocked"/);
    expect(text).toMatch(/"storage":\s*"blocked"/);
    expect(text).toMatch(/"fetch":\s*"blocked"/);
    expect(text).not.toMatch(/"cookie":\s*"readable"/);
  });

  test('fits a phone screen with no sideways scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await captureSaves(page);
    await start(page, motion);
    await expect(page.locator('iframe[title="stimulus"]')).toBeVisible({ timeout: 10_000 });
    const overflows = await page.evaluate(() =>
      document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(overflows).toBe(false);
  });

  test('a display that shows nothing is recorded on the row', async ({ page }) => {
    test.setTimeout(60_000);
    const saved = await captureSaves(page);
    const blank = base('e2eBlank', {
      phases: [
        { name: 'dots', display: { kind: 'blank' }, durationMs: 600, custom: { script: "const { ctx, width, height } = exp.canvas();\nctx.fillStyle = '#0f172a';\nctx.fillRect(0, 0, width, height);" } },
        { name: 'response', display: { kind: 'blank' }, awaitsResponse: true, startsClock: true },
      ],
      response: CHOICE,
      correct: { kind: 'matchesFactor', factor: 'direction' },
    });
    await start(page, blank);
    for (let i = 0; i < 40 && !(await thanks(page).isVisible().catch(() => false)); i++) {
      const button = page.locator('main button', { hasText: /Left|שמאל/ });
      if (await button.isVisible().catch(() => false)) await button.click().catch(() => {});
      await page.waitForTimeout(150);
    }
    await expect(thanks(page)).toBeVisible();
    await savedMatches(saved, /"display_blank":\s*true/);
  });

  test('eight positioned arrows each show their arrow, each in its own place', async ({ page }) => {
    await captureSaves(page);
    const arrows: [string, string][] = [['→', 'right'], ['↗', 'top-right'], ['↑', 'top'], ['↖', 'top-left'],
      ['←', 'left'], ['↙', 'bottom-left'], ['↓', 'bottom'], ['↘', 'bottom-right']];
    const eight = base('e2eEight', {
      phases: [{ name: 'response', display: { kind: 'blank' }, awaitsResponse: true, startsClock: true }],
      response: { kind: 'choice', layout: 'positioned', options: arrows.map(([label, at]) => ({ label, labelHe: label, value: at, at })) },
      correct: { kind: 'none' },
    }, { factors: [{ name: 'direction', levels: ['right'] }], repetitions: 1 });
    await start(page, eight);

    const boxes = [];
    for (const [label] of arrows) {
      const button = page.locator('main button', { hasText: label });
      await expect(button).toBeVisible({ timeout: 10_000 });
      boxes.push(await button.boundingBox());
    }
    // No two overlap: every one of the eight can be pressed.
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]!, b = boxes[j]!;
      const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
      expect(overlap, `${arrows[i][0]} overlaps ${arrows[j][0]}`).toBe(false);
    }
  });
});
