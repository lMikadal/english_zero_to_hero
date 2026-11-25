import { describe, expect, it } from "vitest";
import {
  countByStatus,
  oftenForgotten,
  oxford3000Progress,
  retentionRate,
  wordStatus,
} from "./vocab";
import { card, daysAgo, NOW, review } from "./test-utils";
import type { VocabBankItem } from "./types";

const bank: VocabBankItem[] = [
  { id: "v-cat", oxford: { list: "3000", level: "A1" } },
  { id: "v-dog", oxford: { list: "3000", level: "A1" } },
  { id: "v-run", oxford: { list: "3000", level: "A2" } },
  { id: "v-abandon", oxford: { list: "5000", level: "C1" } },
];

// both directions ok and last review correct
const knownCards = (id: string) => [
  card({ vocabId: id, direction: "en_th", stability: 21 }),
  card({ vocabId: id, direction: "th_en", stability: 21 }),
];
const knownReviews = (id: string) => [
  review({ vocabId: id, direction: "en_th", rating: 3 }),
  review({ vocabId: id, direction: "th_en", rating: 2 }),
];

describe("wordStatus", () => {
  it("is not_started without cards", () => {
    expect(wordStatus([], [])).toBe("not_started");
  });

  it("is learning when a card exists but en_th stability is under 7", () => {
    expect(wordStatus([card({ stability: 6.99 })], [])).toBe("learning");
  });

  it("is remembered when en_th stability is exactly 7", () => {
    expect(wordStatus([card({ stability: 7 })], [])).toBe("remembered");
  });

  it("ignores th_en stability for remembered", () => {
    expect(wordStatus([card({ direction: "th_en", stability: 50 })], [])).toBe("learning");
  });

  it("is known only with both directions at stability >= 21 and correct last reviews", () => {
    expect(wordStatus(knownCards("v-cat"), knownReviews("v-cat"))).toBe("known");
  });

  it("is only remembered when one direction is at 20.99", () => {
    const cards = [
      card({ direction: "en_th", stability: 21 }),
      card({ direction: "th_en", stability: 20.99 }),
    ];
    expect(wordStatus(cards, knownReviews("v-cat"))).toBe("remembered");
  });

  it("is only remembered when th_en card is missing", () => {
    expect(wordStatus([card({ stability: 30 })], knownReviews("v-cat"))).toBe("remembered");
  });

  it("is not known when the latest review of a direction was Again (rating 1)", () => {
    const reviews = [
      review({ direction: "en_th", rating: 3, reviewedAt: daysAgo(5) }),
      review({ direction: "th_en", rating: 3, reviewedAt: daysAgo(5) }),
      review({ direction: "th_en", rating: 1, reviewedAt: daysAgo(1) }),
    ];
    expect(wordStatus(knownCards("v-cat"), reviews)).toBe("remembered");
  });

  it("uses the latest review regardless of input order", () => {
    const reviews = [
      review({ direction: "th_en", rating: 3, reviewedAt: daysAgo(1) }),
      review({ direction: "th_en", rating: 1, reviewedAt: daysAgo(5) }),
      review({ direction: "en_th", rating: 4 }),
    ];
    expect(wordStatus(knownCards("v-cat"), reviews)).toBe("known");
  });

  it("is not known when a direction has no review at all", () => {
    expect(wordStatus(knownCards("v-cat"), [review({ direction: "en_th" })])).toBe("remembered");
  });

  it("ignores reviews of other words", () => {
    expect(wordStatus(knownCards("v-cat"), knownReviews("v-dog"))).toBe("remembered");
  });
});

