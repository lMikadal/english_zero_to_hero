// @vitest-environment node
// Completing a lesson must not be blocked by the CONTENT of other lessons (docs/plans/vocab-review-plan.md 2.1, 4.4.13):
// an earlier finished day with a broken or missing file, or a lesson that lists a word that is not in the bank.
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { profiles, progress, srsCards } from "@/db/schema";
import { cleanDatabase, connectTestDb } from "@/db/test-utils";
import type { CardContent } from "@/lib/srs/cards";
import { handleCompleteLesson } from "./complete-handler";
import { NOW, seedLocal, SESSION } from "./test-helpers";

const { sql, db } = connectTestDb();
let userId: string;

const vocab = (id: string) => ({ word: id, ipa: { us: "", uk: "" }, th: `th-${id}`, example: null });
const content = (lessons: Record<number, string[] | "throw">, bank: string[]): CardContent => ({
  getLesson: (day) => {
    const l = lessons[day];
    if (l === "throw") throw new Error(`day ${day} is broken`);
    return l ? { vocab: l } : null;
  },
  getVocab: (id) => (bank.includes(id) ? vocab(id) : null),
});

const cardIds = async () => (await db.select().from(srsCards).where(eq(srsCards.userId, userId))).map((c) => `${c.vocabId}/${c.direction}`).sort();

beforeEach(async () => {
  await cleanDatabase(sql);
  userId = await seedLocal(db, 2); // day 1 is finished, day 2 is the one being completed
  const earlier = new Date(NOW.getTime() - 86_400_000);
  await db.insert(progress).values({ userId, day: 1, status: "done", startedAt: earlier, completedAt: earlier, score: 1 });
});
afterAll(async () => {
  await cleanDatabase(sql);
  await sql.end();
});

const completeDay2 = (c: CardContent) => handleCompleteLesson({ day: 2, sessionId: SESSION, completedAt: NOW.toISOString() }, { db, userId, now: NOW, content: c });

describe("completion with content problems elsewhere", () => {
  it.each([
    ["an earlier finished day whose lesson file is broken", { 1: "throw" as const, 2: ["v-a", "v-b"] }],
    ["an earlier finished day whose lesson file is missing", { 2: ["v-a", "v-b"] }],
  ])("%s: 200, the day is done, the good words get their cards", async (_name, lessons) => {
    const r = await completeDay2(content(lessons, ["v-a", "v-b"]));
    expect(r.status).toBe(200);
    expect((await db.select().from(progress).where(eq(progress.day, 2)))[0].status).toBe("done");
    expect((await db.select().from(profiles).where(eq(profiles.userId, userId)))[0].currentDay).toBe(3);
    expect(await cardIds()).toEqual(["v-a/en_th", "v-a/th_en", "v-b/en_th", "v-b/th_en"]);
  });

  it("a lesson that lists a word that is not in the bank: the completion succeeds and only the known words get cards", async () => {
    const r = await completeDay2(content({ 1: ["v-x"], 2: ["v-a", "v-ghost", "v-b"] }, ["v-x", "v-a", "v-b"]));
    expect(r.status).toBe(200);
    expect(await cardIds()).toEqual(["v-a/en_th", "v-a/th_en", "v-b/en_th", "v-b/th_en", "v-x/en_th", "v-x/th_en"]);
  });
});
