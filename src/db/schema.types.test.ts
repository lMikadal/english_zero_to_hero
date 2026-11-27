// Type-level facts about the schema that the review code relies on (checked by `make typecheck`; the runtime part by vitest).
import { describe, expect, expectTypeOf, it } from "vitest";
import type { ReviewDirection } from "@/lib/srs/contract";
import type { CardState } from "@/lib/srs/scheduler";
import { ACTIVITY_SOURCES, SRS_DIRECTIONS, srsCards, type ActivitySource, type SrsDirection } from "./schema";

describe("schema types used by the vocabulary review", () => {
  it("activity_days.source accepts review", () => {
    expectTypeOf<"review">().toExtend<ActivitySource>();
    expect(ACTIVITY_SOURCES).toContain("review");
  });
  it("srs_cards.state is 0 | 1 | 2 | 3, the same as the scheduler's CardState.state", () => {
    expectTypeOf<typeof srsCards.$inferSelect.state>().toEqualTypeOf<0 | 1 | 2 | 3>();
    expectTypeOf<typeof srsCards.$inferSelect.state>().toEqualTypeOf<CardState["state"]>();
    expectTypeOf<typeof srsCards.$inferInsert.state>().toEqualTypeOf<0 | 1 | 2 | 3 | undefined>();
  });
  it("every review direction is a stored direction", () => {
    expectTypeOf<ReviewDirection>().toExtend<SrsDirection>();
    expect(SRS_DIRECTIONS).toEqual(expect.arrayContaining(["en_th", "th_en"]));
  });
});
