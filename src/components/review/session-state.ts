// The state of one review session, as a pure reducer (docs/plans/vocab-review-plan.md 2.3).
// Time and zone are inputs: `now` comes with each action (from the one injected clock) and the zone from ReviewQueue.timeZone.
import { fromWire, type ReviewQueue, type WireCardState } from "@/lib/srs/contract";
import { formatInterval } from "@/lib/srs/format";
import { cardKey, requeue, sessionCounter, type QueueCard } from "@/lib/srs/queue";
import { RATINGS, applyRating, type Rating } from "@/lib/srs/scheduler";

/** A card of the queue with what the screen shows (word, IPA, Thai, example). */
export type ReviewItem = QueueCard & { word: string; ipa: string; th: string; example: { en: string; th: string } | null };

export type SessionState = {
  /** The cards left, head first. A card that comes back is in here again, once. */
  queue: ReviewItem[];
  /** n of "x / n": the cards due when the session began. */
  total: number;
  /** The server's end of the learner's local day, fixed at the start. */
  endOfToday: Date;
  timeZone: string;
  side: "front" | "back";
  /** When the card was turned over: the buttons' intervals are computed for this moment. */
  revealedAt: Date | null;
  counts: Record<Rating, number>;
  phase: "playing" | "complete";
  /** What the last rating did, for the live region. */
  last: { rating: Rating; interval: string; again: boolean } | null;
};

export type SessionAction =
  | { type: "reveal"; now: Date }
  | { type: "rate"; rating: Rating; now: Date }
  /** The server answered a review with its card: it replaces the local state of that card. */
  | { type: "server"; key: string; card: WireCardState };

const zeroCounts = (): Record<Rating, number> => ({ 1: 0, 2: 0, 3: 0, 4: 0 });

export function createSession(q: ReviewQueue): SessionState {
  const queue = q.cards.map((c): ReviewItem => ({ ...c, state: fromWire(c.state) }));
  return {
    queue, total: queue.length, endOfToday: new Date(q.endOfToday), timeZone: q.timeZone,
    side: "front", revealedAt: null, counts: zeroCounts(), phase: queue.length === 0 ? "complete" : "playing", last: null,
  };
}

export const counterOf = (s: SessionState) => sessionCounter(s.total, s.queue);
export const RATING_LIST = RATINGS;

export function sessionReducer(s: SessionState, a: SessionAction): SessionState {
  switch (a.type) {
    case "reveal":
      if (s.phase !== "playing" || s.side !== "front") return s;
      return { ...s, side: "back", revealedAt: a.now };
    case "rate": {
      if (s.phase !== "playing" || s.side !== "back") return s;
      const [head, ...rest] = s.queue;
      const next = applyRating(head.state, a.rating, a.now, s.timeZone);
      const queue = requeue(rest, { ...head, state: next }, next.due, s.endOfToday);
      return {
        ...s, queue, side: "front", revealedAt: null, counts: { ...s.counts, [a.rating]: s.counts[a.rating] + 1 },
        phase: queue.length === 0 ? "complete" : "playing",
        last: { rating: a.rating, interval: formatInterval(next.due.getTime() - a.now.getTime()), again: queue.some((c) => cardKey(c) === cardKey(head)) },
      };
    }
    case "server": {
      if (!s.queue.some((c) => cardKey(c) === a.key)) return s;
      const state = fromWire(a.card);
      return { ...s, queue: s.queue.map((c) => (cardKey(c) === a.key ? { ...c, state } : c)) };
    }
  }
}
