import { describe, expect, it } from "vitest";
import { REQUEUE_GAP, SIBLING_GAP } from "./config";
import { REVIEW_DIRECTIONS, type ReviewDirection } from "./contract";
import {
  cardKey, endOfToday, isDueBefore, isDueToday, orderQueue, requeue, separateSiblings, sessionCounter, type QueueCard,
} from "./queue";
import { applyRating, newCardState, type CardState } from "./scheduler";

const BKK = "Asia/Bangkok";
const NOW = new Date("2026-11-26T05:00:00Z"); // 12:00 on 26 Nov, Bangkok
const END = endOfToday(NOW, BKK);

function card(vocabId: string, direction: ReviewDirection, over: Partial<CardState> = {}): QueueCard {
  return { vocabId, direction, state: { ...newCardState(NOW), ...over } };
}
const review = (vocabId: string, direction: ReviewDirection, dueMinutesAgo: number): QueueCard =>
  card(vocabId, direction, { state: 2, stability: 5, difficulty: 5, reps: 3, due: new Date(NOW.getTime() - dueMinutesAgo * 60_000), lastReview: new Date(NOW.getTime() - 5 * 86_400_000) });
const keys = (q: readonly QueueCard[]) => q.map(cardKey);
const TEACH = new Map([["v-a", 0], ["v-b", 1], ["v-c", 2], ["v-d", 3], ["v-e", 4], ["v-f", 5]]);

describe("isDueToday / endOfToday", () => {
  it("end of today is the next local midnight (Bangkok: 17:00Z)", () => {
    expect(endOfToday(NOW, BKK).toISOString()).toBe("2026-11-26T17:00:00.000Z");
    expect(endOfToday(NOW, "UTC").toISOString()).toBe("2026-11-27T00:00:00.000Z");
  });
  it("Asia/Bangkok: 23:59 today is due, 00:00 tomorrow is not", () => {
    expect(isDueToday(new Date("2026-11-26T16:59:00Z"), NOW, BKK)).toBe(true);
    expect(isDueToday(new Date("2026-11-26T17:00:00Z"), NOW, BKK)).toBe(false);
    expect(isDueToday(new Date("2026-11-26T16:59:59.999Z"), NOW, BKK)).toBe(true);
  });
  it("UTC: the same instants fall on the other side", () => {
    expect(isDueToday(new Date("2026-11-26T23:59:00Z"), NOW, "UTC")).toBe(true);
    expect(isDueToday(new Date("2026-11-27T00:00:00Z"), NOW, "UTC")).toBe(false);
  });
  it("overdue cards are due, in any state", () => {
    expect(isDueToday(new Date("2020-01-01T00:00:00Z"), NOW, BKK)).toBe(true);
  });
  it("a card due later today (the evening) is due even though now is noon", () => {
    expect(isDueToday(new Date("2026-11-26T15:00:00Z"), NOW, BKK)).toBe(true);
  });
});

describe("isDueBefore (the boundary computed once per queue, not once per card)", () => {
  it("is exactly `due < end`", () => {
    expect(isDueBefore(new Date(END.getTime() - 1), END)).toBe(true);
    expect(isDueBefore(END, END)).toBe(false);
    expect(isDueBefore(new Date(END.getTime() + 1), END)).toBe(false);
  });
  it("agrees with isDueToday for the same moment and zone", () => {
    for (const due of ["2026-11-26T16:59:59.999Z", "2026-11-26T17:00:00.000Z", "2020-01-01T00:00:00.000Z", "2026-12-01T00:00:00.000Z"]) {
      expect(isDueBefore(new Date(due), END)).toBe(isDueToday(new Date(due), NOW, BKK));
    }
  });
});

