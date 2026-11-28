import { defineConfig } from "@playwright/test";

// `make e2e` starts a production build of the app (project ezh_e2e) and runs this in the `e2e` compose service,
// which reaches it at BASE_URL=http://127.0.0.1:3196 (set by the Makefile).
export default defineConfig({
  testDir: "./e2e",
  // Only *.spec.ts are Playwright tests; e2e/helpers/*.test.ts are Vitest unit tests (run by `make check`).
  testMatch: "**/*.spec.ts",
  outputDir: "./test-results",
  // html report (never auto-opened) is uploaded as a CI artifact on failure
  reporter: [["list"], ["html", { open: "never" }]],
  timeout: 60_000,
  // One worker: the specs share one learner (and one database), and lesson.spec.ts must run before replay.spec.ts.
  workers: 1,
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
