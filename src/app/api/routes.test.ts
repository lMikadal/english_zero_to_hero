// @vitest-environment node
import { describe, expect, it } from "vitest";
import { POST as postAttempts } from "./attempts/route";
import { POST as postComplete } from "./lessons/complete/route";

const bad = (url: string) => new Request(`http://localhost${url}`, { method: "POST", body: "{not json", headers: { "content-type": "application/json" } });

describe("route handlers", () => {
  it("answer 400 for unparseable JSON before touching the database", async () => {
    for (const [route, url] of [[postAttempts, "/api/attempts"], [postComplete, "/api/lessons/complete"]] as const) {
      const res = await route(bad(url));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "invalid_json" });
    }
  });
});
