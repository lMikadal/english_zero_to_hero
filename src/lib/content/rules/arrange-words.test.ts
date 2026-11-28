// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Exercise } from "../schema";
import { buildContext } from "./context";
import { checkArrangeWords } from "./arrange-words";
import { data, exId, instruction, lessonFile, vocabFile, vocabItem } from "./test-support";

const arrange = (words: string[], answer: string, accept?: string[]): Exercise => ({
  id: exId(1, "write"), type: "arrange_words", instruction, words, answer, ...(accept ? { accept } : {}),
});
const check = (ex: Exercise) => checkArrangeWords(buildContext(data([lessonFile(1, [], [ex])], [vocabFile([vocabItem({ id: "v-cat" })])])));

describe("arrange_words calendar words (days and months)", () => {
  it("accepts a day or month capitalised mid-sentence without a Thai spelling", () => {
    expect(check(arrange(["play", "I", "football", "on", "Saturday"], "I play football on Saturday"))).toEqual([]);
    expect(check(arrange(["is", "birthday", "My", "in", "May"], "My birthday is in May"))).toEqual([]);
  });
  it("flags a day that only starts the sentence (the tile would show 'saturday')", () => {
    const out = check(arrange(["I", "football", "play", "Saturday", "On"], "On Saturday I play football"));
    expect(out).toEqual([]);
    const only = check(arrange(["is", "Monday", "a", "school", "day"], "Monday is a school day"));
    expect(only).toHaveLength(1);
    expect(only[0].message).toContain('"Monday"');
    expect(only[0].message).toContain("lower case");
  });
});

describe("arrange_words proper nouns", () => {
  it("accepts ordinary sentence-initial capitals and I", () => {
    expect(check(arrange(["is", "My", "name", "Sam"], "My name is Sam"))).toEqual([]);
    expect(check(arrange(["I", "am", "Ann"], "I am Ann"))).toEqual([]);
    expect(check(arrange(["am", "I'm", "here"], "I'm here"))).toEqual([]);
  });
  it("flags a name that is capitalised only at the start of every sentence (the UI would show it in lower case)", () => {
    const out = check(arrange(["is", "Sam", "my", "friend"], "Sam is my friend"));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ rule: "arrange-words", file: "content/lessons/day-001.json", id: "d001-write-01" });
    expect(out[0].message).toContain('"Sam"');
    expect(out[0].message).toContain("lower case");
  });
  it("accepts the name when an accepted sentence has it mid-sentence", () => {
    expect(check(arrange(["is", "Sam", "my", "friend"], "Sam is my friend", ["My friend is Sam"]))).toEqual([]);
  });
  it("requires a capitalised mid-sentence word to be in the proper-names allowlist", () => {
    const out = check(arrange(["is", "my", "friend", "Zed"], "My friend is Zed"));
    expect(out).toHaveLength(1);
    expect(out[0].message).toContain('"Zed"');
    expect(out[0].message).toContain("allowlists.ts");
  });
  it("accepts allowlisted names mid-sentence, with punctuation and possessive", () => {
    expect(check(arrange(["am", "I", "from", "Bangkok"], "I am from Bangkok"))).toEqual([]);
    expect(check(arrange(["is", "my", "Ann's", "pen"], "My pen is Ann's"))).toEqual([]);
  });
  it("does not flag sentence-initial words that are not names, even when never capitalised elsewhere", () => {
    expect(check(arrange(["you", "How", "are"], "How are you"))).toEqual([]);
  });
});