describe("countByStatus", () => {
  it("returns zeros for empty input", () => {
    const r = countByStatus([], [], []);
    expect(r.total).toEqual({ not_started: 0, learning: 0, remembered: 0, known: 0 });
    expect(r.byLevel).toEqual({});
  });

  it("counts every bank word overall and by Oxford level", () => {
    const cards = [
      ...knownCards("v-cat"),
      card({ vocabId: "v-dog", stability: 8 }),
      card({ vocabId: "v-run", stability: 1 }),
      card({ vocabId: "v-unknown-word", stability: 99 }), // not in bank: ignored
    ];
    const r = countByStatus(bank, cards, knownReviews("v-cat"));
    expect(r.total).toEqual({ not_started: 1, learning: 1, remembered: 1, known: 1 });
    expect(r.byLevel.A1).toEqual({ not_started: 0, learning: 0, remembered: 1, known: 1 });
    expect(r.byLevel.A2).toEqual({ not_started: 0, learning: 1, remembered: 0, known: 0 });
    expect(r.byLevel.C1).toEqual({ not_started: 1, learning: 0, remembered: 0, known: 0 });
    expect(r.byLevel.B1).toBeUndefined();
  });
});

describe("oxford3000Progress", () => {
  it("counts known words of the 3000 list over 3000", () => {
    const cards = [...knownCards("v-cat"), ...knownCards("v-abandon")];
    const reviews = [...knownReviews("v-cat"), ...knownReviews("v-abandon")];
    expect(oxford3000Progress(bank, cards, reviews)).toEqual({ known: 1, total: 3000, fraction: 1 / 3000 });
  });

  it("is zero with nothing known", () => {
    expect(oxford3000Progress(bank, [], [])).toEqual({ known: 0, total: 3000, fraction: 0 });
  });
});

describe("retentionRate", () => {
  it("is null with no qualifying reviews", () => {
    expect(retentionRate([], NOW)).toBeNull();
  });

  it("is recalled / total over graduated cards in the last 30 days", () => {
    const reviews = [
      review({ rating: 3 }),
      review({ rating: 4 }),
      review({ rating: 2 }),
      review({ rating: 1 }),
    ];
    expect(retentionRate(reviews, NOW)).toBe(0.75);
  });

  it("treats rating 2 as correct and rating 1 as incorrect", () => {
    expect(retentionRate([review({ rating: 2 })], NOW)).toBe(1);
    expect(retentionRate([review({ rating: 1 })], NOW)).toBe(0);
  });

  it("excludes cards that were New or Learning before the review", () => {
    const reviews = [
      review({ rating: 1, stateBefore: { state: 0 } }),
      review({ rating: 1, stateBefore: { state: 1 } }),
      review({ rating: 3, stateBefore: { state: 2 } }),
      review({ rating: 1, stateBefore: { state: 3 } }),
    ];
    expect(retentionRate(reviews, NOW)).toBe(0.5);
  });

  it("excludes reviews with missing or malformed stateBefore", () => {
    const reviews = [review({ stateBefore: null }), review({ stateBefore: "x" }), review({ stateBefore: {} })];
    expect(retentionRate(reviews, NOW)).toBeNull();
  });

  it("includes exactly 30 days ago and excludes older or future reviews", () => {
    expect(retentionRate([review({ reviewedAt: daysAgo(30) })], NOW)).toBe(1);
    expect(retentionRate([review({ reviewedAt: new Date(daysAgo(30).getTime() - 1) })], NOW)).toBeNull();
    expect(retentionRate([review({ reviewedAt: new Date(NOW.getTime() + 1) })], NOW)).toBeNull();
  });
});

describe("oftenForgotten", () => {
  it("lists words with lapses >= 3, worst first, ties by id", () => {
    const cards = [
      card({ vocabId: "v-b", lapses: 3 }),
      card({ vocabId: "v-a", lapses: 3 }),
      card({ vocabId: "v-c", lapses: 2 }),
      card({ vocabId: "v-d", lapses: 7, direction: "th_en" }),
      card({ vocabId: "v-d", lapses: 4, direction: "en_th" }),
    ];
    expect(oftenForgotten(cards)).toEqual([
      { vocabId: "v-d", lapses: 7 },
      { vocabId: "v-a", lapses: 3 },
      { vocabId: "v-b", lapses: 3 },
    ]);
  });

  it("is empty for no cards", () => {
    expect(oftenForgotten([])).toEqual([]);
  });
});
