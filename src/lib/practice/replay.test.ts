import { describe, expect, it } from "vitest";
import { readLesson } from "@/lib/answers/test-content";
import { parseReplaySkill, REPLAY_SKILL_LABEL_TH, replaySections, replaySkills } from "./replay";

describe("replaySkills", () => {
  it("lists day 1's skills in lesson order with exercise counts", () => {
    expect(replaySkills(readLesson(1))).toEqual([
      { skill: "pronunciation", exercises: 3 },
      { skill: "listening", exercises: 2 },
      { skill: "speaking", exercises: 2 },
      { skill: "reading", exercises: 1 },
      { skill: "writing", exercises: 2 },
    ]);
  });

  it("merges sections of the same skill (first position) and sums their exercises", () => {
    const l = readLesson(1);
    const [pron, listen] = l.sections;
    const lesson = { ...l, sections: [pron, listen, { ...pron, exercises: pron.exercises.slice(0, 1) }] };
    expect(replaySkills(lesson)).toEqual([
      { skill: "pronunciation", exercises: pron.exercises.length + 1 },
      { skill: "listening", exercises: listen.exercises.length },
    ]);
  });
});

describe("replaySections", () => {
  it("null = every section in the original order", () => {
    const l = readLesson(1);
    expect(replaySections(l, null)).toEqual(l.sections);
  });

  it("a skill = only the sections with that skill, in lesson order (including two sections of one skill)", () => {
    const l = readLesson(1);
    const [pron, listen] = l.sections;
    expect(replaySections(l, "listening")).toEqual([listen]);
    const doubled = { ...l, sections: [pron, listen, pron] };
    expect(replaySections(doubled, "pronunciation")).toEqual([pron, pron]);
  });

  it("a skill the lesson lacks gives no sections", () => {
    const l = readLesson(1);
    const lesson = { ...l, sections: l.sections.filter((s) => s.skill !== "reading") };
    expect(replaySections(lesson, "reading")).toEqual([]);
  });
});

describe("parseReplaySkill", () => {
  it("no value is the whole lesson (null)", () => {
    expect(parseReplaySkill(undefined)).toBeNull();
  });
  it("accepts exactly the five skills", () => {
    for (const s of ["pronunciation", "listening", "speaking", "reading", "writing"] as const) expect(parseReplaySkill(s)).toBe(s);
  });
  it("everything else is invalid", () => {
    for (const bad of ["Listening", "vocabulary", "", " reading", "x"]) expect(parseReplaySkill(bad)).toBe("invalid");
    expect(parseReplaySkill(["a", "b"])).toBe("invalid");
    expect(parseReplaySkill(["listening", "listening"])).toBe("invalid");
    expect(parseReplaySkill([])).toBe("invalid");
  });
});

describe("REPLAY_SKILL_LABEL_TH", () => {
  it("names every skill in Thai", () => {
    expect(REPLAY_SKILL_LABEL_TH).toEqual({ pronunciation: "ออกเสียง", listening: "ฟัง", speaking: "พูด", reading: "อ่าน", writing: "เขียน" });
  });
});
