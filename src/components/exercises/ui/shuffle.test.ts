import { describe, expect, it } from "vitest";
import { shuffleSeeded } from "./shuffle";

describe("shuffleSeeded", () => {
  it("is deterministic and a permutation", () => {
    const a = shuffleSeeded([1, 2, 3, 4, 5, 6], "seed");
    expect(shuffleSeeded([1, 2, 3, 4, 5, 6], "seed")).toEqual(a);
    expect([...a].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });
  it("differs for other seeds and does not mutate the input", () => {
    const input = [1, 2, 3, 4, 5, 6];
    const outs = new Set(["a", "b", "c", "d", "e"].map((s) => shuffleSeeded(input, s).join()));
    expect(outs.size).toBeGreaterThan(1);
    expect(input).toEqual([1, 2, 3, 4, 5, 6]);
  });
  it("never returns a rejected order when another one exists", () => {
    for (const seed of ["x", "y", "z", "q", "r", "s", "t"]) {
      expect(shuffleSeeded([1, 2, 3], seed, (o) => o.join() === "1,2,3")).not.toEqual([1, 2, 3]);
    }
  });
  it("returns something for a single element even when rejected", () => {
    expect(shuffleSeeded([1], "x", () => true)).toEqual([1]);
  });
});
