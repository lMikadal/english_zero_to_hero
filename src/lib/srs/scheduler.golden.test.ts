// Golden vectors: the adapter against what ts-fsrs 6.0.1 itself produced for the same inputs
// (scripts/srs-golden.mjs -> scheduler.golden.vectors.ts). If the library or our configuration changes, the schedule
// changes, and this test fails loudly. Regenerate only after reading the diff and deciding the change is wanted.
import { describe, expect, it } from "vitest";
import { applyRating, newCardState, type Rating } from "./scheduler";
import { GOLDEN_SEQUENCES, GOLDEN_START } from "./scheduler.golden.vectors";

describe("scheduler golden vectors", () => {
  it.each(GOLDEN_SEQUENCES.map((s) => [s.name, s] as const))("%s", (_name, seq) => {
    let card = newCardState(new Date(GOLDEN_START));
    seq.steps.forEach((step, i) => {
      card = applyRating(card, step.rating as Rating, new Date(step.now));
      const at = `step ${i + 1} (rating ${step.rating})`;
      expect({ at, due: card.due.toISOString() }).toEqual({ at, due: step.due });
      expect({ at, stability: Number(card.stability.toFixed(4)) }).toEqual({ at, stability: step.stability });
      expect({ at, difficulty: Number(card.difficulty.toFixed(4)) }).toEqual({ at, difficulty: step.difficulty });
      expect({ at, state: card.state, scheduledDays: card.scheduledDays, learningSteps: card.learningSteps }).toEqual({
        at, state: step.state, scheduledDays: step.scheduledDays, learningSteps: step.learningSteps,
      });
      expect({ at, reps: card.reps, lapses: card.lapses, elapsedDays: card.elapsedDays }).toEqual({
        at, reps: step.reps, lapses: step.lapses, elapsedDays: step.elapsedDays,
      });
      expect(card.lastReview?.toISOString()).toBe(step.now);
    });
  });

  it("covers every state and a lapse", () => {
    const steps = GOLDEN_SEQUENCES.flatMap((s) => s.steps);
    expect(new Set(steps.map((s) => s.state))).toEqual(new Set([1, 2, 3]));
    expect(steps.some((s) => s.lapses > 0)).toBe(true);
    expect(steps.some((s) => s.now !== s.due && s.scheduledDays >= 2)).toBe(true);
  });
});
