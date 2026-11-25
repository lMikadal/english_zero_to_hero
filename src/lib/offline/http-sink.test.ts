import { afterEach, describe, expect, it, vi } from "vitest";
import { API, type AttemptInput, type CompleteLessonRequest, type CompleteLessonResponse } from "@/lib/attempts/contract";
import { createHttpSink, getSyncSink } from "./http-sink";

type Reply = { status: number; body?: unknown; retryAfter?: string; notJson?: boolean } | Error | "hang";
type Call = { url: string; body: { attempts?: AttemptInput[] } & Partial<CompleteLessonRequest> };

function uuid(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}
function attempt(n: number): AttemptInput {
  return {
    id: uuid(n), exerciseId: "d001-read-01", sessionId: uuid(9999), source: "lesson", attemptNo: 1,
    answer: { kind: "choices", selected: [0] }, createdAt: "2026-11-25T10:00:00.000Z",
  };
}
const completion: CompleteLessonRequest = { day: 1, sessionId: uuid(9999), completedAt: "2026-11-25T10:05:00.000Z" };
const completeResponse: CompleteLessonResponse = {
  progress: { day: 1, status: "done", score: 1, completedAt: completion.completedAt },
  streak: { current: 1, longest: 1 }, currentDay: 2,
};
const created = (n: number) => ({ id: uuid(n), status: "created", correct: true, score: 1 });

/** A scripted fetch: each call takes the next reply (or `fallback`) and is recorded. */
function setup(replies: Reply[] = [], fallback?: (c: Call) => Reply) {
  const calls: Call[] = [];
  const queue = [...replies];
  const fetch = vi.fn(async (url: string, init: { body: string; signal?: AbortSignal }) => {
    const call = { url, body: JSON.parse(init.body) } as Call;
    calls.push(call);
    const r = queue.shift() ?? fallback?.(call) ?? { status: 200, body: {} };
    if (r === "hang") return new Promise<never>(() => {});
    if (r instanceof Error) throw r;
    return {
      status: r.status, ok: r.status >= 200 && r.status < 300,
      headers: { get: (n: string) => (n.toLowerCase() === "retry-after" ? (r.retryAfter ?? null) : null) },
      json: async () => {
        if (r.notJson) throw new SyntaxError("Unexpected token < in JSON");
        return r.body;
      },
    };
  });
  const timers: { fn: () => void; ms: number; id: number; live: boolean }[] = [];
  const target = new EventTarget();
  const sink = createHttpSink({
    fetch, eventTarget: target, baseDelayMs: 1000, maxDelayMs: 4000, requestTimeoutMs: 15_000,
    timers: {
      setTimeout: (fn, ms) => (timers.push({ fn, ms, id: timers.length + 1, live: true }), timers.length),
      clearTimeout: (id) => void (timers.find((t) => t.id === id)!.live = false),
    },
  });
  const live = () => timers.filter((t) => t.live);
  const runTimer = async () => {
    const t = live()[0];
    t.live = false;
    t.fn();
    await settle();
  };
  return { sink, calls, fetch, timers, live, runTimer, target };
}
const settle = () => new Promise<void>((r) => setTimeout(r, 0));
const ids = (c: Call) => c.body.attempts!.map((a) => a.id);
const okFor = (...ns: number[]): Reply => ({ status: 200, body: { results: ns.map(created) } });

afterEach(() => vi.restoreAllMocks());

