import { defineConfig, devices } from '@playwright/test';

// Which folder is under test.
//   default            -> ..  (this repository: the site the change would ship)
//   SITE_DIR=<path>    -> any other copy of the site, e.g. a staging folder
// The harness only ever reads. It never writes to either folder.
const SITE_DIR = process.env.SITE_DIR || '..';
const PORT = process.env.SITE_DIR ? 4174 : 4173;

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'results/html', open: 'never' }],
    ['json', { outputFile: 'results/gauntlet.json' }],
  ],
  timeout: 120_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: `node node_modules/http-server/bin/http-server "${SITE_DIR}" -p ${PORT} -c-1 --silent`,
    url: `http://127.0.0.1:${PORT}/index.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
