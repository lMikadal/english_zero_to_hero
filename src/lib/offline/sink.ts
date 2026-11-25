// The seam between the lesson player and the offline queue. Types only (client-safe).
// The HTTP implementation (IndexedDB queue, retries) is built in a later PR; tests use fakes.
import type { AttemptInput, CompleteLessonRequest, CompleteLessonResponse } from "@/lib/attempts/contract";

/** First-in first-out; `completeLesson` is sent only after every earlier attempt. */
export interface SyncSink {
  /** Never throws; keeps the item if sending fails. */
  sendAttempt(a: AttemptInput): void;
  completeLesson(c: CompleteLessonRequest): Promise<CompleteLessonResponse | { queued: true }>;
  pendingCount(): number;
  subscribe(cb: () => void): () => void;
}
