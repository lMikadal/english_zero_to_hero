// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_BODY_BYTES, runJsonRoute } from "./route";

const req = (body: BodyInit, headers: Record<string, string> = { "content-type": "application/json" }) =>
  new Request("http://localhost/api/x", { method: "POST", body, headers });

const okHandler = vi.fn(async (body: unknown) => ({ status: 200 as const, body: { echo: body } }));
const deps = (over: Partial<Parameters<typeof runJsonRoute>[2]> = {}) => ({
  getUserId: vi.fn(async () => "local"),
  getDb: vi.fn(() => ({}) as never),
  now: () => new Date("2026-11-25T10:00:00Z"),
  ...over,
});
const spec = { validate: (b: unknown) => typeof b === "object" && b !== null && "ok" in b, handler: okHandler };

afterEach(() => {
  vi.restoreAllMocks();
  okHandler.mockClear();
});

describe("runJsonRoute", () => {
  it("passes a valid JSON body to the handler and returns its status with no-store", async () => {
    const d = deps();
    const res = await runJsonRoute(req('{"ok":1}'), spec, d);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ echo: { ok: 1 } });
    expect(okHandler).toHaveBeenCalledWith({ ok: 1 }, { db: expect.anything(), userId: "local", now: new Date("2026-11-25T10:00:00Z") });
  });

  it("accepts a charset parameter and upper case on the content type", async () => {
    expect((await runJsonRoute(req('{"ok":1}', { "content-type": "Application/JSON; charset=utf-8" }), spec, deps())).status).toBe(200);
  });

  it.each([undefined, "text/plain", "application/x-www-form-urlencoded", "multipart/form-data; boundary=x", "application/jsonp"])(
    "415 for content type %s, before reading the body or touching the database",
    async (ct) => {
      const d = deps();
      const res = await runJsonRoute(req('{"ok":1}', ct ? { "content-type": ct } : {}), spec, d);
      expect(res.status).toBe(415);
      expect(await res.json()).toEqual({ error: "unsupported_media_type" });
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(d.getUserId).not.toHaveBeenCalled();
    },
  );

  it("413 when Content-Length is over 1 MB", async () => {
    const d = deps();
    const res = await runJsonRoute(req("{}", { "content-type": "application/json", "content-length": String(MAX_BODY_BYTES + 1) }), spec, d);
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "payload_too_large" });
    expect(d.getUserId).not.toHaveBeenCalled();
  });

  it("413 while reading when the body is over 1 MB and Content-Length is missing or wrong", async () => {
    const big = JSON.stringify({ ok: "x".repeat(2 * 1024 * 1024) });
    const res = await runJsonRoute(req(big), spec, deps());
    expect(res.status).toBe(413);
    const lie = await runJsonRoute(req(big, { "content-type": "application/json", "content-length": "10" }), spec, deps());
    expect(lie.status).toBe(413);
  });

  it("400 for unparseable JSON", async () => {
    const res = await runJsonRoute(req("{nope"), spec, deps());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_json" });
  });

  it("400 for an invalid body without touching the database", async () => {
    const d = deps();
    const res = await runJsonRoute(req("{}"), spec, d);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_body" });
    expect(d.getUserId).not.toHaveBeenCalled();
    expect(d.getDb).not.toHaveBeenCalled();
  });

  it("500 { error: 'internal' } when the handler throws, and logs the real error", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await runJsonRoute(req('{"ok":1}'), { ...spec, handler: async () => { throw new Error("boom"); } }, deps());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "internal" });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(log).toHaveBeenCalled();
  });

  it("503 { error: 'database_unavailable' } when the database cannot be reached", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const down = Object.assign(new Error("Failed query"), { cause: Object.assign(new Error("connect"), { code: "ECONNREFUSED" }) });
    const res = await runJsonRoute(req('{"ok":1}'), spec, deps({ getUserId: async () => { throw down; } }));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "database_unavailable" });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("500 when the database dependency itself fails to be created", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await runJsonRoute(req('{"ok":1}'), spec, deps({ getDb: () => { throw new Error("DATABASE_URL is not set"); } }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "internal" });
  });
});
