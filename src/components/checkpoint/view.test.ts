import { describe, expect, it } from "vitest";
import { checkpointFixture } from "@/lib/answers/test-content";
import { checkpointNumber, completionOf, exerciseIds, resumeNumber, totalExercises } from "./view";
import { DONE_RESPONSE } from "./test-support";

describe("checkpoint view helpers", () => {
  it("counts every exercise of every section, in section order", () => {
    expect(totalExercises(checkpointFixture)).toBe(16);
    expect(exerciseIds(checkpointFixture)[0]).toBe("c030-pron-01");
    expect(exerciseIds(checkpointFixture).at(-1)).toBe("c030-vocab-01");
  });
  it("the resume number is the first exercise with no stored answer, counted in the whole set", () => {
    const ids = exerciseIds(checkpointFixture);
    expect(resumeNumber(checkpointFixture, [])).toBe(1);
    expect(resumeNumber(checkpointFixture, ids.slice(0, 5))).toBe(6);
    expect(resumeNumber(checkpointFixture, [ids[0], ids[2]])).toBe(2);
    expect(resumeNumber(checkpointFixture, ids)).toBe(17);
  });
  it("checkpoint 30 is the first", () => {
    expect([30, 60, 360].map(checkpointNumber)).toEqual([1, 2, 12]);
  });
  it("maps what the sink returned to what the result screen shows", () => {
    expect(completionOf(null)).toEqual({ kind: "pending" });
    expect(completionOf({ status: "queued" })).toEqual({ kind: "queued" });
    expect(completionOf({ status: "rejected", code: 409 })).toEqual({ kind: "rejected", code: 409 });
    expect(completionOf({ status: "error" })).toEqual({ kind: "error" });
    expect(completionOf({ status: "done", response: DONE_RESPONSE })).toEqual({
      kind: "shown", display: { result: DONE_RESPONSE.result, streak: DONE_RESPONSE.streak, nextDay: 31 },
    });
  });
});
