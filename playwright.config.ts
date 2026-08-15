import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  // publisher-prototype/ runs its own Playwright suite from inside the directory.
  testIgnore: "publisher-prototype/**",
  timeout: 60_000,
  use: {
    baseURL: "http://localhost:3000",
    // In environments with a pre-provisioned Chromium (PLAYWRIGHT_BROWSERS_PATH +
    // PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD), launch it directly instead of downloading.
    ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } }
      : {}),
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
    // .pub import runs in fixture mode (plan §10.1): e2e is deterministic on
    // machines without libmspub-tools, and the demo trace is the known payload.
    env: { ...process.env, STP_IMPORT_FIXTURE: "1" },
  },
});
