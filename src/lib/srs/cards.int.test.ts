// @vitest-environment node
// Cards are created from finished lessons by ONE idempotent function (docs/plans/vocab-review-plan.md 2.1, PR 2).
import fs from "node:fs";
import path from "node:path";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { attempts, profiles, progress, srsCards, user } from "@/db/schema";
import { cleanDatabase, connectTestDb } from "@/db/test-utils";
import { seedLocal } from "@/lib/server/test-helpers";
import { getLesson } from "@/lib/content/repo";
import { localDate, localMidnight, addDays } from "@/lib/progress/dates";
import { expectedCardVocabIds, getReviewSummary, loadReviewQueue, reconcileCards, repoContent, type CardContent } from "./cards";
import { initialDues } from "./initial";
import { cardKey, endOfToday, isDueBefore } from "./queue";
import { REVIEW_DIRECTIONS } from "./contract";
import { SIBLING_GAP } from "./config";

// initialDues stays the real one unless a test replaces it once
vi.mock("./initial", async (original) => {
  const real = await original<typeof import("./initial")>();
  return { ...real, initialDues: vi.fn(real.initialDues) };
});

const { sql, db } = connectTestDb();
const NOW = new Date("2026-11-25T10:00:00.000Z"); // 17:00 on 25 Nov in Bangkok
const BKK = "Asia/Bangkok";
const LA = "America/Los_Angeles";
let userId: string;

const DAY1 = ["v-hello", "v-name", "v-nice", "v-meet", "v-cat"];
const REAL_DAY_WORDS = new Map<number, string[]>(Array.from({ length: 7 }, (_, i) => [i + 1, [...(getLesson(i + 1)?.vocab ?? [])]]));
const ALL_WORDS_1_7 = [...REAL_DAY_WORDS.values()].flat();

async function markDone(day: number, completedAt = new Date(NOW.getTime() - 3_600_000), user_ = userId) {
  await db.insert(progress).values({ userId: user_, day, status: "done", startedAt: completedAt, completedAt, score: 1 });
}
const cards = (u = userId) => db.select().from(srsCards).where(eq(srsCards.userId, u)).orderBy(srsCards.vocabId, srsCards.direction);
const reconcile = (now = NOW, tz = BKK, opts: Parameters<typeof reconcileCards>[4] = {}) => reconcileCards(db, userId, now, tz, opts);
const setTz = (tz: string) => db.update(profiles).set({ timezone: tz }).where(eq(profiles.userId, userId));

/** An editable content source (a lesson per day, a vocab entry per id). */
function fakeContent(lessons: Record<number, string[]>, vocab: string[]): CardContent & { lessons: Record<number, string[]>; vocab: Set<string> } {
  const v = new Set(vocab);
  return {
    lessons,
    vocab: v,
    getLesson: (d) => (lessons[d] ? { vocab: lessons[d] } : null),
    getVocab: (id) => (v.has(id) ? { word: id, ipa: { us: `us-${id}`, uk: `uk-${id}` }, th: `th-${id}`, example: { en: `en ${id}`, th: `ex ${id}` } } : null),
  };
}

beforeEach(async () => {
  await cleanDatabase(sql);
  vi.mocked(initialDues).mockClear();
  userId = await seedLocal(db, 1, NOW);
});
afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  await cleanDatabase(sql);
  await sql.end();
});

describe("expectedCardVocabIds (pure)", () => {
  const content = fakeContent({ 1: ["a", "b"], 2: ["c", "a", "d"], 4: ["e"] }, ["a", "b", "c", "e"]); // d is not in the vocab bank
  it("teaching order: by day, then by position in lesson.vocab; unknown words and duplicates are skipped", () => {
    expect(expectedCardVocabIds([2, 1], content)).toEqual([
      { vocabId: "a", day: 1, position: 0 },
      { vocabId: "b", day: 1, position: 1 },
      { vocabId: "c", day: 2, position: 0 },
    ]);
  });
  it("only the given days count (a day that is not finished contributes nothing), and a day without a file is skipped", () => {
    expect(expectedCardVocabIds([1], content).map((w) => w.vocabId)).toEqual(["a", "b"]);
    expect(expectedCardVocabIds([3, 5], content)).toEqual([]);
    expect(expectedCardVocabIds([], content)).toEqual([]);
  });
  it("a lesson that throws only loses its own words", () => {
    const broken: CardContent = { getLesson: (d) => { if (d === 1) throw new Error("bad file"); return { vocab: ["x"] }; }, getVocab: () => ({ word: "x", ipa: { us: "", uk: "" }, th: "", example: null }) };
    expect(expectedCardVocabIds([1, 2], broken).map((w) => w.day)).toEqual([2]);
  });
  it("the real content: day 1 teaches the five words the plan names", () => {
    expect(expectedCardVocabIds([1], repoContent).map((w) => w.vocabId)).toEqual(DAY1);
  });
});

