// Plays day 1 end to end at 360px against the real app and database, using the real lesson file as the answer key.
//
// It needs a CLEAN learner state: it expects the home page to start at day 1 with streak 0. CI always starts from a
// fresh database. Locally, reset first:   make db-reset CONFIRM=english_zero_to_hero_dev   (then `make e2e`).
// It must run BEFORE e2e/replay.spec.ts (alphabetical order with `workers: 1` gives that): the replay spec finishes
// day 1 through the API when it is not done yet, after which this spec's "วันที่ 1 / 365" start state is gone.
//
// It does not depend on audio: headless Chromium usually has no English voice, in which case the sound exercises
// show "ข้าม" and the test skips them; when audio does work it answers them instead.
import { expect, request, test } from "@playwright/test";
import { SLOW, done, expectNoHorizontalScroll, playToEnd } from "./helpers/day1";

// The first request to an API route compiles it (dev server); warm both so that compile time cannot push the
// completion past the sink's 15 s request timeout. Any status will do.
test.beforeAll(async () => {
  const api = await request.newContext({ baseURL: process.env.BASE_URL ?? "http://localhost:3000" });
  for (const url of ["/api/attempts", "/api/lessons/complete"]) await api.post(url, { data: {}, timeout: 90_000 }).catch(() => {});
  await api.dispose();
});

test("a learner plays day 1 to the end, day 2 opens, day 3 stays locked", async ({ page }) => {
  test.setTimeout(240_000);

  // home: a fresh learner is on day 1
  await page.goto("/");
  await expectNoHorizontalScroll(page, "home");
  await expect(page.getByText("วันที่ 1 / 365")).toBeVisible();
  await page.getByRole("link", { name: "เริ่มบทเรียนวันที่ 1" }).click();
  await expect(page).toHaveURL(/\/day\/1$/, SLOW);

  await playToEnd(page, done(page));

  // completion: the server's answer (streak 1), not a local guess
  await expect(done(page)).toBeVisible(SLOW);
  await expect(page.getByText(/สตรีค 1 วัน/)).toBeVisible(SLOW);
  await expect(page.getByRole("link", { name: "ไปบทถัดไป" })).toHaveAttribute("href", "/day/2");
  await expectNoHorizontalScroll(page, "completion");

  // the next-lesson link opens day 2's first step (no state carried over from day 1)
  await page.getByRole("link", { name: "ไปบทถัดไป" }).click();
  await expect(page).toHaveURL(/\/day\/2$/, SLOW);
  await expect(page.locator("main h2").first()).toContainText("ข้อ 1 /", SLOW);
  await expectNoHorizontalScroll(page, "day 2 first step");

  // home: now day 2, streak 1
  await page.goto("/");
  await expect(page.getByText("วันที่ 2 / 365")).toBeVisible(SLOW);
  await expect(page.getByText("สตรีคต่อเนื่อง").locator("..")).toContainText("1 วัน");
  await expectNoHorizontalScroll(page, "home after day 1");

  // day 3 is locked until day 2 is done
  await page.goto("/day/3");
  await expect(page.getByRole("heading", { name: "ยังไม่ปลดล็อก" })).toBeVisible();
  await expect(page.getByRole("link", { name: /ไปบทเรียนวันที่ 2/ })).toHaveAttribute("href", "/day/2");
  await expectNoHorizontalScroll(page, "locked day");
});
