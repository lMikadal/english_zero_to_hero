import { describe, expect, it } from "vitest";
import { lessonScore } from "./lesson-score";

const at = (m: number) => new Date(Date.UTC(2026, 10, 25, 10, m));

describe("lessonScore", () => {
  it("is null with no rows", () => {
    expect(lessonScore([])).toBeNull();
  });
  it("is null when nothing is graded (self-rated only)", () => {
    expect(lessonScore([{ exerciseId: "a", score: null, createdAt: at(0) }])).toBeNull();
  });
  it("is the mean of the graded scores, ignoring null scores", () => {
    expect(
      lessonScore([
        { exerciseId: "a", score: 1, createdAt: at(0) },
        { exerciseId: "b", score: 0.5, createdAt: at(1) },
        { exerciseId: "c", score: null, createdAt: at(2) },
      ]),
    ).toBeCloseTo(0.75);
  });
  it("uses only the latest row per exercise", () => {
    expect(
      lessonScore([
        { exerciseId: "a", score: 0, createdAt: at(0) },
        { exerciseId: "a", score: 1, createdAt: at(5) },
        { exerciseId: "b", score: 0, createdAt: at(1) },
      ]),
    ).toBeCloseTo(0.5);
  });
});
