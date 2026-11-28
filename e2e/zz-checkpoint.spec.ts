// The monthly checkpoint at 360px against the real app (docs/plans/checkpoint-plan.md, PR 8): a learner who has finished
// day 30 is held at checkpoint 1, sits it once (intro, every exercise with no right/wrong shown, a reload in the middle
// and "ทำต่อ", the result), and after that day 31 is open and the same day's second sitting is refused.
//
// WHY THE NAME STARTS WITH "zz-": files run alphabetically with one worker (playwright.config.ts), and this one must run
// LAST. Its beforeAll finishes days 1-30 for the ONE learner all the specs share, and the sitting then opens day 31. The
// other specs need a learner at the start of the course (lesson.spec.ts: "วันที่ 1 / 365", replay.spec.ts and review.spec.ts:
// day 1 is the only finished day), so nothing that expects that may ever run after this file. A new spec must sort before
// "zz-". It also cannot run twice on one database (the second time the checkpoint no longer blocks): `make e2e` starts
// from a new database every time, so that never happens there.
//
// Setup does not depend on the other specs having run: days already finished are simply reported as done by the API.
//
// No audio is needed: headless Chromium has no English voice, the sound exercises then show "ข้าม" and store nothing; when a
// voice exists they are answered instead. Scores are NOT asserted (they depend on that; the integration tests cover them),
// only that the numbers of answered exercises on the result are the ones this test stored, and that every page agrees with
// the result screen about pass / not passed and the percentage.
import { expect, request, test, type Page } from "@playwright/test";
import { counter, exercisesOf, expectStored, loadCheckpoint, playSitting, resultHeading, resumeNumber, watchAttempts } from "./helpers/checkpoint";
import { SLOW, expectNoHorizontalScroll } from "./helpers/day1";

const baseURL = process.env.BASE_URL ?? "http://localhost:3000";
const API_TIMEOUT = 90_000;

const AFTER_DAY = 30;
const K = 1; // checkpoint after day 30 is "ครั้งที่ 1"
const NEXT_DAY = AFTER_DAY + 1;
const checkpoint = loadCheckpoint(AFTER_DAY);
const all = exercisesOf(checkpoint);
const TOTAL = all.length;
const SKILL_TH: Record<string, string> = { pronunciation: "ออกเสียง", listening: "ฟัง", speaking: "พูด", reading: "อ่าน", writing: "เขียน" };

const TITLE = `แบบทดสอบประจำเดือน ครั้งที่ ${K}`;
const RETAKE_LINE = "สอบอีกครั้งได้ตั้งแต่พรุ่งนี้";
const CHECKPOINT_URL = new RegExp(`/checkpoint/${AFTER_DAY}$`);

/** Reload after the first reading exercise: by then answers are stored whether or not the device has sound. */
const RELOAD_AFTER = "c030-read-01";
/** Answered wrongly on purpose (neither needs sound): one before the reload, one after it. */
const WRONG = new Set(["c030-read-01", "c030-write-07"]);

test.describe.configure({ mode: "serial" }); // one learner, one sitting: each test needs the one before it

const mainNav = (page: Page) => page.getByRole("navigation", { name: "เมนูหลัก" });
const startLesson = (page: Page) => page.getByRole("link", { name: /^เริ่มบทเรียนวันที่/ });
const startTest = (page: Page) => page.getByRole("button", { name: /^(เริ่มแบบทดสอบ|สอบอีกครั้ง|ทำต่อ)/ });
const badge = (page: Page) => page.getByText(/^(ผ่าน|ยังไม่ผ่าน)$/);
const total = (page: Page) => page.getByText(/^คะแนนรวม \d+%$/);

/** What the result screen showed, for the pages that must agree with it. */
let shown: { passed: boolean; percent: string } | null = null;
/** Exercise ids this test stored in the sitting. */
const answered = new Set<string>();

test.beforeAll(async () => {
  test.setTimeout(240_000);
  for (const id of [RELOAD_AFTER, ...WRONG]) expect(all.map((e) => e.id), `checkpoint-0${AFTER_DAY}.json has ${id}`).toContain(id);
  const api = await request.newContext({ baseURL });
  try {
    // Finish days 1-30 through the API the app uses (idempotent: a finished day answers with its stored state).
    let pending: number | null = null;
    for (let day = 1; day <= AFTER_DAY; day++) {
      const res = await api.post("/api/lessons/complete", { data: { day, sessionId: crypto.randomUUID(), completedAt: new Date().toISOString() }, timeout: API_TIMEOUT });
      expect(res.status(), `POST /api/lessons/complete day ${day}`).toBe(200);
      pending = ((await res.json()) as { pendingCheckpoint: number | null }).pendingCheckpoint;
    }
    expect(pending, `finishing day ${AFTER_DAY} must leave checkpoint ${AFTER_DAY} pending. null = it was already sat: this spec needs a new database (make e2e gives one)`).toBe(AFTER_DAY);
  } finally {
    await api.dispose();
  }
});

