// POST /api/reviews/complete: ends a review session (docs/plans/vocab-review-plan.md 2.4 and 5.2). Writes nothing of
// progress / profiles / attempts; the only writes are the streak (activity_days + streaks, source `review`).
// The eslint rule no-restricted-imports bans the progress writers from every review-* file.
import { getProfile, getStreak, touchStreak } from "@/db/queries/progress";
import { listDoneDays } from "@/db/queries/practice";
import { countDueAt, countSessionDueReviews, sessionReviewSpan } from "@/db/queries/srs";
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
  const { sessionId, startedAt } = parsed.data; // completedAt is validated but not used
  const content = snapshotContent(source ?? repoContent);

  const response = await withTransactionRetry(db, async (tx): Promise<CompleteReviewResponse> => {
    const profile = await getProfile(tx, userId);
    const tz = resolveTimeZone(profile.timezone);
    // The session is anchored to its own STORED reviews, not to the client's clock: its instant is the time of its first
    // review (the server clamped it into [floor, now]). A startedAt cannot move the day back or hide cards that existed
    // when the session began. With no review the clamped startedAt is only used to fill in the response.
    const span = await sessionReviewSpan(tx, userId, sessionId);
    const instant = span.first ?? clampTimestamp(startedAt, now, timestampFloor(now, profile.startDate, tz));
    const sessionDate = localDate(instant, tz);
    const end = localMidnight(addDays(sessionDate, 1), tz);

    // "Done" = every card (BOTH directions) of the finished lessons' words that was due that day and existed when the session began,
    // reviewed; and at least one review of the session was on a card that really was due (a lone early answer never counts)
    const done = await listDoneDays(tx, userId);
    const words = expectedCardVocabIds(done.map((d) => d.day), content).map((w) => w.vocabId);
    const remainingDue = await countDueAt(tx, userId, end, instant, words, REVIEW_DIRECTIONS);
    const reviewedDue = span.count > 0 ? await countSessionDueReviews(tx, userId, sessionId, end) : 0;
    const reviewed = span.count;

    const counted = reviewedDue >= 1 && remainingDue === 0;
    const streak = counted ? await touchStreak(tx, userId, sessionDate, "review") : await getStreak(tx, userId);
    return { sessionDate, reviewed, remainingDue, streak, countedForStreak: counted };
  });

  return { status: 200, body: response };
}
