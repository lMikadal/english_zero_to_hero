import { handleCompleteReview } from "@/lib/server/review-complete-handler";
import { runJsonRoute } from "@/lib/server/route";
import { completeReviewRequestSchema } from "@/lib/srs/contract";

export const dynamic = "force-dynamic";

export const POST = (req: Request) =>
  runJsonRoute(req, { validate: (b) => completeReviewRequestSchema.safeParse(b).success, handler: handleCompleteReview });
