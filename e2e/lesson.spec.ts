// Plays day 1 end to end at 360px against the real app and database, using the real lesson file as the answer key.
//
// It needs a CLEAN learner state: it expects the home page to start at day 1 with streak 0. CI always starts from a
// fresh database. Locally, reset first:   make db-reset CONFIRM=english_zero_to_hero_dev   (then `make e2e`).
//
// It does not depend on audio: headless Chromium usually has no English voice, in which case the sound exercises
// show "ข้าม" and the test skips them; when audio does work it answers them instead.
import fs from "node:fs";
import path from "node:path";
import { expect, request, test, type Locator, type Page } from "@playwright/test";

type Ex = {
  id: string;
  type: string;
  instruction: { th: string };
  [key: string]: unknown;
};
const lesson: { sections: { exercises: Ex[] }[] } = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "content/lessons/day-001.json"), "utf8"),
);
const exercises = lesson.sections.flatMap((s) => s.exercises);
const byInstruction = new Map(exercises.map((e) => [e.instruction.th, e]));
if (byInstruction.size !== exercises.length) throw new Error("day 1 instructions must be unique for this test");

const SLOW = { timeout: 30_000 }; // the dev server compiles pages and API routes on first use

async function expectNoHorizontalScroll(page: Page, where: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `horizontal scroll at ${where}`).toBeLessThanOrEqual(0);
}

const stepLabel = (page: Page) => page.locator("main h2").first();
const done = (page: Page) => page.getByRole("heading", { level: 1, name: "จบบทเรียนแล้ว" });

/** After the audio check has settled: "skip" (no English voice) or "audio". */
async function audioMode(page: Page): Promise<"skip" | "audio"> {
  const skip = page.getByRole("button", { name: "ข้าม", exact: true });
  const play = page.getByRole("button", { name: "ฟัง", exact: true }).first();
  let mode: "skip" | "audio" | "pending" = "pending";
  await expect
    .poll(async () => {
      if (await skip.isVisible()) mode = "skip";
      else if ((await play.count()) > 0 && (await play.isEnabled())) mode = "audio";
      else mode = "pending";
      return mode;
    }, SLOW)
    .not.toBe("pending");
  return mode as "skip" | "audio";
}

const radio = (scope: Locator | Page, name: string) => scope.getByRole("radio", { name, exact: true });

/** The "ถัดไป" button must be on screen as it is, without scrolling (Playwright's click would scroll it into view and hide the bug). */
async function expectInViewport(page: Page, button: Locator, where: string) {
  const box = await button.boundingBox();
  const viewport = page.viewportSize();
  if (!box || !viewport) throw new Error(`no box for ${where}`);
  expect(box.y, `${where}: top of the button`).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height, `${where}: bottom of the button`).toBeLessThanOrEqual(viewport.height);
}

async function checkAndNext(page: Page) {
  await page.getByRole("button", { name: "ตรวจคำตอบ" }).click();
  await expect(page.locator("main").getByRole("status")).toContainText("ถูกต้อง");
  const next = page.getByRole("button", { name: "ถัดไป" });
  await expect(next).toBeEnabled();
  await expectInViewport(page, next, "after checking the answer");
  await next.click();
}

/** Answers the current step the way the lesson file says is right. Returns once the player has moved on or is about to. */
async function playStep(page: Page, ex: Ex) {
  switch (ex.type) {
    case "phoneme_intro":
      await page.getByRole("button", { name: "ถัดไป" }).click();
      return;
    case "minimal_pair": {
      if ((await audioMode(page)) === "skip") return void (await page.getByRole("button", { name: "ข้าม", exact: true }).click());
      const pairs = ex.pairs as { a: string; b: string; answer: "a" | "b" }[];
      for (const [i, p] of pairs.entries()) await radio(page.getByRole("radiogroup", { name: `คู่ที่ ${i + 1}` }), p[p.answer]).click();
      return checkAndNext(page);
    }
    case "listen_choose": {
      if ((await audioMode(page)) === "skip") return void (await page.getByRole("button", { name: "ข้าม", exact: true }).click());
      await radio(page, (ex.choices as string[])[ex.answer as number]).click();
      return checkAndNext(page);
    }
    case "dictation": {
      if ((await audioMode(page)) === "skip") return void (await page.getByRole("button", { name: "ข้าม", exact: true }).click());
      await page.getByRole("textbox", { name: "พิมพ์สิ่งที่ได้ยิน" }).fill(ex.audioText as string);
      return checkAndNext(page);
    }
    case "repeat_after_me":
    case "shadowing": {
      if ((await audioMode(page)) === "skip") return void (await page.getByRole("button", { name: "ข้าม", exact: true }).click());
      await page.getByRole("button", { name: "พูดได้" }).click();
      await page.getByRole("button", { name: "ถัดไป" }).click();
      return;
    }
    case "speak_answer":
      await page.getByRole("button", { name: "พูดได้" }).click();
      await page.getByRole("button", { name: "ถัดไป" }).click();
      return;
    case "read_passage": {
      const questions = ex.questions as { choices: string[]; answer: number }[];
      for (const [i, q] of questions.entries()) await radio(page.getByRole("radiogroup", { name: `คำถามที่ ${i + 1}` }), q.choices[q.answer]).click();
      return checkAndNext(page);
    }
    case "arrange_words": {
      const pool = page.getByRole("list", { name: "คำที่เหลือ" });
      // Tiles are displayed in lower case (except "I" and proper nouns), so match the word case-insensitively.
      for (const word of (ex.answer as string).split(" ")) {
        const name = new RegExp(`^${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
        await pool.getByRole("button", { name }).first().click();
      }
      return checkAndNext(page);
    }
    case "translate_th_en": {
      await page.getByRole("textbox", { name: "คำแปลภาษาอังกฤษ" }).fill((ex.accept as string[])[0]);
      return checkAndNext(page);
    }
    default:
      throw new Error(`e2e does not know how to play ${ex.type} (${ex.id})`);
  }
}

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

  // The player keeps its position in memory, so a full page load in the middle of the lesson (for example the dev
  // server's Fast Refresh falling back to a reload) sends it back to step 1 and the step being played never settles.
  // Count loads so that failure names its cause instead of timing out somewhere else.
  let reloads = 0;
  page.on("load", () => reloads++);

  // play every step (and the retry round, if one appears) until the completion screen
  for (let guard = 0; guard < 40; guard++) {
    await expect(stepLabel(page).or(done(page))).toBeVisible(SLOW);
    if (await done(page).isVisible()) break;
    await expectNoHorizontalScroll(page, `step ${guard + 1}`);
    const before = await stepLabel(page).innerText();
    const th = (await page.getByRole("heading", { level: 3 }).first().innerText()).trim();
    const ex = byInstruction.get(th);
    if (!ex) throw new Error(`no exercise in day-001.json has the instruction "${th}"`);
    try {
      await playStep(page, ex);
    } catch (e) {
      if (reloads > 0) throw new Error(`the lesson page loaded again ${reloads} time(s) while playing "${th}" (now showing: ${await stepLabel(page).innerText().catch(() => "?")}): ${String(e)}`);
      throw e;
    }
    expect(reloads, `the lesson page loaded again by itself after "${th}"`).toBe(0);
    // the player moved on (another step, or the completion screen)
    await expect.poll(async () => (await done(page).isVisible()) || (await stepLabel(page).innerText()) !== before, SLOW).toBe(true);
  }

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
