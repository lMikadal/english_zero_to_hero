// Transaction helpers: retry on deadlock / serialization failure, and SQLSTATE classification that looks through
// Drizzle's wrapper errors (the driver error is on `.cause`).
import type { Db, Tx } from "../types";

function codes(err: unknown): string[] {
  const out: string[] = [];
  for (let e = err as { code?: unknown; cause?: unknown } | undefined, i = 0; e && typeof e === "object" && i < 5; e = e.cause as typeof e, i++) {
    if (typeof e.code === "string") out.push(e.code);
  }
  return out;
}

/** Deadlock detected (40P01) or serialization failure (40001): the whole transaction is safe to run again. */
export const isTransient = (err: unknown) => codes(err).some((c) => c === "40P01" || c === "40001");
/** A problem with the data of one request: class 22 (data exception) or 23 (integrity constraint violation). */
export const isDataError = (err: unknown) => codes(err).some((c) => /^2[23]/.test(c));
/** The database cannot be reached (down, restarting, DNS or connect timeout). */
export const isUnreachable = (err: unknown) =>
  codes(err).some((c) => /^(08|57P0)/.test(c) || ["ECONNREFUSED", "ECONNRESET", "ENOTFOUND", "EAI_AGAIN", "ETIMEDOUT", "CONNECT_TIMEOUT", "CONNECTION_CLOSED", "CONNECTION_DESTROYED", "CONNECTION_ENDED"].includes(c));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Runs `fn` in a transaction, running it again (up to `retries` times) when Postgres reports a deadlock. `fn` must be re-runnable. */
export async function withTransactionRetry<T>(db: Db, fn: (tx: Tx) => Promise<T>, opts: { retries?: number; delayMs?: number } = {}): Promise<T> {
  const retries = opts.retries ?? 4;
  const delayMs = opts.delayMs ?? 25;
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.transaction(fn);
    } catch (err) {
      if (attempt >= retries || !isTransient(err)) throw err;
      await sleep(delayMs * (attempt + 1) + Math.random() * delayMs);
    }
  }
}
