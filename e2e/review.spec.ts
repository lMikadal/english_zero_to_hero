// Vocabulary review at 360px against the real app (docs/plans/vocab-review-plan.md, PR 6): the entry points on the home
// page and /practice, one whole session of `en_th` cards (front, back, rating, requeue, completion), nothing left due,
// then one whole session of `th_en` cards (the mirror: the front must not show the English word).
//
// Order: files run alphabetically with one worker, so this file runs LAST (home, lesson, nav, replay, review). It only
// ever adds reviews and moves `due` of review cards; it does not touch lessons, attempts or progress, so it cannot break
// the assumptions of lesson.spec.ts / replay.spec.ts. Nothing may run after it that expects a day with no review.
// Like them it needs a database in which day 1 is the only finished day (CI: fresh; locally: make db-reset).
//
// Making cards due: a lesson finished today creates `en_th` cards due tomorrow and `th_en` cards the day after, so right
// after the lesson nothing is due and the app has (on purpose) no way to skip its clock. The test moves `due` into the
// past with one SQL update (e2e/helpers/due.ts: refuses any database not ending in `_dev`, reads E2E_DATABASE_URL from the
// e2e service) and then uses only the pages. No audio is needed: the tests never play a sound.
import { expect, request, test, type Locator, type Page } from "@playwright/test";
import { SLOW, ensureDayOneFinished, expectNoHorizontalScroll } from "./helpers/day1";
import { makeCardsDue } from "./helpers/due";

const baseURL = process.env.BASE_URL ?? "http://localhost:3000";
const API_TIMEOUT = 90_000; // the dev server compiles each route on its first request

test.describe.configure({ mode: "serial" }); // each test needs the one before it (cards, due dates, streak)

const NONE_DUE = "วันนี้ไม่มีคำถึงกำหนดทวน";
const RATINGS = ["จำไม่ได้", "ยาก", "ได้", "ง่าย"] as const;

const practiceHeading = (page: Page) => page.getByRole("heading", { level: 1, name: "ฝึกเพิ่ม" });
const startLink = (page: Page) => page.getByRole("link", { name: "เริ่มทวน", exact: true });
const homeRow = (page: Page) => page.getByRole("link", { name: /^ทวนคำศัพท์ · ถึงกำหนด \d+ ใบ$/ });
const counter = (page: Page) => page.getByText(/^\d+ \/ \d+$/);
const rating = (page: Page, label: string) => page.getByRole("button", { name: new RegExp(`^${label}(\\s|$)`) });
const completionHeading = (page: Page) => page.getByRole("heading", { level: 1, name: "ทวนครบแล้ว" });
const front = (page: Page) => page.locator('[data-side="front"]');
const back = (page: Page) => page.locator('[data-side="back"]');
// The audio row of a card side shows either the buttons or, on a device with no English voice, a note. Which one depends on the browser.
const audioRow = (page: Page) => page.getByRole("button", { name: "ฟัง", exact: true }).or(page.getByText("อุปกรณ์นี้ไม่มีเสียงภาษาอังกฤษ"));

/** Counts full page loads from now on: a load in the middle of a session (Fast Refresh falling back to a reload) resets it, and the test must say so. */
function watchLoads(page: Page) {
  let loads = 0;
  page.on("load", () => loads++);
  return (where: string) => expect(loads, `/review loaded again by itself (${where}); the session restarts on every load (docs/PLAN.md, "E2E ไม่นิ่ง")`).toBe(0);
}

/** The number n in "ถึงกำหนด n ใบ" on /practice. */
async function dueOnPractice(page: Page): Promise<number> {
  const text = await page.getByText(/^ถึงกำหนด \d+ ใบ$/).innerText();
  return Number(text.match(/\d+/)?.[0]);
}

/** Rates `label` on the card on screen: reveal, then the rating button. */
async function revealAndRate(page: Page, reveal: Locator, label: string) {
  await reveal.click();
  await expect(rating(page, label)).toBeVisible(SLOW);
  await rating(page, label).click();
}

/** Rates every card "ง่าย" until the completion screen. Returns how many ratings it took. */
async function rateAllEasy(page: Page, reveal: Locator): Promise<number> {
  let rated = 0;
  for (let guard = 0; guard < 40; guard++) {
    await expect(reveal.or(completionHeading(page))).toBeVisible(SLOW);
    if (await completionHeading(page).isVisible()) return rated;
    await revealAndRate(page, reveal, "ง่าย");
    rated++;
  }
  throw new Error("the review session did not finish after 40 ratings");
}

