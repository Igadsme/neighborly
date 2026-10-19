import { defineConfig, devices } from '@playwright/test'

const useExistingServer = process.env.PLAYWRIGHT_USE_EXISTING_SERVER === '1'

export default defineConfig({
  testDir: './tests/frontend',
  testIgnore: ['**/._*'],
  timeout: 30_000,
  fullyParallel: true,
  workers: useExistingServer ? 1 : undefined,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4173',
    ignoreHTTPSErrors: process.env.PLAYWRIGHT_IGNORE_HTTPS_ERRORS === '1',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 5'] } },
  ],
  ...(useExistingServer
    ? {}
    : {
        webServer: {
          command: 'PORT=4173 pnpm dev --host 127.0.0.1',
          url: 'http://127.0.0.1:4173',
          reuseExistingServer: !process.env.CI,
        },
      }),
})
