import { defineConfig, devices } from '@playwright/test';

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
    baseURL: 'http://localhost:3211',
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
    command: 'npm run dev -- --port 3211',
    url: 'http://localhost:3211',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
