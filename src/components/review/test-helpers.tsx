// Test support only: a fixed clock, fake review queues and a fake sink shared by the review page tests.
import { vi, type Mock } from "vitest";
import type { ReviewDirection, ReviewQueue } from "@/lib/srs/contract";
import { toWire } from "@/lib/srs/contract";
import { applyRating, newCardState, type CardState } from "@/lib/srs/scheduler";
import type { CompleteResult, SyncSink } from "@/lib/offline/sink";
import type { CompleteReviewResponse } from "@/lib/srs/contract";

/** 12:00 in Bangkok. The one clock every review test injects. */
export const NOW = new Date("2026-11-27T05:00:00Z");
export const TZ = "Asia/Bangkok";
export const END_OF_TODAY = "2026-11-27T17:00:00.000Z"; // 00:00 on 28 November in Bangkok

/** A real Review-state card (built by the real scheduler), due at `due`. */
export function reviewState(due: string): CardState {
  let s = newCardState(new Date("2026-10-01T05:00:00Z"));
  let at = s.due;
  for (let i = 0; i < 10 && s.state !== 2; i++) {
    s = applyRating(s, 3, at, TZ);
    at = s.due;
  }
  if (s.state !== 2) throw new Error("fixture: the card did not reach Review");
  return { ...s, due: new Date(due) };
}
export const newState = (due = "2026-11-27T00:00:00Z"): CardState => newCardState(new Date(due));

export const WORDS = {
  country: { word: "country", ipa: "/ˈkʌntri/", th: "ประเทศ", example: { en: "Thailand is a big country.", th: "ไทยเป็นประเทศที่ใหญ่" } },
  friend: { word: "friend", ipa: "/frend/", th: "เพื่อน", example: { en: "She is my friend.", th: "เธอเป็นเพื่อนของฉัน" } },
  water: { word: "water", ipa: "/ˈwɔːtər/", th: "น้ำ", example: { en: "I drink water.", th: "ฉันดื่มน้ำ" } },
  hello: { word: "hello", ipa: "/həˈloʊ/", th: "สวัสดี", example: { en: "Hello, nice to meet you.", th: "สวัสดี ยินดีที่ได้รู้จัก" } },
  book: { word: "book", ipa: "/bʊk/", th: "หนังสือ", example: { en: "This book is old.", th: "หนังสือเล่มนี้เก่า" } },
} as const;
export type WordKey = keyof typeof WORDS;

export type CardSpec = [WordKey, ReviewDirection, CardState?];
export function makeQueue(specs: CardSpec[], over: Partial<ReviewQueue> = {}): ReviewQueue {
  return {
    today: "2026-11-27", endOfToday: END_OF_TODAY, timeZone: TZ,
    cards: specs.map(([k, direction, state]) => ({ vocabId: `v-${k}`, direction, state: toWire(state ?? reviewState("2026-11-27T03:00:00Z")), ...WORDS[k] })),
    ...over,
  };
}

export type FakeSink = SyncSink & {
  sendReview: Mock<SyncSink["sendReview"]>;
  completeReview: Mock<SyncSink["completeReview"]>;
  setPending(n: number): void;
};
/** `result` is what completeReview answers (a fresh object per call). */
export function fakeSink(result: CompleteResult<CompleteReviewResponse> = { status: "queued" }): FakeSink {
  let pending = 0;
  const listeners = new Set<() => void>();
  return {
    sendAttempt: vi.fn(),
    completeLesson: vi.fn(async () => ({ status: "queued" as const })),
    completePractice: vi.fn(async () => ({ status: "queued" as const })),
    completeCheckpoint: async () => ({ status: "queued" as const }),
    sendReview: vi.fn<SyncSink["sendReview"]>(),
    completeReview: vi.fn<SyncSink["completeReview"]>(async () => result),
    pendingCount: () => pending,
    subscribe: (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    setPending(n) { pending = n; listeners.forEach((cb) => cb()); },
  };
}
