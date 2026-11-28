import { describe, expect, expectTypeOf, it } from "vitest";
import type { AttemptSource } from "@/db/schema"; // type-only: erased
import { DETECTION_SOURCES } from "./config";
import { SOURCE_ROLES, sourcesWith } from "./sources";
import type { AttemptSourceLike } from "./types";

describe("source classification", () => {
  it("AttemptSourceLike equals AttemptSource in the DB schema", () => {
    expectTypeOf<AttemptSourceLike>().toEqualTypeOf<AttemptSource>();
  });

  it("classifies every source (the record's keys are exactly the sources)", () => {
    expect(Object.keys(SOURCE_ROLES).sort()).toEqual(["checkpoint", "checkpoint_retake", "drill", "lesson", "practice", "retest"]);
  });

  it("practice is neither weakness evidence, nor drill activity, nor does it touch progress", () => {
    expect(SOURCE_ROLES.practice).toEqual({ detection: false, drillActivity: false, touchesProgress: false });
  });

  it("a checkpoint answer is weakness evidence but never touches progress (docs/plans/checkpoint-plan.md 4.5)", () => {
    expect(SOURCE_ROLES.checkpoint).toEqual({ detection: true, drillActivity: false, touchesProgress: false });
  });

  it("a checkpoint retake is nothing at all: not evidence, not drill activity, no progress", () => {
    expect(SOURCE_ROLES.checkpoint_retake).toEqual({ detection: false, drillActivity: false, touchesProgress: false });
  });

  it("keeps the existing roles of the other sources", () => {
    expect(sourcesWith("detection")).toEqual(["lesson", "checkpoint"]);
    expect(sourcesWith("drillActivity")).toEqual(["drill", "retest"]);
    expect(sourcesWith("touchesProgress")).toEqual(["lesson", "drill", "retest"]);
  });

  it("DETECTION_SOURCES is still lesson and checkpoint", () => {
    expect([...DETECTION_SOURCES]).toEqual(["lesson", "checkpoint"]);
  });
});
