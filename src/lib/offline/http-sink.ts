// In-memory HTTP implementation of SyncSink (docs/ARCHITECTURE.md section 5.1, "offline queue rules").
// IndexedDB persistence is added later behind the same interface.
//
// Scheduling: one request in flight at a time. Entries are strictly first in, first out. A pass takes the
// attempts at the head of the queue (up to 50, never past a completion) and sends them as one batch; a completion
// at the head is posted on its own. A pass keeps going while requests succeed and stops on the first failure,
// which schedules a retry with exponential backoff (also retried at once on the `online` event).
import {
  API,
  type AttemptInput,
  type CompleteLessonRequest,
  type CompleteLessonResponse,
} from "@/lib/attempts/contract";
import type { CompleteResult, SyncSink } from "./sink";

/** The part of `Response` the sink reads, so tests can fake it. */
type FetchResponse = { status: number; json(): Promise<unknown> };
export type SinkFetch = (url: string, init: { method: "POST"; headers: Record<string, string>; body: string }) => Promise<FetchResponse>;
type Timers = { setTimeout(fn: () => void, ms: number): unknown; clearTimeout(handle: unknown): void };

export type HttpSinkOptions = {
  fetch?: SinkFetch;
  timers?: Timers;
  /** Where the `online` event is heard; defaults to `window` when it exists. */
  eventTarget?: Pick<EventTarget, "addEventListener"> | null;
  baseDelayMs?: number;
  maxDelayMs?: number;
  maxBatch?: number;
};

type Entry =
  | { kind: "attempt"; item: AttemptInput }
  | { kind: "complete"; req: CompleteLessonRequest; settle: (r: CompleteResult) => void };

const DROP_STATUSES = new Set(["created", "duplicate", "rejected"]);

export function createHttpSink(options: HttpSinkOptions = {}): SyncSink {
  const doFetch: SinkFetch = options.fetch ?? ((url, init) => globalThis.fetch(url, init));
  const timers: Timers = options.timers ?? {
    setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
    clearTimeout: (h) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>),
  };
  const baseDelay = options.baseDelayMs ?? 1000;
  const maxDelay = options.maxDelayMs ?? 30_000;
  const maxBatch = Math.min(options.maxBatch ?? 50, 50);

  const queue: Entry[] = [];
  const listeners = new Set<() => void>();
  let running = false;
  let failures = 0;
  let timer: unknown = null;

  const notify = () => {
    for (const cb of [...listeners]) {
      try {
        cb();
      } catch (e) {
        console.error("sync sink subscriber threw", e);
      }
    }
  };

  const post = (url: string, body: unknown) =>
    doFetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  const clearTimer = () => {
    if (timer !== null) timers.clearTimeout(timer);
    timer = null;
  };

  const scheduleRetry = () => {
    failures += 1;
    clearTimer();
    const delay = Math.min(maxDelay, baseDelay * 2 ** (failures - 1));
    timer = timers.setTimeout(() => {
      timer = null;
      void flush();
    }, delay);
  };

  /** Removes the first `n` entries (they were sent from the head). */
  const dropHead = (n: number) => {
    queue.splice(0, n);
    notify();
  };

  /** One request for the head of the queue. Returns true when the pass may continue. */
  async function step(): Promise<boolean> {
    const head = queue[0];
    if (head.kind === "complete") {
      const res = await post(API.completeLesson, head.req);
      if (res.status === 200) {
        const response = (await res.json()) as CompleteLessonResponse;
        dropHead(1);
        head.settle({ status: "done", response });
        return true;
      }
      if (res.status === 400 || res.status === 409) {
        dropHead(1);
        head.settle({ status: "rejected", code: res.status });
        return true;
      }
      return false; // 5xx and anything unexpected: keep and retry
    }

    const batch: AttemptInput[] = [];
    for (const e of queue) {
      if (e.kind !== "attempt" || batch.length >= maxBatch) break;
      batch.push(e.item);
    }
    const res = await post(API.attempts, { attempts: batch });
    if (res.status === 400) {
      console.error("POST /api/attempts answered 400 (bad envelope); dropping the batch", batch.map((a) => a.id));
      dropHead(batch.length);
      return true;
    }
    if (res.status !== 200) return false;
    const body = (await res.json()) as { results?: { status?: string }[] };
    const results = Array.isArray(body?.results) ? body.results : [];
    // one result per attempt, in order; an item without a readable answer stays queued
    const dropIdx = new Set<number>();
    batch.forEach((_, i) => {
      if (DROP_STATUSES.has(String(results[i]?.status))) dropIdx.add(i);
    });
    // batch items are the first batch.length entries; remove the answered ones, keep order of the rest
    const rest = queue.splice(0, batch.length).filter((_, i) => !dropIdx.has(i));
    queue.unshift(...rest);
    notify();
    return dropIdx.size === batch.length;
  }

  async function flush(): Promise<void> {
    if (running) return;
    running = true;
    try {
      while (queue.length > 0) {
        let ok = false;
        try {
          ok = await step();
        } catch {
          ok = false; // network error, unreadable body
        }
        if (!ok) {
          scheduleRetry();
          break;
        }
        failures = 0;
      }
    } finally {
      running = false;
      // a completion that was not sent in this pass is queued; its caller stops waiting
      for (const e of queue) if (e.kind === "complete") e.settle({ status: "queued" });
    }
  }

  const start = () => void Promise.resolve().then(() => (timer === null ? flush() : undefined));

  const target = options.eventTarget === undefined ? (typeof window !== "undefined" ? window : null) : options.eventTarget;
  target?.addEventListener("online", () => {
    clearTimer();
    void flush();
  });

  return {
    sendAttempt(a) {
      try {
        if (queue.some((e) => e.kind === "attempt" && e.item.id === a.id)) return;
        queue.push({ kind: "attempt", item: a });
        notify();
        start();
      } catch (e) {
        console.error("sendAttempt failed", e);
      }
    },
    completeLesson(c) {
      return new Promise<CompleteResult>((resolve) => {
        queue.push({ kind: "complete", req: c, settle: resolve });
        notify();
        // one flush attempt now, even if a backoff timer is waiting
        void Promise.resolve().then(() => {
          clearTimer();
          return flush();
        });
      });
    },
    pendingCount: () => queue.length,
    subscribe(cb) {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },
  };
}
