import { defineConfig } from "@playwright/test";

// `make e2e` starts a production build of the app (project ezh_e2e) and runs this in the `e2e` compose service,
// which reaches it at BASE_URL=http://127.0.0.1:3196 (set by the Makefile).
export default defineConfig({
  testDir: "./e2e",
  // Only *.spec.ts are Playwright tests; e2e/helpers/*.test.ts are Vitest unit tests (run by `make check`).
  testMatch: "**/*.spec.ts",
  // Everything Playwright writes (traces, .last-run.json, attachments, the html report) lives under ONE folder, e2e-artifacts/.
  // Playwright removes and recreates its output folders when a run starts, which needs write permission on the PARENT. The
  // container user (uid 1000) must not need that on the checkout root, which on CI belongs to the runner user, so the parent
  // is a folder made for it: the CI job creates e2e-artifacts/ for uid 1000, `make e2e` creates it when missing.
  // e2e/helpers/config.test.ts keeps it that way. The html report (never auto-opened) is uploaded as a CI artifact on failure.
  outputDir: "./e2e-artifacts/test-results",
  reporter: [["list"], ["html", { open: "never", outputFolder: "e2e-artifacts/playwright-report" }]],
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
