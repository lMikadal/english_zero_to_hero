// @vitest-environment node
import { describe, expect, it } from "vitest";
import { POST as postAttempts } from "./attempts/route";
import { POST as postCheckpoint } from "./checkpoints/complete/route";
import { POST as postComplete } from "./lessons/complete/route";
import { POST as postPractice } from "./practice/complete/route";
import { POST as postReviews } from "./reviews/route";
import { POST as postReviewComplete } from "./reviews/complete/route";

const post = (url: string, body: string, headers: Record<string, string> = { "content-type": "application/json" }) =>
  new Request(`http://localhost${url}`, { method: "POST", body, headers });

describe("route handlers answer without touching the database", () => {
  const routes = [[postAttempts, "/api/attempts"], [postComplete, "/api/lessons/complete"], [postPractice, "/api/practice/complete"], [postCheckpoint, "/api/checkpoints/complete"], [postReviews, "/api/reviews"], [postReviewComplete, "/api/reviews/complete"]] as const;
  it("400 for unparseable JSON", async () => {
    for (const [route, url] of routes) {
      const res = await route(post(url, "{not json"));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "invalid_json" });
    }
  });
  it("400 for a body that fails validation (no database is reachable in this test)", async () => {
    for (const [route, url] of routes) expect((await route(post(url, "{}"))).status).toBe(400);
    expect((await postAttempts(post("/api/attempts", '{"attempts":[]}'))).status).toBe(400);
    expect((await postReviews(post("/api/reviews", '{"reviews":[]}'))).status).toBe(400);
  });
  it("415 for a non-JSON content type", async () => {
    for (const [route, url] of routes) expect((await route(post(url, "{}", { "content-type": "text/plain" }))).status).toBe(415);
  });
  it("the checkpoint completion rejects a day that is not a checkpoint day and a body over the size cap, before the database", async () => {
    const ok = { afterDay: 30, sessionId: "7b0f6f4e-5c1b-4f55-9a43-0d1c2e3f4a5b", completedAt: "2026-11-28T10:00:00.000Z" };
    expect((await postCheckpoint(post("/api/checkpoints/complete", JSON.stringify({ ...ok, afterDay: 45 })))).status).toBe(400);
    expect((await postCheckpoint(post("/api/checkpoints/complete", JSON.stringify({ ...ok, extra: 1 })))).status).toBe(400);
    const big = await postCheckpoint(post("/api/checkpoints/complete", JSON.stringify({ ...ok, pad: "x".repeat(1024 * 1024 + 1) })));
    expect(big.status).toBe(413);
  });
});
