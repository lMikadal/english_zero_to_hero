// Helpers shared by the e2e specs that play day 1 (lesson.spec.ts, replay.spec.ts): the lesson file is the answer key.
import fs from "node:fs";
import path from "node:path";
import { expect, type APIRequestContext, type Locator, type Page } from "@playwright/test";

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

export const SLOW = { timeout: 30_000 }; // the dev server compiles pages and API routes on first use

export async function expectNoHorizontalScroll(page: Page, where: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `horizontal scroll at ${where}`).toBeLessThanOrEqual(0);
}

export const stepLabel = (page: Page) => page.locator("main h2").first();
export const done = (page: Page) => page.getByRole("heading", { level: 1, name: "จบบทเรียนแล้ว" });

/** After the audio check has settled: "skip" (no English voice) or "audio". */
export async function audioMode(page: Page): Promise<"skip" | "audio"> {
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
export async function playStep(page: Page, ex: Ex) {
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

/**
 * Plays every step (and the retry round, if one appears) of the day-1 player that is open, until `finished` shows.
 *
 * The player keeps its position in memory, so a full page load in the middle of the lesson (for example the dev
 * server's Fast Refresh falling back to a reload) sends it back to step 1 and the step being played never settles.
 * Loads are counted from the moment this is called, so that failure names its cause instead of timing out elsewhere.
 */
export async function playToEnd(page: Page, finished: Locator) {
  let reloads = 0;
  page.on("load", () => reloads++);
  for (let guard = 0; guard < 40; guard++) {
    await expect(stepLabel(page).or(finished)).toBeVisible(SLOW);
    if (await finished.isVisible()) break;
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
    await expect.poll(async () => (await finished.isVisible()) || (await stepLabel(page).innerText()) !== before, SLOW).toBe(true);
  }
}

/**
 * Makes sure day 1 is finished without playing it: through the same HTTP API the app uses (one first-try reading attempt,
 * then /api/lessons/complete), unless /day/1 already opens as a replay (lesson.spec.ts ran first, as it does in CI).
 * Both calls are idempotent. Needs a database in which day 1 is the only finished day.
 */
export async function ensureDayOneFinished(api: APIRequestContext, timeout: number) {
  // A finished day opens as a replay: the badge is in the server-rendered page.
  const html = await (await api.get("/day/1", { timeout })).text();
  if (html.includes("เล่นซ้ำ")) return;
  const sessionId = "5e2a6c1e-0b53-4a0e-9c43-7d6f1b8e0001";
  const attempt = {
    id: "5e2a6c1e-0b53-4a0e-9c43-7d6f1b8e0002", exerciseId: "d001-read-01", sessionId, source: "lesson", attemptNo: 1,
    answer: { kind: "choices", selected: [1] }, // "Ann", the right answer in content/lessons/day-001.json
    createdAt: new Date().toISOString(),
  };
  const a = await api.post("/api/attempts", { data: { attempts: [attempt] }, timeout });
  expect(a.status(), "POST /api/attempts").toBe(200);
  const c = await api.post("/api/lessons/complete", { data: { day: 1, sessionId, completedAt: new Date().toISOString() }, timeout });
  expect(c.status(), "POST /api/lessons/complete").toBe(200);
}
