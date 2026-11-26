// In-memory HTTP implementation of SyncSink (docs/ARCHITECTURE.md section 5.1, "offline queue rules").
// IndexedDB persistence is added later behind the same interface.
//
// Scheduling: one request in flight at a time, each with a timeout. Entries are strictly first in, first out.
// A pass takes the attempts at the head of the queue (up to the batch size, 50 at most, never past a completion)
// and sends them as one batch; a completion at the head is posted on its own. A pass keeps going while requests
// succeed and stops on the first failure.
//
// How answers are handled (attempts / completion):
// - retry with exponential backoff: network error, timeout, 408, 429 (Retry-After seconds, capped), 5xx, a 200 whose
//   body is unusable (not JSON, results that do not line up with the batch);
// - 401 / 403: keep everything and pause (no timer) until an `online` event or a new enqueue;
// - 413 on attempts: halve the batch; a single item that is still too large is dropped and logged;
// - other 4xx on attempts: drop the batch and log; on a completion: settle `rejected` (409 stays 409, others 400).
import {
  API,
  type AttemptInput,
  type CompleteLessonRequest,
  type CompleteLessonResponse,
  type CompletePracticeRequest,
  type CompletePracticeResponse,
} from "@/lib/attempts/contract";
import type { CompleteResult, SyncSink } from "./sink";

/** The part of `Response` the sink reads, so tests can fake it. */
type FetchResponse = { status: number; json(): Promise<unknown>; headers?: { get(name: string): string | null } };
export type SinkFetch = (
  url: string,
  init: { method: "POST"; headers: Record<string, string>; body: string; signal?: AbortSignal },
) => Promise<FetchResponse>;
type Timers = { setTimeout(fn: () => void, ms: number): unknown; clearTimeout(handle: unknown): void };

export type HttpSinkOptions = {
  fetch?: SinkFetch;
  timers?: Timers;
  /** Where the `online` event is heard; defaults to `window` when it exists. */
  eventTarget?: Pick<EventTarget, "addEventListener" | "removeEventListener"> | null;
  baseDelayMs?: number;
  maxDelayMs?: number;
  maxBatch?: number;
  /** A request that has not answered after this long is aborted and treated as a network error. Default 15 s. */
  requestTimeoutMs?: number;
};

export type SinkStatus = "idle" | "sending" | "retrying" | "paused";
export type SinkState = { pending: number; pendingAttempts: number; status: SinkStatus };

/** A SyncSink plus what a UI needs to show the wait ("กำลังรอสัญญาณ"). Not part of the SyncSink interface. */
export type HttpSink = SyncSink & {
  getState(): SinkState;
  /** Removes the `online` listener and clears timers. */
  dispose(): void;
};

// A completion entry carries its own endpoint and response check, so lesson and practice share the queue rules.
// `key` dedups inside the queue (the endpoint plus day and session).
type CompleteEntry = {
  kind: "complete";
  url: string;
  key: string;
  req: CompleteLessonRequest | CompletePracticeRequest;
  isResponse: (v: unknown) => boolean;
  settle: (r: CompleteResult<never>) => void;
  promise: Promise<CompleteResult<never>>;
};
type Entry = { kind: "attempt"; item: AttemptInput } | CompleteEntry;

type Outcome = { next: "continue" } | { next: "retry"; afterMs?: number } | { next: "pause" };

const DROP_STATUSES = new Set(["created", "duplicate", "rejected"]);
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const isCompleteResponse = (v: unknown): v is CompleteLessonResponse =>
  isObject(v) && isObject(v.progress) && isObject(v.streak) && typeof v.currentDay === "number";
const isPracticeResponse = (v: unknown): v is CompletePracticeResponse =>
  isObject(v) && isObject(v.session) && isObject(v.streak) && typeof v.countedForStreak === "boolean" && !("progress" in v);