describe("orderQueue", () => {
  it("reviews first (oldest due first), then new cards in teaching order, en_th before th_en", () => {
    const q = orderQueue(
      [
        card("v-b", "th_en"), card("v-a", "th_en"), card("v-b", "en_th"), card("v-a", "en_th"),
        review("v-d", "en_th", 30), review("v-c", "th_en", 600), review("v-e", "en_th", 120),
      ],
      TEACH,
    );
    // reviews: v-c (600 min ago), v-e (120), v-d (30); then new: a/en, a/th, b/en, b/th (the sibling rule may move cards, so check the sets)
    expect(keys(q).slice(0, 3)).toEqual(["v-c|th_en", "v-e|en_th", "v-d|en_th"]);
    expect(new Set(keys(q).slice(3))).toEqual(new Set(["v-a|en_th", "v-a|th_en", "v-b|en_th", "v-b|th_en"]));
  });
  it("new cards: every en_th in teaching order, then every th_en in teaching order (siblings are far apart by construction)", () => {
    const q = orderQueue(
      ["v-c", "v-a", "v-b"].flatMap((w) => [card(w, "th_en"), card(w, "en_th")]),
      TEACH,
    );
    expect(keys(q)).toEqual(["v-a|en_th", "v-b|en_th", "v-c|en_th", "v-a|th_en", "v-b|th_en", "v-c|th_en"]);
  });
  it("5 words x 2 directions, all new (a missed day): no two siblings are adjacent and every gap is >= SIBLING_GAP", () => {
    const words = ["v-a", "v-b", "v-c", "v-d", "v-e"];
    const q = orderQueue(words.flatMap((w) => REVIEW_DIRECTIONS.map((d) => card(w, d))), TEACH);
    expect(q).toHaveLength(10);
    const at = new Map(q.map((c, i) => [cardKey(c), i]));
    for (const w of words) expect(Math.abs(at.get(`${w}|en_th`)! - at.get(`${w}|th_en`)!), w).toBeGreaterThanOrEqual(SIBLING_GAP);
  });
  it("reviews still come before new cards, and the new cards after them keep the direction-first order", () => {
    const q = orderQueue([card("v-a", "en_th"), card("v-a", "th_en"), card("v-b", "en_th"), card("v-b", "th_en"), review("v-c", "en_th", 5)], TEACH);
    expect(keys(q)).toEqual(["v-c|en_th", "v-a|en_th", "v-b|en_th", "v-a|th_en", "v-b|th_en"]);
  });
  it("new cards follow teaching order when there are no sibling conflicts", () => {
    const q = orderQueue([card("v-c", "en_th"), card("v-a", "en_th"), card("v-b", "en_th")], TEACH);
    expect(keys(q)).toEqual(["v-a|en_th", "v-b|en_th", "v-c|en_th"]);
  });
  it("learning and relearning cards (state 1, 3) are in the first group, by due", () => {
    const learning = card("v-a", "en_th", { state: 1, due: new Date(NOW.getTime() - 5 * 60_000) });
    const relearning = card("v-b", "en_th", { state: 3, due: new Date(NOW.getTime() - 50 * 60_000) });
    const fresh = card("v-c", "en_th");
    expect(keys(orderQueue([fresh, learning, relearning], TEACH))).toEqual(["v-b|en_th", "v-a|en_th", "v-c|en_th"]);
  });
  it("ties are broken by vocab id and then by direction order, so the result never depends on input order", () => {
    const a = [review("v-b", "th_en", 10), review("v-b", "en_th", 10), review("v-a", "en_th", 10), review("v-c", "en_th", 10)];
    const forward = keys(orderQueue(a, TEACH));
    const backward = keys(orderQueue([...a].reverse(), TEACH));
    expect(forward).toEqual(backward);
  });
  it("unknown vocab (not in the teaching order) goes after the known ones", () => {
    expect(keys(orderQueue([card("v-zzz", "en_th"), card("v-a", "en_th")], TEACH))).toEqual(["v-a|en_th", "v-zzz|en_th"]);
  });
  it("does not change its input", () => {
    const input = [card("v-b", "en_th"), card("v-a", "en_th")];
    const copy = [...input];
    orderQueue(input, TEACH);
    expect(input).toEqual(copy);
  });
  it("empty in, empty out", () => {
    expect(orderQueue([], TEACH)).toEqual([]);
  });
});

