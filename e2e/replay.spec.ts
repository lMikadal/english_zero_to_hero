// Replaying a finished lesson at 360px against the real app (docs/plans/replay-plan.md): the list on /practice, one
// skill (reading: no audio), the whole lesson, and the original progress staying where it was.
//
// Setup does not depend on another spec: beforeAll finishes day 1 through the HTTP API (ensureDayOneFinished), unless
// lesson.spec.ts already did (in CI files run alphabetically, "lesson" before "replay"). Like
// lesson.spec.ts it needs a database in which day 1 is the only finished day (CI: fresh; locally: make db-reset).
import { expect, request, test, type Page } from "@playwright/test";
import { SLOW, done, ensureDayOneFinished, expectNoHorizontalScroll, playToEnd, stepLabel } from "./helpers/day1";

const baseURL = process.env.BASE_URL ?? "http://localhost:3000";
const API_TIMEOUT = 90_000; // the dev server compiles each route on its first request

const replayDone = (page: Page) => page.getByRole("heading", { level: 1, name: "จบการเล่นซ้ำแล้ว" });
const currentDayText = async (page: Page) => (await page.locator("h2").filter({ hasText: /วันที่ \d+ \/ 365/ }).first().innerText()).replace(/\s+/g, " ").trim();
/** The expandable row of day 1 on /practice. */
const dayOneRow = (page: Page) => page.locator("details").filter({ has: page.locator("summary", { hasText: /วันที่ 1(?!\d)/ }) });

/** From /practice: expand day 1 and tap one of its links. */
async function openFromPractice(page: Page, link: RegExp) {
  await page.goto("/practice");
  await expect(page.getByRole("heading", { level: 1, name: "ฝึกเพิ่ม" })).toBeVisible(SLOW);
  await dayOneRow(page).locator("summary").click();
  await dayOneRow(page).getByRole("link", { name: link }).click();
}

test.beforeAll(async () => {
  test.setTimeout(240_000);
  const api = await request.newContext({ baseURL });
  try {
    await ensureDayOneFinished(api, API_TIMEOUT);
    // warm the replay completion route (dev server) so compile time cannot push the result past the sink's timeout
    await api.post("/api/practice/complete", { data: {}, timeout: API_TIMEOUT }).catch(() => {});
  } finally {
    await api.dispose();
  }
});

test("replaying one skill (reading) and then the whole lesson leaves the original progress where it was", async ({ page }) => {
  test.setTimeout(240_000);

  await page.goto("/");
  const homeBefore = await currentDayText(page);

  // /practice lists the finished day; expanding it shows the whole-lesson button and one link per skill
  await page.goto("/practice");
  await expect(page.getByRole("heading", { level: 1, name: "ฝึกเพิ่ม" })).toBeVisible(SLOW);
  await expectNoHorizontalScroll(page, "practice (collapsed)");
  await expect(dayOneRow(page)).toHaveCount(1);
  // the lesson's original score as the list shows it: every later screen must show this same number
  const original = (await dayOneRow(page).locator("summary").innerText()).match(/คะแนน (\d+)%/)?.[1];
  expect(original, "the finished day row shows its original score").toBeTruthy();
  const originalLine = `คะแนนเดิมของบท ${original}% (ไม่เปลี่ยน)`;
  await dayOneRow(page).locator("summary").click();
  await expect(dayOneRow(page).getByRole("link", { name: /^เล่นทั้งบท/ })).toBeVisible();
  for (const skill of ["ออกเสียง", "ฟัง", "พูด", "อ่าน", "เขียน"]) {
    await expect(dayOneRow(page).getByRole("link", { name: new RegExp(`^${skill} · \\d+ ข้อ`) })).toBeVisible();
  }
  await expectNoHorizontalScroll(page, "practice (expanded)");

  // one skill: reading
  await dayOneRow(page).getByRole("link", { name: /^อ่าน · \d+ ข้อ/ }).click();
  await expect(page).toHaveURL(/\/day\/1\?skill=reading$/, SLOW);
  await expect(page.getByText("เล่นซ้ำ · อ่าน", { exact: true })).toBeVisible(SLOW);
  await expect(stepLabel(page)).toContainText("ข้อ 1 / 1");
  await playToEnd(page, replayDone(page));
  await expect(replayDone(page)).toBeVisible(SLOW);
  await expect(page.getByText(/^คะแนนรอบนี้ \d+%$/)).toBeVisible(SLOW);
  await expect(page.getByText(originalLine, { exact: true })).toBeVisible(SLOW);
  await expect(page.getByText("ฝึกแยกส่วนไม่นับสตรีค นับเมื่อเล่นทั้งบทจนจบ")).toBeVisible();
  await expect(page.getByRole("link", { name: "ไปบทถัดไป" })).toHaveCount(0);
  await expectNoHorizontalScroll(page, "skill replay completion");

  // the whole lesson, from the list
  await openFromPractice(page, /^เล่นทั้งบท/);
  await expect(page).toHaveURL(/\/day\/1$/, SLOW);
  await expect(page.getByText("เล่นซ้ำ", { exact: true })).toBeVisible(SLOW);
  await playToEnd(page, replayDone(page));
  await expect(replayDone(page)).toBeVisible(SLOW);
  await expect(done(page)).toHaveCount(0); // not the first-time completion screen
  await expect(page.getByText(originalLine, { exact: true })).toBeVisible(SLOW);
  await expect(page.getByText(/^สตรีค \d+ วัน/)).toBeVisible(); // a whole lesson with stored answers counts
  await expect(page.getByRole("link", { name: "ไปบทถัดไป" })).toHaveCount(0);
  await expectNoHorizontalScroll(page, "whole-lesson replay completion");

  // the original progress did not move
  await page.goto("/");
  await expect.poll(() => currentDayText(page), SLOW).toBe(homeBefore);
  await page.goto("/practice");
  await expect(dayOneRow(page).locator("summary")).toContainText(`คะแนน ${original}%`, SLOW);
});

test("/day/1?skill=vocabulary is not a page", async ({ page }) => {
  const response = await page.goto("/day/1?skill=vocabulary");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1, name: "ไม่พบหน้านี้" })).toBeVisible(SLOW);
});
