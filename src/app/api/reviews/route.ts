import { handlePostReviews } from "@/lib/server/review-handler";
import { runJsonRoute } from "@/lib/server/route";
import { parseReviewBatch } from "@/lib/srs/contract";

export const dynamic = "force-dynamic";

export const POST = (req: Request) => runJsonRoute(req, { validate: (b) => parseReviewBatch(b).ok, handler: handlePostReviews });
