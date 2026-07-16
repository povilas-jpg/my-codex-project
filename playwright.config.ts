import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:7466",
    // Prefer a system/pre-provisioned Chromium (e.g. sandboxed CI images)
    // over downloading a matching build.
    launchOptions: process.env.CLAUDE_PAD_CHROMIUM
      ? { executablePath: process.env.CLAUDE_PAD_CHROMIUM }
      : {},
  },
  webServer: {
    command: "npx tsx scripts/e2e-server.ts",
    url: "http://127.0.0.1:7466/api/health",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
