import { describe, expect, it, vi } from "vitest";
import type { AttemptInput } from "@/lib/attempts/contract";
import { createMemorySink } from "./memory-sink";

const attempt: AttemptInput = {
  id: "22222222-2222-4222-8222-222222222222", exerciseId: "d001-listen-01", sessionId: "11111111-1111-4111-8111-111111111111",
  source: "lesson", attemptNo: 1, answer: { kind: "choice", selected: 0 }, createdAt: "2026-11-25T10:00:00.000Z",
};

describe("createMemorySink", () => {
  it("keeps attempts in memory and counts them", () => {
    const sink = createMemorySink();
    const cb = vi.fn();
    sink.subscribe(cb);
    sink.sendAttempt(attempt);
    expect(sink.pendingCount()).toBe(1);
    expect(cb).toHaveBeenCalled();
  });

  it("completeLesson resolves queued", async () => {
    const sink = createMemorySink();
    await expect(sink.completeLesson({ day: 1, sessionId: attempt.sessionId, completedAt: attempt.createdAt })).resolves.toEqual({ status: "queued" });
  });

  it("unsubscribe stops notifications", () => {
    const sink = createMemorySink();
    const cb = vi.fn();
    sink.subscribe(cb)();
    sink.sendAttempt(attempt);
    expect(cb).not.toHaveBeenCalled();
  });
});
