import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './e2e', fullyParallel: false, workers: 1, retries: 0,
  timeout: 45000, expect: {timeout: 15000},
  reporter: [['list'], ['html', {open: 'never'}]],
  use: {launchOptions: process.env.INDAVERSE_BROWSER_PATH ? {executablePath: process.env.INDAVERSE_BROWSER_PATH, args: ['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']} : {args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader']}, baseURL: 'http://127.0.0.1:3012', trace: 'retain-on-failure', screenshot: 'only-on-failure'},
  projects: [{name: 'chromium', use: {...devices['Desktop Chrome']}}],
  webServer: [
    {command: `"${process.env.INDAVERSE_TEST_PYTHON || 'python'}" ../../scripts/browser_server.py`, url: 'http://127.0.0.1:8012/api/v1/health', timeout: 60000, reuseExistingServer: false},
    {command: 'npm run build:e2e && npm run start:e2e', url: 'http://127.0.0.1:3012/login', timeout: 240000, reuseExistingServer: false},
  ],
});