test("a learner who finished day 30 is held at the checkpoint: home, /today, /day/31, /practice", async ({ page, request: api }) => {
  // home: the checkpoint card takes the place of the lesson card, with the one primary action
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 2, name: TITLE })).toBeVisible(SLOW);
  await expect(page.getByRole("link", { name: "เริ่มแบบทดสอบ", exact: true })).toHaveAttribute("href", `/checkpoint/${AFTER_DAY}`);
  await expect(startLesson(page)).toHaveCount(0);
  await expect(page.getByText("วันนี้เรียนแล้ว ทำแบบทดสอบประจำเดือนต่อได้เลย")).toBeVisible();
  await expect(mainNav(page)).toBeVisible();
  await expectNoHorizontalScroll(page, "home while the checkpoint blocks");

  // /today is the checkpoint
  const today = await api.get("/today", { maxRedirects: 0 });
  expect(today.status(), "GET /today").toBe(307);
  expect(today.headers().location, "GET /today Location").toMatch(CHECKPOINT_URL);
  await page.goto("/today");
  await expect(page).toHaveURL(CHECKPOINT_URL, SLOW);
  await expect(page.getByRole("heading", { level: 1, name: TITLE })).toBeVisible(SLOW);

  // day 31 says why it is closed and where to go; a later day sends to the checkpoint too
  await page.goto(`/day/${NEXT_DAY}`);
  await expect(page.getByRole("heading", { level: 1, name: "ทำแบบทดสอบประจำเดือนก่อน" })).toBeVisible(SLOW);
  await expect(page.getByRole("link", { name: "ไปทำแบบทดสอบ" })).toHaveAttribute("href", `/checkpoint/${AFTER_DAY}`);
  await expectNoHorizontalScroll(page, "day 31 while the checkpoint blocks");
  await page.goto(`/day/${NEXT_DAY + 1}`);
  await expect(page.getByRole("heading", { level: 1, name: "ยังไม่ปลดล็อก" })).toBeVisible(SLOW);
  await expect(page.getByRole("link", { name: "ไปทำแบบทดสอบ" })).toHaveAttribute("href", `/checkpoint/${AFTER_DAY}`);

  // the server holds day 31 back too, not only the pages
  const locked = await api.post("/api/lessons/complete", { data: { day: NEXT_DAY, sessionId: crypto.randomUUID(), completedAt: new Date().toISOString() } });
  expect(locked.status(), "POST /api/lessons/complete day 31 before the checkpoint").toBe(409);
  expect(await locked.json()).toEqual({ error: "locked_day" });

  // /practice lists the checkpoint as not taken
  await page.goto("/practice");
  await expect(page.getByRole("heading", { level: 2, name: "แบบทดสอบประจำเดือน" })).toBeVisible(SLOW);
  const row = page.getByRole("list", { name: "แบบทดสอบประจำเดือน" }).getByRole("link");
  await expect(row).toHaveCount(1);
  await expect(row).toContainText(`ครั้งที่ ${K} · วันที่ 1–${AFTER_DAY}`);
  await expect(row).toContainText("ยังไม่ได้สอบ");
  await expect(row).toHaveAttribute("href", `/checkpoint/${AFTER_DAY}`);
  await expectNoHorizontalScroll(page, "practice with the checkpoint row");

  // only days 30, 60 ... are checkpoint pages
  expect((await page.goto("/checkpoint/45"))?.status(), "GET /checkpoint/45").toBe(404);
});

