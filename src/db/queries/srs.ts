// The ONLY module that reads or writes the review tables as tables (ESLint enforces it: srsCards and srsReviews cannot
// be imported as values anywhere else). Everything takes a client or a transaction.
import { eq } from "drizzle-orm";
import { srsCards, type SrsDirection } from "../schema";
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