describe("createHttpSink: attempts", () => {
  it("posts to API.attempts as JSON in first-in first-out order, batching what was queued in the same tick", async () => {
    const t = setup([okFor(1, 2, 3)]);
    [1, 2, 3].forEach((n) => t.sink.sendAttempt(attempt(n)));
    expect(t.sink.pendingCount()).toBe(3);
    await settle();
    expect(t.calls).toHaveLength(1);
    expect(t.calls[0].url).toBe(API.attempts);
    expect(ids(t.calls[0])).toEqual([uuid(1), uuid(2), uuid(3)]);
    expect(t.sink.pendingCount()).toBe(0);
  });

  it("sends at most 50 per request, one request at a time, in order", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const t = setup([], (c) => ({ status: 200, body: { results: c.body.attempts!.map((a) => ({ id: a.id, status: "created", correct: true, score: 1 })) } }));
    const original = t.fetch.getMockImplementation()!;
    t.fetch.mockImplementation(async (...args) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await settle();
      const r = await original(...args);
      inFlight--;
      return r;
    });
    for (let n = 1; n <= 120; n++) t.sink.sendAttempt(attempt(n));
    await vi.waitFor(() => expect(t.sink.pendingCount()).toBe(0));
    expect(t.calls.map((c) => c.body.attempts!.length)).toEqual([50, 50, 20]);
    expect(t.calls.flatMap(ids)).toEqual(Array.from({ length: 120 }, (_, i) => uuid(i + 1)));
    expect(maxInFlight).toBe(1);
  });

  it("drops created, duplicate and rejected items and keeps one the server gave no usable status for", async () => {
    const t = setup([
      { status: 200, body: { results: [created(1), { id: uuid(2), status: "duplicate" }, { id: null, status: "rejected", reason: "invalid" }, { id: uuid(4), status: "weird" }] } },
      { status: 500 },
    ]);
    [1, 2, 3, 4].forEach((n) => t.sink.sendAttempt(attempt(n)));
    await settle();
    expect(t.sink.pendingCount()).toBe(1);
    await t.runTimer();
    expect(ids(t.calls[1])).toEqual([uuid(4)]);
  });

  it("S2: a 200 whose results do not line up with the batch loses nothing and is treated like a 5xx", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const t = setup([{ status: 200, body: { results: [created(2), created(3)] } }, okFor(1, 2, 3)]);
    [1, 2, 3].forEach((n) => t.sink.sendAttempt(attempt(n)));
    await settle();
    expect(t.sink.pendingCount()).toBe(3);
    expect(t.live().map((x) => x.ms)).toEqual([1000]);
    expect(err).toHaveBeenCalledTimes(1);
    // same length but wrong ids
    await t.runTimer();
    expect(t.sink.pendingCount()).toBe(0);
  });

  it("S2: a result whose id does not match its position is rejected as a whole", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const t = setup([{ status: 200, body: { results: [created(2), created(1)] } }]);
    [1, 2].forEach((n) => t.sink.sendAttempt(attempt(n)));
    await settle();
    expect(t.sink.pendingCount()).toBe(2);
  });

  it("keeps items on 5xx, backs off, retries in the same order and loses nothing", async () => {
    const t = setup([{ status: 503 }, { status: 502 }, okFor(1, 2, 3)]);
    [1, 2, 3].forEach((n) => t.sink.sendAttempt(attempt(n)));
    await settle();
    expect(t.sink.pendingCount()).toBe(3);
    expect(t.live().map((x) => x.ms)).toEqual([1000]);
    t.sink.sendAttempt(attempt(4)); // queued during backoff: does not bypass it
    await settle();
    expect(t.calls).toHaveLength(1);
    await t.runTimer();
    expect(t.live().map((x) => x.ms)).toEqual([2000]);
    await t.runTimer();
    expect(t.calls.map(ids)).toEqual([
      [uuid(1), uuid(2), uuid(3)], [uuid(1), uuid(2), uuid(3), uuid(4)], [uuid(1), uuid(2), uuid(3), uuid(4)],
    ]);
  });

  it("caps the backoff", async () => {
    const t = setup([], () => ({ status: 500 }));
    t.sink.sendAttempt(attempt(1));
    await settle();
    for (let i = 0; i < 5; i++) await t.runTimer();
    expect(t.timers.filter((x) => x.ms !== 15_000).map((x) => x.ms)).toEqual([1000, 2000, 4000, 4000, 4000, 4000]);
  });

  it("on a network error pendingCount stays up, nothing throws, and it recovers on retry", async () => {
    const t = setup([new TypeError("Failed to fetch"), okFor(1)]);
    expect(() => t.sink.sendAttempt(attempt(1))).not.toThrow();
    await settle();
    expect(t.sink.pendingCount()).toBe(1);
    await t.runTimer();
    expect(t.sink.pendingCount()).toBe(0);
  });

  it("retries at once on the online event", async () => {
    const t = setup([new TypeError("offline"), okFor(1)]);
    t.sink.sendAttempt(attempt(1));
    await settle();
    expect(t.live()).toHaveLength(1);
    t.target.dispatchEvent(new Event("online"));
    await settle();
    expect(t.sink.pendingCount()).toBe(0);
    expect(t.live()).toHaveLength(0);
  });

  it("drops a batch the server answers 400 and logs it instead of retrying forever", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const t = setup([{ status: 400 }, okFor(2)]);
    t.sink.sendAttempt(attempt(1));
    await settle();
    expect(t.sink.pendingCount()).toBe(0);
    expect(err).toHaveBeenCalled();
    expect(t.live()).toHaveLength(0);
    t.sink.sendAttempt(attempt(2));
    await settle();
    expect(t.calls.map(ids)).toEqual([[uuid(1)], [uuid(2)]]);
  });

  it("does not queue the same attempt id twice", async () => {
    const t = setup([new TypeError("x")]);
    t.sink.sendAttempt(attempt(1));
    t.sink.sendAttempt(attempt(1));
    await settle();
    expect(ids(t.calls[0])).toEqual([uuid(1)]);
    expect(t.sink.pendingCount()).toBe(1);
  });

  it("never sends an item twice in one request across retries", async () => {
    const t = setup([new TypeError("x"), new TypeError("x"), okFor(1, 2)]);
    t.sink.sendAttempt(attempt(1));
    t.sink.sendAttempt(attempt(2));
    await settle();
    await t.runTimer();
    await t.runTimer();
    for (const c of t.calls) expect(new Set(ids(c)).size).toBe(ids(c).length);
  });
});