/** The completion screen once the server has answered: the streak line replaces "กำลังบันทึก…". */
async function expectCompleted(page: Page, n: number) {
  await expect(completionHeading(page)).toBeVisible(SLOW);
  await expect(page.getByText(`ทวน ${n} ใบ`, { exact: true })).toBeVisible();
  await expect(page.getByText(/^สตรีค \d+ วัน \(นานที่สุด \d+ วัน\)$/)).toBeVisible(SLOW);
  await expect(page.getByRole("link", { name: "กลับไปหน้าฝึกเพิ่ม" })).toHaveAttribute("href", "/practice");
  await expect(page.getByRole("link", { name: "กลับหน้าแรก" })).toHaveAttribute("href", "/");
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await expectNoHorizontalScroll(page, "review completion");
}

test.beforeAll(async () => {
  test.setTimeout(240_000);
  const api = await request.newContext({ baseURL });
  try {
    await ensureDayOneFinished(api, API_TIMEOUT);
    // warm the pages and routes of the review (dev server compiles on first use) so compile time cannot reload a page mid-session
    for (const path of ["/", "/practice", "/review"]) await api.get(path, { timeout: API_TIMEOUT });
    for (const path of ["/api/reviews", "/api/reviews/complete"]) await api.post(path, { data: {}, timeout: API_TIMEOUT }).catch(() => {});
  } finally {
    await api.dispose();
  }
});

test("right after the lesson nothing is due: the cards start tomorrow", async ({ page }) => {
  await page.goto("/practice");
  await expect(practiceHeading(page)).toBeVisible(SLOW);
  await expect(page.getByRole("heading", { level: 2, name: "ทวนคำศัพท์" })).toBeVisible();
  await expect(page.getByText(NONE_DUE, { exact: true })).toBeVisible();
  await expect(startLink(page)).toHaveCount(0);
  await page.goto("/");
  await expect(page.getByRole("link", { name: "ทวนคำศัพท์", exact: false })).toHaveCount(0);
  await page.goto("/review");
  await expect(page.getByText("ยังไม่มีคำที่ถึงกำหนดวันนี้", { exact: true })).toBeVisible(SLOW);
});

test("en_th cards: from the entry points through one whole session to the completion screen", async ({ page }) => {
  test.setTimeout(240_000);

  // the cards of day 1 become due (one SQL update, see the header)
  expect(await makeCardsDue("en_th"), "en_th cards of day 1 that were made due").toBeGreaterThanOrEqual(5);

  // home: the quiet row under the lesson card
  await page.goto("/");
  await expect(homeRow(page)).toBeVisible(SLOW);
  const n = Number((await homeRow(page).innerText()).match(/\d+/)?.[0]);
  expect(n, "cards due on the home page").toBeGreaterThanOrEqual(5);
  await expectNoHorizontalScroll(page, "home with the review row");

  // /practice: the card shows the same number and the start button
  await page.goto("/practice");
  await expect(practiceHeading(page)).toBeVisible(SLOW);
  expect(await dueOnPractice(page), "the number on /practice is the number on the home page").toBe(n);
  await expect(startLink(page)).toBeVisible();
  await expectNoHorizontalScroll(page, "practice with cards due");
  const noReload = watchLoads(page);

  // start: /review has no main nav, counts from 1 / n, asks English -> Thai
  await startLink(page).click();
  await expect(page).toHaveURL(/\/review$/, SLOW);
  await expect(page.getByRole("heading", { level: 1, name: "ทวนคำศัพท์" })).toBeVisible(SLOW);
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await expect(counter(page)).toHaveText(`1 / ${n}`);
  await expect(page.getByText("อังกฤษ → ไทย", { exact: true })).toBeVisible();
  const word = front(page).locator('[lang="en"]').first();
  await expect(word).toBeVisible();
  expect((await word.innerText()).trim().length, "an English word on the front").toBeGreaterThan(0);
  await expectNoHorizontalScroll(page, "review front");

  // before the reveal only the reveal button; no rating buttons
  const reveal = page.getByRole("button", { name: "ดูความหมาย", exact: true });
  await expect(reveal).toBeVisible();
  for (const label of RATINGS) await expect(rating(page, label)).toHaveCount(0);
  noReload("front of the first card");

  // after it: four rating buttons, each with the time until the card comes back; the reveal button is gone
  await reveal.click();
  for (const label of RATINGS) {
    await expect(rating(page, label)).toBeVisible(SLOW);
    await expect(rating(page, label)).toHaveText(new RegExp(`^${label}\\s*\\S+`)); // label + interval, e.g. "จำไม่ได้ 10 นาที"
  }
  await expect(reveal).toHaveCount(0);
  await expect(back(page).locator('[lang="en"]').first()).toBeVisible(); // the word is still on the back, with the meaning
  await expectNoHorizontalScroll(page, "review back");
  noReload("back of the first card");

  // "จำไม่ได้": the card comes back later in the same session; the total does not change and the session does not end early
  await rating(page, "จำไม่ได้").click();
  await expect(reveal).toBeVisible(SLOW);
  await expect(counter(page)).toHaveText(`1 / ${n}`); // n unchanged, and the forgotten card is still counted as not passed
  const rest = await rateAllEasy(page, reveal);
  expect(rest + 1, `ratings in the whole session: the ${n} cards plus the one that came back`).toBeGreaterThanOrEqual(n + 1);
  noReload("rating all the cards");

  // completion
  await expectCompleted(page, n);

  // back to /practice: nothing is due any more, and the home row is gone
  await page.getByRole("link", { name: "กลับไปหน้าฝึกเพิ่ม" }).click();
  await expect(page).toHaveURL(/\/practice$/, SLOW);
  await expect(page.getByText(NONE_DUE, { exact: true })).toBeVisible(SLOW);
  await expect(startLink(page)).toHaveCount(0);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible(SLOW);
  await expect(homeRow(page)).toHaveCount(0);
});

