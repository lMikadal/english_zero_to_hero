import { completeCheckpointRequestSchema } from "@/lib/attempts/contract";
import { handleCompleteCheckpoint } from "@/lib/server/checkpoint-complete-handler";
import { runJsonRoute } from "@/lib/server/route";

export const dynamic = "force-dynamic";

export const POST = (req: Request) =>
  runJsonRoute(req, { validate: (b) => completeCheckpointRequestSchema.safeParse(b).success, handler: handleCompleteCheckpoint });