describe("createHttpSink: completeLesson", () => {
  it("flushes earlier attempts first, then posts the completion and resolves done with the response", async () => {
    const t = setup([okFor(1, 2), { status: 200, body: completeResponse }]);
    t.sink.sendAttempt(attempt(1));
    t.sink.sendAttempt(attempt(2));
    const result = await t.sink.completeLesson(completion);
    expect(result).toEqual({ status: "done", response: completeResponse });
    expect(t.calls.map((c) => c.url)).toEqual([API.attempts, API.completeLesson]);
    expect(t.calls[1].body).toEqual(completion);
    expect(t.sink.pendingCount()).toBe(0);
  });

  it("resolves queued when offline, keeps it pending, and sends it later after the attempts", async () => {
    const t = setup([new TypeError("offline"), okFor(1), { status: 200, body: completeResponse }]);
    t.sink.sendAttempt(attempt(1));
    const result = await t.sink.completeLesson(completion);
    expect(result).toEqual({ status: "queued" });
    expect(t.sink.pendingCount()).toBe(2);
    await t.runTimer();
    expect(t.calls.map((c) => c.url)).toEqual([API.attempts, API.attempts, API.completeLesson]);
    expect(t.sink.pendingCount()).toBe(0);
  });

  it("resolves queued on 5xx for the completion itself and retries it", async () => {
    const t = setup([{ status: 500 }, { status: 200, body: completeResponse }]);
    expect(await t.sink.completeLesson(completion)).toEqual({ status: "queued" });
    expect(t.sink.pendingCount()).toBe(1);
    await t.runTimer();
    expect(t.sink.pendingCount()).toBe(0);
  });

  it("resolves rejected with 409 and drops it", async () => {
    const t = setup([{ status: 409 }]);
    expect(await t.sink.completeLesson(completion)).toEqual({ status: "rejected", code: 409 });
    expect(t.sink.pendingCount()).toBe(0);
    expect(t.live()).toHaveLength(0);
  });

  it("resolves rejected with 400 and drops it", async () => {
    const t = setup([{ status: 400 }]);
    expect(await t.sink.completeLesson(completion)).toEqual({ status: "rejected", code: 400 });
    expect(t.sink.pendingCount()).toBe(0);
  });

  it("does not send attempts queued after a completion before it, and does not batch across it", async () => {
    const t = setup([okFor(1), { status: 200, body: completeResponse }, okFor(2)]);
    t.sink.sendAttempt(attempt(1));
    const p = t.sink.completeLesson(completion);
    t.sink.sendAttempt(attempt(2));
    await p;
    await settle();
    expect(t.calls.map((c) => (c.url === API.attempts ? ids(c) : "complete"))).toEqual([[uuid(1)], "complete", [uuid(2)]]);
  });

  it("holds later attempts behind a completion that cannot be sent yet", async () => {
    const t = setup([{ status: 500 }, { status: 200, body: completeResponse }, okFor(2)]);
    expect(await t.sink.completeLesson(completion)).toEqual({ status: "queued" });
    t.sink.sendAttempt(attempt(2));
    await settle();
    expect(t.calls).toHaveLength(1);
    await t.runTimer();
    await settle();
    expect(t.calls.map((c) => (c.url === API.attempts ? ids(c) : "complete"))).toEqual(["complete", "complete", [uuid(2)]]);
  });

  it("makes an immediate attempt even while a backoff timer is waiting", async () => {
    const t = setup([{ status: 500 }, { status: 200, body: completeResponse }]);
    t.sink.sendAttempt(attempt(1));
    await settle();
    expect(t.live()).toHaveLength(1);
    // attempt 1 is still pending, completion makes one flush attempt: attempts first (500 again) then queued
    t.fetch.mockImplementationOnce(async () => ({ status: 500, ok: false, headers: { get: () => null }, json: async () => ({}) }));
    expect(await t.sink.completeLesson(completion)).toEqual({ status: "queued" });
    expect(t.live()).toHaveLength(1);
  });
});

