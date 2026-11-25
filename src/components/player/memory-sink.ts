// TODO(wiring PR): temporary. The day page uses this until the real HTTP/IndexedDB sink
// (src/lib/offline/http-sink.ts) exists; then DayPlayer swaps it and this file can go.
import type { AttemptInput } from "@/lib/attempts/contract";
import type { SyncSink } from "@/lib/offline/sink";

export function createMemorySink(): SyncSink {
  const attempts: AttemptInput[] = [];
  const listeners = new Set<() => void>();
  return {
    sendAttempt(a) {
      attempts.push(a);
      listeners.forEach((cb) => cb());
    },
    async completeLesson() {
      return { status: "queued" };
    },
    pendingCount: () => attempts.length,
    subscribe(cb) {
      listeners.add(cb);
      return () => { listeners.delete(cb); };
    },
  };
}
