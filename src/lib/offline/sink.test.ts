import { expect, expectTypeOf, it } from "vitest";
import type { AttemptInput, CompleteLessonRequest, CompleteLessonResponse } from "@/lib/attempts/contract";
import type { SyncSink } from "./sink";

it("SyncSink has the documented shape and can be faked", async () => {
  expectTypeOf<SyncSink["sendAttempt"]>().toEqualTypeOf<(a: AttemptInput) => void>();
  expectTypeOf<SyncSink["completeLesson"]>().toEqualTypeOf<
    (c: CompleteLessonRequest) => Promise<CompleteLessonResponse | { queued: true }>
  >();
  expectTypeOf<SyncSink["pendingCount"]>().toEqualTypeOf<() => number>();
  expectTypeOf<SyncSink["subscribe"]>().toEqualTypeOf<(cb: () => void) => () => void>();

  const sent: AttemptInput[] = [];
  const fake: SyncSink = {
    sendAttempt: (a) => void sent.push(a),
    completeLesson: async () => ({ queued: true }),
    pendingCount: () => sent.length,
    subscribe: () => () => {},
  };
  expect(await fake.completeLesson({ day: 1, sessionId: "11111111-2222-4333-8444-555555555555", completedAt: "2026-11-25T10:00:00Z" })).toEqual({ queued: true });
});
