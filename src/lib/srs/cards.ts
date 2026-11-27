// Server side of the vocabulary review: which cards a learner should have, creating them, and the day's queue.
// docs/plans/vocab-review-plan.md 2.1 (cards), 2.2 (due), 2.3 (order), 5.4. Not client-safe (it reads the database and content).
//
// Time and zone come in as parameters (nothing here reads the clock). Due dates of new cards come ONLY from initialDues.
import { getProfile } from "@/db/queries/progress";
import { listDoneDays } from "@/db/queries/practice";
import { insertMissingCards, listCards, type CardRow, type NewCard } from "@/db/queries/srs";
import type { Db, DbOrTx } from "@/db/types";
import { getLesson, vocabReader } from "@/lib/content/repo";
import { localDate, resolveTimeZone } from "@/lib/progress/dates";
import { REVIEW_DIRECTIONS, toWire, type ReviewDirection, type ReviewQueue } from "./contract";
import { initialDues, type CardOrigin } from "./initial";
import { endOfToday, isDueBefore, orderQueue, type QueueCard } from "./queue";
import type { CardState } from "./scheduler";

export type VocabCardContent = { word: string; ipa: { us: string; uk: string }; th: string; example: { en: string; th: string } | null };
/** Where lessons and words come from: the content files in production, a small fake in tests. */
export type CardContent = {
  getLesson(day: number): { vocab: readonly string[] } | null;
  getVocab(id: string): VocabCardContent | null;
  /** A source that is costly to ask word by word returns a version bound to one read; reconcile and the loader call it once per call. */
  snapshot?(): CardContent;
};

const toCard = (v: { word: string; ipa: { us: string; uk: string }; th: string; examples: readonly { en: string; th: string }[] }): VocabCardContent => ({
  word: v.word, ipa: v.ipa, th: v.th, example: v.examples[0] ?? null,
});

export const repoContent: CardContent = {
  getLesson: (day) => getLesson(day),
  getVocab: (id) => {
    const v = vocabReader()(id);
    return v ? toCard(v) : null;
  },
  // the vocabulary tree is read once for everything done with the snapshot
  snapshot: () => {
    const read = vocabReader();
    return {
      getLesson: (day) => getLesson(day),
      getVocab: (id) => {
        const v = read(id);
        return v ? toCard(v) : null;
      },
    };
  },
};

export type ExpectedWord = { vocabId: string; day: number; position: number };

/**
 * The words that should have cards: every word of `lesson.vocab` of the finished days that exists in the vocabulary bank,
 * in teaching order (day, then position in the lesson). A word taught twice counts once (first place). A lesson that
 * is missing or fails to load only loses its own words.
 */
export function expectedCardVocabIds(doneDays: readonly number[], content: CardContent): ExpectedWord[] {
  const out: ExpectedWord[] = [];
  const seen = new Set<string>();
  for (const day of [...new Set(doneDays)].sort((a, b) => a - b)) {
    let vocab: readonly string[] = [];
    try {
      vocab = content.getLesson(day)?.vocab ?? [];
    } catch {
      continue;
    }
    vocab.forEach((vocabId, position) => {
      if (seen.has(vocabId) || !content.getVocab(vocabId)) return;
      seen.add(vocabId);
      out.push({ vocabId, day, position });
    });
  }
  return out;
}

const isReviewDirection = (d: string): d is ReviewDirection => (REVIEW_DIRECTIONS as readonly string[]).includes(d);

/** The content source bound to one read of the vocabulary (a source without `snapshot` is used as it is). */
export const snapshotContent = (content: CardContent): CardContent => content.snapshot?.() ?? content;

async function expectedForUser(db: DbOrTx, userId: string, content: CardContent): Promise<ExpectedWord[]> {
  const done = await listDoneDays(db, userId);
  return expectedCardVocabIds(done.map((d) => d.day), content);
}

export type ReconcileOptions = {
  content?: CardContent;
  /** The lesson that was finished in this very transaction: its words start by the lesson rule, all others by the backfill rule. */
  completed?: { day: number; completedAt: Date };
};

