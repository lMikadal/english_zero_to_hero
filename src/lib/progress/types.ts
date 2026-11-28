// Narrow structural input types for the progress formulas (docs/PROGRESS.md). Field names match the
// TS property names in src/db/schema.ts so database rows can be passed in directly, but nothing here
// imports Drizzle: the formulas stay pure and their tests need no database.

export type AttemptSourceLike = "lesson" | "drill" | "retest" | "checkpoint" | "practice" | "checkpoint_retake";
export type SrsDirectionLike = "en_th" | "th_en" | "listen_spell" | "speak";
export type ProgressStatusLike = "not_started" | "in_progress" | "done";

export type AttemptLike = {
  day: number;
  skill: string;
  exerciseType: string;
  correct: boolean;
  /** fraction 0..1; null for ungraded attempts (self-rated speaking, free_write) */
  score: number | null;
  /** 1 = first try, 2 = the end-of-lesson retry */
  attemptNo: number;
  tags: readonly string[];
  source: AttemptSourceLike;
  sessionId: string | null;
  createdAt: Date;
};

export type SrsCardLike = {
  vocabId: string;
  direction: SrsDirectionLike;
  stability: number;
  lapses: number;
  /** ts-fsrs State: 0 New, 1 Learning, 2 Review, 3 Relearning */
  state: number;
};

export type SrsReviewLike = {
  vocabId: string;
  direction: SrsDirectionLike;
  /** 1 Again, 2 Hard, 3 Good, 4 Easy */
  rating: number;
  reviewedAt: Date;
  /** jsonb snapshot of the card before the review; only `state` is read, defensively */
  stateBefore: unknown;
};

/** A finished checkpoint sitting, as the CEFR estimate reads it (`checkpoint_results` rows pass in directly). */
export type CheckpointResultLike = {
  /** The checkpoint's day: 30, 60, ... 360 */
  afterDay: number;
  /** fraction 0..1 */
  score: number;
};

export type ProgressLike = {
  day: number;
  status: ProgressStatusLike;
  /** fraction 0..1 (0.7 = 70%) */
  score: number | null;
  completedAt: Date | null;
};

/** The part of a VocabItem (src/lib/content/schema.ts) the formulas need. */
export type VocabBankItem = {
  id: string;
  oxford: { list: "3000" | "5000"; level: string };
};
