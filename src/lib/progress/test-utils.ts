import type { AttemptLike, SrsCardLike, SrsReviewLike } from "./types";

export const DAY = 86_400_000;
export const NOW = new Date("2026-06-15T05:00:00Z"); // 12:00 in Bangkok

export const daysAgo = (n: number, from: Date = NOW) => new Date(from.getTime() - n * DAY);

export function attempt(over: Partial<AttemptLike> = {}): AttemptLike {
  const correct = over.correct ?? true;
  return {
    score: correct ? 1 : 0,
    attemptNo: 1,
    day: 10,
    skill: "reading",
    exerciseType: "multiple_choice",
    tags: [],
    source: "lesson",
    sessionId: null,
    createdAt: NOW,
    ...over,
    correct,
  };
}

export function card(over: Partial<SrsCardLike> = {}): SrsCardLike {
  return { vocabId: "v-cat", direction: "en_th", stability: 0, lapses: 0, state: 2, ...over };
}

export function review(over: Partial<SrsReviewLike> = {}): SrsReviewLike {
  return {
    vocabId: "v-cat",
    direction: "en_th",
    rating: 3,
    reviewedAt: NOW,
    stateBefore: { state: 2 },
    ...over,
  };
}
