// POST /api/reviews/complete: ends a review session (docs/plans/vocab-review-plan.md 2.4 and 5.2). Writes nothing of
// progress / profiles / attempts; the only writes are the streak (activity_days + streaks, source `review`).
// The eslint rule no-restricted-imports bans the progress writers from every review-* file.
import { getProfile, getStreak, touchStreak } from "@/db/queries/progress";
import { listDoneDays } from "@/db/queries/practice";
import { countDueAt, countSessionReviews } from "@/db/queries/srs";
import { withTransactionRetry } from "@/db/queries/tx";
import { addDays, localDate, localMidnight, resolveTimeZone } from "@/lib/progress/dates";
import { completeReviewRequestSchema, REVIEW_DIRECTIONS, type CompleteReviewResponse } from "@/lib/srs/contract";
import { expectedCardVocabIds, repoContent, snapshotContent } from "@/lib/srs/cards";
import type { HandlerResult } from "./attempts-handler";
import { clampTimestamp, timestampFloor } from "./clamp";
import type { ReviewDeps } from "./review-handler";

export async function handleCompleteReview(body: unknown, { db, userId, now, content: source }: ReviewDeps): Promise<HandlerResult<CompleteReviewResponse>> {
  const parsed = completeReviewRequestSchema.safeParse(body);
  if (!parsed.success) return { status: 400, body: { error: "invalid_body" } };
  const { sessionId, startedAt } = parsed.data;
  const content = snapshotContent(source ?? repoContent);

  const response = await withTransactionRetry(db, async (tx): Promise<CompleteReviewResponse> => {
    const profile = await getProfile(tx, userId);
    const tz = resolveTimeZone(profile.timezone);
    // The session's day is the day it STARTED, and a client clock cannot reach back further than the clamp allows
    // (30 days, never before the profile's start date), like every other client timestamp.
    const started = clampTimestamp(startedAt, now, timestampFloor(now, profile.startDate, tz));
    const sessionDate = localDate(started, tz);
    const end = localMidnight(addDays(sessionDate, 1), tz);

    // "Done" = every card (BOTH directions) of the finished lessons' words that was due that day and existed when the session began
    const done = await listDoneDays(tx, userId);
    const words = expectedCardVocabIds(done.map((d) => d.day), content).map((w) => w.vocabId);
    const reviewed = await countSessionReviews(tx, userId, sessionId);
    const remainingDue = await countDueAt(tx, userId, end, started, words, REVIEW_DIRECTIONS);

    const counted = reviewed >= 1 && remainingDue === 0;
    const streak = counted ? await touchStreak(tx, userId, sessionDate, "review") : await getStreak(tx, userId);
    return { sessionDate, reviewed, remainingDue, streak, countedForStreak: counted };
  });

  return { status: 200, body: response };
}