describe("createHttpSink: subscribe", () => {
  it("notifies on every change (queue and status) and can unsubscribe", async () => {
    const t = setup([okFor(1)]);
    const cb = vi.fn();
    const off = t.sink.subscribe(cb);
    t.sink.sendAttempt(attempt(1));
    expect(cb).toHaveBeenCalledTimes(1);
    await settle();
    expect(cb.mock.calls.length).toBeGreaterThanOrEqual(3); // sending, dropped, idle
    off();
    const n = cb.mock.calls.length;
    t.sink.sendAttempt(attempt(2));
    await settle();
    expect(cb).toHaveBeenCalledTimes(n);
  });

  it("survives a throwing subscriber", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const t = setup([okFor(1)]);
    t.sink.subscribe(() => {
      throw new Error("boom");
    });
    expect(() => t.sink.sendAttempt(attempt(1))).not.toThrow();
    await settle();
    expect(t.sink.pendingCount()).toBe(0);
  });
});

describe("createHttpSink: robustness", () => {
  it("never throws when fetch rejects or the body is not JSON", async () => {
    const t = setup([new Error("boom")]);
    expect(() => t.sink.sendAttempt(attempt(1))).not.toThrow();
    await expect(t.sink.completeLesson(completion)).resolves.toEqual({ status: "queued" });
  });

  it("uses the global fetch by default", async () => {
    const f = vi.fn(async () => ({ status: 200, ok: true, json: async () => ({ results: [created(1)] }) }));
    vi.stubGlobal("fetch", f);
    const sink = createHttpSink();
    sink.sendAttempt(attempt(1));
    await vi.waitFor(() => expect(sink.pendingCount()).toBe(0));
    expect(f).toHaveBeenCalledWith(API.attempts, expect.objectContaining({ method: "POST" }));
    vi.unstubAllGlobals();
  });
});

describe("createHttpSink: request timeout (M1)", () => {
  it("a fetch that never resolves times out: completeLesson resolves queued and later sends are not blocked", async () => {
    const t = setup(["hang", { status: 200, body: completeResponse }, okFor(1)]);
    const p = t.sink.completeLesson(completion);
    await settle();
    expect(t.live().map((x) => x.ms)).toEqual([15_000]);
    t.live()[0].fn(); // the timeout fires
    expect(await p).toEqual({ status: "queued" });
    expect(t.sink.getState().status).toBe("retrying");
    await t.runTimer();
    expect(t.sink.pendingCount()).toBe(0);
    t.sink.sendAttempt(attempt(1));
    await settle();
    expect(t.sink.pendingCount()).toBe(0);
  });

  it("passes an abort signal to fetch and aborts it on timeout", async () => {
    const t = setup(["hang"]);
    t.sink.sendAttempt(attempt(1));
    await settle();
    const signal = (t.fetch.mock.calls[0] as unknown as [string, { signal: AbortSignal }])[1].signal;
    expect(signal.aborted).toBe(false);
    t.live()[0].fn();
    await settle();
    expect(signal.aborted).toBe(true);
    expect(t.sink.pendingCount()).toBe(1);
  });
});

