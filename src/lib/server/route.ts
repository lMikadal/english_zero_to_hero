// Shared body of the thin route handlers: check -> read -> parse -> validate -> handler -> JSON. All logic lives in the
// handlers. Nothing that fails reaches the client as an empty response: errors become JSON, and the request is
// validated BEFORE the database is touched, so a bad body is a 400 even when Postgres is down.
import { getDb } from "@/db/client";
import { isUnreachable } from "@/db/queries/tx";
import type { Db } from "@/db/types";
import { getCurrentUserId } from "./current-user";
import type { HandlerResult } from "./attempts-handler";

export const MAX_BODY_BYTES = 1024 * 1024;

export type RouteSpec<T> = {
  /** Cheap, database-free check of the parsed body; false answers 400 without touching the database. */
  validate: (body: unknown) => boolean;
  handler: (body: unknown, deps: { db: Db; userId: string; now: Date }) => Promise<HandlerResult<T>>;
};
export type RouteDeps = { getUserId: () => Promise<string>; getDb: () => Db; now: () => Date };
const defaultDeps: RouteDeps = { getUserId: getCurrentUserId, getDb, now: () => new Date() };

const json = (body: unknown, status: number) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** Reads the body as text, giving up as soon as it passes the cap (Content-Length can be missing or wrong). */
async function readCapped(req: Request): Promise<string | null> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return null;
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function runJsonRoute<T>(req: Request, spec: RouteSpec<T>, deps: RouteDeps = defaultDeps): Promise<Response> {
  try {
    const type = (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (type !== "application/json") return json({ error: "unsupported_media_type" }, 415);
    const text = await readCapped(req);
    if (text === null) return json({ error: "payload_too_large" }, 413);
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return json({ error: "invalid_json" }, 400);
    }
    if (!spec.validate(body)) return json({ error: "invalid_body" }, 400);

    const userId = await deps.getUserId();
    const result = await spec.handler(body, { db: deps.getDb(), userId, now: deps.now() });
    return json(result.body, result.status);
  } catch (err) {
    console.error("[api] request failed:", err);
    return isUnreachable(err) ? json({ error: "database_unavailable" }, 503) : json({ error: "internal" }, 500);
  }
}
