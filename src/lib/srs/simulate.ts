// How much work does the review create? A deterministic simulation of one learner that uses the REAL scheduler,
// initialDues, orderQueue and requeue (docs/plans/vocab-review-plan.md 2.7 and 4). Pure: the "clock" is a counter
// starting on 2026-01-01, the random numbers come from a seeded generator.
//
// Model: every day the learner reviews everything that is due (at 12:00 UTC, one press every `secondsPerPress`
// seconds) and, on lesson days, finishes a lesson at 18:00 whose words become cards. A card that is still due today
// after a press comes back after 3 other cards, exactly as in the app. Each press is Again with probability
// `againRate`; otherwise Hard 15%, Good 65%, Easy 20% of the remaining presses.
import { type ReviewDirection } from "./contract";
import { initialDues } from "./initial";
import { cardKey, endOfToday, isDueToday, orderQueue, requeue, type QueueCard } from "./queue";
import { applyRating, newCardState, type Rating } from "./scheduler";

export type SimulationInput = {
  /** New words in each lesson that has words. 0 for none. */
  wordsPerLessonDay: number;
  days: number;
  /** Probability that a press is "Again" (0 to 1, exclusive of 1). */
  againRate: number;
  /** Days of a 7-day week (the first ones) whose lesson has new words. Default 5. */
  newWordDaysPerWeek?: number;
  /** Words whose lessons were finished before the feature: their cards are created on day 1. */
  backfillWords?: number;
  /** Days with no review and no lesson (inclusive). */
  offDays?: { from: number; to: number };
  seed?: number;
  secondsPerPress?: number;
  timeZone?: string;
};

export type DayLoad = {
  day: number;
  /** Cards due when the learner would sit down. */
  due: number;
  /** Of those, cards never reviewed before. */
  newCards: number;
  presses: number;
  minutes: number;
};

export type SimulationResult = { days: DayLoad[]; meanPresses(from: number, to: number): number };

const DAY_MS = 86_400_000;
const START = Date.UTC(2026, 0, 1);

/** mulberry32 */
function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function simulateLoad(input: SimulationInput): SimulationResult {
  const { wordsPerLessonDay, days, againRate, newWordDaysPerWeek = 5, backfillWords = 0, offDays, seed = 1, secondsPerPress = 10, timeZone = "UTC" } = input;
  const rand = random(seed);
  const cards = new Map<string, QueueCard>();
  const teach = new Map<string, number>();
  let words = 0;
  const addWord = (dues: Record<ReviewDirection, Date>) => {
    const vocabId = `v-sim${words}`;
    teach.set(vocabId, words++);
    for (const direction of Object.keys(dues) as ReviewDirection[]) {
      const c: QueueCard = { vocabId, direction, state: newCardState(dues[direction]) };
      cards.set(cardKey(c), c);
    }
  };
  const pickRating = (): Rating => {
    if (rand() < againRate) return 1;
    const u = rand();
    return u < 0.15 ? 2 : u < 0.8 ? 3 : 4;
  };

  const rows: DayLoad[] = [];
  for (let day = 1; day <= days; day++) {
    const dayStart = START + (day - 1) * DAY_MS;
    const sessionStart = new Date(dayStart + 12 * 3_600_000);
    const off = offDays !== undefined && day >= offDays.from && day <= offDays.to;
    if (day === 1) for (let i = 0; i < backfillWords; i++) addWord(initialDues({ kind: "backfill" }, sessionStart, timeZone));

    const dueCards = [...cards.values()].filter((c) => isDueToday(c.state.due, sessionStart, timeZone));
    let presses = 0;
    if (!off) {
      const end = endOfToday(sessionStart, timeZone);
      let queue = orderQueue(dueCards, teach);
      while (queue.length > 0 && presses < 100_000) {
        const [card, ...rest] = queue;
        const now = new Date(sessionStart.getTime() + presses * secondsPerPress * 1000);
        const next = applyRating(card.state, pickRating(), now);
        presses++;
        const updated = { ...card, state: next };
        cards.set(cardKey(card), updated);
        queue = requeue(rest, updated, next.due, end);
      }
    }
    rows.push({ day, due: dueCards.length, newCards: dueCards.filter((c) => c.state.state === 0).length, presses, minutes: (presses * secondsPerPress) / 60 });

    const lessonDay = wordsPerLessonDay > 0 && !off && (day - 1) % 7 < newWordDaysPerWeek;
    if (lessonDay) {
      const completedAt = new Date(dayStart + 18 * 3_600_000);
      for (let i = 0; i < wordsPerLessonDay; i++) addWord(initialDues({ kind: "lesson", completedAt }, completedAt, timeZone));
    }
  }
  return {
    days: rows,
    meanPresses(from, to) {
      const sel = rows.filter((r) => r.day >= from && r.day <= to);
      return sel.length === 0 ? 0 : sel.reduce((s, r) => s + r.presses, 0) / sel.length;
    },
  };
}