describe("createHttpSink: status rules (S3)", () => {
  it.each([408, 429, 500, 503])("%i keeps the items and retries with backoff", async (status) => {
    const t = setup([{ status }, okFor(1)]);
    t.sink.sendAttempt(attempt(1));
    await settle();
    expect(t.live().map((x) => x.ms)).toEqual([1000]);
    await t.runTimer();
    expect(t.sink.pendingCount()).toBe(0);
  });

  it("429 honours Retry-After seconds, capped at the max delay", async () => {
    const t = setup([{ status: 429, retryAfter: "3" }, { status: 429, retryAfter: "99" }, okFor(1)]);
    t.sink.sendAttempt(attempt(1));
    await settle();
    expect(t.live().map((x) => x.ms)).toEqual([3000]);
    await t.runTimer();
    expect(t.live().map((x) => x.ms)).toEqual([4000]);
  });

  it.each([401, 403])("%i keeps the items and pauses: no timer until online, a new enqueue or a new sink", async (status) => {
    const t = setup([{ status }, okFor(1), { status }, okFor(1, 2)]);
    t.sink.sendAttempt(attempt(1));
    await settle();
    expect(t.sink.pendingCount()).toBe(1);
    expect(t.live()).toHaveLength(0);
    expect(t.sink.getState().status).toBe("paused");
    t.target.dispatchEvent(new Event("online"));
    await settle();
    expect(t.sink.pendingCount()).toBe(0);
    expect(t.sink.getState().status).toBe("idle");
    // a new enqueue also resumes
    t.sink.sendAttempt(attempt(1));
    await settle();
    expect(t.sink.getState().status).toBe("paused");
    t.sink.sendAttempt(attempt(2));
    await settle();
    expect(t.sink.pendingCount()).toBe(0);
  });

  it("413 halves the batch for the retry, and drops a single item that is still too large", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const t = setup([{ status: 413 }, { status: 413 }, { status: 413 }, okFor(2), okFor(3), okFor(4)]);
    [1, 2, 3, 4].forEach((n) => t.sink.sendAttempt(attempt(n)));
    await settle();
    expect(t.calls.map((c) => ids(c).length)).toEqual([4, 2, 1, 1, 1, 1]); // the smaller size sticks
    expect(t.calls.map(ids)[3]).toEqual([uuid(2)]);
    expect(err).toHaveBeenCalledTimes(1); // item 1 dropped
    expect(t.sink.pendingCount()).toBe(0);
  });

  it.each([404, 422])("any other 4xx (%i) on attempts drops the batch and logs", async (status) => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const t = setup([{ status }]);
    t.sink.sendAttempt(attempt(1));
    await settle();
    expect(t.sink.pendingCount()).toBe(0);
    expect(err).toHaveBeenCalled();
    expect(t.live()).toHaveLength(0);
  });

  it("any other 4xx on a completion settles rejected 400 and drops it", async () => {
    const t = setup([{ status: 422 }]);
    expect(await t.sink.completeLesson(completion)).toEqual({ status: "rejected", code: 400 });
    expect(t.sink.pendingCount()).toBe(0);
  });

  it("401 on a completion keeps it queued and paused", async () => {
    const t = setup([{ status: 401 }]);
    expect(await t.sink.completeLesson(completion)).toEqual({ status: "queued" });
    expect(t.sink.pendingCount()).toBe(1);
    expect(t.live()).toHaveLength(0);
    expect(t.sink.getState().status).toBe("paused");
  });
});

describe("createHttpSink: S4-S6", () => {
  it("S5: a 200 whose body is not JSON keeps the items and retries", async () => {
    const t = setup([{ status: 200, notJson: true }, okFor(1)]);
    t.sink.sendAttempt(attempt(1));
    await settle();
    expect(t.sink.pendingCount()).toBe(1);
    await t.runTimer();
    expect(t.sink.pendingCount()).toBe(0);
  });

  it("S6: a completion 200 with a malformed body is treated as a server error", async () => {
    const t = setup([{ status: 200, body: { nope: true } }, { status: 200, body: completeResponse }]);
    expect(await t.sink.completeLesson(completion)).toEqual({ status: "queued" });
    expect(t.sink.pendingCount()).toBe(1);
    await t.runTimer();
    expect(t.sink.pendingCount()).toBe(0);
  });

  it("S6: a second completeLesson for the same day and session returns the same promise and sends once", async () => {
    const t = setup([{ status: 200, body: completeResponse }]);
    const p1 = t.sink.completeLesson(completion);
    const p2 = t.sink.completeLesson({ ...completion });
    expect(p2).toBe(p1);
    await p1;
    expect(t.calls.filter((c) => c.url === API.completeLesson)).toHaveLength(1);
  });

  it("S6: getState reports pending counts and the status through the whole cycle", async () => {
    const t = setup([{ status: 500 }, okFor(1)]);
    expect(t.sink.getState()).toEqual({ pending: 0, pendingAttempts: 0, status: "idle" });
    const seen: string[] = [];
    t.sink.subscribe(() => seen.push(t.sink.getState().status));
    t.sink.sendAttempt(attempt(1));
    void t.sink.completeLesson(completion);
    await settle();
    expect(t.sink.getState()).toEqual({ pending: 2, pendingAttempts: 1, status: "retrying" });
    expect(seen).toContain("sending");
    expect(seen).toContain("retrying");
  });

  it("S4: dispose removes the online listener and clears timers", async () => {
    const t = setup([new TypeError("x"), okFor(1)]);
    t.sink.sendAttempt(attempt(1));
    await settle();
    expect(t.live()).toHaveLength(1);
    t.sink.dispose();
    expect(t.live()).toHaveLength(0);
    t.target.dispatchEvent(new Event("online"));
    await settle();
    expect(t.calls).toHaveLength(1);
  });

  it("S4: getSyncSink returns one shared instance", () => {
    expect(getSyncSink()).toBe(getSyncSink());
    getSyncSink().dispose();
  });
});
