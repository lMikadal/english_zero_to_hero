import { describe, expect, it } from "vitest";
import { checkpointFixture } from "@/lib/answers/test-content";
import { checkpointNumber, completionOf, exerciseIds, percentShown, rejectedMessage, resumeNumber, totalExercises } from "./view";
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

  it("shows a percentage rounded DOWN, so a failing score never reads as the pass mark", () => {
    expect([0.699, 0.6999999, 0.7, 0.7000001, 0.9999, 1, 0, 0.29, 0.58, 0.07].map(percentShown)).toEqual([69, 69, 70, 70, 99, 100, 0, 29, 58, 7]);
  });

  it("explains a rejected completion: the generic text and a fresh start for 400/409 whatever the reason", () => {
    const generic = { text: "บันทึกผลไม่ได้ ไม่มีคำตอบของรอบนี้บนเซิร์ฟเวอร์ ลองทำใหม่", restart: true };
    expect(rejectedMessage(409)).toEqual(generic);
    expect(rejectedMessage(400)).toEqual(generic);
    expect(rejectedMessage(409, "something_the_server_adds_later")).toEqual(generic);
  });
});