/**
 * Makes sure every word of every finished lesson has one card per direction. Idempotent: it only inserts what is
 * missing and never edits a card. A word with no card yet starts by the rule of its origin (the lesson just finished,
 * or the backfill for older lessons); a word that has only one direction gets the other one by the backfill rule.
 * Call it inside the completion transaction and from the queue loader.
 */
export async function reconcileCards(db: DbOrTx, userId: string, now: Date, timeZone: string, opts: ReconcileOptions = {}): Promise<{ created: number; expected: ExpectedWord[] }> {
  const content = snapshotContent(opts.content ?? repoContent);
  const tz = resolveTimeZone(timeZone);
  const expected = await expectedForUser(db, userId, content);
  if (expected.length === 0) return { created: 0, expected };
  const have = new Map<string, Set<string>>();
  for (const c of await listCards(db, userId)) {
    if (!isReviewDirection(c.direction)) continue; // a card of another direction (listen_spell...) says nothing about the review pair
    if (!have.has(c.vocabId)) have.set(c.vocabId, new Set());
    have.get(c.vocabId)!.add(c.direction);
  }
  const dues = new Map<string, Record<ReviewDirection, Date>>();
  const duesFor = (origin: CardOrigin) => {
    const key = origin.kind === "lesson" ? `lesson|${origin.completedAt.getTime()}` : "backfill";
    let d = dues.get(key);
    if (!d) dues.set(key, (d = initialDues(origin, now, tz)));
    return d;
  };
  const missing: NewCard[] = [];
  for (const w of expected) {
    const dirs = have.get(w.vocabId);
    const fresh = !dirs || dirs.size === 0;
    const origin: CardOrigin = fresh && opts.completed?.day === w.day ? { kind: "lesson", completedAt: opts.completed.completedAt } : { kind: "backfill" };
    for (const direction of REVIEW_DIRECTIONS) {
      if (dirs?.has(direction)) continue;
      missing.push({ vocabId: w.vocabId, direction, due: duesFor(origin)[direction] });
    }
  }
  return { created: await insertMissingCards(db, userId, missing, now), expected };
}

/** A stored card as the scheduler's state (the column `state` is already 0 | 1 | 2 | 3). */
export function rowToCardState(r: CardRow): CardState {
  return {
    due: r.due, stability: r.stability, difficulty: r.difficulty, scheduledDays: r.scheduledDays, learningSteps: r.learningSteps,
    elapsedDays: r.elapsedDays, reps: r.reps, lapses: r.lapses, state: r.state, lastReview: r.lastReview,
  };
}

/**
 * The cards due today, ordered, with what the screen shows. Creates missing cards first (backfill and content repair).
 * "Today" is the learner's local day in profiles.timezone; the end of today is computed once for the whole queue.
 * Cards of words that are not (or no longer) in the expected set are kept in the database but not served. The button
 * intervals are not computed here: the client computes them from `state` and its clock.
 */
export async function loadReviewQueue(db: Db, userId: string, now: Date, source: CardContent = repoContent): Promise<ReviewQueue> {
  const content = snapshotContent(source);
  const profile = await getProfile(db, userId);
  const tz = resolveTimeZone(profile.timezone);
  const { expected } = await reconcileCards(db, userId, now, tz, { content });
  const teachOrder = new Map(expected.map((w, i) => [w.vocabId, i]));
  const end = endOfToday(now, tz);
  const due: QueueCard[] = [];
  for (const row of await listCards(db, userId)) {
    if (!isReviewDirection(row.direction) || !teachOrder.has(row.vocabId)) continue;
    const state = rowToCardState(row);
    if (isDueBefore(state.due, end)) due.push({ vocabId: row.vocabId, direction: row.direction, state });
  }
  const cards = orderQueue(due, teachOrder).flatMap((c) => {
    const v = content.getVocab(c.vocabId);
    return v ? [{ vocabId: c.vocabId, direction: c.direction, state: toWire(c.state), word: v.word, ipa: v.ipa[profile.accent], th: v.th, example: v.example }] : [];
  });
  return { today: localDate(now, tz), endOfToday: end.toISOString(), timeZone: tz, cards };
}