describe("content is read once per call", () => {
  const vocabTreeReads = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.filter(([dir]) => String(dir) === path.join(process.cwd(), "content", "vocab")).length;
  it("one reconcile of 7 finished days lists the vocabulary tree once (not once per word)", async () => {
    for (let d = 1; d <= 7; d++) await markDone(d);
    const spy = vi.spyOn(fs, "readdirSync");
    await reconcile();
    expect(vocabTreeReads(spy)).toBe(1);
  });
  it("one queue load (reconcile + queue) lists it once too", async () => {
    for (let d = 1; d <= 7; d++) await markDone(d);
    const spy = vi.spyOn(fs, "readdirSync");
    await loadReviewQueue(db, userId, NOW);
    expect(vocabTreeReads(spy)).toBe(1);
  });
  it("the loader asks for the finished days once", async () => {
    await markDone(1);
    const content = fakeContent({ 1: ["a"] }, ["a"]);
    const getLessonSpy = vi.spyOn(content, "getLesson");
    await loadReviewQueue(db, userId, NOW, content);
    expect(getLessonSpy).toHaveBeenCalledTimes(1);
  });
});

describe("reconcileCards", () => {
  it("day 1 finished: 5 words x 2 directions = 10 New cards, due only through initialDues (lesson origin)", async () => {
    await markDone(1);
    const completedAt = new Date("2026-11-25T09:00:00.000Z");
    const r = await reconcile(NOW, BKK, { completed: { day: 1, completedAt } });
    expect(r.created).toBe(10);
    const rows = await cards();
    expect(rows).toHaveLength(10);
    expect(new Set(rows.map((c) => c.vocabId))).toEqual(new Set(DAY1));
    for (const c of rows) {
      expect(c.state).toBe(0);
      expect([c.reps, c.lapses, c.stability, c.difficulty, c.scheduledDays, c.learningSteps, c.elapsedDays]).toEqual([0, 0, 0, 0, 0, 0, 0]);
      expect(c.lastReview).toBeNull();
      expect(c.createdAt).toEqual(NOW);
    }
    const expected = initialDues({ kind: "lesson", completedAt }, NOW, BKK);
    expect(rows.filter((c) => c.direction === "en_th").every((c) => c.due.getTime() === expected.en_th.getTime())).toBe(true);
    expect(rows.filter((c) => c.direction === "th_en").every((c) => c.due.getTime() === expected.th_en.getTime())).toBe(true);
    expect(expected.en_th.toISOString()).toBe("2026-11-25T17:00:00.000Z"); // 00:00 on 26 Nov in Bangkok
    expect(expected.th_en.toISOString()).toBe("2026-11-26T17:00:00.000Z");
  });

  it("due dates come ONLY from initialDues: a replaced initialDues decides what is stored", async () => {
    await markDone(1);
    const marker = { en_th: new Date("2031-01-01T00:00:00.000Z"), th_en: new Date("2032-02-02T00:00:00.000Z") };
    vi.mocked(initialDues).mockReturnValue(marker);
    await reconcile();
    const rows = await cards();
    expect(rows.filter((c) => c.direction === "en_th").map((c) => c.due.toISOString())).toEqual(Array(5).fill(marker.en_th.toISOString()));
    expect(rows.filter((c) => c.direction === "th_en").map((c) => c.due.toISOString())).toEqual(Array(5).fill(marker.th_en.toISOString()));
    expect(vi.mocked(initialDues)).toHaveBeenCalled();
    vi.mocked(initialDues).mockReset();
  });

  it("calling it twice changes nothing (second call creates 0 and rows are identical)", async () => {
    await markDone(1);
    await reconcile(NOW, BKK, { completed: { day: 1, completedAt: NOW } });
    const first = await cards();
    const second = await reconcile(new Date(NOW.getTime() + 86_400_000), BKK);
    expect(second.created).toBe(0);
    expect(await cards()).toEqual(first);
  });

  it("never edits a card that has been reviewed", async () => {
    await markDone(1);
    await reconcile();
    const due = new Date("2026-12-25T00:00:00.000Z");
    await db.update(srsCards).set({ state: 2, reps: 5, stability: 9.5, due, lastReview: NOW }).where(and(eq(srsCards.vocabId, "v-cat"), eq(srsCards.direction, "en_th")));
    const before = await cards();
    await reconcile(new Date(NOW.getTime() + 5 * 86_400_000));
    expect(await cards()).toEqual(before);
  });

  it("a word with only en_th gets ONLY th_en, with the backfill due; the en_th row is untouched", async () => {
    await markDone(1);
    await db.insert(srsCards).values({ userId, vocabId: "v-cat", direction: "en_th", due: new Date("2026-11-20T00:00:00.000Z"), state: 2, reps: 3 });
    await reconcile(NOW, BKK, { completed: { day: 1, completedAt: NOW } });
    const rows = await cards();
    expect(rows).toHaveLength(10);
    const cat = rows.filter((c) => c.vocabId === "v-cat");
    expect(cat.find((c) => c.direction === "en_th")).toMatchObject({ state: 2, reps: 3 });
    expect(cat.find((c) => c.direction === "en_th")!.due.toISOString()).toBe("2026-11-20T00:00:00.000Z");
    expect(cat.find((c) => c.direction === "th_en")!.due).toEqual(initialDues({ kind: "backfill" }, NOW, BKK).th_en);
  });

  it("a card of another direction (listen_spell) does not change which due rule a word gets", async () => {
    await markDone(1);
    await db.insert(srsCards).values({ userId, vocabId: "v-hello", direction: "listen_spell", due: new Date("2026-11-01T00:00:00.000Z") });
    const completedAt = new Date("2026-11-25T09:00:00.000Z");
    await reconcile(NOW, BKK, { completed: { day: 1, completedAt } });
    const hello = (await cards()).filter((c) => c.vocabId === "v-hello");
    expect(hello.map((c) => c.direction)).toEqual(["en_th", "listen_spell", "th_en"]);
    const lesson = initialDues({ kind: "lesson", completedAt }, NOW, BKK);
    expect(hello.find((c) => c.direction === "en_th")!.due).toEqual(lesson.en_th); // not the backfill rule
    expect(hello.find((c) => c.direction === "th_en")!.due).toEqual(lesson.th_en);
    expect(hello.find((c) => c.direction === "listen_spell")!.due.toISOString()).toBe("2026-11-01T00:00:00.000Z"); // untouched
  });

  it("GUARD: a word of a lesson that is not finished never gets a card (in_progress, not_started, no row)", async () => {
    await markDone(1);
    await db.insert(progress).values({ userId, day: 2, status: "in_progress", startedAt: NOW });
    await db.insert(progress).values({ userId, day: 3, status: "not_started" });
    await reconcile();
    const ids = new Set((await cards()).map((c) => c.vocabId));
    expect(ids).toEqual(new Set(DAY1));
    for (const w of REAL_DAY_WORDS.get(2)!.concat(REAL_DAY_WORDS.get(3)!)) expect(ids.has(w)).toBe(false);
  });

  it("with nothing finished there are no cards", async () => {
    expect((await reconcile()).created).toBe(0);
    expect(await cards()).toHaveLength(0);
  });

  it("a word that is not in the vocabulary bank is skipped, the others are created", async () => {
    await markDone(1);
    const content = fakeContent({ 1: ["a", "ghost", "b"] }, ["a", "b"]);
    await reconcileCards(db, userId, NOW, BKK, { content });
    expect((await cards()).map((c) => `${c.vocabId}/${c.direction}`)).toEqual(["a/en_th", "a/th_en", "b/en_th", "b/th_en"]);
  });

  it("content repair: a word added to a finished lesson later gets both cards (backfill dues); a word removed keeps its cards", async () => {
    await markDone(1);
    const content = fakeContent({ 1: ["a", "b"] }, ["a", "b", "c"]);
    await reconcileCards(db, userId, NOW, BKK, { content, completed: { day: 1, completedAt: NOW } });
    expect(await cards()).toHaveLength(4);
    const later = new Date(NOW.getTime() + 3 * 86_400_000);
    content.lessons[1] = ["a", "c"]; // b removed, c added
    const r = await reconcileCards(db, userId, later, BKK, { content });
    expect(r.created).toBe(2);
    const rows = await cards();
    expect(rows.map((c) => `${c.vocabId}/${c.direction}`)).toEqual(["a/en_th", "a/th_en", "b/en_th", "b/th_en", "c/en_th", "c/th_en"]);
    const c = rows.filter((x) => x.vocabId === "c");
    const backfill = initialDues({ kind: "backfill" }, later, BKK);
    expect(c.find((x) => x.direction === "en_th")!.due).toEqual(backfill.en_th);
    expect(c.find((x) => x.direction === "th_en")!.due).toEqual(backfill.th_en);
    expect(c[0].createdAt).toEqual(later);
  });

  it("user scoping: it only ever creates cards for the given user", async () => {
    await db.insert(user).values({ id: "other", name: "O", email: "o@example.com" });
    await db.insert(profiles).values({ userId: "other", startDate: "2026-11-25" });
    await markDone(1);
    await reconcile();
    expect(await cards()).toHaveLength(10);
    expect(await cards("other")).toHaveLength(0);
    await markDone(1, NOW, "other");
    await reconcileCards(db, "other", NOW, BKK);
    expect(await cards("other")).toHaveLength(10);
    expect(await cards()).toHaveLength(10);
  });

  it("works inside a transaction and rolls back with it", async () => {
    await markDone(1);
    await db.transaction(async (tx) => {
      await reconcileCards(tx, userId, NOW, BKK);
      tx.rollback();
    }).catch(() => undefined);
    expect(await cards()).toHaveLength(0);
  });
});

