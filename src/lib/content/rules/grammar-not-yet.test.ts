// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Exercise } from "../schema";
import type { LoadedLesson } from "../loader";
import { buildContext } from "./context";
import { GRAMMAR_NOT_BEFORE, checkGrammarNotYet, thirdPersonS } from "./grammar-not-yet";
import { data, exId, instruction, lessonFile, vocabFile, vocabItem } from "./test-support";

const say = (day: number, text: string, n = 1): Exercise => ({ id: exId(day, "speak", n), type: "repeat_after_me", instruction, text });
const passage = (day: number, text: string, glossary?: Record<string, string>): Exercise => ({
  id: exId(day, "read"), type: "read_passage", instruction, text, ...(glossary ? { glossary } : {}),
  questions: [{ question: { en: "Q?", th: "คำถาม" }, choices: ["a", "b"], answer: 0 }],
});
const verb = (word: string, pos = "verb") => ({ ...vocabItem({ id: `v-${word}${pos === "verb" ? "" : `-${pos}`}`, word, pos, examples: ["I do."] }) });
const BANK = [verb("live"), verb("love"), verb("work"), verb("play", "noun"), verb("play"), verb("study"), verb("watch")];
const check = (lessons: LoadedLesson[], items = BANK) => checkGrammarNotYet(buildContext(data(lessons, [vocabFile(items)])));
const on = (day: number, ex: Exercise, vocab: string[] = []) => [lessonFile(day, vocab, [ex])];

describe("thirdPersonS", () => {
  it("spells the regular third-person -s", () => {
    expect(thirdPersonS("live")).toBe("lives");
    expect(thirdPersonS("work")).toBe("works");
    expect(thirdPersonS("watch")).toBe("watches");
    expect(thirdPersonS("study")).toBe("studies");
    expect(thirdPersonS("go")).toBe("goes");
    expect(thirdPersonS("play")).toBe("plays");
  });
});

describe("GRAMMAR_NOT_BEFORE (explicit table, first allowed day from docs/CURRICULUM.md)", () => {
  it("has/have is week 5 (day 29), Present Simple week 6 (day 36)", () => {
    expect(GRAMMAR_NOT_BEFORE.has).toMatchObject({ day: 29 });
    expect(GRAMMAR_NOT_BEFORE.does).toMatchObject({ day: 36 });
    expect(GRAMMAR_NOT_BEFORE.but).toMatchObject({ severity: "warning" });
  });
});

describe("grammar-not-yet: forms that need a grammar point not yet taught", () => {
  it("flags 'lives' on day 15 even though 'live' is taught: a third-person -s form is the Present Simple week (the incident)", () => {
    const out = check(on(15, say(15, "My mother lives in Bangkok."), ["v-live"]));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ rule: "grammar-not-yet", file: "content/lessons/day-015.json", id: "d015-speak-01" });
    expect(out[0].severity).toBeUndefined();
    expect(out[0].message).toContain('"lives"');
    expect(out[0].message).toContain('"live"');
    expect(out[0].message).toContain("day 36");
    expect(out[0].message).toContain("day 15");
    expect(out[0].message).toContain("glossary");
  });
  it("flags loves, works, and an irregular table form", () => {
    expect(check(on(20, say(20, "She loves a cat."))).map((p) => p.message).join()).toContain('"loves"');
    expect(check(on(20, say(20, "He works here."))).length).toBe(1);
    const has = check(on(20, say(20, "She has a cat.")));
    expect(has).toHaveLength(1);
    expect(has[0].message).toContain("day 29");
    expect(check(on(20, say(20, "Does she live here?"))).map((p) => p.message).join()).toContain('"does"');
  });
  it("is quiet from the first allowed day", () => {
    expect(check(on(36, say(36, "My mother lives in Bangkok. She does work.")))).toEqual([]);
    expect(check(on(29, say(29, "She has a cat.")))).toEqual([]);
  });
  it("is quiet when the exercise's glossary explains the form", () => {
    expect(check(on(15, passage(15, "My mother lives in Bangkok.", { lives: "อาศัยอยู่" })))).toEqual([]);
    expect(check(on(15, passage(15, "My mother lives in Bangkok.", { other: "อื่น" })))).toHaveLength(1);
  });
  it("does not flag the base form, plurals of nouns, or a possessive 's", () => {
    expect(check(on(15, say(15, "I live and we work. Sam's cat is here.")))).toEqual([]);
    expect(check(on(15, say(15, "They are my friends. Those are cats.")))).toEqual([]);
  });
  it("skips a form after a determiner or number (noun reading: 'their lives', 'two works')", () => {
    expect(check(on(15, say(15, "Their lives are good. I love my two works.")))).toEqual([]);
  });
  it("does not generate a form for a word that is also a noun entry (plays, works as nouns)", () => {
    expect(check(on(15, say(15, "He plays here.")))).toEqual([]);
  });
  it("'but' is only a WARNING (its day is not in the curriculum)", () => {
    const out = check(on(15, say(15, "I am small but happy.")));
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe("warning");
    expect(out[0].message).toContain('"but"');
  });
  it("does not check sound drills or bilingual question texts", () => {
    const pair: Exercise = { id: exId(15, "pron"), type: "minimal_pair", instruction, pairs: [{ a: "but", b: "bat", answer: "a" }] };
    expect(check(on(15, pair))).toEqual([]);
    const lc: Exercise = { id: exId(15, "listen"), type: "listen_choose", instruction, audioText: "Hello.", question: { en: "What does Ann say?", th: "แอนพูดว่าอะไร" }, choices: ["Hi", "Bye"], answer: 0 };
    expect(check(on(15, lc))).toEqual([]);
  });
  it("checks the examples of a vocab entry on the day it is taught", () => {
    const item = { ...vocabItem({ id: "v-cat", word: "cat" }), examples: [{ en: "She has a cat.", th: "เธอมีแมว" }] };
    const out = check(on(15, say(15, "Hello.", 1), ["v-cat"]), [item]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: "v-cat", file: "content/vocab/oxford-3000/a1.json" });
  });
});
