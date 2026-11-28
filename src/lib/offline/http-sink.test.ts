import { afterEach, describe, expect, it, vi } from "vitest";
import { API, type AttemptInput, type CompleteCheckpointRequest, type CompleteCheckpointResponse, type CompleteLessonRequest, type CompleteLessonResponse, type CompletePracticeRequest, type CompletePracticeResponse } from "@/lib/attempts/contract";
import { API_SRS, type CompleteReviewRequest, type CompleteReviewResponse, type ReviewInput } from "@/lib/srs/contract";
import { createHttpSink, getSyncSink } from "./http-sink";

type Reply = { status: number; body?: unknown; retryAfter?: string; notJson?: boolean } | Error | "hang";
type Call = { url: string; body: { attempts?: AttemptInput[] } & Partial<CompleteLessonRequest> & Partial<CompletePracticeRequest> };

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
  streak: { current: 1, longest: 1 }, currentDay: 2, pendingCheckpoint: null,
};
const practiceReq: CompletePracticeRequest = { kind: "replay", day: 1, skill: null, sessionId: uuid(7777), completedAt: "2026-11-26T10:05:00.000Z" };
const practiceResponse: CompletePracticeResponse = {
  session: { sessionId: practiceReq.sessionId, day: 1, skill: null, score: 0.5, graded: 4 },
  lessonScore: 1, streak: { current: 1, longest: 1 }, countedForStreak: true,
};
const checkpointReq: CompleteCheckpointRequest = { afterDay: 30, sessionId: uuid(5555), completedAt: "2026-11-28T10:30:00.000Z" };
const checkpointResponse: CompleteCheckpointResponse = {
  result: {
    sessionId: checkpointReq.sessionId, afterDay: 30, score: 0.75, passed: true, completedAt: checkpointReq.completedAt, sitting: 1, best: 0.75,
    skills: [{ skill: "listening", weight: 100, score: 0.75, answered: 4, total: 4, selfOk: null }],
  },
  streak: { current: 1, longest: 1 }, nextDay: 31,
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
    expect(t.sink.getState()).toEqual({ pending: 0, pendingAttempts: 0, pendingReviews: 0, pendingReviewCompletions: 0, status: "idle" });
    const seen: string[] = [];
    t.sink.subscribe(() => seen.push(t.sink.getState().status));
    t.sink.sendAttempt(attempt(1));
    void t.sink.completeLesson(completion);
    await settle();
    expect(t.sink.getState()).toEqual({ pending: 2, pendingAttempts: 1, pendingReviews: 0, pendingReviewCompletions: 0, status: "retrying" });
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

describe("createHttpSink: completePractice", () => {
  const practiceAttempt = (n: number): AttemptInput => ({ ...attempt(n), source: "practice", sessionId: practiceReq.sessionId });

  it("flushes earlier attempts first (FIFO), then posts to API.completePractice and resolves done", async () => {
    const t = setup([okFor(1, 2), { status: 200, body: practiceResponse }]);
    t.sink.sendAttempt(practiceAttempt(1));
    t.sink.sendAttempt(practiceAttempt(2));
    const result = await t.sink.completePractice(practiceReq);
    expect(result).toEqual({ status: "done", response: practiceResponse });
    expect(t.calls.map((c) => c.url)).toEqual([API.attempts, API.completePractice]);
    expect(t.calls[1].body).toEqual(practiceReq);
    expect(t.sink.pendingCount()).toBe(0);
  });

  it("does not send attempts queued after it before it", async () => {
    const t = setup([new TypeError("offline"), okFor(1), { status: 200, body: practiceResponse }, okFor(3)]);
    t.sink.sendAttempt(practiceAttempt(1));
    expect(await t.sink.completePractice(practiceReq)).toEqual({ status: "queued" });
    t.sink.sendAttempt(practiceAttempt(3));
    await t.runTimer();
    expect(t.calls.map((c) => c.url)).toEqual([API.attempts, API.attempts, API.completePractice, API.attempts]);
  });

  it("409 settles rejected 409 and 400 settles rejected 400 (dropped from the queue)", async () => {
    const a = setup([{ status: 409, body: { error: "not_replayable" } }]);
    expect(await a.sink.completePractice(practiceReq)).toEqual({ status: "rejected", code: 409 });
    expect(a.sink.pendingCount()).toBe(0);
    const b = setup([{ status: 400 }]);
    expect(await b.sink.completePractice(practiceReq)).toEqual({ status: "rejected", code: 400 });
  });

  it("5xx resolves queued and keeps it pending until a retry succeeds", async () => {
    const t = setup([{ status: 500 }, { status: 200, body: practiceResponse }]);
    expect(await t.sink.completePractice(practiceReq)).toEqual({ status: "queued" });
    expect(t.sink.pendingCount()).toBe(1);
    await t.runTimer();
    expect(t.sink.pendingCount()).toBe(0);
  });

  it("a 200 with the wrong shape (a lesson completion body) is retried, not accepted", async () => {
    const t = setup([{ status: 200, body: completeResponse }, { status: 200, body: practiceResponse }]);
    expect(await t.sink.completePractice(practiceReq)).toEqual({ status: "queued" });
    expect(t.sink.pendingCount()).toBe(1);
    await t.runTimer();
    expect(t.sink.pendingCount()).toBe(0);
  });

  it("a lesson completion body shape check is not loosened: a practice body is not a lesson completion", async () => {
    const t = setup([{ status: 200, body: practiceResponse }]);
    expect(await t.sink.completeLesson(completion)).toEqual({ status: "queued" });
  });

  it("a second completePractice for the same session returns the same promise and sends once", async () => {
    const t = setup([{ status: 200, body: practiceResponse }]);
    const p1 = t.sink.completePractice(practiceReq);
    const p2 = t.sink.completePractice({ ...practiceReq });
    expect(p2).toBe(p1);
    await p1;
    expect(t.calls.filter((c) => c.url === API.completePractice)).toHaveLength(1);
  });

  it("a lesson completion and a practice completion with the same sessionId are different entries", async () => {
    const t = setup([{ status: 200, body: completeResponse }, { status: 200, body: practiceResponse }]);
    const shared = practiceReq.sessionId;
    const p1 = t.sink.completeLesson({ ...completion, sessionId: shared });
    const p2 = t.sink.completePractice(practiceReq);
    expect(p2).not.toBe(p1);
    await Promise.all([p1, p2]);
    expect(t.calls.map((c) => c.url)).toEqual([API.completeLesson, API.completePractice]);
  });

  it("401 pauses without dropping it", async () => {
    const t = setup([{ status: 401 }]);
    expect(await t.sink.completePractice(practiceReq)).toEqual({ status: "queued" });
    expect(t.sink.getState().status).toBe("paused");
    expect(t.sink.pendingCount()).toBe(1);
  });
});

describe("createHttpSink: reviews (vocabulary review)", () => {
  const review = (n: number): ReviewInput => ({
    id: uuid(n), sessionId: uuid(8888), vocabId: "v-hello", direction: n % 2 ? "en_th" : "th_en", rating: 3, reviewedAt: "2026-11-26T10:00:00.000Z",
  });
  const reviewCompletion: CompleteReviewRequest = { sessionId: uuid(8888), startedAt: "2026-11-26T10:00:00.000Z", completedAt: "2026-11-26T10:05:00.000Z" };
  const reviewCompleteResponse: CompleteReviewResponse = {
    sessionDate: "2026-11-26", reviewed: 2, remainingDue: 0, streak: { current: 1, longest: 1 }, countedForStreak: true,
  };
  const wire = { due: "2026-11-27T10:00:00.000Z", lastReview: "2026-11-26T10:00:00.000Z", stability: 2.3, difficulty: 2.1, scheduledDays: 1, learningSteps: 0, elapsedDays: 0, reps: 1, lapses: 0, state: 2 };
  const createdReview = (n: number) => ({ id: uuid(n), status: "created", card: wire });
  const reviewsOf = (c: Call) => ((c.body as unknown as { reviews: ReviewInput[] }).reviews ?? []).map((r) => r.id);
  const kindOf = (c: Call) => (c.url === API_SRS.reviews ? reviewsOf(c) : c.url === API_SRS.completeReview ? "review-complete" : c.url === API.attempts ? ids(c) : "other");

  it("posts reviews to API_SRS.reviews as { reviews: [...] }, in order, in one batch", async () => {
    const t = setup([{ status: 200, body: { results: [1, 2, 3].map(createdReview) } }]);
    [1, 2, 3].forEach((n) => t.sink.sendReview(review(n)));
    expect(t.sink.pendingCount()).toBe(3);
    await settle();
    expect(t.calls).toHaveLength(1);
    expect(t.calls[0].url).toBe(API_SRS.reviews);
    expect(reviewsOf(t.calls[0])).toEqual([uuid(1), uuid(2), uuid(3)]);
    expect(t.sink.pendingCount()).toBe(0);
  });

  it("does not mix attempts and reviews in one request; first in, first out across the two kinds", async () => {
    const t = setup([okFor(1), { status: 200, body: { results: [createdReview(2)] } }, okFor(3)]);
    t.sink.sendAttempt(attempt(1));
    t.sink.sendReview(review(2));
    t.sink.sendAttempt(attempt(3));
    await settle();
    expect(t.calls.map(kindOf)).toEqual([[uuid(1)], [uuid(2)], [uuid(3)]]);
  });

  it("does not queue the same review id twice", async () => {
    const t = setup([{ status: 200, body: { results: [createdReview(1)] } }]);
    t.sink.sendReview(review(1));
    t.sink.sendReview(review(1));
    expect(t.sink.pendingCount()).toBe(1);
    await settle();
    expect(reviewsOf(t.calls[0])).toEqual([uuid(1)]);
  });

  it("an attempt and a review with the same id are different entries", async () => {
    const t = setup([okFor(1), { status: 200, body: { results: [createdReview(1)] } }]);
    t.sink.sendAttempt(attempt(1));
    t.sink.sendReview(review(1));
    expect(t.sink.pendingCount()).toBe(2);
    await settle();
    expect(t.sink.pendingCount()).toBe(0);
  });

  it("drops created, duplicate and rejected reviews, and keeps one with no usable status", async () => {
    const t = setup([
      { status: 200, body: { results: [{ id: uuid(1), status: "duplicate", card: wire }, { id: uuid(2), status: "rejected", reason: "not_taught" }, { id: uuid(3) }] } },
    ]);
    [1, 2, 3].forEach((n) => t.sink.sendReview(review(n)));
    await settle();
    expect(t.sink.pendingCount()).toBe(1);
    expect(t.live()).toHaveLength(1);
  });

  it("5xx keeps every review, backs off, then retries in the same order", async () => {
    const t = setup([{ status: 503 }, { status: 200, body: { results: [1, 2].map(createdReview) } }]);
    t.sink.sendReview(review(1));
    t.sink.sendReview(review(2));
    await settle();
    expect(t.sink.pendingCount()).toBe(2);
    expect(t.live()[0].ms).toBe(1000);
    await t.runTimer();
    expect(t.calls.map(kindOf)).toEqual([[uuid(1), uuid(2)], [uuid(1), uuid(2)]]);
    expect(t.sink.pendingCount()).toBe(0);
  });

  it("a 200 whose results do not line up is treated as a server error and loses nothing", async () => {
    const t = setup([{ status: 200, body: { results: [createdReview(9)] } }]);
    vi.spyOn(console, "error").mockImplementation(() => {});
    t.sink.sendReview(review(1));
    await settle();
    expect(t.sink.pendingCount()).toBe(1);
  });

  it("413 halves the batch; another 4xx drops the batch and logs", async () => {
    const t = setup([{ status: 413 }, { status: 200, body: { results: [createdReview(1)] } }, { status: 400 }]);
    vi.spyOn(console, "error").mockImplementation(() => {});
    t.sink.sendReview(review(1));
    t.sink.sendReview(review(2));
    await settle();
    expect(t.calls.map(kindOf)).toEqual([[uuid(1), uuid(2)], [uuid(1)], [uuid(2)]]);
    expect(t.sink.pendingCount()).toBe(0);
  });

  it("completeReview waits for earlier reviews, posts to API_SRS.completeReview and resolves done", async () => {
    const t = setup([{ status: 200, body: { results: [1, 2].map(createdReview) } }, { status: 200, body: reviewCompleteResponse }]);
    t.sink.sendReview(review(1));
    t.sink.sendReview(review(2));
    const r = await t.sink.completeReview(reviewCompletion);
    expect(r).toEqual({ status: "done", response: reviewCompleteResponse });
    expect(t.calls.map(kindOf)).toEqual([[uuid(1), uuid(2)], "review-complete"]);
    expect(t.calls[1].body).toEqual(reviewCompletion);
  });

  it("reviews queued after a completion are not sent before it", async () => {
    const t = setup([{ status: 200, body: { results: [createdReview(1)] } }, { status: 200, body: reviewCompleteResponse }, { status: 200, body: { results: [createdReview(2)] } }]);
    t.sink.sendReview(review(1));
    const p = t.sink.completeReview(reviewCompletion);
    t.sink.sendReview(review(2));
    await p;
    await settle();
    expect(t.calls.map(kindOf)).toEqual([[uuid(1)], "review-complete", [uuid(2)]]);
  });

  it("completion 409 settles rejected 409 and 400 settles rejected 400, both dropped", async () => {
    const a = setup([{ status: 409 }]);
    expect(await a.sink.completeReview(reviewCompletion)).toEqual({ status: "rejected", code: 409 });
    expect(a.sink.pendingCount()).toBe(0);
    const b = setup([{ status: 400 }]);
    expect(await b.sink.completeReview(reviewCompletion)).toEqual({ status: "rejected", code: 400 });
  });

  it("completion on 5xx resolves queued, stays pending, and is retried", async () => {
    const t = setup([{ status: 500 }, { status: 200, body: reviewCompleteResponse }]);
    expect(await t.sink.completeReview(reviewCompletion)).toEqual({ status: "queued" });
    expect(t.sink.pendingCount()).toBe(1);
    await t.runTimer();
    expect(t.sink.pendingCount()).toBe(0);
  });

  it("a completion body of the wrong shape (a lesson or practice one) is retried, not accepted", async () => {
    const t = setup([{ status: 200, body: completeResponse }]);
    expect(await t.sink.completeReview(reviewCompletion)).toEqual({ status: "queued" });
    expect(t.sink.pendingCount()).toBe(1);
  });

  it("a review completion body is not accepted by the lesson or practice completion", async () => {
    const t = setup([{ status: 200, body: reviewCompleteResponse }]);
    expect(await t.sink.completeLesson(completion)).toEqual({ status: "queued" });
    const u = setup([{ status: 200, body: reviewCompleteResponse }]);
    expect(await u.sink.completePractice(practiceReq)).toEqual({ status: "queued" });
  });

  it("a second completeReview for the same session returns the same promise and sends once", async () => {
    const t = setup([{ status: 200, body: reviewCompleteResponse }]);
    const p1 = t.sink.completeReview(reviewCompletion);
    const p2 = t.sink.completeReview(reviewCompletion);
    expect(p2).toBe(p1);
    await p1;
    expect(t.calls).toHaveLength(1);
  });

  it("getState counts pending reviews separately and leaves pendingAttempts alone", async () => {
    const t = setup([{ status: 500 }]);
    t.sink.sendAttempt(attempt(1));
    t.sink.sendReview(review(2));
    expect(t.sink.getState()).toMatchObject({ pending: 2, pendingAttempts: 1, pendingReviews: 1 });
  });

  it("getState counts a waiting review completion by itself: a lesson or practice completion is not one", async () => {
    const t = setup([{ status: 500 }]);
    void t.sink.completeLesson(completion);
    expect(t.sink.getState()).toMatchObject({ pending: 1, pendingReviewCompletions: 0 });
    void t.sink.completeReview(reviewCompletion);
    expect(t.sink.getState()).toMatchObject({ pending: 2, pendingAttempts: 0, pendingReviews: 0, pendingReviewCompletions: 1 });
  });

  it("401 on reviews keeps them and pauses", async () => {
    const t = setup([{ status: 401 }]);
    t.sink.sendReview(review(1));
    await settle();
    expect(t.sink.pendingCount()).toBe(1);
    expect(t.sink.getState().status).toBe("paused");
  });
});

// The page needs the server's card for each review (docs/plans/vocab-review-plan.md 4.4 item 13): onReviewResult.
// Decision: a batch the sink drops without an answer (4xx other than 401/403/408/429, or a 413 for one item) delivers
// `rejected` / `invalid` for each of its reviews, so the page can drop those cards instead of waiting for a card that never comes.
describe("createHttpSink: onReviewResult", () => {
  const review = (n: number): ReviewInput => ({
    id: uuid(n), sessionId: uuid(8888), vocabId: "v-hello", direction: "en_th", rating: 3, reviewedAt: "2026-11-26T10:00:00.000Z",
  });
  const wire = (stability: number) => ({ due: "2026-11-27T10:00:00.000Z", lastReview: "2026-11-26T10:00:00.000Z", stability, difficulty: 2.1, scheduledDays: 1, learningSteps: 0, elapsedDays: 0, reps: 1, lapses: 0, state: 2 });
  const createdReview = (n: number) => ({ id: uuid(n), status: "created", card: wire(n) });
  const listen = (t: ReturnType<typeof setup>) => {
    const got: unknown[] = [];
    const off = t.sink.onReviewResult((r) => got.push(r));
    return { got, off };
  };

  it("delivers one result per settled review, in order, with the server's card (created and duplicate)", async () => {
    const t = setup([{ status: 200, body: { results: [createdReview(1), { id: uuid(2), status: "duplicate", card: wire(2) }, createdReview(3)] } }]);
    const { got } = listen(t);
    [1, 2, 3].forEach((n) => t.sink.sendReview(review(n)));
    await settle();
    expect(got).toEqual([
      { id: uuid(1), status: "created", card: wire(1) },
      { id: uuid(2), status: "duplicate", card: wire(2) },
      { id: uuid(3), status: "created", card: wire(3) },
    ]);
  });

  it("delivers rejected with its reason and the id of the review even when the server answered id null", async () => {
    const t = setup([{ status: 200, body: { results: [{ id: uuid(1), status: "rejected", reason: "not_taught" }, { id: null, status: "rejected", reason: "invalid" }] } }]);
    const { got } = listen(t);
    t.sink.sendReview(review(1));
    t.sink.sendReview(review(2));
    await settle();
    expect(got).toEqual([
      { id: uuid(1), status: "rejected", reason: "not_taught" },
      { id: uuid(2), status: "rejected", reason: "invalid" },
    ]);
  });

  it("delivers nothing for a review that stays queued (no usable status, 5xx) and each result once, even after a retry", async () => {
    const t = setup([{ status: 200, body: { results: [createdReview(1), { id: uuid(2) }] } }, { status: 200, body: { results: [createdReview(2)] } }]);
    const { got } = listen(t);
    t.sink.sendReview(review(1));
    t.sink.sendReview(review(2));
    await settle();
    expect(got).toHaveLength(1);
    await t.runTimer();
    expect(got.map((r) => (r as { id: string }).id)).toEqual([uuid(1), uuid(2)]);
  });

  it("delivers nothing for attempts, and nothing for a 5xx", async () => {
    const t = setup([okFor(1), { status: 503 }]);
    const { got } = listen(t);
    t.sink.sendAttempt(attempt(1));
    await settle();
    t.sink.sendReview(review(2));
    await settle();
    expect(got).toEqual([]);
  });

  it("a dropped batch (400) delivers rejected/invalid for each review in it", async () => {
    const t = setup([{ status: 400 }]);
    const { got } = listen(t);
    t.sink.sendReview(review(1));
    t.sink.sendReview(review(2));
    await settle();
    expect(got).toEqual([{ id: uuid(1), status: "rejected", reason: "invalid" }, { id: uuid(2), status: "rejected", reason: "invalid" }]);
  });

  it("unsubscribe stops delivery; several listeners all hear; a throwing listener does not stop the others or the queue", async () => {
    const t = setup([{ status: 200, body: { results: [createdReview(1)] } }, { status: 200, body: { results: [createdReview(2)] } }]);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const a = listen(t);
    const b = listen(t);
    t.sink.onReviewResult(() => { throw new Error("boom"); });
    t.sink.sendReview(review(1));
    await settle();
    a.off();
    t.sink.sendReview(review(2));
    await settle();
    expect(a.got).toHaveLength(1);
    expect(b.got).toHaveLength(2);
    expect(t.sink.pendingCount()).toBe(0);
  });
});

describe("createHttpSink: completeCheckpoint", () => {
  const cpAttempt = (n: number): AttemptInput => ({ ...attempt(n), exerciseId: "c030-listen-01", source: "checkpoint", sessionId: checkpointReq.sessionId });

  it("flushes earlier attempts first (FIFO), then posts to API.completeCheckpoint and resolves done", async () => {
    const t = setup([okFor(1, 2), { status: 200, body: checkpointResponse }]);
    t.sink.sendAttempt(cpAttempt(1));
    t.sink.sendAttempt(cpAttempt(2));
    expect(await t.sink.completeCheckpoint(checkpointReq)).toEqual({ status: "done", response: checkpointResponse });
    expect(t.calls.map((c) => c.url)).toEqual([API.attempts, API.completeCheckpoint]);
    expect(t.calls[1].body).toEqual(checkpointReq);
    expect(t.sink.pendingCount()).toBe(0);
  });

  it("does not send attempts queued after it before it", async () => {
    const t = setup([new TypeError("offline"), okFor(1), { status: 200, body: checkpointResponse }, okFor(3)]);
    t.sink.sendAttempt(cpAttempt(1));
    expect(await t.sink.completeCheckpoint(checkpointReq)).toEqual({ status: "queued" });
    t.sink.sendAttempt(cpAttempt(3));
    await t.runTimer();
    expect(t.calls.map((c) => c.url)).toEqual([API.attempts, API.attempts, API.completeCheckpoint, API.attempts]);
  });

  it("409 (not_completable) settles rejected 409, 400 settles rejected 400; both leave the queue", async () => {
    const a = setup([{ status: 409, body: { error: "not_completable" } }]);
    expect(await a.sink.completeCheckpoint(checkpointReq)).toEqual({ status: "rejected", code: 409 });
    expect(a.sink.pendingCount()).toBe(0);
    const b = setup([{ status: 400 }]);
    expect(await b.sink.completeCheckpoint(checkpointReq)).toEqual({ status: "rejected", code: 400 });
  });

  it("5xx resolves queued and keeps it pending until a retry succeeds", async () => {
    const t = setup([{ status: 500 }, { status: 200, body: checkpointResponse }]);
    expect(await t.sink.completeCheckpoint(checkpointReq)).toEqual({ status: "queued" });
    expect(t.sink.pendingCount()).toBe(1);
    await t.runTimer();
    expect(t.sink.pendingCount()).toBe(0);
  });

  it("a 200 whose body is another completion (lesson or practice) is retried, not accepted", async () => {
    const t = setup([{ status: 200, body: completeResponse }, { status: 200, body: practiceResponse }, { status: 200, body: checkpointResponse }]);
    expect(await t.sink.completeCheckpoint(checkpointReq)).toEqual({ status: "queued" });
    await t.runTimer();
    expect(t.sink.pendingCount()).toBe(1);
    await t.runTimer();
    expect(t.sink.pendingCount()).toBe(0);
  });

  it("a checkpoint body is not accepted as a lesson or practice completion, nor one whose skills is not an array", async () => {
    const a = setup([{ status: 200, body: checkpointResponse }]);
    expect(await a.sink.completeLesson(completion)).toEqual({ status: "queued" });
    const b = setup([{ status: 200, body: checkpointResponse }]);
    expect(await b.sink.completePractice(practiceReq)).toEqual({ status: "queued" });
    const c = setup([{ status: 200, body: { ...checkpointResponse, result: { ...checkpointResponse.result, skills: "x" } } }]);
    expect(await c.sink.completeCheckpoint(checkpointReq)).toEqual({ status: "queued" });
    const d = setup([{ status: 200, body: { result: checkpointResponse.result } }]);
    expect(await d.sink.completeCheckpoint(checkpointReq)).toEqual({ status: "queued" });
  });

  it("a second completeCheckpoint for the same afterDay and session returns the same promise and sends once (idempotent by sessionId)", async () => {
    const t = setup([{ status: 200, body: checkpointResponse }]);
    const p1 = t.sink.completeCheckpoint(checkpointReq);
    const p2 = t.sink.completeCheckpoint({ ...checkpointReq });
    expect(p2).toBe(p1);
    await p1;
    expect(t.calls.filter((c) => c.url === API.completeCheckpoint)).toHaveLength(1);
  });

  it("the same sessionId as a lesson or practice completion is a different entry", async () => {
    const t = setup([{ status: 200, body: completeResponse }, { status: 200, body: checkpointResponse }]);
    const p1 = t.sink.completeLesson({ ...completion, sessionId: checkpointReq.sessionId });
    const p2 = t.sink.completeCheckpoint(checkpointReq);
    expect(p2).not.toBe(p1);
    await Promise.all([p1, p2]);
    expect(t.calls.map((c) => c.url)).toEqual([API.completeLesson, API.completeCheckpoint]);
  });

  it("the same session for another checkpoint day is a different entry", async () => {
    const t = setup([{ status: 200, body: checkpointResponse }, { status: 200, body: checkpointResponse }]);
    const p1 = t.sink.completeCheckpoint(checkpointReq);
    const p2 = t.sink.completeCheckpoint({ ...checkpointReq, afterDay: 60 });
    expect(p2).not.toBe(p1);
    await Promise.all([p1, p2]);
  });

  it("401 pauses without dropping it", async () => {
    const t = setup([{ status: 401 }]);
    expect(await t.sink.completeCheckpoint(checkpointReq)).toEqual({ status: "queued" });
    expect(t.sink.getState().status).toBe("paused");
    expect(t.sink.pendingCount()).toBe(1);
  });
});