describe("loadReviewQueue", () => {
  const load = (now = NOW, content: CardContent = repoContent) => loadReviewQueue(db, userId, now, content);
  const keys = (q: Awaited<ReturnType<typeof load>>) => q.cards.map((c) => `${c.vocabId}/${c.direction}`);

  it("BACKFILL: days 1-7 finished before the feature: 72 cards are created, 36 are due today (all en_th)", async () => {
    for (let d = 1; d <= 7; d++) await markDone(d);
    expect(ALL_WORDS_1_7).toHaveLength(36);
    const q = await load();
    const rows = await cards();
    expect(rows).toHaveLength(72);
    expect(rows.filter((c) => c.direction === "en_th")).toHaveLength(36);
    expect(rows.filter((c) => c.direction === "en_th").every((c) => c.due.getTime() === NOW.getTime())).toBe(true);
    const tomorrow = localMidnight(addDays(localDate(NOW, BKK), 1), BKK);
    expect(rows.filter((c) => c.direction === "th_en").every((c) => c.due.getTime() === tomorrow.getTime())).toBe(true);
    expect(q.cards).toHaveLength(36);
    expect(q.cards.every((c) => c.direction === "en_th")).toBe(true);
    expect(q.cards.map((c) => c.vocabId)).toEqual(ALL_WORDS_1_7); // new cards in teaching order
  });

  it("reports today, the end of today and the zone it used", async () => {
    await markDone(1);
    const q = await load();
    expect(q.today).toBe("2026-11-25");
    expect(q.endOfToday).toBe(endOfToday(NOW, BKK).toISOString());
    expect(q.endOfToday).toBe("2026-11-25T17:00:00.000Z");
    expect(q.timeZone).toBe(BKK);
  });

  it("uses the profile's time zone for the day boundary", async () => {
    await markDone(1);
    await setTz(LA); // 02:00 on 25 Nov in Los Angeles
    const q = await load();
    expect(q.today).toBe("2026-11-25");
    expect(q.endOfToday).toBe("2026-11-26T08:00:00.000Z");
    expect(q.timeZone).toBe(LA);
  });

  it("the boundary: due exactly at the end of today is NOT in the queue, one millisecond before is", async () => {
    await markDone(1);
    await reconcile();
    const end = endOfToday(NOW, BKK);
    await db.update(srsCards).set({ due: new Date(end.getTime() - 1) }).where(and(eq(srsCards.vocabId, "v-hello"), eq(srsCards.direction, "th_en")));
    await db.update(srsCards).set({ due: end }).where(and(eq(srsCards.vocabId, "v-name"), eq(srsCards.direction, "th_en")));
    await db.update(srsCards).set({ due: new Date(end.getTime() - 86_400_000) }).where(eq(srsCards.direction, "en_th"));
    const q = await load();
    expect(keys(q)).toContain("v-hello/th_en");
    expect(keys(q)).not.toContain("v-name/th_en");
    expect(isDueBefore(end, end)).toBe(false);
  });

  it("reviews before new, oldest due first; new cards in teaching order (not the due order)", async () => {
    await markDone(1);
    await reconcile();
    const day = 86_400_000;
    await db.update(srsCards).set({ state: 1, due: new Date(NOW.getTime() - 2 * day), reps: 1 }).where(and(eq(srsCards.vocabId, "v-meet"), eq(srsCards.direction, "en_th")));
    await db.update(srsCards).set({ state: 2, due: new Date(NOW.getTime() - 3 * day), reps: 2 }).where(and(eq(srsCards.vocabId, "v-cat"), eq(srsCards.direction, "en_th")));
    await db.update(srsCards).set({ state: 0, due: new Date(NOW.getTime() - 9 * day) }).where(and(eq(srsCards.vocabId, "v-hello"), eq(srsCards.direction, "en_th")));
    await db.update(srsCards).set({ due: new Date(NOW.getTime() + 20 * day) }).where(eq(srsCards.direction, "th_en"));
    // en_th due now: hello (new), name (new), nice (new), meet (learning), cat (review)
    const q = await load();
    expect(keys(q)).toEqual(["v-cat/en_th", "v-meet/en_th", "v-hello/en_th", "v-name/en_th", "v-nice/en_th"]);
  });

  it("a queue that is already valid is returned exactly as ordered (siblings not due together: nothing is moved)", async () => {
    await markDone(1);
    await load();
    const q = await load(new Date(NOW.getTime() + 1000));
    expect(keys(q)).toEqual(DAY1.map((w) => `${w}/en_th`));
  });

  it("sibling gap: both cards of four words due the same day are kept at least SIBLING_GAP apart (sorted, they would be adjacent)", async () => {
    await markDone(1);
    await reconcile();
    const four = DAY1.slice(0, 4);
    await db.update(srsCards).set({ due: NOW }).where(and(eq(srsCards.userId, userId), inArray(srsCards.vocabId, four))); // both directions of 4 words due now
    const q = await load();
    expect(keys(q).sort()).toEqual(four.flatMap((w) => [`${w}/en_th`, `${w}/th_en`]).concat(["v-cat/en_th"]).sort());
    expect(keys(q).slice(0, 4).every((k) => k.endsWith("en_th"))).toBe(true);
    const at = new Map(q.cards.map((c, i) => [cardKey(c), i]));
    for (const w of four) expect(Math.abs(at.get(`${w}|en_th`)! - at.get(`${w}|th_en`)!)).toBeGreaterThanOrEqual(SIBLING_GAP);
  });

  it("a missed day: 5 words, both directions due, all new -> no siblings adjacent, every gap >= SIBLING_GAP, en_th block first", async () => {
    await markDone(1);
    await reconcile();
    await db.update(srsCards).set({ due: NOW }).where(eq(srsCards.userId, userId));
    const q = await load();
    expect(keys(q)).toEqual([...DAY1.map((w) => `${w}/en_th`), ...DAY1.map((w) => `${w}/th_en`)]);
    const at = new Map(q.cards.map((c, i) => [cardKey(c), i]));
    for (const w of DAY1) expect(Math.abs(at.get(`${w}|en_th`)! - at.get(`${w}|th_en`)!)).toBeGreaterThanOrEqual(SIBLING_GAP);
  });

  it("content comes from the content source: word, IPA by the profile's accent, Thai, first example", async () => {
    await markDone(1);
    const content = fakeContent({ 1: ["a", "b"] }, ["a", "b"]);
    let q = await load(NOW, content);
    expect(q.cards[0]).toMatchObject({ vocabId: "a", direction: "en_th", word: "a", ipa: "us-a", th: "th-a", example: { en: "en a", th: "ex a" } });
    await db.update(profiles).set({ accent: "uk" }).where(eq(profiles.userId, userId));
    q = await load(NOW, content);
    expect(q.cards[0].ipa).toBe("uk-a");
  });

  it("the real content: IPA and an example for the day 1 words, in the wire format of the contract", async () => {
    await markDone(1);
    const q = await load();
    const hello = q.cards.find((c) => c.vocabId === "v-hello")!;
    expect(hello.word).toBe("hello");
    expect(hello.th).toMatch(/[฀-๿]/);
    expect(hello.ipa.length).toBeGreaterThan(0);
    expect(hello.example?.en.length).toBeGreaterThan(0);
    expect(hello.state).toMatchObject({ state: 0, reps: 0, lapses: 0, lastReview: null });
    expect(typeof hello.state.due).toBe("string");
  });

  it("a word removed from content keeps its cards but is not served; it comes back with its old state when re-added", async () => {
    await markDone(1);
    const content = fakeContent({ 1: ["a", "b"] }, ["a", "b"]);
    await load(NOW, content);
    expect(keys(await load(NOW, content))).toEqual(["a/en_th", "b/en_th"]);
    content.lessons[1] = ["a"];
    expect(keys(await load(NOW, content))).toEqual(["a/en_th"]);
    expect(await cards()).toHaveLength(4); // b's cards are still stored
    content.lessons[1] = ["a", "b"];
    expect(keys(await load(NOW, content))).toEqual(["a/en_th", "b/en_th"]);
    content.vocab.delete("b");
    expect(keys(await load(NOW, content))).toEqual(["a/en_th"]);
  });

  it("a card of a day that is not finished (e.g. stale data) is not served", async () => {
    await markDone(1);
    await reconcile();
    await db.insert(srsCards).values({ userId, vocabId: "v-how", direction: "en_th", due: NOW }); // a day 2 word with a card, day 2 not done
    expect(keys(await load())).not.toContain("v-how/en_th");
  });

  it("only the given user's cards are served, and nothing is created for a user with no finished lesson", async () => {
    await db.insert(user).values({ id: "other", name: "O", email: "o@example.com" });
    await db.insert(profiles).values({ userId: "other", startDate: "2026-11-25" });
    await markDone(1);
    await load();
    const q = await loadReviewQueue(db, "other", NOW, repoContent);
    expect(q.cards).toEqual([]);
    expect(await cards("other")).toHaveLength(0);
    expect(await cards()).toHaveLength(10);
  });

  it("GUARD: reconcile and the loader never write progress, profiles or attempts", async () => {
    for (let d = 1; d <= 3; d++) await markDone(d);
    await db.insert(progress).values({ userId, day: 4, status: "in_progress", startedAt: NOW });
    await db.insert(attempts).values({ userId, exerciseId: "d001-pron-01", day: 1, skill: "pronunciation", exerciseType: "minimal-pair", correct: true });
    const snap = async () => ({
      progress: await db.select().from(progress).orderBy(progress.day),
      profiles: await db.select().from(profiles).orderBy(profiles.userId),
      attempts: await db.select().from(attempts),
    });
    const before = await snap();
    await load();
    await reconcile(new Date(NOW.getTime() + 86_400_000), BKK, { completed: { day: 3, completedAt: NOW } });
    await load(new Date(NOW.getTime() + 2 * 86_400_000));
    expect(await snap()).toEqual(before);
    expect((await cards()).length).toBeGreaterThan(0);
  });

  it("is idempotent: loading twice gives the same queue and the same cards", async () => {
    for (let d = 1; d <= 5; d++) await markDone(d);
    const a = await load();
    const rowsA = await cards();
    const b = await load();
    expect(b).toEqual(a);
    expect(await cards()).toEqual(rowsA);
    expect(REVIEW_DIRECTIONS).toHaveLength(2);
  });
});

