// The seam between the lesson player and the offline queue. Types only (client-safe).
// The HTTP implementation (IndexedDB queue, retries) is built in a later PR; tests use fakes.
import type {
  AttemptInput,
  CompleteCheckpointRequest,
  CompleteCheckpointResponse,
  CompleteLessonRequest,
  CompleteLessonResponse,
  CompletePracticeRequest,
  CompletePracticeResponse,
} from "@/lib/attempts/contract";
import type { CompleteReviewRequest, CompleteReviewResponse, ReviewInput } from "@/lib/srs/contract";

/**
 * - `done`: the server answered 200.
 * - `queued`: it could not be sent now (offline, 5xx, or earlier items still pending after one flush attempt);
 *   it will be sent later, in order.
 * - `rejected`: 400 or 409 (locked day). Dropped; resending gives the same answer.
 */
export type CompleteResult<R = CompleteLessonResponse> =
  | { status: "done"; response: R }
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
  /** Same FIFO rules as `completeLesson`, to POST /api/practice/complete (never touches progress). */
  completePractice(c: CompletePracticeRequest): Promise<CompleteResult<CompletePracticeResponse>>;
  /**
   * Same FIFO rules as `completeLesson`, to POST /api/checkpoints/complete (never touches progress). Deduplicated in
   * the queue by afterDay and sessionId, so completing the same sitting twice sends once.
   */
  completeCheckpoint(c: CompleteCheckpointRequest): Promise<CompleteResult<CompleteCheckpointResponse>>;
  /** A vocabulary review (docs/plans/vocab-review-plan.md 5.3). Never throws; deduplicated in the queue by id. */
  sendReview(r: ReviewInput): void;
  /** Same FIFO rules as `completeLesson`, to POST /api/reviews/complete (only touches the streak). */
  completeReview(c: CompleteReviewRequest): Promise<CompleteResult<CompleteReviewResponse>>;
  pendingCount(): number;
  subscribe(cb: () => void): () => void;
}
