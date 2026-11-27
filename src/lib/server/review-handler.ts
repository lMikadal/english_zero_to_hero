// POST /api/reviews: stores reviews and moves the cards (docs/plans/vocab-review-plan.md 5.2 and 4.4.13).
// One bad item never fails the batch. The new state of a card is computed ONLY by applyRating(stateBefore, rating,
// clampedReviewedAt, profile time zone); the response is the server's card. A review with a known id changes nothing.
// The eslint rule no-restricted-imports bans the progress writers from every review-* file.
import { getProfile } from "@/db/queries/progress";
import { findReview, insertReview, lockCard, updateCard } from "@/db/queries/srs";
import { isDataError, withTransactionRetry } from "@/db/queries/tx";
import { resolveTimeZone } from "@/lib/progress/dates";
import { parseReviewBatch, toWire, type PostReviewsResponse, type ReviewInput, type ReviewResult } from "@/lib/srs/contract";
import { reconcileCards, repoContent, rowToCardState, snapshotContent, type CardContent } from "@/lib/srs/cards";
import { applyRating, fromStoredState, toStoredState } from "@/lib/srs/scheduler";
import type { HandlerDeps, HandlerResult } from "./attempts-handler";
import { clampTimestamp, timestampFloor } from "./clamp";

/** `content` is a test seam: where the words come from (default: the content files). */
export type ReviewDeps = HandlerDeps & { content?: CardContent; /** test seam: how often the whole request is retried after a deadlock (default: the helper's own) */ txRetries?: number };

type Work = { index: number; r: ReviewInput };

export async function handlePostReviews(body: unknown, { db, userId, now, content: source, txRetries }: ReviewDeps): Promise<HandlerResult<PostReviewsResponse>> {
  const parsed = parseReviewBatch(body);
  if (!parsed.ok) return { status: 400, body: { error: "invalid_body" } };
  const content = snapshotContent(source ?? repoContent); // the vocabulary is read once for the whole request

  const results = await withTransactionRetry(db, async (tx) => {
    const out: (ReviewResult | undefined)[] = new Array(parsed.items.length);
    const profile = await getProfile(tx, userId);
    const tz = resolveTimeZone(profile.timezone);
    const floor = timestampFloor(now, profile.startDate, tz);
    // the cards of every finished lesson exist before they are looked up; `expected` is the set of words that may be reviewed
    const { expected } = await reconcileCards(tx, userId, now, tz, { content });
    const taught = new Set(expected.map((w) => w.vocabId));

    const work: Work[] = [];
    parsed.items.forEach((item, index) => {
      if (!item.ok) out[index] = { id: item.id, status: "rejected", reason: "invalid" };
      else if (!content.getVocab(item.value.vocabId)) out[index] = { id: item.id, status: "rejected", reason: "unknown_word" };
      else if (!taught.has(item.value.vocabId)) out[index] = { id: item.id, status: "rejected", reason: "not_taught" };
      else work.push({ index, r: item.value });
    });

    // Cards are locked in (word, direction) order whatever the request order, so two batches can never wait on each other
    // in a cycle. Array.sort is stable: the reviews of ONE card keep their request order, which is their time order.
    // They are never sorted by id: that would apply them in the wrong order.
    const key = (w: Work) => `${w.r.vocabId}|${w.r.direction}`;
    const ordered = [...work].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));

    for (const { index, r } of ordered) {
      try {
        // a savepoint per item: a database error in one item rolls back only that item
        out[index] = await tx.transaction(async (sp): Promise<ReviewResult> => {
          const row = await lockCard(sp, userId, r.vocabId, r.direction);
          if (!row) return { id: r.id, status: "rejected", reason: "invalid" };
          const before = rowToCardState(row);
          // the client's clock is trusted only inside [floor, now]; time never goes back before the card's last review,
          // and a card cannot be reviewed before it existed
          let reviewedAt = clampTimestamp(r.reviewedAt, now, floor);
          if (before.lastReview && reviewedAt < before.lastReview) reviewedAt = before.lastReview;
          if (reviewedAt < row.createdAt) reviewedAt = row.createdAt;
          const after = applyRating(before, r.rating, reviewedAt, tz);

          const created = await insertReview(sp, userId, {
            id: r.id, vocabId: r.vocabId, direction: r.direction, rating: r.rating, reviewedAt, durationMs: r.durationMs ?? null,
            stateBefore: toStoredState(before), stateAfter: toStoredState(after), sessionId: r.sessionId,
          });
          if (created) {
            await updateCard(sp, userId, r.vocabId, r.direction, after, now);
            return { id: r.id, status: "created", card: toWire(after) };
          }
          // the id exists: report the card as that review left it, never reschedule
          const stored = await findReview(sp, userId, r.id);
          // the id belongs to another user, or this client reused it for a DIFFERENT card: never answer with another card's schedule
          if (!stored || stored.vocabId !== r.vocabId || stored.direction !== r.direction) return { id: r.id, status: "rejected", reason: "invalid" };
          try {
            return { id: r.id, status: "duplicate", card: toWire(fromStoredState(stored.stateAfter)) };
          } catch (err) {
            // an unreadable state_after must not fail the batch (a FIFO queue would resend it forever): answer with the card as it is now
            console.error(`[reviews] stored state_after of review ${r.id} cannot be read; answering with the current card:`, err);
            return { id: r.id, status: "duplicate", card: toWire(before) };
          }
        });
      } catch (err) {
        if (!isDataError(err)) throw err; // deadlock, connection loss...: the whole request is retried or fails
        console.error(`[reviews] item ${r.id} rejected by the database:`, err);
        out[index] = { id: r.id, status: "rejected", reason: "invalid" };
      }
    }
    return out as ReviewResult[];
  }, txRetries === undefined ? {} : { retries: txRetries });

  return { status: 200, body: { results } };
}
