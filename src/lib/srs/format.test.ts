import { describe, expect, it } from "vitest";
import { formatInterval, ratingIntervalLabels } from "./format";
import { applyRating, newCardState, type CardState } from "./scheduler";

const MIN = 60_000;
const H = 3_600_000;
const D = 86_400_000;

describe("formatInterval (the text under the rating buttons)", () => {
  it.each([
    [1_000, "1 นาที"], // never less than 1
    [0, "1 นาที"],
    [MIN, "1 นาที"],
    [10 * MIN, "10 นาที"],
    [59 * MIN, "59 นาที"],
    [60 * MIN, "1 ชั่วโมง"],
    [59.7 * MIN, "1 ชั่วโมง"], // rounds up across the boundary instead of showing 60 minutes
    [5.5 * MIN, "6 นาที"],
    [23 * H, "23 ชั่วโมง"],
    [23.6 * H, "1 วัน"],
    [D, "1 วัน"],
    [8 * D, "8 วัน"],
    [30 * D, "30 วัน"],
    [31 * D, "1 เดือน"],
    [90 * D, "3 เดือน"],
    [330 * D, "11 เดือน"],
    [345 * D, "12 เดือน"], // under 365 days is months, even when the rounded number is 12
    [364 * D, "12 เดือน"],
    [364.4 * D, "12 เดือน"],
    [365 * D, "1 ปี"],
    [400 * D, "1 ปี"],
    [800 * D, "2 ปี"],
  ])("%d ms -> %s", (ms, text) => {
    expect(formatInterval(ms)).toBe(text);
  });
});

describe("ratingIntervalLabels", () => {
  const NOW = new Date("2026-01-01T01:00:00.000Z");
  it("a new card: 1 minute / 6 minutes / 10 minutes / 8 days", () => {
    expect(ratingIntervalLabels(newCardState(NOW), NOW, "UTC")).toEqual({ 1: "1 นาที", 2: "6 นาที", 3: "10 นาที", 4: "8 วัน" });
  });
  it("forgetting a Review card (stability about 3 days) says 10 minutes, as in design image 24", () => {
    const card: CardState = {
      due: NOW, stability: 3, difficulty: 5, scheduledDays: 3, learningSteps: 0, elapsedDays: 3, reps: 4, lapses: 0, state: 2,
      lastReview: new Date(NOW.getTime() - 3 * D),
    };
    expect(ratingIntervalLabels(card, NOW, "UTC")[1]).toBe("10 นาที");
    expect(ratingIntervalLabels(card, NOW, "UTC")[3]).toBe("11 วัน");
  });
  it("matches the real due date after pressing that button", () => {
    const card = applyRating(newCardState(NOW), 3, NOW, "UTC");
    const labels = ratingIntervalLabels(card, card.due, "UTC");
    for (const r of [1, 2, 3, 4] as const) {
      expect(labels[r]).toBe(formatInterval(applyRating(card, r, card.due, "UTC").due.getTime() - card.due.getTime()));
    }
  });
});