test("th_en cards: the front gives no English word and no sound, the back does", async ({ page }) => {
  test.setTimeout(240_000);

  expect(await makeCardsDue("th_en"), "th_en cards of day 1 that were made due").toBeGreaterThanOrEqual(5);

  await page.goto("/practice");
  await expect(practiceHeading(page)).toBeVisible(SLOW);
  const n = await dueOnPractice(page);
  expect(n, "th_en cards due on /practice").toBeGreaterThanOrEqual(5);
  const noReload = watchLoads(page);
  await startLink(page).click();
  await expect(page).toHaveURL(/\/review$/, SLOW);

  // front: Thai only. No element with lang="en", no sound button, no "no audio" note (the audio row is not even mounted)
  await expect(page.getByRole("heading", { level: 1, name: "ทวนคำศัพท์" })).toBeVisible(SLOW);
  await expect(counter(page)).toHaveText(`1 / ${n}`);
  await expect(page.getByText("ไทย → อังกฤษ", { exact: true })).toBeVisible();
  await expect(page.locator('main [lang="en"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^ฟัง/ })).toHaveCount(0);
  await expect(page.getByText("อุปกรณ์นี้ไม่มีเสียงภาษาอังกฤษ")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "ดูความหมาย", exact: true })).toHaveCount(0);
  const reveal = page.getByRole("button", { name: "ดูคำศัพท์", exact: true });
  await expect(reveal).toBeVisible();
  for (const label of RATINGS) await expect(rating(page, label)).toHaveCount(0);
  await expectNoHorizontalScroll(page, "th_en front");
  noReload("th_en front");

  // back: the English word, and the audio row (buttons, or the note when this browser has no English voice)
  await reveal.click();
  const answer = back(page).locator('[lang="en"]').first();
  await expect(answer).toBeVisible(SLOW);
  expect((await answer.innerText()).trim().length, "the English word on the back").toBeGreaterThan(0);
  await expect(audioRow(page).first()).toBeVisible(SLOW);
  for (const label of RATINGS) await expect(rating(page, label)).toBeVisible();
  await expectNoHorizontalScroll(page, "th_en back");
  noReload("th_en back");

  // finish the session (rate this first card too)
  await rating(page, "ง่าย").click();
  const rest = await rateAllEasy(page, reveal);
  expect(rest + 1, "ratings in the whole session").toBe(n);
  await expectCompleted(page, n);
  noReload("th_en session");

  await page.goto("/practice");
  await expect(page.getByText(NONE_DUE, { exact: true })).toBeVisible(SLOW);
});