// PR 5: the number on /practice and the home page is the n of the "x / n" counter on /review. One definition (plan 2.2, 2.6/26).
describe("getReviewSummary", () => {
  const summary = (now = NOW, content: CardContent = repoContent) => getReviewSummary(db, userId, now, content);
  const queueSize = async (now = NOW, content: CardContent = repoContent) => (await loadReviewQueue(db, userId, now, content)).cards.length;
  /** The number the learner sees before starting must be the n of the session. */
  const agree = async (now = NOW, content: CardContent = repoContent) => {
    const s = await summary(now, content);
    expect(s.due).toBe(await queueSize(now, content));
    return s;
  };

  it("nothing finished: no words, nothing due, and no card is created", async () => {
    expect(await agree()).toEqual({ due: 0, withCard: 0 });
    expect(await cards()).toHaveLength(0);
  });

  it("day 1 just finished: 5 words with cards, none due today (they start tomorrow); once they are due, 10 cards (not 5 words)", async () => {
    await markDone(1);
    expect(await agree()).toEqual({ due: 0, withCard: 5 });
    await db.update(srsCards).set({ due: new Date(NOW.getTime() - 3_600_000) }).where(eq(srsCards.userId, userId));
    expect(await agree()).toEqual({ due: 10, withCard: 5 });
  });

  it("backfill of days 1-7: 36 words, 36 cards due (the en_th ones), and it is the queue's n", async () => {
    for (let d = 1; d <= 7; d++) await markDone(d);
    expect(await agree()).toEqual({ due: 36, withCard: 36 });
  });

  it("the day boundary is the learner's zone: due at the end of today is not counted, one millisecond before is", async () => {
    await markDone(1);
    await reconcile();
    const end = endOfToday(NOW, BKK);
    await db.update(srsCards).set({ due: new Date(end.getTime() - 86_400_000) }).where(eq(srsCards.direction, "en_th"));
    await db.update(srsCards).set({ due: new Date(end.getTime() - 1) }).where(and(eq(srsCards.vocabId, "v-hello"), eq(srsCards.direction, "th_en")));
    await db.update(srsCards).set({ due: end }).where(and(eq(srsCards.vocabId, "v-name"), eq(srsCards.direction, "th_en")));
    expect((await agree()).due).toBe(6); // 5 en_th + v-hello th_en
  });

  it("uses the profile's zone: a card due 10 hours after Bangkok's midnight is due today in Los Angeles only", async () => {
    await markDone(1);
    await reconcile();
    const late = new Date("2026-11-26T03:00:00.000Z"); // 10:00 on 26 Nov in Bangkok, 19:00 on 25 Nov in Los Angeles
    await db.update(srsCards).set({ due: late }).where(eq(srsCards.userId, userId));
    expect((await agree()).due).toBe(0);
    await setTz(LA);
    expect((await agree()).due).toBe(10);
  });

  it("a card whose word is no longer in content is stored but not counted, exactly like the queue", async () => {
    await markDone(1);
    const content = fakeContent({ 1: ["a", "b"] }, ["a", "b"]);
    await summary(NOW, content); // creates the four cards
    await db.update(srsCards).set({ due: new Date(NOW.getTime() - 3_600_000) }).where(eq(srsCards.userId, userId));
    expect(await agree(NOW, content)).toEqual({ due: 4, withCard: 2 });
    content.lessons[1] = ["a"]; // b leaves the lesson: its cards stay in the table
    expect(await agree(NOW, content)).toEqual({ due: 2, withCard: 1 });
    expect(await cards()).toHaveLength(4);
    content.lessons[1] = ["a", "b"];
    content.vocab.delete("b"); // b leaves the vocabulary bank
    expect(await agree(NOW, content)).toEqual({ due: 2, withCard: 1 });
  });

  it("cards that are not review cards or not of a finished day are not counted (listen_spell, a day 2 word)", async () => {
    await markDone(1);
    await reconcile();
    await db.update(srsCards).set({ due: new Date(NOW.getTime() - 3_600_000) }).where(eq(srsCards.userId, userId));
    await db.insert(srsCards).values([
      { userId, vocabId: "v-hello", direction: "listen_spell", due: new Date("2026-11-01T00:00:00.000Z") },
      { userId, vocabId: "v-how", direction: "en_th", due: NOW },
    ]);
    expect(await agree()).toEqual({ due: 10, withCard: 5 });
  });

  it("only the given user's cards count", async () => {
    await db.insert(user).values({ id: "other", name: "O", email: "o@example.com" });
    await db.insert(profiles).values({ userId: "other", startDate: "2026-11-25" });
    await markDone(1);
    await db.update(srsCards).set({ due: NOW }).where(eq(srsCards.userId, userId));
    expect(await getReviewSummary(db, "other", NOW, repoContent)).toEqual({ due: 0, withCard: 0 });
    expect(await agree()).toMatchObject({ withCard: 5 });
  });

  it("a card that was just reviewed and is due later today still counts, like the queue", async () => {
    await markDone(1);
    await reconcile();
    await db.update(srsCards).set({ due: new Date(NOW.getTime() + 600_000), state: 1 }).where(eq(srsCards.userId, userId));
    expect((await agree()).due).toBe(10);
  });

  it("GUARD: reading the summary never writes progress, profiles or attempts", async () => {
    await markDone(1);
    const before = [await db.select().from(progress), await db.select().from(profiles), await db.select().from(attempts)];
    await summary();
    expect([await db.select().from(progress), await db.select().from(profiles), await db.select().from(attempts)]).toEqual(before);
  });
});
