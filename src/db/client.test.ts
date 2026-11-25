// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

describe("db client", () => {
  const original = process.env.DATABASE_URL;
  afterEach(() => {
    if (original === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = original;
    vi.resetModules();
  });

  it("throws a clear error when DATABASE_URL is missing", async () => {
    delete process.env.DATABASE_URL;
    const { getDb } = await import("./client");
    expect(() => getDb()).toThrow(/DATABASE_URL/);
  });

  it("returns the same instance on repeated calls and across module reloads (hot reload)", async () => {
    process.env.DATABASE_URL = "postgres://u:p@localhost:1/none";
    const first = await import("./client");
    const a = first.getDb();
    expect(first.getDb()).toBe(a);
    vi.resetModules();
    const second = await import("./client");
    expect(second.getDb()).toBe(a);
    await second.closeDb();
  });
});
