import { completePracticeRequestSchema } from "@/lib/attempts/contract";
import { handleCompletePractice } from "@/lib/server/practice-complete-handler";
import { runJsonRoute } from "@/lib/server/route";

export const dynamic = "force-dynamic";

export const POST = (req: Request) =>
  runJsonRoute(req, { validate: (b) => completePracticeRequestSchema.safeParse(b).success, handler: handleCompletePractice });
