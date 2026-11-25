import { completeLessonRequestSchema } from "@/lib/attempts/contract";
import { handleCompleteLesson } from "@/lib/server/complete-handler";
import { runJsonRoute } from "@/lib/server/route";

export const dynamic = "force-dynamic";

export const POST = (req: Request) =>
  runJsonRoute(req, { validate: (b) => completeLessonRequestSchema.safeParse(b).success, handler: handleCompleteLesson });