describe("siblings are kept apart (SIBLING_GAP)", () => {
  it("SIBLING_GAP is 4 and REQUEUE_GAP is 3", () => {
    expect([SIBLING_GAP, REQUEUE_GAP]).toEqual([4, 3]);
  });
  it("a pair that would sit next to each other is separated by at least SIBLING_GAP - 1 other cards", () => {
    const q = orderQueue(
      [review("v-a", "en_th", 100), review("v-a", "th_en", 99), review("v-b", "en_th", 98), review("v-c", "en_th", 97), review("v-d", "en_th", 96), review("v-e", "en_th", 95)],
      TEACH,
    );
    const i = keys(q).indexOf("v-a|en_th");
    const j = keys(q).indexOf("v-a|th_en");
    expect(Math.abs(i - j)).toBeGreaterThanOrEqual(SIBLING_GAP);
    expect(keys(q)).toHaveLength(6);
  });
  it("keeps the order of the other cards", () => {
    const q = separateSiblings([card("v-a", "en_th"), card("v-a", "th_en"), card("v-b", "en_th"), card("v-c", "en_th"), card("v-d", "en_th"), card("v-e", "en_th")]);
    expect(keys(q)).toEqual(["v-a|en_th", "v-b|en_th", "v-c|en_th", "v-d|en_th", "v-a|th_en", "v-e|en_th"]);
  });
  it("a short queue sends the second sibling to the end (not an endless loop)", () => {
    const q = separateSiblings([card("v-a", "en_th"), card("v-a", "th_en"), card("v-b", "en_th")]);
    expect(keys(q)).toEqual(["v-a|en_th", "v-b|en_th", "v-a|th_en"]);
  });
  it("when every remaining card conflicts, the one whose sibling is furthest back is taken (not simply the first)", () => {
    // after a, b, c the rest are b2 (sibling 1 back), a2 (sibling 3 back): a2 is the better choice
    const q = separateSiblings([card("v-a", "en_th"), card("v-b", "en_th"), card("v-c", "en_th"), card("v-b", "th_en"), card("v-a", "th_en")]);
    expect(keys(q)).toEqual(["v-a|en_th", "v-b|en_th", "v-c|en_th", "v-a|th_en", "v-b|th_en"]);
  });
  it("a queue of only one pair is shown as it is (it cannot be avoided)", () => {
    const q = separateSiblings([card("v-a", "en_th"), card("v-a", "th_en")]);
    expect(keys(q)).toEqual(["v-a|en_th", "v-a|th_en"]);
  });
  it("is idempotent: a queue that already satisfies the rule is returned unchanged", () => {
    const q = [card("v-a", "en_th"), card("v-b", "en_th"), card("v-c", "en_th"), card("v-d", "en_th"), card("v-a", "th_en")];
    expect(keys(separateSiblings(q))).toEqual(keys(q));
    const once = separateSiblings([card("v-a", "en_th"), card("v-a", "th_en"), card("v-b", "en_th")]);
    expect(keys(separateSiblings(once))).toEqual(keys(once));
  });

  /** mulberry32, fixed seeds: the property test is the same on every run. */
  function rng(seed: number) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  it("with every first card before every second card and 8 or more words, nobody is close to their sibling", () => {
    const first = ["a", "b", "c", "d", "e", "f", "g", "h"].map((w) => card(`v-${w}`, "en_th"));
    const second = first.map((c) => card(c.vocabId, "th_en"));
    const out = separateSiblings([...first, ...second]);
    out.forEach((c, i) => expect(out.slice(Math.max(0, i - (SIBLING_GAP - 1)), i).some((p) => p.vocabId === c.vocabId)).toBe(false));
  });

  it("property (1,000 seeded queues): the output is a permutation, and a close pair appears only when it cannot be avoided", () => {
    for (let seed = 1; seed <= 1000; seed++) {
      const rand = rng(seed);
      const words = 1 + Math.floor(rand() * 14);
      const input: QueueCard[] = [];
      for (let w = 0; w < words; w++) {
        const id = `v-w${w}`;
        if (rand() < 0.85) input.push(card(id, "en_th"));
        if (rand() < 0.85) input.push(card(id, "th_en"));
      }
      // shuffle
      for (let i = input.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [input[i], input[j]] = [input[j], input[i]];
      }
      const out = separateSiblings(input);
      expect(keys(out).sort(), `seed ${seed}`).toEqual(keys(input).sort());
      const sibling = (a: QueueCard, b: QueueCard) => a.vocabId === b.vocabId;
      out.forEach((c, i) => {
        const near = out.slice(Math.max(0, i - (SIBLING_GAP - 1)), i);
        if (!near.some((p) => sibling(p, c))) return;
        // a violation at i is allowed only if EVERY card from i onward conflicts with the cards just before i
        for (let k = i; k < out.length; k++) {
          expect(near.some((p) => sibling(p, out[k])), `seed ${seed}: a card at ${k} could have been moved up to ${i}`).toBe(true);
        }
      });
    }
  });
});

