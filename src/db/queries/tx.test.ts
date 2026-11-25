import { describe, expect, it, vi } from "vitest";
import { isDataError, isTransient, isUnreachable, withTransactionRetry } from "./tx";

const pgError = (code: string) => Object.assign(new Error("pg"), { code });
const wrapped = (code: string) => Object.assign(new Error("Failed query"), { cause: pgError(code) });

function fakeDb(failures: unknown[]) {
  const calls = { n: 0 };
  const db = {
    transaction: vi.fn(async (fn: (tx: string) => Promise<unknown>) => {
      calls.n++;
      const f = failures.shift();
      if (f) throw f;
      return fn("tx");
    }),
  };
  return { db, calls };
}

describe("withTransactionRetry", () => {
  it("retries deadlocks and serialization failures, then succeeds", async () => {
    const { db, calls } = fakeDb([wrapped("40P01"), pgError("40001")]);
    const r = await withTransactionRetry(db as never, async (tx) => `ok:${tx}`, { delayMs: 0 });
    expect(r).toBe("ok:tx");
    expect(calls.n).toBe(3);
  });
  it("gives up after the retry budget and rethrows the last error", async () => {
    const { db, calls } = fakeDb(Array.from({ length: 10 }, () => wrapped("40P01")));
    await expect(withTransactionRetry(db as never, async () => 1, { retries: 3, delayMs: 0 })).rejects.toThrow("Failed query");
    expect(calls.n).toBe(4);
  });
  it("does not retry other errors", async () => {
    const { db, calls } = fakeDb([wrapped("23505")]);
    await expect(withTransactionRetry(db as never, async () => 1, { delayMs: 0 })).rejects.toThrow();
    expect(calls.n).toBe(1);
  });
});

describe("error classification", () => {
  it("finds the SQLSTATE through Drizzle's cause chain", () => {
    expect(isTransient(wrapped("40P01"))).toBe(true);
    expect(isTransient(wrapped("23505"))).toBe(false);
    expect(isDataError(wrapped("22P05"))).toBe(true);
    expect(isDataError(wrapped("23514"))).toBe(true);
    expect(isDataError(wrapped("40P01"))).toBe(false);
    expect(isDataError(new Error("boom"))).toBe(false);
  });
  it("recognises an unreachable database", () => {
    for (const code of ["ECONNREFUSED", "ENOTFOUND", "CONNECT_TIMEOUT", "CONNECTION_CLOSED", "CONNECTION_DESTROYED", "57P01", "08006", "ETIMEDOUT", "EAI_AGAIN"]) {
      expect(isUnreachable(wrapped(code))).toBe(true);
    }
    expect(isUnreachable(wrapped("23505"))).toBe(false);
    expect(isUnreachable(new Error("x"))).toBe(false);
  });
});
