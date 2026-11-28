// @vitest-environment node
import path from "node:path";
import { describe, expect, it } from "vitest";
import { allExercises, checkpointFixture, weekOne } from "@/lib/answers/test-content";
import { checkpointSchema, isCheckpointDay } from "./checkpoint-schema";
import { readContent, type ContentData } from "./loader";
import { cpId } from "./rules/checkpoint-test-support";
import { instruction, lessonFile } from "./rules/test-support";
import { checkContentRules } from "./rules";
import { checkContent, formatProblem } from "./validate";

const root = path.resolve(import.meta.dirname, "../../../content");
const bank = readContent(root).vocab;

/** Days 1-7 of the real lessons (the words and sounds the fixture may use) plus a plain day-30 lesson, which an unlock needs. */
const world = (cp = checkpointFixture): ContentData => ({
  lessons: [
    ...weekOne.map((lesson) => ({ file: `content/lessons/day-${String(lesson.day).padStart(3, "0")}.json`, lesson })),
    lessonFile(30, [], [{ id: "d030-listen-01", type: "dictation", instruction, audioText: "Hello." }]),
  ],
  vocab: bank,
  checkpoints: [{ file: "content/checkpoints/checkpoint-030.json", checkpoint: cp }],
});
const problems = (d: ContentData) => [...checkContent(d), ...checkContentRules(d)];
const lines = (d: ContentData) => problems(d).map((p) => `${p.severity === "warning" ? "WARN " : ""}${formatProblem(p)}`);

describe("checkpointFixture", () => {
  it("is a valid checkpoint (round-trips through the schema) after a checkpoint day", () => {
    expect(isCheckpointDay(checkpointFixture.afterDay)).toBe(true);
    expect(checkpointSchema.parse(JSON.parse(JSON.stringify(checkpointFixture)))).toEqual(checkpointFixture);
  });
  it("has all five skills once, weights 20/25/0/20/35 and ids of its own kind", () => {
    expect(checkpointFixture.sections.map((s) => [s.skill, s.weight])).toEqual([["pronunciation", 20], ["listening", 25], ["speaking", 0], ["reading", 20], ["writing", 35]]);
    for (const e of checkpointFixture.sections.flatMap((s) => s.exercises)) expect(e.id).toMatch(/^c030-/);
  });
  it("passes every checkContent and rule check against days 1-7 and a day-30 lesson, with no errors and no warnings", () => {
    expect(lines(world())).toEqual([]);
  });
  it("does not collide with the week-one lesson exercise ids", () => {
    const lessonIds = new Set(allExercises().map((e) => e.exercise.id));
    for (const e of checkpointFixture.sections.flatMap((s) => s.exercises)) expect(lessonIds.has(e.id)).toBe(false);
  });
});

describe("negative variants of the fixture, one change each", () => {
  const change = (mutate: (cp: typeof checkpointFixture) => void) => {
    const cp = structuredClone(checkpointFixture);
    mutate(cp);
    return lines(world(cp));
  };
  it("a word first taught on day 31 (tall) is a taught-words error naming the checkpoint exercise", () => {
    const out = change((cp) => { cp.sections[1].exercises[1] = { id: cpId("listen", 2), type: "dictation", instruction, audioText: "My dog is tall." }; });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatch(/checkpoint-030\.json \[c030-listen-02\]: uses words not taught by day 30/);
  });
  it("third-person -s is a grammar-not-yet error, `has` is not", () => {
    const bad = change((cp) => { cp.sections[2].exercises[1] = { id: cpId("speak", 2), type: "repeat_after_me", instruction, text: "Ann lives here." }; });
    expect(bad.join("\n")).toMatch(/\[c030-speak-02\].*not taught yet by day 30/);
    const good = change((cp) => { cp.sections[2].exercises[1] = { id: cpId("speak", 2), type: "repeat_after_me", instruction, text: "Ann has a dog." }; });
    expect(good).toEqual([]);
  });
  it("a glossary is rejected", () => {
    const out = change((cp) => { const r = cp.sections[3].exercises[0]; if (r.type === "read_passage") r.glossary = { dog: "สุนัข" }; });
    expect(out.join("\n")).toMatch(/\[c030-read-01\].*glossary/);
  });
  it("a vocab_match word of day 31+ is rejected", () => {
    const out = change((cp) => { const r = cp.sections[4].exercises[3]; if (r.type === "vocab_match") r.pairs[0] = { vocabId: "v-tall" }; });
    expect(out.join("\n")).toMatch(/\[c030-vocab-01\].*tall.*first taught on day 3\d/);
  });
});
