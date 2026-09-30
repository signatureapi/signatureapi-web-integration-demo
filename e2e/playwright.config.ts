import { defineConfig, devices } from "@playwright/test";

const PORT = 3999;

/**
 * Real ceremonies against SignatureAPI test mode, framed by the demo page in
 * the three desktop engines. The demo server runs from ../server with the key
 * in server/.env, and serves the page from the origin the ceremonies allow.
 */
export default defineConfig({
  testDir: "tests",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  workers: 4,
  retries: 0,
  reporter: [["list"]],
  use: {
    // localhost, not 127.0.0.1: the origin has to match embeddable_in exactly.
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
  ],
  webServer: {
    command: "node --env-file-if-exists=.env src/index.ts",
    cwd: "../server",
    env: { PORT: String(PORT) },
    url: `http://localhost:${PORT}/health`,
    reuseExistingServer: false,
    stdout: "ignore",
    stderr: "pipe",
  },
});
