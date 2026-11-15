import { defineConfig, devices } from '@playwright/test'

// Each spec starts its own server on a throwaway data directory
// (tests/helpers/server.ts), so there is no shared webServer here.
export default defineConfig({
  testDir: 'tests/e2e',
  globalSetup: './tests/helpers/build.ts',
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  // An action that cannot be done fails after ten seconds and names itself,
  // instead of waiting out the whole test.
  use: { trace: 'retain-on-failure', actionTimeout: 10_000 },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
