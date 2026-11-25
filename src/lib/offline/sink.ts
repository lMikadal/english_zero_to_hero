// The seam between the lesson player and the offline queue. Types only (client-safe).
// The HTTP implementation (IndexedDB queue, retries) is built in a later PR; tests use fakes.
import type { AttemptInput, CompleteLessonRequest, CompleteLessonResponse } from "@/lib/attempts/contract";

/**
 * - `done`: the server answered 200.
 * - `queued`: it could not be sent now (offline, 5xx, or earlier items still pending after one flush attempt);
 *   it will be sent later, in order.
 * - `rejected`: 400 or 409 (locked day). Dropped; resending gives the same answer.
 */
export type CompleteResult =
  | { status: "done"; response: CompleteLessonResponse }
  | { status: "queued" }
  | { status: "rejected"; code: 400 | 409 };

/**
 * Strict first-in first-out. Batches never cross a `completeLesson` boundary: attempts queued after a completion
 * are not sent before it. `completeLesson` is sent only after every earlier attempt.
 */
export interface SyncSink {
  /** Never throws; keeps the item if sending fails. */
  sendAttempt(a: AttemptInput): void;
  completeLesson(c: CompleteLessonRequest): Promise<CompleteResult>;
  pendingCount(): number;
  subscribe(cb: () => void): () => void;
}
