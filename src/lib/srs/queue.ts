// The order of a review session and what happens after a rating. Pure and client-safe (docs/plans/vocab-review-plan.md 2.2/2.3).
import { addDays, localDate, localMidnight } from "@/lib/progress/dates";
import { REQUEUE_GAP, SIBLING_GAP } from "./config";
import { REVIEW_DIRECTIONS, type ReviewDirection } from "./contract";
import type { CardState } from "./scheduler";

export type QueueCard = { vocabId: string; direction: ReviewDirection; state: CardState };

export const cardKey = (c: Pick<QueueCard, "vocabId" | "direction">): string => `${c.vocabId}|${c.direction}`;

/** The first instant after today in the learner's time zone. */
export function endOfToday(now: Date, timeZone: string): Date {
  return localMidnight(addDays(localDate(now, timeZone), 1), timeZone);
}

/** `due` is before `end` (compute `end` once with endOfToday for a whole queue: it costs dozens of Intl calls). */
export function isDueBefore(due: Date, end: Date): boolean {
  return due.getTime() < end.getTime();
}

/** One definition of "due today" for every state: due before the next local midnight. For many cards use endOfToday once and isDueBefore. */
export function isDueToday(due: Date, now: Date, timeZone: string): boolean {
  return isDueBefore(due, endOfToday(now, timeZone));
}

const directionIndex = (d: ReviewDirection) => REVIEW_DIRECTIONS.indexOf(d);

/**
 * Walks the queue front to back and, at each position, takes the first remaining card whose sibling (same word) is not
 * among the previous SIBLING_GAP - 1 cards. If every remaining card conflicts (unavoidable), the one whose sibling is
 * furthest back is taken (the first of those on a tie), so the pair that is left is as far apart as it can be.
 * The other cards keep their order. A queue that already satisfies the rule comes back unchanged.
 */
export function separateSiblings<T extends { vocabId: string }>(queue: readonly T[]): T[] {
  const remaining = [...queue];
  const out: T[] = [];
  while (remaining.length > 0) {
    const recent = out.slice(-(SIBLING_GAP - 1));
    let pick = remaining.findIndex((c) => !recent.some((p) => p.vocabId === c.vocabId));
    if (pick === -1) {
      // every candidate conflicts: distance back to its sibling, larger is better; the first wins a tie
      let best = -1;
      remaining.forEach((c, i) => {
        const back = out.length - out.map((p) => p.vocabId).lastIndexOf(c.vocabId);
        if (back > best) [best, pick] = [back, i];
      });
    }
    out.push(remaining.splice(pick, 1)[0]);
  }
  return out;
}

/**
 * Reviews first (state 1-3, oldest due first), then new cards (state 0): every en_th in teaching order, then every th_en
 * in teaching order (direction first, so the two cards of a word are a whole direction apart); ties by
 * vocab id and direction, so the result never depends on input order. Siblings are then kept apart.
 * `teachOrder` maps a vocab id to its position in the course (day, then place in the lesson).
 */
export function orderQueue(cards: readonly QueueCard[], teachOrder: ReadonlyMap<string, number>): QueueCard[] {
  const position = (c: QueueCard) => teachOrder.get(c.vocabId) ?? Number.MAX_SAFE_INTEGER;
  const tie = (a: QueueCard, b: QueueCard) => (a.vocabId < b.vocabId ? -1 : a.vocabId > b.vocabId ? 1 : directionIndex(a.direction) - directionIndex(b.direction));
  const reviews = cards.filter((c) => c.state.state !== 0).sort((a, b) => a.state.due.getTime() - b.state.due.getTime() || tie(a, b));
  const fresh = cards
    .filter((c) => c.state.state === 0)
    .sort((a, b) => directionIndex(a.direction) - directionIndex(b.direction) || position(a) - position(b) || tie(a, b));
  return separateSiblings([...reviews, ...fresh]);
}

/**
 * `queue` is what is left after the card was taken off the front. If the card's next due is still today it goes back
 * after REQUEUE_GAP other cards (the end of the queue when fewer are left), then siblings are kept apart again.
 */
export function requeue<T extends { vocabId: string }>(queue: readonly T[], card: T, nextDue: Date, endOfTodayAt: Date): T[] {
  if (nextDue.getTime() >= endOfTodayAt.getTime()) return [...queue];
  const at = Math.min(REQUEUE_GAP, queue.length);
  return separateSiblings([...queue.slice(0, at), card, ...queue.slice(at)]);
}

/** The "x / n" and the progress bar. n = cards due when the session began; a card that comes back is counted once. */
export function sessionCounter(total: number, queue: readonly QueueCard[]): { x: number; n: number; fraction: number } {
  if (total === 0) return { x: 0, n: 0, fraction: 1 };
  const left = new Set(queue.map(cardKey)).size;
  const passed = Math.max(0, total - left);
  return { x: Math.min(total, passed + 1), n: total, fraction: passed / total };
}
