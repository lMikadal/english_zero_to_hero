// Shared body of the thin route handlers: parse JSON -> handler -> JSON. All logic lives in the handlers.
import { getDb } from "@/db/client";
import type { Db } from "@/db/types";
import { getCurrentUserId } from "./current-user";
import type { HandlerResult } from "./attempts-handler";

export async function runJsonRoute<T>(
  req: Request,
  handler: (body: unknown, deps: { db: Db; userId: string; now: Date }) => Promise<HandlerResult<T>>,
): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const userId = await getCurrentUserId();
  const result = await handler(body, { db: getDb(), userId, now: new Date() });
  return Response.json(result.body, { status: result.status });
}
