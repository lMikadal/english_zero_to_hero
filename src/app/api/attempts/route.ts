import { parseAttemptBatch } from "@/lib/attempts/contract";
import { handlePostAttempts } from "@/lib/server/attempts-handler";
import { runJsonRoute } from "@/lib/server/route";

export const dynamic = "force-dynamic";

export const POST = (req: Request) => runJsonRoute(req, { validate: (b) => parseAttemptBatch(b).ok, handler: handlePostAttempts });
