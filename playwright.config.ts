import { defineConfig } from "@playwright/test";

// The app is started by docker compose (service `app`); the e2e service
// reaches it at BASE_URL=http://e2e-target:3000.
export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  // html report (never auto-opened) is uploaded as a CI artifact on failure
  reporter: [["list"], ["html", { open: "never" }]],
  // the dev server compiles pages on first request
  timeout: 60_000,
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "mobile-360",
      use: {
        browserName: "chromium",
        viewport: { width: 360, height: 640 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2,
      },
    },
  ],
});
