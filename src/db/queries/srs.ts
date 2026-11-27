// The ONLY module that reads or writes the review tables as tables (ESLint enforces it: srsCards and srsReviews cannot
// be imported as values anywhere else). Everything takes a client or a transaction.
import { and, count, eq, inArray, lt, lte, min, sql } from "drizzle-orm";
import type { CardState } from "@/lib/srs/scheduler";
import { srsCards, srsReviews, type SrsDirection } from "../schema";
import type { DbOrTx } from "../types";

export type CardRow = typeof srsCards.$inferSelect;
export type NewCard = { vocabId: string; direction: SrsDirection; due: Date };

/** Every card of the user, in a fixed order (word, then direction). */
export async function listCards(db: DbOrTx, userId: string): Promise<CardRow[]> {
  return db.select().from(srsCards).where(eq(srsCards.userId, userId)).orderBy(srsCards.vocabId, srsCards.direction);
}

/**
 * Inserts New cards (state 0, no reviews) that do not exist yet; a card that exists is never touched
 * (ON CONFLICT DO NOTHING on the primary key), so it is safe to call again and under concurrency.
 * `now` is stored as created_at and updated_at. Returns how many rows were really inserted.
 */
export async function insertMissingCards(db: DbOrTx, userId: string, rows: readonly NewCard[], now: Date): Promise<number> {
  if (rows.length === 0) return 0;
  const inserted = await db
    .insert(srsCards)
    .values(rows.map((r) => ({ userId, vocabId: r.vocabId, direction: r.direction, due: r.due, createdAt: now, updatedAt: now })))
    .onConflictDoNothing()
    .returning({ vocabId: srsCards.vocabId });
  return inserted.length;
}

/** One card, locked FOR UPDATE until the transaction ends: the reviews of one card are computed one after the other. */
export async function lockCard(db: DbOrTx, userId: string, vocabId: string, direction: SrsDirection): Promise<CardRow | undefined> {
  const [row] = await db
    .select()
    .from(srsCards)
    .where(and(eq(srsCards.userId, userId), eq(srsCards.vocabId, vocabId), eq(srsCards.direction, direction)))
    .for("update");
  return row;
}

export type NewReview = {
  id: string;
  vocabId: string;
  direction: SrsDirection;
  rating: number;
  reviewedAt: Date;
  durationMs: number | null;
  stateBefore: unknown;
  stateAfter: unknown;
  sessionId: string;
};

/** Stores a review with the client's id. false = a row with that id already exists (nothing was changed). */
export async function insertReview(db: DbOrTx, userId: string, r: NewReview): Promise<boolean> {
  const inserted = await db.insert(srsReviews).values({ ...r, userId }).onConflictDoNothing({ target: srsReviews.id }).returning({ id: srsReviews.id });
  return inserted.length > 0;
}

/** The user's stored review with this id (the card it belongs to and its `state_after` jsonb), or undefined when there is none (or it is another user's). */
export async function findReview(db: DbOrTx, userId: string, id: string) {
  const [row] = await db
    .select({ vocabId: srsReviews.vocabId, direction: srsReviews.direction, stateAfter: srsReviews.stateAfter })
    .from(srsReviews)
    .where(and(eq(srsReviews.userId, userId), eq(srsReviews.id, id)));
  return row;
}

/** Writes the new scheduling state of a (locked) card. */
export async function updateCard(db: DbOrTx, userId: string, vocabId: string, direction: SrsDirection, s: CardState, now: Date): Promise<void> {
  await db
    .update(srsCards)
    .set({
      due: s.due, stability: s.stability, difficulty: s.difficulty, scheduledDays: s.scheduledDays, learningSteps: s.learningSteps,
      elapsedDays: s.elapsedDays, reps: s.reps, lapses: s.lapses, state: s.state, lastReview: s.lastReview, updatedAt: now,
    })
    .where(and(eq(srsCards.userId, userId), eq(srsCards.vocabId, vocabId), eq(srsCards.direction, direction)));
}

/** How many reviews of the session are stored, and the time of the first one (`reviewed_at`, already clamped by the server). */
export async function sessionReviewSpan(db: DbOrTx, userId: string, sessionId: string): Promise<{ count: number; first: Date | null }> {
  const [row] = await db
    .select({ n: count(), first: min(srsReviews.reviewedAt) })
    .from(srsReviews)
    .where(and(eq(srsReviews.userId, userId), eq(srsReviews.sessionId, sessionId)));
  return { count: row.n, first: row.first ? new Date(row.first) : null };
}

/** Reviews of the session on a card that was due before `end` when it was reviewed (`state_before.due`): the ones that count as "finishing what was due". */
export async function countSessionDueReviews(db: DbOrTx, userId: string, sessionId: string, end: Date): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(srsReviews)
    .where(and(eq(srsReviews.userId, userId), eq(srsReviews.sessionId, sessionId), sql`(${srsReviews.stateBefore}->>'due')::timestamptz < ${end.toISOString()}::timestamptz`));
  return row.n;
}

/**
 * Cards due before `end` that existed at `createdUpTo` (created_at <= it), of the given words and directions only.
 * One definition of "due" for every state (docs/plans/vocab-review-plan.md 2.2).
 */
export async function countDueAt(
  db: DbOrTx, userId: string, end: Date, createdUpTo: Date, vocabIds: readonly string[], directions: readonly SrsDirection[],
): Promise<number> {
  if (vocabIds.length === 0 || directions.length === 0) return 0;
  const [row] = await db
    .select({ n: count() })
    .from(srsCards)
    .where(
      and(
        eq(srsCards.userId, userId),
        lt(srsCards.due, end),
        lte(srsCards.createdAt, createdUpTo),
        inArray(srsCards.vocabId, [...vocabIds]),
        inArray(srsCards.direction, [...directions]),
      ),
    );
  return row.n;
}

/**
 * How many of the user's cards, of the given words and directions, are due before `end` (any state, whenever created).
 * The count on /practice and the home page; the review queue applies the same filter in memory, so the two cannot differ.
 */
export async function countDueCards(db: DbOrTx, userId: string, end: Date, vocabIds: readonly string[], directions: readonly SrsDirection[]): Promise<number> {
  if (vocabIds.length === 0 || directions.length === 0) return 0;
  const [row] = await db
    .select({ n: count() })
    .from(srsCards)
    .where(and(eq(srsCards.userId, userId), lt(srsCards.due, end), inArray(srsCards.vocabId, [...vocabIds]), inArray(srsCards.direction, [...directions])));
  return row.n;
}
