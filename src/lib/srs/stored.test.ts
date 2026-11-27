// toStoredState and fromStoredState are inverse: the jsonb in srs_reviews rebuilds the very card that was stored
// (docs/plans/vocab-review-plan.md 4.4.13: a duplicate review answers with the card rebuilt from `state_after`).
import { describe, expect, it } from "vitest";
import { toWire } from "./contract";
import { applyRating, fromStoredState, newCardState, RATINGS, toStoredState, type CardState, type Rating } from "./scheduler";

const T0 = new Date("2026-11-26T05:00:00.000Z");
const hours = (h: number) => new Date(T0.getTime() + h * 3_600_000);

/** A card walked through a few ratings, so every field (state, steps, lapses, stability...) takes real values. */
function walk(ratings: Rating[], tz = "Asia/Bangkok"): CardState[] {
  const out: CardState[] = [newCardState(T0)];
  ratings.forEach((r, i) => out.push(applyRating(out[i], r, hours(i === 0 ? 0 : i * 30), tz)));
  return out;
}

describe("fromStoredState", () => {
  it.each([[[3, 3, 3, 3]], [[1, 3, 3]], [[4, 4]], [[3, 1, 3, 2, 1, 4]], [[2]]] as Rating[][][])("round trip for %j: every step comes back equal", (ratings) => {
    for (const card of walk(ratings)) expect(fromStoredState(toStoredState(card))).toEqual(card);
  });
  it("survives JSON (what Postgres jsonb does) and gives the same wire shape", () => {
    for (const card of walk([3, 1, 3, 4])) {
      const viaJson = JSON.parse(JSON.stringify(toStoredState(card)));
      expect(fromStoredState(viaJson)).toEqual(card);
      expect(toWire(fromStoredState(viaJson))).toEqual(toWire(card));
    }
  });
  it("covers every rating on a new card, and a card with no last review", () => {
    for (const r of RATINGS) {
      const c = applyRating(newCardState(T0), r, T0, "UTC");
      expect(fromStoredState(toStoredState(c))).toEqual(c);
    }
    expect(fromStoredState(toStoredState(newCardState(T0))).lastReview).toBeNull();
  });
  it("rejects what is not a stored card state instead of building a broken card", () => {
    const ok = toStoredState(newCardState(T0));
    expect(() => fromStoredState(null)).toThrow();
    expect(() => fromStoredState({})).toThrow();
    expect(() => fromStoredState({ ...ok, state: 4 })).toThrow();
    expect(() => fromStoredState({ ...ok, due: "not a date" })).toThrow();
    expect(() => fromStoredState({ ...ok, reps: "1" })).toThrow();
  });
  it("does not share a Date with its input", () => {
    const stored = toStoredState(applyRating(newCardState(T0), 3, T0, "UTC"));
    const a = fromStoredState(stored);
    a.due.setTime(0);
    expect(fromStoredState(stored).due.getTime()).not.toBe(0);
  });
});
