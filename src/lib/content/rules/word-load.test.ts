// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Exercise } from "../schema";
import type { LoadedLesson } from "../loader";
import { buildContext } from "./context";
import {
  GRAMMAR_DAY_FROM_DAY, GRAMMAR_DAY_MAX_NEW_WORDS, VOCAB_MATCH_FROM_DAY, VOCAB_MATCH_MAX_PAIRS, WEEK_RECYCLE_FROM_WEEK, WORD_EXPOSURE_FROM_DAY,
  checkNewWordsPerDay, checkVocabMatch, checkWeekRecycle, checkWordExposure,
} from "./word-load";
import { data, exId, instruction, lessonFile, vocabFile, vocabItem } from "./test-support";

const say = (day: number, text: string, n = 1): Exercise => ({ id: exId(day, "speak", n), type: "repeat_after_me", instruction, text });
const dict = (day: number, text: string, n = 1): Exercise => ({ id: exId(day, "listen", n), type: "dictation", instruction, audioText: text });
const read = (day: number, text: string, n = 1): Exercise => ({ id: exId(day, "read", n), type: "read_passage", instruction, text, questions: [{ question: { en: "Q?", th: "ค" }, choices: ["a", "b"], answer: 0 }] });
const match = (day: number, ids: string[], n = 1): Exercise => ({ id: exId(day, "vocab", n), type: "vocab_match", instruction, pairs: ids.map((vocabId) => ({ vocabId })) });
const note = (day: number): Exercise => ({ id: exId(day, "read", 9), type: "grammar_note", instruction, titleTh: "ก", bodyTh: "ก", examples: [{ en: "I like tea.", th: "ก" }], structures: ["third-person-s"] }) as Exercise;
const lesson = (day: number, vocab: string[], exs: Exercise[], type: "lesson" | "review" | "challenge" = "lesson"): LoadedLesson => {
  const f = lessonFile(day, vocab, exs);
  f.lesson.type = type;
  return f;
};
const words = (...ws: string[]) => ws.map((w) => vocabItem({ id: `v-${w}`, word: w, pos: "noun" }));
const ctx = (ls: LoadedLesson[], items = words("cat", "dog", "pen")) => buildContext(data(ls, [vocabFile(items)]));

describe("constants", () => {
  it("are the owner's numbers", () => {
    expect([WORD_EXPOSURE_FROM_DAY, WEEK_RECYCLE_FROM_WEEK, VOCAB_MATCH_FROM_DAY, VOCAB_MATCH_MAX_PAIRS, GRAMMAR_DAY_FROM_DAY, GRAMMAR_DAY_MAX_NEW_WORDS]).toEqual([36, 6, 36, 8, 43, 9]);
  });
});

describe("word-exposure (WARNING from day 36): a new word occurs 3+ times in 2+ exercise types outside vocab_match", () => {
  const rich = [say(36, "A cat."), dict(36, "The cat is here.", 1), read(36, "My cat is big. A cat.")];
  it("is quiet for a word with 3+ occurrences in 2+ types", () => {
    expect(checkWordExposure(ctx([lesson(36, ["v-cat"], rich)]))).toEqual([]);
  });
  it("warns for a word that appears once, listing counts by type and where to add it", () => {
    const out = checkWordExposure(ctx([lesson(36, ["v-cat"], [say(36, "A cat."), match(36, ["v-cat", "v-dog"])])]));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ rule: "word-exposure", severity: "warning", file: "content/lessons/day-036.json", id: "v-cat" });
    expect(out[0].message).toContain('"cat"');
    expect(out[0].message).toContain("1 time");
    expect(out[0].message).toContain("repeat_after_me: 1");
    expect(out[0].message).toContain("at least 3");
    expect(out[0].message).toContain("2 different exercise types");
  });
  it("warns when it is frequent but in one exercise type only", () => {
    const out = checkWordExposure(ctx([lesson(36, ["v-cat"], [read(36, "A cat. My cat. The cat."), read(36, "More.", 2)])]));
    expect(out).toHaveLength(1);
    expect(out[0].message).toContain("1 exercise type");
  });
  it("counts inflected forms (cats), says 0 for a word that never appears, and ignores vocab_match", () => {
    expect(checkWordExposure(ctx([lesson(36, ["v-cat"], [say(36, "A cat."), dict(36, "Two cats.", 1), read(36, "Cats are nice.")])]))).toEqual([]);
    const out = checkWordExposure(ctx([lesson(36, ["v-cat"], [say(36, "Hello."), match(36, ["v-cat", "v-dog"])])]));
    expect(out[0].message).toContain("0 time");
  });
  it("is quiet before day 36 (and says what it would report when asked for every day)", () => {
    const l = lesson(20, ["v-cat"], [say(20, "A cat.")]);
    expect(checkWordExposure(ctx([l]))).toEqual([]);
    expect(checkWordExposure(ctx([l]), 1)).toHaveLength(1);
  });
});

