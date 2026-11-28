// @vitest-environment node
import { describe, expect, it } from "vitest";
import { CHECKPOINT_INTERVAL, checkpointSchema, checkpointSectionSchema, isCheckpointDay } from "./checkpoint-schema";
import { EXERCISE_ID_PATTERN, LESSON_TYPES, lessonSchema } from "./schema";

const instruction = { th: "ทำตามคำสั่ง" };
const bi = { en: "Hello", th: "สวัสดี" };
const section = (over: Record<string, unknown> = {}) => ({
  skill: "reading", title: bi, weight: 100, reviewDays: [13],
  exercises: [{ id: "c030-read-01", type: "read_passage", instruction, text: "Sam: Hello!", questions: [{ question: bi, choices: ["Sam", "Ann"], answer: 0 }] }],
  ...over,
});
const checkpoint = (over: Record<string, unknown> = {}) => ({
  afterDay: 30, cefr: "preA1", title: bi, estimatedMinutes: 30, sections: [section()], ...over,
});
const ok = (v: unknown) => checkpointSchema.safeParse(v).success;
const messages = (v: unknown) => {
  const r = checkpointSchema.safeParse(v);
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
};

describe("checkpointSchema", () => {
  it("accepts a minimal checkpoint", () => {
    expect(checkpointSchema.parse(checkpoint()).afterDay).toBe(30);
  });
  it.each([30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330, 360])("accepts afterDay %i", (n) => {
    expect(ok(checkpoint({ afterDay: n }))).toBe(true);
  });
  it.each([0, 15, 31, 45, 390, -30, 30.5])("rejects afterDay %s", (n) => {
    expect(ok(checkpoint({ afterDay: n }))).toBe(false);
  });
  it("rejects an unknown top-level key", () => {
    expect(messages(checkpoint({ vocab: [] }))).toEqual([expect.stringContaining("vocab")]);
  });
  it("rejects an unknown key inside a section (.extend() of the strict sectionSchema stays strict)", () => {
    const m = messages(checkpoint({ sections: [section({ extra: 1 })] }));
    expect(m).toHaveLength(1);
    expect(m[0]).toContain("sections.0");
    expect(m[0]).toContain("extra");
  });
  it("rejects an unknown key inside an exercise", () => {
    const s = section();
    (s.exercises[0] as Record<string, unknown>).typo = 1;
    expect(ok(checkpoint({ sections: [s] }))).toBe(false);
  });
  it.each([101, -1, 1.5])("rejects weight %s", (w) => {
    expect(ok(checkpoint({ sections: [section({ weight: w })] }))).toBe(false);
  });
  it("accepts weight 0 and 100", () => {
    expect(ok(checkpoint({ sections: [section({ weight: 0 })] }))).toBe(true);
    expect(ok(checkpoint({ sections: [section({ weight: 100 })] }))).toBe(true);
  });
  it("requires weight and reviewDays", () => {
    const noWeight: Record<string, unknown> = section();
    delete noWeight.weight;
    const noDays: Record<string, unknown> = section();
    delete noDays.reviewDays;
    expect(ok(checkpoint({ sections: [noWeight] }))).toBe(false);
    expect(ok(checkpoint({ sections: [noDays] }))).toBe(false);
  });
  it("rejects empty reviewDays, more than 4, and days outside 1..365", () => {
    expect(ok(checkpoint({ sections: [section({ reviewDays: [] })] }))).toBe(false);
    expect(ok(checkpoint({ sections: [section({ reviewDays: [1, 2, 3, 4, 5] })] }))).toBe(false);
    expect(ok(checkpoint({ sections: [section({ reviewDays: [0] })] }))).toBe(false);
    expect(ok(checkpoint({ sections: [section({ reviewDays: [366] })] }))).toBe(false);
    expect(ok(checkpoint({ sections: [section({ reviewDays: [1, 2, 3, 4] })] }))).toBe(true);
  });
  it("needs at least one section, a title with Thai, and a positive estimatedMinutes", () => {
    expect(ok(checkpoint({ sections: [] }))).toBe(false);
    expect(ok(checkpoint({ title: { en: "Test", th: "test" } }))).toBe(false);
    expect(ok(checkpoint({ estimatedMinutes: 0 }))).toBe(false);
  });
  it("accepts a c-id and rejects a section exercise without a valid id", () => {
    const s = section();
    (s.exercises[0] as Record<string, unknown>).id = "c030-foo-01";
    expect(ok(checkpoint({ sections: [s] }))).toBe(false);
  });
  it("checkpointSectionSchema is exported and strict on its own", () => {
    expect(checkpointSectionSchema.safeParse(section()).success).toBe(true);
    expect(checkpointSectionSchema.safeParse(section({ nope: true })).success).toBe(false);
  });
});

describe("isCheckpointDay / CHECKPOINT_INTERVAL", () => {
  it("is every 30th day from 30 to 360", () => {
    expect(CHECKPOINT_INTERVAL).toBe(30);
    expect([...Array(365)].map((_, i) => i + 1).filter(isCheckpointDay)).toEqual([30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330, 360]);
    expect(isCheckpointDay(30.5)).toBe(false);
    expect(isCheckpointDay(Number.NaN)).toBe(false);
    expect(isCheckpointDay(0)).toBe(false);
    expect(isCheckpointDay(390)).toBe(false);
  });
});

describe("shared schema changes for checkpoints", () => {
  it("the exercise id pattern accepts c030-read-01 as well as d001-pron-01", () => {
    expect(EXERCISE_ID_PATTERN.test("c030-read-01")).toBe(true);
    expect(EXERCISE_ID_PATTERN.test("d001-pron-01")).toBe(true);
    expect(EXERCISE_ID_PATTERN.test("x030-read-01")).toBe(false);
    expect(EXERCISE_ID_PATTERN.test("c30-read-01")).toBe(false);
  });
  it('a lesson of type "checkpoint" is no longer valid (checkpoints are their own files)', () => {
    expect([...LESSON_TYPES]).toEqual(["lesson", "review", "challenge"]);
    const lesson = {
      day: 30, phase: 1, week: 5, type: "checkpoint", cefr: "preA1", title: bi, objectives: [bi], estimatedMinutes: 20, vocab: [],
      sections: [{ skill: "listening", title: bi, exercises: [{ id: "d030-listen-01", type: "dictation", instruction, audioText: "Hi." }] }],
    };
    expect(lessonSchema.safeParse(lesson).success).toBe(false);
    expect(lessonSchema.safeParse({ ...lesson, type: "lesson" }).success).toBe(true);
  });
});