test("one sitting: intro, every exercise with no right or wrong shown, reload and resume, the result", async ({ page }) => {
  test.setTimeout(420_000);
  const watch = watchAttempts(page);

  // the intro, reached from the home page
  await page.goto("/");
  await page.getByRole("link", { name: "เริ่มแบบทดสอบ", exact: true }).click();
  await expect(page).toHaveURL(CHECKPOINT_URL, SLOW);
  await expect(page.getByRole("heading", { level: 1, name: TITLE })).toBeVisible(SLOW);
  await expect(page.getByText(`บทเรียนวันที่ 1–${AFTER_DAY} · ${TOTAL} ข้อ · ประมาณ ${checkpoint.estimatedMinutes} นาที`)).toBeVisible();
  await expect(page.getByRole("list", { name: "กติกา" }).getByRole("listitem")).toHaveCount(4);
  await expect(page.getByRole("list", { name: "ส่วนของแบบทดสอบ" }).getByRole("listitem")).toHaveCount(checkpoint.sections.length);
  await expect(mainNav(page)).toHaveCount(0);
  await expectNoHorizontalScroll(page, "checkpoint intro");
  const start = page.getByRole("button", { name: "เริ่มแบบทดสอบ", exact: true });
  await expect(start).toBeVisible();

  // first part: up to the reload point, one answer wrong on purpose
  await start.click();
  await expect(counter(page)).toHaveText(new RegExp(`ข้อ 1 / ${TOTAL}$`), SLOW);
  await expect(page.getByText("แบบทดสอบประจำเดือน", { exact: true })).toBeVisible(); // the pill above the step
  await expect(mainNav(page)).toHaveCount(0);
  const first = await playSitting(page, checkpoint, { wrong: WRONG, stopAfter: RELOAD_AFTER });
  for (const id of first.answered) answered.add(id);
  expect(first.answered, "the reading exercise before the reload was answered").toContain(RELOAD_AFTER);
  await expectStored(watch, first.answered, "before the reload");

  // reload: the sitting is still open, the button says where it goes on
  const storedBeforeReload = new Set(first.answered);
  await page.reload();
  const resume = page.getByRole("button", { name: `ทำต่อ (ข้อ ${resumeNumber(checkpoint, storedBeforeReload)} / ${TOTAL})`, exact: true });
  await expect(resume).toBeVisible(SLOW);
  await expect(page.getByRole("button", { name: "เริ่มแบบทดสอบ", exact: true })).toHaveCount(0);
  await expectNoHorizontalScroll(page, "checkpoint intro with a sitting left open");

  // second part: the player steps over what the server already has (playSitting fails if an answered exercise comes back)
  await resume.click();
  const second = await playSitting(page, checkpoint, { alreadyStored: storedBeforeReload, wrong: WRONG });
  for (const id of second.answered) {
    expect(answered.has(id), `${id} was asked a second time after the resume`).toBe(false);
    answered.add(id);
  }
  expect([...answered].filter((id) => WRONG.has(id)).sort(), "both wrong answers were given").toEqual([...WRONG].sort());
  // every exercise was either answered once or skipped for want of a voice; the run's log says which mode it was
  expect(answered.size + second.skipped.length, "answered + skipped").toBe(TOTAL);
  console.log(`checkpoint sitting: ${answered.size} of ${TOTAL} answered, ${second.skipped.length} skipped (no English voice on this device)`);

  // the result: the server's answer
  await expect(resultHeading(page, K)).toBeVisible(SLOW);
  await expect(badge(page)).toBeVisible(SLOW);
  await expect(total(page)).toBeVisible();
  await expect(page.getByText(/^เกณฑ์ผ่าน \d+%$/)).toBeVisible();
  await expectStored(watch, [...answered], "at the result");

  // one row per skill; the counts are the answers THIS sitting stored, before and after the reload (one session)
  const rows = page.getByRole("list", { name: "คะแนนรายทักษะ" }).getByRole("listitem");
  await expect(rows).toHaveCount(checkpoint.sections.length);
  for (const [i, section] of checkpoint.sections.entries()) {
    const n = section.exercises.filter((e) => answered.has(e.id)).length;
    const t = section.exercises.length;
    await expect(rows.nth(i), `row of ${section.skill}`).toContainText(SKILL_TH[section.skill]);
    if (section.weight === 0) await expect(rows.nth(i), `row of ${section.skill}`).toContainText(`ประเมินตัวเอง พูดได้ ${n} จาก ${t} ข้อ · ไม่นับคะแนน`);
    else await expect(rows.nth(i), `row of ${section.skill}`).toContainText(new RegExp(`\\d+% · ตอบ ${n} จาก ${t} ข้อ`));
  }
  await expect(page.getByText(/^สตรีค \d+ วัน \(นานที่สุด \d+ วัน\)$/)).toBeVisible();
  await expect(page.getByText(RETAKE_LINE, { exact: true })).toBeVisible();
  await expect(startTest(page)).toHaveCount(0);
  await expect(mainNav(page)).toHaveCount(0);
  await expectNoHorizontalScroll(page, "checkpoint result");
  shown = { passed: (await badge(page).innerText()).trim() === "ผ่าน", percent: (await total(page).innerText()).match(/\d+/)![0] };

  // the way on: day 31 opens in the player
  const next = page.getByRole("link", { name: `ไปบทเรียนวันที่ ${NEXT_DAY}` });
  await expect(next).toHaveAttribute("href", `/day/${NEXT_DAY}`);
  await next.click();
  await expect(page).toHaveURL(new RegExp(`/day/${NEXT_DAY}$`), SLOW);
  await expect(page.locator("main h2").first()).toContainText("ข้อ 1 /", SLOW);
  await expectNoHorizontalScroll(page, "day 31 first step");
});

