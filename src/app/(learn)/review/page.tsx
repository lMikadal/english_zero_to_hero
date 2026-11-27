import { ReviewApp } from "@/components/review/ReviewApp";
import { DbErrorScreen } from "@/components/ui/DbErrorScreen";
import { getDb } from "@/db/client";
import { loadReviewQueue } from "@/lib/srs/cards";
import type { ReviewQueue } from "@/lib/srs/contract";
import { getCurrentUserId } from "@/lib/server/current-user";

// The queue depends on the learner and on the time: never cache.
export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  let queue: ReviewQueue;
  try {
    // The server's clock decides "today" for the whole session (in the learner's zone, inside loadReviewQueue).
    // eslint-disable-next-line no-restricted-syntax
    queue = await loadReviewQueue(getDb(), await getCurrentUserId(), new Date());
  } catch (e) {
    console.error("Cannot load the review queue:", e);
    return <DbErrorScreen retryHref="/review" />;
  }
  return <ReviewApp queue={queue} />;
}
