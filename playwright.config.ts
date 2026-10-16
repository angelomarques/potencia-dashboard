import { defineConfig, devices } from "@playwright/test";

const port = process.env.VERIFY_PORT || "43210";
const baseURL = process.env.BASE_URL || process.env.VERIFY_URL || process.env.PLAYWRIGHT_BASE_URL || `http://localhost:${port}`;
const reuseServer = Boolean(process.env.BASE_URL || process.env.VERIFY_URL || process.env.PLAYWRIGHT_BASE_URL);

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.spec.ts",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  use: {
    baseURL,
    trace: "off",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: reuseServer
    ? undefined
    : {
        command: `pnpm exec next dev --port ${port}`,
        url: `http://localhost:${port}/sign-in`,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