test("after the sitting: day 31 is today's lesson, the result is kept, a second sitting the same day is refused", async ({ page, request: api }) => {
  expect(shown, "the result screen of the sitting was read").not.toBeNull();
  const { passed, percent } = shown!;

  // home: back to a lesson card; the quiet checkpoint row only while it is not passed
  await page.goto("/");
  await expect(page.getByText(`วันที่ ${NEXT_DAY} / 365`)).toBeVisible(SLOW);
  await expect(page.getByRole("link", { name: `เริ่มบทเรียนวันที่ ${NEXT_DAY}` })).toHaveAttribute("href", `/day/${NEXT_DAY}`);
  await expect(page.getByRole("link", { name: "เริ่มแบบทดสอบ", exact: true })).toHaveCount(0);
  const quiet = page.getByRole("link", { name: new RegExp(`^แบบทดสอบครั้งที่ ${K} · `) });
  if (passed) await expect(quiet).toHaveCount(0);
  else {
    await expect(quiet).toHaveText(new RegExp(`^แบบทดสอบครั้งที่ ${K} · ยังไม่ผ่าน\\s*ดูผลและฝึกซ่อม$`));
    await expect(quiet).toHaveAttribute("href", `/checkpoint/${AFTER_DAY}`);
  }
  await expectNoHorizontalScroll(page, "home after the checkpoint");

  // /today is the lesson again
  await page.goto("/today");
  await expect(page).toHaveURL(new RegExp(`/day/${NEXT_DAY}$`), SLOW);

  // /practice: the row carries the same verdict and percentage as the result screen
  await page.goto("/practice");
  await expect(page.getByRole("heading", { level: 2, name: "แบบทดสอบประจำเดือน" })).toBeVisible(SLOW);
  const row = page.getByRole("list", { name: "แบบทดสอบประจำเดือน" }).getByRole("link");
  await expect(row).toContainText(`ครั้งที่ ${K} · วันที่ 1–${AFTER_DAY}`);
  await expect(row).toContainText(passed ? `ผ่าน · ดีที่สุด ${percent}%` : `ยังไม่ผ่าน · ล่าสุด ${percent}%`);
  await expectNoHorizontalScroll(page, "practice after the checkpoint");

  // the row opens the stored result: same numbers, no way to start again today
  const expectStoredResult = async (where: string) => {
    await expect(resultHeading(page, K), where).toBeVisible(SLOW);
    await expect(badge(page), where).toHaveText(passed ? "ผ่าน" : "ยังไม่ผ่าน");
    await expect(total(page), where).toHaveText(`คะแนนรวม ${percent}%`);
    await expect(page.getByRole("list", { name: "คะแนนรายทักษะ" }).getByRole("listitem"), where).toHaveCount(checkpoint.sections.length);
    await expect(page.getByText(RETAKE_LINE, { exact: true }), where).toBeVisible();
    await expect(startTest(page), where).toHaveCount(0);
    await expect(page.getByRole("link", { name: `ไปบทเรียนวันที่ ${NEXT_DAY}` }), where).toHaveAttribute("href", `/day/${NEXT_DAY}`);
  };
  await row.click();
  await expect(page).toHaveURL(CHECKPOINT_URL, SLOW);
  await expectStoredResult("the stored result on /checkpoint/30");
  await expectNoHorizontalScroll(page, "stored checkpoint result");

  // the server refuses a second sitting of the same day, even one that has an answer stored
  const sessionId = crypto.randomUUID();
  const reading = all.find((e) => e.id === RELOAD_AFTER)!;
  const attempt = {
    id: crypto.randomUUID(), exerciseId: reading.id, sessionId, source: "checkpoint", attemptNo: 1,
    answer: { kind: "choices", selected: (reading.questions as { answer: number }[]).map((q) => q.answer) },
    createdAt: new Date().toISOString(),
  };
  const sent = await api.post("/api/attempts", { data: { attempts: [attempt] } });
  expect(sent.status(), "POST /api/attempts for a second sitting").toBe(200);
  expect(((await sent.json()) as { results: { status: string }[] }).results.map((r) => r.status), "the answer of the second sitting is stored").toEqual(["created"]);
  const again = await api.post("/api/checkpoints/complete", { data: { afterDay: AFTER_DAY, sessionId, completedAt: new Date().toISOString() } });
  expect(again.status(), "POST /api/checkpoints/complete for a second sitting the same day").toBe(409);
  expect(await again.json()).toEqual({ error: "retake_tomorrow" });

  // and it changed nothing: the first result still stands, day 31 is still open
  await page.reload();
  await expectStoredResult("the stored result after the refused second sitting");
  await page.goto("/");
  await expect(page.getByRole("link", { name: `เริ่มบทเรียนวันที่ ${NEXT_DAY}` })).toBeVisible(SLOW);
});
