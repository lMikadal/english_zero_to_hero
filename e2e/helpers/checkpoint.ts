// Helpers of e2e/zz-checkpoint.spec.ts: the checkpoint file is the answer key, the way helpers/day1.ts uses the lesson file.
//
// Differences from a lesson that shape this file:
// - The instructions of a checkpoint are NOT unique (eleven exercises say "ฟังแล้วเลือกคำที่ได้ยิน"), so the exercise on screen is
//   found by its number: the player shows "ข้อ x / n" counted in the whole file, also after a resume.
// - Nothing on screen says right or wrong, so "it was stored" is read from the bar ("บันทึกคำตอบแล้ว") and from the answers of
//   POST /api/attempts (watchAttempts), never from feedback.
// - A device with no English voice shows "ข้าม" on the sound exercises; a skipped exercise stores nothing, so after a reload
//   the player asks it again. Both modes are played (headless Chromium on CI has no voice).
import fs from "node:fs";
import path from "node:path";
import { expect, type Locator, type Page } from "@playwright/test";
import { SLOW, audioMode, expectNoHorizontalScroll } from "./day1";

export type CheckpointExercise = { id: string; type: string; instruction: { th: string }; [key: string]: unknown };
export type CheckpointSection = { skill: string; weight: number; exercises: CheckpointExercise[] };
export type CheckpointFile = { afterDay: number; estimatedMinutes: number; sections: CheckpointSection[] };

export function loadCheckpoint(afterDay: number): CheckpointFile {
  const file = path.join(process.cwd(), "content/checkpoints", `checkpoint-${String(afterDay).padStart(3, "0")}.json`);
  return JSON.parse(fs.readFileSync(file, "utf8")) as CheckpointFile;
}

export const exercisesOf = (cp: CheckpointFile): CheckpointExercise[] => cp.sections.flatMap((s) => s.exercises);

/** word and Thai meaning of every vocabulary id under content/vocab (vocab_match shows these, not the ids). */
function loadVocab(): Map<string, { word: string; th: string }> {
  const out = new Map<string, { word: string; th: string }>();
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".json")) {
        for (const v of JSON.parse(fs.readFileSync(full, "utf8")) as { id: string; word: string; th: string }[]) out.set(v.id, { word: v.word, th: v.th });
      }
    }
  };
  walk(path.join(process.cwd(), "content/vocab"));
  return out;
}
const vocab = loadVocab();

/** The words that must never be on screen during a sitting: the lesson player's feedback, and the marks of a graded exercise. */
const FEEDBACK_WORDS = ["ถูกต้อง", "ยังไม่ถูก", "คำตอบที่ถูกต้อง", "ตัวอย่างคำตอบ", "✓", "✗"];
/** What a graded exercise adds to the DOM once it shows its result (src/components/exercises): none of it may exist here. */
const GRADED_MARKUP = 'main [data-state="right"], main [data-state="wrong"], main [aria-invalid="true"], main [data-testid^="reveal-"]';

export const counter = (page: Page) => page.locator("main h2").first();
export const resultHeading = (page: Page, k: number) => page.getByRole("heading", { level: 1, name: `ผลแบบทดสอบ ครั้งที่ ${k}` });
const confirmButton = (page: Page) => page.getByRole("button", { name: "ยืนยันคำตอบ", exact: true });
const nextButton = (page: Page) => page.getByRole("button", { name: "ถัดไป", exact: true });
const skipButton = (page: Page) => page.getByRole("button", { name: "ข้าม", exact: true });
const radio = (scope: Locator | Page, name: string) => scope.getByRole("radio", { name, exact: true });

/**
 * Listens to POST /api/attempts of this page. `stored` = exercise ids the server answered `created` or `duplicate` for;
 * `problems` = anything else (a refused answer, a status that is not 200, a grade in the answer: the server must not send
 * right/wrong for a checkpoint answer). The listener survives page.reload().
 */
export function watchAttempts(page: Page) {
  const stored = new Set<string>();
  const problems: string[] = [];
  page.on("response", (response) => {
    const request = response.request();
    if (request.method() !== "POST" || new URL(response.url()).pathname !== "/api/attempts") return;
    void (async () => {
      try {
        const sent = (request.postDataJSON() as { attempts: { id: string; exerciseId: string; source: string }[] }).attempts;
        if (response.status() !== 200) return void problems.push(`POST /api/attempts answered ${response.status()}`);
        const { results } = (await response.json()) as { results: ({ id: string | null; status: string; reason?: string } & Record<string, unknown>)[] };
        for (const result of results) {
          const attempt = sent.find((a) => a.id === result.id);
          if (!attempt) problems.push(`a result for an attempt that was not sent: ${JSON.stringify(result)}`);
          else if (result.status !== "created" && result.status !== "duplicate") problems.push(`${attempt.exerciseId}: ${result.status} ${result.reason ?? ""}`);
          else if ("correct" in result || "score" in result || "items" in result) problems.push(`${attempt.exerciseId}: the server sent a grade (${JSON.stringify(result)})`);
          else if (attempt.source !== "checkpoint") problems.push(`${attempt.exerciseId}: sent with source "${attempt.source}"`);
          else stored.add(attempt.exerciseId);
        }
      } catch (e) {
        problems.push(`could not read an answer of POST /api/attempts: ${String(e)}`);
      }
    })();
  });
  return { stored, problems };
}

