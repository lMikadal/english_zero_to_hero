import { afterEach, describe, expect, it, vi } from "vitest";
import { API, type AttemptInput, type CompleteLessonRequest, type CompleteLessonResponse } from "@/lib/attempts/contract";
import { createHttpSink } from "./http-sink";

type Reply = { status: number; body?: unknown } | Error;
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
  const fetch = vi.fn(async (url: string, init: { body: string }) => {
    const call = { url, body: JSON.parse(init.body) } as Call;
    calls.push(call);
    const r = queue.shift() ?? fallback?.(call) ?? { status: 200, body: {} };
    if (r instanceof Error) throw r;
    return { status: r.status, ok: r.status >= 200 && r.status < 300, json: async () => r.body };
  });
  const timers: { fn: () => void; ms: number; id: number; live: boolean }[] = [];
  const target = new EventTarget();
  const sink = createHttpSink({
    fetch, eventTarget: target, baseDelayMs: 1000, maxDelayMs: 4000,
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

  it("drops created, duplicate and rejected items and keeps the rest of a mixed response", async () => {
    const t = setup([
      { status: 200, body: { results: [created(1), { id: uuid(2), status: "duplicate" }, { id: uuid(3), status: "rejected", reason: "invalid" }] } },
      { status: 500 },
    ]);
    [1, 2, 3, 4].forEach((n) => t.sink.sendAttempt(attempt(n)));
    await settle();
    // 4 items: results only cover 3, the 4th has no answer and is kept; then 5xx keeps it
    expect(t.sink.pendingCount()).toBe(1);
    await t.runTimer();
    expect(ids(t.calls[1])).toEqual([uuid(4)]);
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
    expect(t.timers.map((x) => x.ms)).toEqual([1000, 2000, 4000, 4000, 4000, 4000]);
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

  it("keeps items on other non-2xx statuses (never loses an answer)", async () => {
    const t = setup([{ status: 401 }]);
    t.sink.sendAttempt(attempt(1));
    await settle();
    expect(t.sink.pendingCount()).toBe(1);
    expect(t.live()).toHaveLength(1);
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
    const t = setup([new TypeError("offline"), new TypeError("offline"), okFor(1), { status: 200, body: completeResponse }]);
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
    t.fetch.mockImplementationOnce(async () => ({ status: 500, ok: false, json: async () => ({}) }));
    expect(await t.sink.completeLesson(completion)).toEqual({ status: "queued" });
    expect(t.live()).toHaveLength(1);
  });
});

describe("createHttpSink: subscribe", () => {
  it("notifies on every change and can unsubscribe", async () => {
    const t = setup([okFor(1)]);
    const cb = vi.fn();
    const off = t.sink.subscribe(cb);
    t.sink.sendAttempt(attempt(1));
    expect(cb).toHaveBeenCalledTimes(1);
    await settle();
    expect(cb).toHaveBeenCalledTimes(2);
    off();
    t.sink.sendAttempt(attempt(2));
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("survives a throwing subscriber", async () => {
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