describe("requeue (after a rating, a card that is still due today comes back)", () => {
  const rest = (...ids: string[]) => ids.map((id) => card(id, "en_th"));
  const soon = new Date(NOW.getTime() + 10 * 60_000);
  const tomorrow = new Date(NOW.getTime() + 86_400_000);

  it("a card due again today goes back after REQUEUE_GAP other cards", () => {
    const q = requeue(rest("v-a", "v-b", "v-c", "v-d", "v-e"), card("v-z", "en_th"), soon, END);
    expect(keys(q)).toEqual(["v-a|en_th", "v-b|en_th", "v-c|en_th", "v-z|en_th", "v-d|en_th", "v-e|en_th"]);
  });
  it("with fewer than REQUEUE_GAP cards left it goes to the end", () => {
    expect(keys(requeue(rest("v-a", "v-b"), card("v-z", "en_th"), soon, END))).toEqual(["v-a|en_th", "v-b|en_th", "v-z|en_th"]);
    expect(keys(requeue([], card("v-z", "en_th"), soon, END))).toEqual(["v-z|en_th"]);
  });
  it("a card due tomorrow or later is not put back", () => {
    expect(keys(requeue(rest("v-a", "v-b", "v-c"), card("v-z", "en_th"), tomorrow, END))).toEqual(["v-a|en_th", "v-b|en_th", "v-c|en_th"]);
    expect(requeue(rest("v-a"), card("v-z", "en_th"), END, END)).toHaveLength(1); // exactly the end of today is not today
  });
  it("does not change its input", () => {
    const q = rest("v-a", "v-b", "v-c", "v-d");
    const copy = [...q];
    requeue(q, card("v-z", "en_th"), soon, END);
    expect(q).toEqual(copy);
  });
  it("forgetting en_th does not bring it back next to th_en of the same word", () => {
    const queue = [card("v-b", "en_th"), card("v-a", "th_en"), card("v-c", "en_th"), card("v-d", "en_th"), card("v-e", "en_th")];
    const q = requeue(queue, card("v-a", "en_th"), soon, END);
    const i = keys(q).indexOf("v-a|en_th");
    const j = keys(q).indexOf("v-a|th_en");
    expect(Math.abs(i - j)).toBeGreaterThanOrEqual(SIBLING_GAP);
    expect(q).toHaveLength(6);
  });
  it("a queue that has only the sibling left: the card is still shown (no hang)", () => {
    const q = requeue([card("v-a", "th_en")], card("v-a", "en_th"), soon, END);
    expect(keys(q)).toEqual(["v-a|th_en", "v-a|en_th"]);
  });
  it("uses the real scheduler: forgetting a Review card puts it back, easy on a new card does not", () => {
    const rev = review("v-a", "en_th", 5);
    const forgot = applyRating(rev.state, 1, NOW, "UTC");
    expect(requeue(rest("v-b", "v-c", "v-d", "v-e"), rev, forgot.due, END)).toHaveLength(5);
    const easy = applyRating(newCardState(NOW), 4, NOW, "UTC");
    expect(requeue(rest("v-b", "v-c"), card("v-a", "en_th"), easy.due, END)).toHaveLength(2);
  });
});

describe("sessionCounter (the 'x / n' on the page)", () => {
  const q = (...ids: string[]) => ids.map((id) => card(id, "en_th"));
  it("starts at 1 / n and counts cards, not appearances", () => {
    expect(sessionCounter(5, q("v-a", "v-b", "v-c", "v-d", "v-e"))).toEqual({ x: 1, n: 5, fraction: 0 });
  });
  it("moves on when a card leaves the queue for good", () => {
    expect(sessionCounter(5, q("v-c", "v-d", "v-e"))).toEqual({ x: 3, n: 5, fraction: 2 / 5 });
  });
  it("a card that comes back does not raise n or x", () => {
    expect(sessionCounter(5, q("v-b", "v-c", "v-d", "v-e", "v-a"))).toEqual({ x: 1, n: 5, fraction: 0 });
    // v-a is rated again and requeued: still 4 distinct + ... the same card twice in the queue counts once
    expect(sessionCounter(3, [...q("v-b", "v-c"), ...q("v-b")])).toEqual({ x: 2, n: 3, fraction: 1 / 3 });
  });
  it("an empty queue is n / n, fraction 1", () => {
    expect(sessionCounter(4, [])).toEqual({ x: 4, n: 4, fraction: 1 });
  });
  it("n = 0 does not divide by zero", () => {
    expect(sessionCounter(0, [])).toEqual({ x: 0, n: 0, fraction: 1 });
  });
});

it("REVIEW_DIRECTIONS order is en_th then th_en (orderQueue relies on it)", () => {
  expect([...REVIEW_DIRECTIONS]).toEqual(["en_th", "th_en"]);
});
