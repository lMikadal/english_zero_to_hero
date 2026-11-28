// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Exercise } from "../schema";
import { buildContext } from "./context";
import { checkAnswerForms } from "./answer-forms";
import { data, exId, instruction, lessonFile, vocabFile, vocabItem } from "./test-support";

const translate = (accept: string[], strict?: boolean): Exercise => ({ id: exId(1, "write"), type: "translate_th_en", instruction, th: "ก", accept, ...(strict === undefined ? {} : { strict }) });
const dictation = (audioText: string, accept?: string[], strict?: boolean): Exercise => ({ id: exId(1, "listen"), type: "dictation", instruction, audioText, ...(accept ? { accept } : {}), ...(strict === undefined ? {} : { strict }) });
const blank = (answer: string, strict?: boolean): Exercise => ({ id: exId(1, "write", 2), type: "fill_blank", instruction, text: "I am ___", answer: [answer], ...(strict === undefined ? {} : { strict }) });
const items = [vocabItem({ id: "v-meet", word: "meet", pos: "verb", forms: { past: "met", pastParticiple: "met" } })];
const check = (ex: Exercise) => checkAnswerForms(buildContext(data([lessonFile(1, [], [ex])], [vocabFile(items)])));
const messages = (ex: Exercise) => check(ex).map((p) => p.message).join("\n");

describe("answer-forms: contractions", () => {
  it("passes plain answers and foldable contractions", () => {
    expect(check(translate(["He's a doctor", "I'm Ann", "Don't sit"]))).toEqual([]);
    expect(check(dictation("He is ten"))).toEqual([]);
    expect(check(translate(["I'd like tea", "I'd love tea"]))).toEqual([]);
  });
  it("flags 's before an -ed word unless the full form is also accepted, or strict", () => {
    const out = check(translate(["He's tired"]));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ rule: "answer-forms", file: "content/lessons/day-001.json", id: "d001-write-01" });
    expect(out[0].message).toContain("ambiguous");
    expect(out[0].message).toContain("X has");
    expect(out[0].message).toContain("X is");
    expect(out[0].message).not.toContain("he is tired"); // never print a concrete sentence that may be ungrammatical
    expect(out[0].message).toContain("strict");
    expect(check(translate(["He's tired", "He is tired"]))).toEqual([]);
    expect(check(translate(["He's tired"], true))).toEqual([]);
  });
  it("flags 's before a participle from the bank's forms (met)", () => {
    expect(check(translate(["She's met Ann"]))).toHaveLength(1);
  });
  it("flags the full form too, because it would not match the contraction", () => {
    const out = check(translate(["It is tired"]));
    expect(out).toHaveLength(1);
    expect(out[0].message).toContain("it's");
    expect(check(translate(["It is tired", "It's tired"]))).toEqual([]);
  });
  it("flags a contraction that is not in the table", () => {
    expect(messages(translate(["I'd go home"]))).toContain("I'd");
    expect(check(translate(["I'd go home"], true))).toEqual([]);
  });
  it("lets possessive 's of ordinary words and o'clock through", () => {
    expect(check(translate(["It is my friend's pen", "It is five o'clock"]))).toEqual([]);
  });
  it("flags Name's unless the full form is also accepted", () => {
    expect(check(translate(["Sam's from Japan"]))).toHaveLength(1);
    expect(check(translate(["Sam's from Japan", "Sam is from Japan"]))).toEqual([]);
    expect(messages(translate(["Sam's pen"]))).toContain("possessive");
  });
});

describe("answer-forms: reverse directions that grading does not fold", () => {
  it("X has + participle needs the 's form (He has finished -> He's finished)", () => {
    const out = check(translate(["She has finished"]));
    expect(out).toHaveLength(1);
    expect(out[0].message).toContain("she's finished");
    expect(check(translate(["She has finished", "She's finished"]))).toEqual([]);
    expect(check(translate(["She has finished"], true))).toEqual([]);
  });
  it("stays quiet where grading folds: has been/got, would like/love, is + non-participle", () => {
    expect(check(translate(["He has been here", "She has got a cat", "I would like tea", "I would love tea", "He is ten"]))).toEqual([]);
  });
  it("would after a pronoun needs the 'd form", () => {
    expect(check(translate(["I would go"]))).toHaveLength(1);
    expect(check(translate(["I would go", "I'd go"]))).toEqual([]);
  });
  it("Name is ... needs Name's ...", () => {
    const out = check(translate(["Sam is happy"]));
    expect(out).toHaveLength(1);
    expect(out[0].message).toContain("sam's happy");
    expect(check(translate(["Sam is happy", "Sam's happy"]))).toEqual([]);
  });
});