export function createHttpSink(options: HttpSinkOptions = {}): HttpSink {
  const doFetch: SinkFetch = options.fetch ?? ((url, init) => globalThis.fetch(url, init));
  const timers: Timers = options.timers ?? {
    setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
    clearTimeout: (h) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>),
  };
  const baseDelay = options.baseDelayMs ?? 1000;
  const maxDelay = options.maxDelayMs ?? 30_000;
  const requestTimeout = options.requestTimeoutMs ?? 15_000;
  const configuredBatch = Math.max(1, Math.min(options.maxBatch ?? 50, 50));

  const queue: Entry[] = [];
  const listeners = new Set<() => void>();
  let batchSize = configuredBatch;
  let running = false;
  let paused = false;
  let disposed = false;
  let failures = 0;
  let timer: unknown = null;
  let loggedMismatch = false;
  let lastStatus: SinkStatus = "idle";

  const status = (): SinkStatus => (running ? "sending" : paused ? "paused" : timer !== null ? "retrying" : "idle");

  const notify = () => {
    lastStatus = status();
    for (const cb of [...listeners]) {
      try {
        cb();
      } catch (e) {
        console.error("sync sink subscriber threw", e);
      }
    }
  };
  /** Notifies when only the status changed. */
  const touch = () => {
    if (status() !== lastStatus) notify();
  };

  async function request(url: string, body: unknown): Promise<FetchResponse> {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    let handle: unknown;
    const timeout = new Promise<never>((_, reject) => {
      handle = timers.setTimeout(() => {
        controller?.abort();
        reject(new Error("request timed out"));
      }, requestTimeout);
    });
    try {
      return await Promise.race([
        doFetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: controller?.signal }),
        timeout,
      ]);
    } finally {
      timers.clearTimeout(handle);
    }
  }

  const clearTimer = () => {
    if (timer !== null) timers.clearTimeout(timer);
    timer = null;
  };

  const scheduleRetry = (afterMs?: number) => {
    if (disposed) return;
    failures += 1;
    clearTimer();
    const delay = afterMs ?? Math.min(maxDelay, baseDelay * 2 ** (failures - 1));
    timer = timers.setTimeout(() => {
      timer = null;
      void flush();
    }, delay);
  };

  const retryAfterMs = (res: FetchResponse): number | undefined => {
    const v = res.headers?.get("retry-after");
    const seconds = v == null ? NaN : Number(v);
    return Number.isFinite(seconds) && seconds >= 0 ? Math.min(maxDelay, seconds * 1000) : undefined;
  };

  const dropHead = (n: number) => {
    queue.splice(0, n);
    notify();
  };

  /** One request for the head of the queue. */
  async function step(): Promise<Outcome> {
    const head = queue[0];
    if (head.kind === "complete") {
      const res = await request(head.url, head.req);
      if (res.status === 200) {
        const response = await res.json();
        if (!head.isResponse(response)) return { next: "retry" };
        dropHead(1);
        head.settle({ status: "done", response: response as never });
        return { next: "continue" };
      }
      if (res.status === 401 || res.status === 403) return { next: "pause" };
      if (res.status === 408 || res.status === 429 || res.status >= 500) return { next: "retry", afterMs: retryAfterMs(res) };
      if (res.status >= 400 && res.status < 500) {
        dropHead(1);
        head.settle({ status: "rejected", code: res.status === 409 ? 409 : 400 });
        return { next: "continue" };
      }
      return { next: "retry" };
    }

    const batch: AttemptInput[] = [];
    for (const e of queue) {
      if (e.kind !== "attempt" || batch.length >= batchSize) break;
      batch.push(e.item);
    }
    const res = await request(API.attempts, { attempts: batch });

    if (res.status === 200) {
      const body = await res.json();
      const results = isObject(body) ? body.results : undefined;
      const aligned =
        Array.isArray(results) &&
        results.length === batch.length &&
        results.every((r, i) => isObject(r) && (r.id == null || r.id === batch[i].id));
      if (!aligned) {
        if (!loggedMismatch) {
          loggedMismatch = true;
          console.error("POST /api/attempts answered 200 but the results do not match the batch; keeping all items");
        }
        return { next: "retry" };
      }
      const answered = (results as { status?: unknown }[]).map((r) => DROP_STATUSES.has(String(r.status)));
      const kept = queue.splice(0, batch.length).filter((_, i) => !answered[i]);
      queue.unshift(...kept);
      notify();
      return kept.length === 0 ? { next: "continue" } : { next: "retry" };
    }
    if (res.status === 401 || res.status === 403) return { next: "pause" };
    if (res.status === 413) {
      if (batch.length > 1) {
        batchSize = Math.max(1, Math.floor(batch.length / 2));
        return { next: "continue" };
      }
      console.error("POST /api/attempts answered 413 for a single attempt; dropping it", batch[0].id);
      dropHead(1);
      return { next: "continue" };
    }
    if (res.status === 408 || res.status === 429 || res.status >= 500) return { next: "retry", afterMs: retryAfterMs(res) };
    if (res.status >= 400 && res.status < 500) {
      console.error(`POST /api/attempts answered ${res.status}; dropping the batch`, batch.map((a) => a.id));
      dropHead(batch.length);
      return { next: "continue" };
    }
    return { next: "retry" };
  }

  async function flush(): Promise<void> {
    if (running || disposed) return;
    running = true;
    touch();
    try {
      while (queue.length > 0 && !disposed) {
        let outcome: Outcome;
        try {
          outcome = await step();
        } catch {
          outcome = { next: "retry" }; // network error, timeout, unreadable body
        }
        if (outcome.next === "continue") {
          failures = 0;
          continue;
        }
        if (outcome.next === "pause") paused = true;
        else scheduleRetry(outcome.afterMs);
        break;
      }
    } finally {
      running = false;
      // a completion that was not sent in this pass is queued; its caller stops waiting
      for (const e of queue) if (e.kind === "complete") e.settle({ status: "queued" });
      touch();
    }
  }

  const resume = () => {
    paused = false;
  };
  const start = () => void Promise.resolve().then(() => (timer === null && !paused ? flush() : undefined));

  const onOnline = () => {
    resume();
    clearTimer();
    void flush();
  };
  const target = options.eventTarget === undefined ? (typeof window !== "undefined" ? window : null) : options.eventTarget;
  target?.addEventListener("online", onOnline);

  function enqueueComplete(
    url: string,
    key: string,
    req: CompleteLessonRequest | CompletePracticeRequest,
    isResponse: (v: unknown) => boolean,
  ): Promise<CompleteResult<never>> {
    const existing = queue.find((e): e is CompleteEntry => e.kind === "complete" && e.key === key);
    if (existing) return existing.promise;
    let settle!: (r: CompleteResult<never>) => void;
    const promise = new Promise<CompleteResult<never>>((resolve) => {
      settle = resolve;
    });
    resume();
    queue.push({ kind: "complete", url, key, req, isResponse, settle, promise });
    notify();
    // one flush attempt now, even if a backoff timer is waiting
    void Promise.resolve().then(() => {
      clearTimer();
      return flush();
    });
    return promise;
  }

  return {
    sendAttempt(a) {
      try {
        if (queue.some((e) => e.kind === "attempt" && e.item.id === a.id)) return;
        resume();
        queue.push({ kind: "attempt", item: a });
        notify();
        start();
      } catch (e) {
        console.error("sendAttempt failed", e);
      }
    },
    completeLesson: (c) =>
      enqueueComplete(API.completeLesson, `${API.completeLesson}|${c.day}|${c.sessionId}`, c, isCompleteResponse) as Promise<CompleteResult>,
    completePractice: (c) =>
      enqueueComplete(API.completePractice, `${API.completePractice}|${c.day}|${c.sessionId}`, c, isPracticeResponse) as Promise<
        CompleteResult<CompletePracticeResponse>
      >,
    /** Attempts plus completions still queued. */
    pendingCount: () => queue.length,
    getState: () => ({ pending: queue.length, pendingAttempts: queue.filter((e) => e.kind === "attempt").length, status: status() }),
    subscribe(cb) {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },
    dispose() {
      disposed = true;
      target?.removeEventListener("online", onOnline);
      clearTimer();
      touch();
    },
  };
}

let shared: HttpSink | null = null;

/**
 * The one queue the whole app shares, so FIFO holds across day pages. Created on first use, so importing this
 * module during SSR touches no `window`.
 */
export function getSyncSink(): HttpSink {
  shared ??= createHttpSink();
  return shared;
}
