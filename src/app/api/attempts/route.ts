import { handlePostAttempts } from "@/lib/server/attempts-handler";
import { runJsonRoute } from "@/lib/server/route";

export const dynamic = "force-dynamic";

export const POST = (req: Request) => runJsonRoute(req, handlePostAttempts);
