// @vitest-environment node
import { describe, expect, it } from "vitest";
import { POST as postAttempts } from "./attempts/route";
import { POST as postComplete } from "./lessons/complete/route";
import { POST as postPractice } from "./practice/complete/route";
import { POST as postReviews } from "./reviews/route";
import { POST as postReviewComplete } from "./reviews/complete/route";

const post = (url: string, body: string, headers: Record<string, string> = { "content-type": "application/json" }) =>
  new Request(`http://localhost${url}`, { method: "POST", body, headers });

describe("route handlers answer without touching the database", () => {
  const routes = [[postAttempts, "/api/attempts"], [postComplete, "/api/lessons/complete"], [postPractice, "/api/practice/complete"], [postReviews, "/api/reviews"], [postReviewComplete, "/api/reviews/complete"]] as const;
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
});