describe("answer-forms: possessive or contraction", () => {
  const bank = [
    vocabItem({ id: "v-pen", word: "pen", pos: "noun" }), vocabItem({ id: "v-cat", word: "cat", pos: "noun" }),
    vocabItem({ id: "v-big", word: "big", pos: "adjective" }), vocabItem({ id: "v-happy", word: "happy", pos: "adjective" }),
  ];
  const run = (ex: Exercise) => checkAnswerForms(buildContext(data([lessonFile(1, [], [ex])], [vocabFile(bank)])));
  it("Name's + noun (or adjective + noun) from the bank is a possessive: no error", () => {
    expect(run(translate(["It is Ann's pen"]))).toEqual([]);
    expect(run(translate(["It is Ann's big cat"]))).toEqual([]);
  });
  it("Name's + a/the/from/not/adjective alone is a contraction: demands the full form", () => {
    for (const t of ["Ann's from Japan", "Ann's a doctor", "Ann's in the park", "Ann's not here", "Ann's happy", "Ann's big"]) expect(run(translate([t])), t).toHaveLength(1);
  });
  it("a plural possessive (students') is not an unknown contraction", () => {
    expect(run(translate(["These are the students' pens"]))).toEqual([]);
  });
});

describe("answer-forms: numbers", () => {
  it("passes digits and words up to 100, and 21-99", () => {
    expect(check(dictation("Six, seven", ["6,7", "6, 7, 8, 9, 10"]))).toEqual([]); // commas that separate a list are punctuation
    expect(check(translate(["I am 20", "I am twenty-one", "It is 100 baht", "It is a hundred baht"]))).toEqual([]);
  });
  it.each([
    ["I am 101", "101"],
    ["It is 1,000 baht", "1,000"],
    ["It is 3:30", "3:30"],
    ["It is 2.5 baht", "2.5"],
    ["I have 05 pens", "05"],
    ["I have 0 pens", "0"],
    ["I have zero pens", "zero"],
    ["It is two hundred baht", "hundred"],
  ])("flags %s", (text, token) => {
    const out = check(translate([text]));
    expect(out).toHaveLength(1);
    expect(out[0].message).toContain(token);
    expect(check(translate([text], true))).toEqual([]);
  });
  it("flags an ordinal unless both spellings are accepted", () => {
    expect(check(translate(["It is the first"]))).toHaveLength(1);
    expect(check(translate(["It is the 1st"]))).toHaveLength(1);
    expect(check(translate(["It is the first", "It is the 1st"]))).toEqual([]);
  });
  it("ordinals beyond twentieth are covered", () => {
    expect(check(translate(["It is the 21st"]))).toHaveLength(1);
    expect(check(translate(["It is the twenty-first", "It is the 21st"]))).toEqual([]);
    expect(check(translate(["It is the thirtieth"]))).toHaveLength(1);
    expect(check(translate(["It is the thirtieth", "It is the 30th"]))).toEqual([]);
    expect(check(translate(["It is the twenty first", "It is the 21st"]))).toEqual([]);
    expect(check(translate(["It is the 101st"]))).toHaveLength(1);
  });
  it("accepts both zero spellings when both are listed", () => {
    expect(check(translate(["I have zero pens", "I have 0 pens"]))).toEqual([]);
  });
});

describe("answer-forms: fill_blank must decide", () => {
  it.each(["ten", "10", "21", "twenty-one", "I'm", "isn't", "cannot", "do not", "hundred"])("answer %s needs strict", (a) => {
    const out = check(blank(a));
    expect(out).toHaveLength(1);
    expect(out[0].message).toContain("strict");
    expect(check(blank(a, true))).toEqual([]);
    expect(check(blank(a, false))).toEqual([]);
  });
  it("leaves ordinary answers alone", () => expect(check(blank("Ann"))).toEqual([]));
});
