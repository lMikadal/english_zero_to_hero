// @vitest-environment node
import { describe, expect, it } from "vitest";
import { formatProblem } from "../loader";
import type { Exercise } from "../schema";
import { buildContext } from "./context";
import { learnerEnglish } from "./learner-text";
import { checkTaughtWords, checkVocabUsedOnItsDay } from "./taught-words";
import { data, exId, instruction, lessonFile, vocabFile, vocabItem } from "./test-support";

const dictation = (day: number, audioText: string, n = 1): Exercise => ({ id: exId(day, "listen", n), type: "dictation", instruction, audioText });
const run = (lessons: ReturnType<typeof lessonFile>[], items: ReturnType<typeof vocabItem>[]) => buildContext(data(lessons, [vocabFile(items)]));

describe("learnerEnglish", () => {
  it("lists the English a learner sees or hears, with the field it is in", () => {
    const ex: Exercise = {
      id: exId(1, "read"), type: "read_passage", instruction, text: "A cat.", glossary: { cat: "แมว" },
      questions: [{ question: { en: "What is it?", th: "อะไร" }, choices: ["A cat", "A dog"], answer: 0 }],
    };
    expect(learnerEnglish(ex).map((f) => [f.field, f.text])).toEqual([
      ["text", "A cat."], ["questions[0].question", "What is it?"], ["questions[0].choices[0]", "A cat"], ["questions[0].choices[1]", "A dog"],
    ]);
  });
  it("uses the model answer (accept[0]) of translate_th_en, not every alternative", () => {
    const ex: Exercise = { id: exId(1, "write"), type: "translate_th_en", instruction, th: "ไทย", accept: ["Hello", "Pleased"] };
    expect(learnerEnglish(ex).map((f) => f.text)).toEqual(["Hello"]);
  });
});

describe("checkTaughtWords: vocab examples", () => {
  const items = [
    vocabItem({ id: "v-hello", word: "hello", examples: ["Hello, I'm Ann."] }),
    vocabItem({ id: "v-cat", word: "cat", examples: ["I have a cat.", "The cat is big."] }),
    vocabItem({ id: "v-big", word: "big", pos: "adjective", examples: ["My cat is big."] }),
  ];

  it("allows allowlisted words, names, and words taught on or before the entry's day", () => {
    const ctx = run([lessonFile(1, ["v-hello", "v-cat"], [dictation(1, "Hello cat")]), lessonFile(2, ["v-big"], [dictation(2, "Big cat")])], items);
    expect(checkTaughtWords(ctx).filter((p) => p.file.includes("vocab"))).toEqual([]);
  });
  it("flags a word taught only later, naming the entry, the example, the word and the day", () => {
    const early = [...items.slice(0, 2), vocabItem({ id: "v-big", word: "big", examples: ["My cat is big."] })];
    const ctx = run([lessonFile(1, ["v-hello", "v-big"], [dictation(1, "Hello big")]), lessonFile(2, ["v-cat"], [dictation(2, "Cat")])], early);
    const out = checkTaughtWords(ctx).filter((p) => p.file.includes("vocab"));
    const msg = out.map(formatProblem).join("\n");
    expect(out.every((p) => p.rule === "taught-words")).toBe(true);
    expect(msg).toContain("[v-big]");
    expect(msg).toContain('"My cat is big."');
    expect(msg).toContain('"cat"');
    expect(msg).toContain("day 1");
  });
  it("flags a completely unknown word", () => {
    const bad = [vocabItem({ id: "v-hello", word: "hello", examples: ["Hello, zebra."] })];
    const out = checkTaughtWords(run([lessonFile(1, ["v-hello"], [dictation(1, "Hello")])], bad));
    expect(out.map(formatProblem).join("\n")).toContain('"zebra"');
  });
  it("skips entries that no lesson teaches yet (no day to compare with)", () => {
    const out = checkTaughtWords(run([lessonFile(1, ["v-hello"], [dictation(1, "Hello")])], [...items.slice(0, 1), vocabItem({ id: "v-zebra", word: "zebra", examples: ["Quux."] })]));
    expect(out).toEqual([]);
  });
});

describe("checkTaughtWords: exercise text", () => {
  const items = [vocabItem({ id: "v-hello", word: "hello" }), vocabItem({ id: "v-cat", word: "cat" })];

  it("flags untaught words with the exercise id, the field and the day", () => {
    const ctx = run([lessonFile(1, ["v-hello"], [dictation(1, "Hello cat")]), lessonFile(2, ["v-cat"], [dictation(2, "Hello cat")])], items);
    const out = checkTaughtWords(ctx).filter((p) => p.file.includes("lessons"));
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("d001-listen-01");
    expect(out[0].file).toBe("content/lessons/day-001.json");
    expect(out[0].message).toContain('"cat"');
    expect(out[0].message).toContain("audioText");
    expect(out[0].message).toContain("day 1");
  });
  it("accepts words glossed in Thai in the same passage", () => {
    const ex: Exercise = {
      id: exId(1, "read"), type: "read_passage", instruction, text: "Hello, zebra.", glossary: { zebra: "ม้าลาย" },
      questions: [{ question: { en: "Hello?", th: "อะไร" }, choices: ["Hello", "Cat"], answer: 0 }],
    };
    const out = checkTaughtWords(run([lessonFile(1, ["v-hello", "v-cat"], [ex])], items));
    expect(out).toEqual([]);
  });
  it("groups every unknown word of an exercise into one problem", () => {
    const out = checkTaughtWords(run([lessonFile(1, ["v-hello"], [dictation(1, "Hello zebra lion")])], items));
    expect(out).toHaveLength(1);
    expect(out[0].message).toContain('"zebra"');
    expect(out[0].message).toContain('"lion"');
  });
  it("lets inflections of taught words through (plural, -ing, be forms)", () => {
    const ctx = run([lessonFile(1, ["v-cat"], [dictation(1, "Cats")])], items);
    expect(checkTaughtWords(ctx)).toEqual([]);
  });
});

describe("checkVocabUsedOnItsDay", () => {
  const items = [vocabItem({ id: "v-cat", word: "cat" }), vocabItem({ id: "v-dog", word: "dog" })];
  it("flags a new word that no exercise of its lesson uses, naming file and id", () => {
    const out = checkVocabUsedOnItsDay(run([lessonFile(1, ["v-cat", "v-dog"], [dictation(1, "A cat")])], items));
    expect(out).toHaveLength(1);
    expect(out[0].rule).toBe("vocab-used");
    expect(out[0].file).toBe("content/lessons/day-001.json");
    expect(out[0].id).toBe("v-dog");
    expect(out[0].message).toContain("dog");
  });
  it("counts an inflected use", () => {
    expect(checkVocabUsedOnItsDay(run([lessonFile(1, ["v-cat"], [dictation(1, "Cats")])], items))).toEqual([]);
  });
  it("does not count the word only appearing in another lesson", () => {
    const ctx = run([lessonFile(1, ["v-cat"], [dictation(1, "A cat")]), lessonFile(2, ["v-dog"], [dictation(2, "A cat")])], items);
    expect(checkVocabUsedOnItsDay(ctx).map((p) => p.id)).toEqual(["v-dog"]);
  });
});
