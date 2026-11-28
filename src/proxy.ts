// The one place that decides who may use the app. It exports no route filter, so it runs for every request
// (pages, API routes, _next assets, public files), so a new route cannot forget it. See docs/ARCHITECTURE.md.
import { NextResponse, type NextRequest } from "next/server";
import { checkAccess, createDenyLogger, forbiddenHtml } from "@/lib/access/guard";

const logDenied = createDenyLogger({ write: (line) => console.warn(line), now: Date.now, windowMs: 60_000, maxPerWindow: 20, maxKeys: 500 });

export function proxy(request: NextRequest): NextResponse {
  const decision = checkAccess(request.headers, process.env);
  if (decision.allowed) return NextResponse.next();
  logDenied(decision.ip, request.nextUrl.pathname);
  return new NextResponse(forbiddenHtml(decision.ip), {
    status: 403,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}
