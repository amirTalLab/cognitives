import { defineConfig, devices } from '@playwright/test';

// Settable so two checkouts can run the suite at once — a second worktree uses
// E2E_PORT=3212. Without it both would bind the same port and, because
// `reuseExistingServer` is on locally, the second run would silently test the FIRST
// checkout's code: a green suite for changes it never loaded.
const PORT = Number(process.env.E2E_PORT ?? 3211);

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    // Dedicated port so tests never collide with (or accidentally reuse)
    // another dev server running on the default :3000.
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
