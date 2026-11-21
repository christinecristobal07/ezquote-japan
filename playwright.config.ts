import { defineConfig, devices } from '@playwright/test';
import { BASE_URL, EVIDENCE_DIR, ROOT, uatConfigured } from './e2e/uat-env.ts';

/**
 * End-to-end UAT.
 *
 * The app is served from a UAT build (`--mode uat` makes Vite read .env.uat),
 * never from the production env file. When .env.uat is absent the specs skip
 * themselves with a reason rather than failing, so the pipeline stays usable
 * before the UAT project exists.
 */
const configured = uatConfigured();

export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e/.results',
  fullyParallel: false,
  forbidOnly: process.env.CI === 'true',
  retries: process.env.CI === 'true' ? 1 : 0,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { outputFolder: 'e2e/.report', open: 'never' }]],

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    locale: 'en-PH',
    timezoneId: 'Asia/Manila',
  },

  projects: [
    {
      name: 'setup',
      testMatch: /global\.setup\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'desktop',
      testIgnore: [/global\.setup\.ts/, /mobile\./],
      dependencies: configured ? ['setup'] : [],
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        // UAT-16 reads the clipboard to prove Copy Full is exact.
        permissions: ['clipboard-read', 'clipboard-write'],
      },
    },
    {
      name: 'mobile',
      testMatch: /mobile\./,
      dependencies: configured ? ['setup'] : [],
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 375, height: 812 },
        isMobile: false,
        hasTouch: true,
        permissions: ['clipboard-read', 'clipboard-write'],
      },
    },
  ],

  // Only started when there is a UAT project to serve.
  ...(configured
    ? {
        webServer: {
          command: 'npm run dev:uat',
          url: BASE_URL,
          cwd: ROOT,
          reuseExistingServer: process.env.CI !== 'true',
          timeout: 120_000,
        },
      }
    : {}),

  metadata: { evidenceDir: EVIDENCE_DIR },
});
