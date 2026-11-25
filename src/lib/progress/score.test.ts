import { describe, expect, it } from "vitest";
import { normalizeScore } from "./score";

describe("normalizeScore", () => {
  it("passes through scores in 0..1", () => {
    expect(normalizeScore(0)).toBe(0);
    expect(normalizeScore(0.7)).toBe(0.7);
    expect(normalizeScore(1)).toBe(1);
  });

  it("clamps out-of-range scores", () => {
    expect(normalizeScore(-0.2)).toBe(0);
    expect(normalizeScore(1.5)).toBe(1);
  });

  it("treats null, undefined and non-finite scores as ungraded", () => {
    expect(normalizeScore(null)).toBeNull();
    expect(normalizeScore(undefined)).toBeNull();
    expect(normalizeScore(Number.NaN)).toBeNull();
    expect(normalizeScore(Number.POSITIVE_INFINITY)).toBeNull();
  });
});