/** Waits until the server has stored every id of `ids` (the queue is in memory: a reload before that would lose answers). */
export async function expectStored(watch: ReturnType<typeof watchAttempts>, ids: readonly string[], where: string) {
  await expect.poll(() => ids.filter((id) => !watch.stored.has(id)), { ...SLOW, message: `answers not stored by the server yet (${where})` }).toEqual([]);
  expect(watch.problems, `problems with POST /api/attempts (${where})`).toEqual([]);
}

/** Fills in the exercise on screen (right by the file, or wrong on purpose) WITHOUT confirming. Self-rated types are rated here: that is their answer. */
async function fillIn(page: Page, ex: CheckpointExercise, wrong: boolean) {
  switch (ex.type) {
    case "minimal_pair": {
      const pairs = ex.pairs as { a: string; b: string; answer: "a" | "b" }[];
      for (const [i, p] of pairs.entries()) {
        const pick = wrong ? (p.answer === "a" ? "b" : "a") : p.answer;
        await radio(page.getByRole("radiogroup", { name: `คู่ที่ ${i + 1}` }), p[pick]).click();
      }
      return;
    }
    case "listen_choose": {
      const choices = ex.choices as string[];
      const answer = ex.answer as number;
      await radio(page, choices[wrong ? (answer + 1) % choices.length : answer]).click();
      return;
    }
    case "dictation":
      await page.getByRole("textbox", { name: "พิมพ์สิ่งที่ได้ยิน" }).fill(wrong ? "I do not know" : (ex.audioText as string));
      return;
    case "repeat_after_me":
    case "shadowing":
    case "speak_answer":
      await page.getByRole("button", { name: "พูดได้", exact: true }).click();
      return;
    case "read_passage": {
      const questions = ex.questions as { choices: string[]; answer: number }[];
      for (const [i, q] of questions.entries()) {
        const pick = wrong && i === 0 ? (q.answer + 1) % q.choices.length : q.answer;
        await radio(page.getByRole("radiogroup", { name: `คำถามที่ ${i + 1}` }), q.choices[pick]).click();
      }
      return;
    }
    case "arrange_words": {
      const pool = page.getByRole("list", { name: "คำที่เหลือ" });
      const words = (ex.answer as string).split(" ");
      // Tiles are displayed in lower case (except "I" and proper nouns), so match the word case-insensitively.
      for (const word of wrong ? [...words].reverse() : words) {
        const name = new RegExp(`^${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
        await pool.getByRole("button", { name }).first().click();
      }
      return;
    }
    case "fill_blank": {
      const answers = ex.answer as string[];
      for (const [i, a] of answers.entries()) {
        await page.getByRole("textbox", { name: answers.length > 1 ? `ช่องว่างที่ ${i + 1}` : "ช่องว่าง", exact: true }).fill(wrong ? "zzz" : a);
      }
      return;
    }
    case "translate_th_en":
      await page.getByRole("textbox", { name: "คำแปลภาษาอังกฤษ" }).fill(wrong ? "I do not know" : (ex.accept as string[])[0]);
      return;
    case "vocab_match": {
      const ids = (ex.pairs as { vocabId: string }[]).map((p) => p.vocabId);
      const words = page.getByRole("group", { name: "คำภาษาอังกฤษ" });
      const meanings = page.getByRole("group", { name: "ความหมายภาษาไทย" });
      for (const [i, id] of ids.entries()) {
        const word = vocab.get(id);
        const meaning = vocab.get(wrong ? ids[(i + 1) % ids.length] : id);
        if (!word || !meaning) throw new Error(`${ex.id}: ${id} is not in content/vocab`);
        await words.getByRole("button", { name: word.word, exact: true }).click();
        await meanings.getByRole("button", { name: meaning.th, exact: true }).click();
      }
      return;
    }
    default:
      throw new Error(`e2e does not know how to play ${ex.type} (${ex.id})`);
  }
}

const SOUND_TYPES = ["minimal_pair", "listen_choose", "dictation", "repeat_after_me", "shadowing"];
const SELF_RATED = ["repeat_after_me", "shadowing", "speak_answer"];

/** The text that would give the answer away if the exercise showed its key (only where the key is not on screen as an option anyway). */
function answerKeyTexts(ex: CheckpointExercise): string[] {
  if (ex.type === "translate_th_en") return ex.accept as string[];
  if (ex.type === "dictation") return [ex.audioText as string];
  if (ex.type === "speak_answer") return [ex.sampleAnswer as string];
  return [];
}

/**
 * After an answer was confirmed: the bar says it was saved and offers "ถัดไป", and NOTHING tells right from wrong
 * (docs/plans/checkpoint-plan.md 3.3 item 20, D5). `wrong` = the answer was wrong on purpose: its key must not appear either.
 */
async function expectSavedWithoutFeedback(page: Page, ex: CheckpointExercise, wrong: boolean) {
  const where = `${ex.id} (${ex.type}) after confirming`;
  await expect(page.locator("#step-feedback"), where).toHaveText("บันทึกคำตอบแล้ว", SLOW);
  await expect(nextButton(page), where).toBeEnabled();
  await expect(confirmButton(page), `${where}: the confirm button is gone`).toHaveCount(0);
  await expect(page.getByRole("button", { name: "ตรวจคำตอบ" }), `${where}: the lesson's check button`).toHaveCount(0);
  await expect(page.locator(GRADED_MARKUP), `${where}: right/wrong markup in the DOM`).toHaveCount(0);
  const text = await page.locator("main").innerText();
  for (const word of FEEDBACK_WORDS) expect(text, `${where}: "${word}" on screen`).not.toContain(word);
  if (wrong) for (const key of answerKeyTexts(ex)) expect(text, `${where}: the answer key on screen`).not.toContain(key);
  await expectNoHorizontalScroll(page, where);
}

export type SittingRun = {
  /** Exercise ids answered (confirmed or self-rated) in this call, in order. */
  answered: string[];
  /** Exercise ids skipped because the device has no English voice. */
  skipped: string[];
};

/**
 * Plays the checkpoint player that is open, from the exercise it must be on, and returns what it did.
 * - `alreadyStored`: ids the server had before this page load (a resumed sitting): the player must step over them.
 * - `wrong`: ids to answer wrongly on purpose.
 * - `stopAfter`: return once this exercise is done and the NEXT one is on screen (to reload in the middle); without it the
 *   run ends when the last exercise is done (the caller then waits for the result screen).
 * Every step is checked against the file by its number and instruction, so a player that asks an answered exercise again,
 * or leaves one out, fails here.
 */
export async function playSitting(
  page: Page,
  cp: CheckpointFile,
  { alreadyStored = new Set<string>(), wrong = new Set<string>(), stopAfter }: { alreadyStored?: ReadonlySet<string>; wrong?: ReadonlySet<string>; stopAfter?: string } = {},
): Promise<SittingRun> {
  const all = exercisesOf(cp);
  const run: SittingRun = { answered: [], skipped: [] };
  const nextFrom = (from: number) => all.findIndex((e, i) => i >= from && !alreadyStored.has(e.id));
  const label = (i: number) => new RegExp(`ข้อ ${i + 1} / ${all.length}$`);

  for (let i = nextFrom(0); i >= 0; i = nextFrom(i + 1)) {
    const ex = all[i];
    const where = `${ex.id} (${ex.type})`;
    await expect(counter(page), `${where}: the player is on this exercise`).toHaveText(label(i), SLOW);
    await expect(page.getByRole("heading", { level: 3 }).first(), `${where}: instruction`).toHaveText(ex.instruction.th);
    await expect(page.locator("#step-feedback"), `${where}: nothing saved yet`).toBeEmpty();
    await expect(nextButton(page), `${where}: no way on before answering`).toHaveCount(0);

    if (SOUND_TYPES.includes(ex.type) && (await audioMode(page)) === "skip") {
      await skipButton(page).click();
      run.skipped.push(ex.id);
    } else {
      await fillIn(page, ex, wrong.has(ex.id));
      if (!SELF_RATED.includes(ex.type)) await confirmButton(page).click();
      await expectSavedWithoutFeedback(page, ex, wrong.has(ex.id));
      run.answered.push(ex.id);
      await nextButton(page).click();
    }

    if (ex.id === stopAfter) {
      const next = nextFrom(i + 1);
      if (next < 0) throw new Error(`stopAfter ${stopAfter} is the last exercise: nothing to resume`);
      await expect(counter(page), `after ${where}`).toHaveText(label(next), SLOW);
      return run;
    }
  }
  return run;
}

/** 1-based number the intro shows in "ทำต่อ (ข้อ x / n)": the first exercise of the file with no stored answer. */
export function resumeNumber(cp: CheckpointFile, stored: ReadonlySet<string>): number {
  const i = exercisesOf(cp).findIndex((e) => !stored.has(e.id));
  return i < 0 ? exercisesOf(cp).length + 1 : i + 1;
}
