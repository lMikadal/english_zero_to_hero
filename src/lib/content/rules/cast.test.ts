// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Exercise } from "../schema";
import type { LoadedLesson } from "../loader";
import { buildContext } from "./context";
import { ageClaims, checkCast } from "./cast";
import { cpOf } from "./checkpoint-test-support";
import { data, exId, instruction, lessonFile, vocabFile, vocabItem } from "./test-support";

const read = (day: number, text: string, n = 1): Exercise => ({
  id: exId(day, "read", n), type: "read_passage", instruction, text,
  questions: [{ question: { en: "Q?", th: "คำถาม" }, choices: ["a", "b"], answer: 0 }],
});
const lessons = (...specs: [day: number, text: string][]): LoadedLesson[] => specs.map(([d, t]) => lessonFile(d, [], [read(d, t)]));
const check = (ls: LoadedLesson[]) => checkCast(buildContext(data(ls, [vocabFile([vocabItem({ id: "v-cat" })])])));

describe("ageClaims", () => {
  it("reads 'Name is N', 'Name's N', digits and words, with or without 'years old'", () => {
    expect(ageClaims("Ann is thirteen.")).toEqual([{ name: "Ann", age: 13, sentence: "Ann is thirteen" }]);
    expect(ageClaims("Ben is 14 years old.").map((c) => [c.name, c.age])).toEqual([["Ben", 14]]);
    expect(ageClaims("Tom's twenty-one and Mai is 30.").map((c) => [c.name, c.age])).toEqual([["Tom", 21], ["Mai", 30]]);
  });
  it("reads the first-person pattern 'I am Name ... I am N' when the text has exactly one speaker name", () => {
    expect(ageClaims("Hello! I am Ann. I am nineteen.").map((c) => [c.name, c.age])).toEqual([["Ann", 19]]);
    expect(ageClaims("My name is Sam. I'm 12.").map((c) => [c.name, c.age])).toEqual([["Sam", 12]]);
  });
  it("reads 'He/She is N' right after a sentence that names exactly one person", () => {
    expect(ageClaims("This is my friend, Ann. She is eight.").map((c) => [c.name, c.age])).toEqual([["Ann", 8]]);
    expect(ageClaims("Ann is my friend. She is nine. Ben is my friend, too. He is seven.").map((c) => [c.name, c.age])).toEqual([["Ann", 9], ["Ben", 7]]);
    expect(ageClaims("Tom is my friend.\nHe's forty.").map((c) => [c.name, c.age])).toEqual([["Tom", 40]]);
  });
  it("does not guess when the sentence before names two people, or no one, or the pronoun is not followed by a number", () => {
    expect(ageClaims("Ann and Ben are here. She is nine.")).toEqual([]);
    expect(ageClaims("It is a pen. She is nine.")).toEqual([]);
    expect(ageClaims("This is my friend, Ann. She is happy.")).toEqual([]);
  });
  it("a possessive name is not the person the next 'He is N' talks about (Dan's father is seventy, not Dan)", () => {
    expect(ageClaims("This is Ray. He is Dan's father. He is seventy.").map((c) => [c.name, c.age])).toEqual([]);
    expect(ageClaims("This is Ann's brother. He is nine.").map((c) => [c.name, c.age])).toEqual([]);
    expect(ageClaims("This is Ray, Dan's father. He is seventy.").map((c) => [c.name, c.age])).toEqual([["Ray", 70]]);
  });

  it("strips dialogue speaker labels, so 'Mai: This is the boy, Tom. He is ten.' reads Tom (not two names)", () => {
    expect(ageClaims("Mai: This is the boy, Tom. He is ten.").map((c) => [c.name, c.age])).toEqual([["Tom", 10]]);
    expect(ageClaims("Mai: Hi!\nBen: Hello, Mai.\nMai: This is my friend, Ann. She is nine.").map((c) => [c.name, c.age])).toEqual([["Ann", 9]]);
  });
  it("a labelled line's 'I am N' belongs to its speaker", () => {
    expect(ageClaims("Ben: Are you twenty?\nAnn: No, I am not. I am thirty.").map((c) => [c.name, c.age])).toEqual([["Ann", 30]]);
    expect(ageClaims("Mai: I am a teacher. I'm 25.\nBen: I am a doctor. I am thirty.").map((c) => [c.name, c.age])).toEqual([["Mai", 25], ["Ben", 30]]);
  });
  it("skips a first-person age when two different speakers introduce themselves in the text", () => {
    expect(ageClaims("I am Ann. I am ten. I am Ben. I am eleven.")).toEqual([]);
  });
  it("does not read a number that is not an age: a count or a thing", () => {
    expect(ageClaims("Ann is ten minutes late.")).toEqual([]);
    expect(ageClaims("Ann is in room 5.")).toEqual([]);
    expect(ageClaims("Ann is happy.")).toEqual([]);
    expect(ageClaims("Ann has two cats.")).toEqual([]);
  });
  it("only reads names from PROPER_NAMES, not any capitalised word", () => {
    expect(ageClaims("Hello is 20.")).toEqual([]);
  });
});

