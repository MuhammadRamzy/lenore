import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const existingChromium =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ??
  join(homedir(), ".cache/ms-playwright/chromium-1243/chrome-linux64/chrome");
export default defineConfig({
  testDir: "tests/browser",
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:8788",
    headless: true,
    launchOptions: existsSync(existingChromium)
      ? { executablePath: existingChromium }
      : {},
    trace: "retain-on-failure",
  },
  webServer: {
    // Own database (.wrangler/e2e) and port, with the demo samples, so tests
    // never mix with the products in your local workspace.
    command:
      "node scripts/setup-local.mjs --persist-to .wrangler/e2e && npm run build:client && wrangler dev --ip 127.0.0.1 --port 8788 --persist-to .wrangler/e2e --var DEMO_MODE:true",
    url: "http://127.0.0.1:8788",
    reuseExistingServer: true,
    timeout: 60000,
  },
});
