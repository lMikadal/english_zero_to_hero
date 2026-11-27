// The state of one review session, as a pure reducer (docs/plans/vocab-review-plan.md 2.3).
// Time and zone are inputs: `now` comes with each action (from the one injected clock) and the zone from ReviewQueue.timeZone.
import { fromWire, type ReviewQueue, type WireCardState } from "@/lib/srs/contract";
import { formatInterval } from "@/lib/srs/format";
import { cardKey, endOfToday, isDueBefore, requeue, sessionCounter, type QueueCard } from "@/lib/srs/queue";
import { RATINGS, applyRating, type Rating } from "@/lib/srs/scheduler";

/** A card of the queue with what the screen shows (word, IPA, Thai, example). */
export type ReviewItem = QueueCard & { word: string; ipa: string; th: string; example: { en: string; th: string } | null };

export type SessionState = {
  /** The cards left, head first. A card that comes back is in here again, once. */
  queue: ReviewItem[];
  /** n of "x / n": the cards due when the session began. */
  total: number;
  /** The server's end of the learner's local day when the page loaded: decides "still due today" until the first answer. */
  endOfToday: Date;
  /**
   * The end of the local day of the session's FIRST answer (computed with `timeZone`), fixed from then on. It replaces
   * `endOfToday` once set: the server takes the day of the first stored review, so a page loaded before midnight and
   * answered after it must follow the new day (plan 2.4, rule 15).
   */
  sessionEnd: Date | null;
  timeZone: string;
  side: "front" | "back";
  /** When the card was turned over: the buttons' intervals are computed for this moment. */
  revealedAt: Date | null;
  counts: Record<Rating, number>;
  phase: "playing" | "complete";
  /** Every card of the session by key, as it was served (content for a card the server brings back). */
  items: Record<string, ReviewItem>;
  /** A short Thai note for the live region after a card was dropped (the server rejected its review); cleared by the next rating. */
  notice: string | null;
  /** Counts the times a dropped card was on screen with its back showing: the screen moves focus to the heading each time it grows. */
  refocus: number;
  /** What the last rating did, for the live region. */
  last: { rating: Rating; interval: string; again: boolean } | null;
};

export type SessionAction =
  | { type: "reveal"; now: Date }
  | { type: "rate"; rating: Rating; now: Date }
  /**
   * The server answered a review with its card: it replaces the local state of that card, and it decides whether the card
   * is still due today (out of the queue if not, back in if the client had finished it).
   */
  | { type: "server"; key: string; card: WireCardState }
  /** The server rejected the review (or it can never be sent): the card leaves the session. */
  | { type: "drop"; key: string };

export const DROPPED_NOTICE = "บันทึกใบนี้ไม่ได้ จึงข้ามไป";

const zeroCounts = (): Record<Rating, number> => ({ 1: 0, 2: 0, 3: 0, 4: 0 });

export function createSession(q: ReviewQueue): SessionState {
  const queue = q.cards.map((c): ReviewItem => ({ ...c, state: fromWire(c.state) }));
  return {
    queue, total: queue.length, endOfToday: new Date(q.endOfToday), sessionEnd: null, refocus: 0, timeZone: q.timeZone,
    side: "front", revealedAt: null, counts: zeroCounts(), phase: queue.length === 0 ? "complete" : "playing", last: null, notice: null,
    items: Object.fromEntries(queue.map((c) => [cardKey(c), c])),
  };
}

/** The end of the day that decides "still due today": the first answer's day once there is one, else the payload's. */
const dayEnd = (s: SessionState): Date => s.sessionEnd ?? s.endOfToday;

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
      const sessionEnd = s.sessionEnd ?? endOfToday(a.now, s.timeZone);
      const queue = requeue(rest, { ...head, state: next }, next.due, sessionEnd);
      return {
        ...s, queue, sessionEnd, side: "front", revealedAt: null, counts: { ...s.counts, [a.rating]: s.counts[a.rating] + 1 },
        phase: queue.length === 0 ? "complete" : "playing", notice: null,
        last: { rating: a.rating, interval: formatInterval(next.due.getTime() - a.now.getTime()), again: queue.some((c) => cardKey(c) === cardKey(head)) },
      };
    }
    case "server": {
      const item = s.items[a.key];
      if (!item || s.phase !== "playing") return s;
      const state = fromWire(a.card);
      const stillDue = isDueBefore(state.due, dayEnd(s));
      const at = s.queue.findIndex((c) => cardKey(c) === a.key);
      if (at >= 0) return stillDue ? { ...s, queue: s.queue.map((c, i) => (i === at ? { ...c, state } : c)) } : without(s, at, null);
      if (!stillDue) return s;
      return { ...s, queue: requeue(s.queue, { ...item, state }, state.due, dayEnd(s)) };
    }
    case "drop": {
      const at = s.queue.findIndex((c) => cardKey(c) === a.key);
      if (at < 0 || s.phase !== "playing") return s;
      return { ...without(s, at, DROPPED_NOTICE), refocus: s.refocus + (at === 0 && s.side === "back" ? 1 : 0) };
    }
  }
}

/** The card at `at` leaves the queue. If it was the one on screen, the next card starts on its front. */
function without(s: SessionState, at: number, notice: string | null): SessionState {
  const queue = s.queue.filter((_, i) => i !== at);
  return {
    ...s, queue, notice: notice ?? s.notice, phase: queue.length === 0 ? "complete" : "playing",
    ...(at === 0 ? { side: "front" as const, revealedAt: null } : {}),
  };
}