describe("cast-consistency: one name, one age within a week (days 7k+1 .. 7k+7)", () => {
  it("warns when the same name has two ages in one week, naming both places and both ages", () => {
    const out = check(lessons([15, "Ann is thirteen."], [17, "Ann is 14 years old."]));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ rule: "cast-consistency", severity: "warning", file: "content/lessons/day-017.json", id: "d017-read-01" });
    expect(out[0].message).toContain('"Ann"');
    expect(out[0].message).toContain("13");
    expect(out[0].message).toContain("14");
    expect(out[0].message).toContain("content/lessons/day-015.json");
    expect(out[0].message).toContain("d015-read-01");
    expect(out[0].message).toContain("d017-read-01");
  });
  it("is silent when the ages agree (digits and words are the same age)", () => {
    expect(check(lessons([15, "Ann is thirteen."], [16, "Ann is 13."], [17, "Hi! I am Ann. I am thirteen."]))).toEqual([]);
  });
  it("compares only inside one week: day 14 and day 15 are different weeks", () => {
    expect(check(lessons([14, "Ann is twelve."], [15, "Ann is thirteen."]))).toEqual([]);
    expect(check(lessons([21, "Ann is twelve."], [22, "Ann is thirteen."]))).toEqual([]);
    expect(check(lessons([15, "Ann is twelve."], [21, "Ann is thirteen."]))).toHaveLength(1);
  });
  it("reports one warning per name, not one per pair", () => {
    expect(check(lessons([15, "Ann is 10."], [16, "Ann is 11."], [17, "Ann is 12."], [18, "Ben is 9."]))).toHaveLength(1);
  });
  it("reads ages in vocab examples of the day the word is taught", () => {
    const item = { ...vocabItem({ id: "v-cat" }), examples: [{ en: "Ann is fourteen.", th: "แอนอายุสิบสี่" }] };
    const ls = [lessonFile(16, ["v-cat"], [read(16, "Hello there.")]), ...lessons([17, "Ann is thirteen."])];
    const out = checkCast(buildContext(data(ls, [vocabFile([item])])));
    expect(out).toHaveLength(1);
    expect(out[0].message).toContain("v-cat");
  });
});

describe("checkCast does not look at checkpoints (they span weeks)", () => {
  it("a checkpoint age that disagrees with a lesson of its week is not reported (the same two texts as lessons are)", () => {
    const bank = [vocabFile([vocabItem({ id: "v-cat" })])];
    expect(check(lessons([29, "Ann is nine."], [30, "Ann is twelve."]))).not.toEqual([]);
    const cp = cpOf([{ ...read(30, "Ann is twelve."), id: "c030-read-01" }]);
    expect(checkCast(buildContext({ ...data(lessons([29, "Ann is nine."]), bank), checkpoints: [cp] }))).toEqual([]);
  });
});