describe("week-recycle (WARNING from week 6): every word taught on the teaching days occurs on the review or challenge day", () => {
  const week = (reviewText: string, challengeText = "Hello.") => [
    lesson(36, ["v-cat"], [say(36, "A cat.")]), lesson(37, ["v-dog"], [say(37, "A dog.")]),
    lesson(41, [], [say(41, reviewText)], "review"), lesson(42, [], [say(42, challengeText)], "challenge"),
  ];
  it("is quiet when each word is used on the review or the challenge day", () => {
    expect(checkWeekRecycle(ctx(week("A cat.", "A dog.")))).toEqual([]);
    expect(checkWeekRecycle(ctx(week("A cat and a dog.")))).toEqual([]);
  });
  it("warns once per week, listing the missing words with their days", () => {
    const out = checkWeekRecycle(ctx(week("A cat.")));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ rule: "week-recycle", severity: "warning" });
    expect(out[0].message).toContain('"dog" (day 37)');
    expect(out[0].message).not.toContain('"cat"');
    expect(out[0].message).toContain("week 6");
    expect(out[0].message).toContain("days 41, 42");
  });
  it("a word that only occurs in vocab_match does not count", () => {
    const ls = week("Hello.");
    ls[2].lesson.sections[0].exercises.push(match(41, ["v-cat", "v-dog"], 2));
    expect(checkWeekRecycle(ctx(ls))[0].message).toContain('"cat"');
  });
  it("is quiet before week 6, and for a week without a review or challenge day", () => {
    const early = week("Hello.").map((l) => ({ ...l, lesson: { ...l.lesson, day: l.lesson.day - 14 }, file: l.file.replace(/day-0(\d\d)/, (_m, d) => `day-0${Number(d) - 14}`) }));
    expect(checkWeekRecycle(ctx(early))).toEqual([]);
    expect(checkWeekRecycle(ctx(week("Hello.").slice(0, 2)))).toEqual([]);
  });
});

describe("vocab-match-covers-new-words (ERROR from day 36)", () => {
  it("passes when the vocab_match exercises of the day together cover every new word, in at most 8 pairs each", () => {
    const l = lesson(36, ["v-cat", "v-dog", "v-pen"], [match(36, ["v-cat", "v-dog"]), match(36, ["v-pen", "v-cat"], 2)]);
    expect(checkVocabMatch(ctx([l]))).toEqual([]);
  });
  it("flags a new word that is in no vocab_match, naming it", () => {
    const out = checkVocabMatch(ctx([lesson(36, ["v-cat", "v-dog"], [match(36, ["v-cat", "v-pen"])])]));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ rule: "vocab-match-covers-new-words", file: "content/lessons/day-036.json" });
    expect(out[0].severity).toBeUndefined();
    expect(out[0].message).toContain('"dog"');
    expect(out[0].message).not.toContain('"cat"');
  });
  it("flags a day with new words and no vocab_match at all", () => {
    expect(checkVocabMatch(ctx([lesson(36, ["v-cat"], [say(36, "A cat.")])]))).toHaveLength(1);
  });
  it("flags a vocab_match with more than 8 pairs (it does not fit a 360px screen) and says how to split it", () => {
    const many = Array.from({ length: 9 }, (_, i) => `w${i}`);
    const items = words(...many);
    const out = checkVocabMatch(buildContext(data([lesson(36, [], [match(36, many.map((w) => `v-${w}`))])], [vocabFile(items)])));
    expect(out).toHaveLength(1);
    expect(out[0].message).toContain("9 pairs");
    expect(out[0].message).toContain("at most 8");
    expect(out[0].message).toContain("two vocab_match");
  });
  it("is quiet before day 36 (fromDay 1 reports it) and on days without new words", () => {
    const l = lesson(20, ["v-cat", "v-dog"], [match(20, ["v-cat"])]);
    expect(checkVocabMatch(ctx([l]))).toEqual([]);
    expect(checkVocabMatch(ctx([l]), 1)).toHaveLength(1);
    expect(checkVocabMatch(ctx([lesson(41, [], [say(41, "Hello.")], "review")]))).toEqual([]);
  });
});

describe("new-words-per-day: a lesson with a grammar_note teaches at most 9 new words (ERROR from day 43)", () => {
  const ten = Array.from({ length: 10 }, (_, i) => `w${i}`);
  const items = words(...ten);
  const run = (day: number, ids: string[], exs: Exercise[]) => checkNewWordsPerDay(buildContext(data([lesson(day, ids.map((w) => `v-${w}`), exs)], [vocabFile(items)])));
  it("flags 10 words with a grammar_note from day 43, naming the numbers and the way out", () => {
    const out = run(43, ten, [note(43)]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ rule: "new-words-per-day", file: "content/lessons/day-043.json" });
    expect(out[0].severity).toBeUndefined();
    expect(out[0].message).toContain("10 new words");
    expect(out[0].message).toContain("at most 9");
    expect(out[0].message).toContain("grammar");
  });
  it("allows 9, allows 10 without a note, and is quiet before day 43", () => {
    expect(run(43, ten.slice(0, 9), [note(43)])).toEqual([]);
    expect(run(43, ten, [say(43, "Hello.")])).toEqual([]);
    expect(run(42, ten, [note(42)])).toEqual([]);
  });
});
