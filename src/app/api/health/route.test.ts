// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/health", () => {
  it("answers { ok: true } with 200", async () => {
    const res = GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("never touches the database or the learner (health checks run every few seconds)", () => {
    const code = fs.readFileSync(path.join(import.meta.dirname, "route.ts"), "utf8");
    expect(code).not.toMatch(/@\/db|current-user|getDb|@\/lib\/server/);
  });
});
