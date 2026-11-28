// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Exercise, Lesson, Topic, VocabItem } from "./schema";
import type { LoadedCheckpoint } from "./loader";
import { checkContent, formatProblem, summarize, type LoadedLesson, type LoadedVocab } from "./validate";

const bi = { en: "Hello", th: "สวัสดี" };
const instruction = { th: "ทำตามคำสั่ง" };

function word(id: string, level: VocabItem["oxford"]["level"] = "A1", topics: Topic[] = ["greetings"]): VocabItem {
  return {
    id, word: id.slice(2), pos: "noun",
    oxford: { list: "3000", level },
    ipa: { us: "/x/", uk: "/x/" }, th: "คำ", topics,
    examples: [{ en: "x", th: "x" }],
  };
}

function lessonOf(day: number, over: Partial<Lesson> = {}, exercises: Exercise[] = []): LoadedLesson {
  const dd = String(day).padStart(3, "0");
  const lesson: Lesson = {
    day, phase: day <= 60 ? 1 : day <= 150 ? 2 : day <= 270 ? 3 : 4, week: Math.ceil(day / 7), type: "lesson", cefr: "A1",
    title: bi, objectives: [bi], estimatedMinutes: 20, vocab: [],
    sections: [{
      skill: "listening", title: bi,
      exercises: exercises.length ? exercises : [{ id: `d${dd}-listen-01`, type: "dictation", instruction, audioText: "Hi." }],
    }],
    ...over,
  };
  return { file: `content/lessons/day-${dd}.json`, lesson };
}

function vocabOf(items: VocabItem[], file = "content/vocab/oxford-3000/a1.json"): LoadedVocab {
  return { file, items };
}

const text = (lessons: LoadedLesson[], vocab: LoadedVocab[]) => checkContent({ lessons, vocab }).map(formatProblem);

describe("checkContent", () => {
  const bank = [vocabOf([word("v-hello"), word("v-name"), word("v-cat")])];

  it("returns no problems for consistent content", () => {
    expect(text([lessonOf(1, { vocab: ["v-hello", "v-name"] }), lessonOf(2, { vocab: ["v-cat"] })], bank)).toEqual([]);
  });

  it("flags a lesson whose day does not match its filename", () => {
    const l = lessonOf(2);
    l.file = "content/lessons/day-003.json";
    const out = text([l], bank);
    expect(out).toHaveLength(1);
    expect(out[0]).toContain("content/lessons/day-003.json");
    expect(out[0]).toMatch(/day 2.*day-003/);
  });

  it("flags a lesson file that is not named day-XXX.json", () => {
    const l = lessonOf(1);
    l.file = "content/lessons/lesson-1.json";
    expect(text([l], bank).join("\n")).toContain("day-XXX.json");
  });

  it("flags duplicate exercise ids across lessons (naming both files)", () => {
    const ex = (day: string): Exercise => ({ id: "d001-listen-01", type: "dictation", instruction, audioText: day });
    const out = text([lessonOf(1, {}, [ex("a")]), lessonOf(2, {}, [ex("b")])], bank).join("\n");
    expect(out).toContain("duplicate exercise id d001-listen-01");
    expect(out).toContain("day-001.json");
    expect(out).toContain("day-002.json");
  });

  it("flags duplicate exercise ids within one lesson", () => {
    const ex: Exercise = { id: "d001-listen-01", type: "dictation", instruction, audioText: "a" };
    expect(text([lessonOf(1, {}, [ex, { ...ex }])], bank).join("\n")).toContain("duplicate exercise id d001-listen-01");
  });

  it("flags an exercise id whose day differs from the lesson day", () => {
    const ex: Exercise = { id: "d002-listen-01", type: "dictation", instruction, audioText: "a" };
    const out = text([lessonOf(1, {}, [ex])], bank);
    expect(out).toHaveLength(1);
    expect(out[0]).toContain("[d002-listen-01]");
    expect(out[0]).toContain("day 1");
  });

  it("flags duplicate vocab ids across bank files", () => {
    const b = [vocabOf([word("v-hello")]), vocabOf([word("v-hello")], "content/vocab/oxford-3000/a2.json")];
    const out = text([], b).join("\n");
    expect(out).toContain("duplicate vocab id v-hello");
    expect(out).toContain("a1.json");
    expect(out).toContain("a2.json");
  });

  it("flags a lesson.vocab id that is not in the bank", () => {
    const out = text([lessonOf(1, { vocab: ["v-ghost"] })], bank);
    expect(out).toHaveLength(1);
    expect(out[0]).toContain("v-ghost");
    expect(out[0]).toContain("not in the vocab bank");
  });

  it.each([
    ["vocab_match", { type: "vocab_match", pairs: [{ vocabId: "v-hello" }, { vocabId: "v-ghost" }] }],
    ["spell_word", { type: "spell_word", vocabId: "v-ghost" }],
    ["use_in_sentence", { type: "use_in_sentence", vocabId: "v-ghost", prompt: "x" }],
  ])("flags an unknown vocab id referenced from %s", (_t, body) => {
    const ex = { id: "d001-vocab-01", instruction, ...body } as Exercise;
    const out = text([lessonOf(1, { vocab: ["v-hello"] }, [ex])], bank);
    expect(out).toHaveLength(1);
    expect(out[0]).toContain("[d001-vocab-01]");
    expect(out[0]).toContain("v-ghost");
  });

  it("flags a word introduced as new in two lessons", () => {
    const out = text([lessonOf(1, { vocab: ["v-hello"] }), lessonOf(2, { vocab: ["v-hello"] })], bank).join("\n");
    expect(out).toContain("v-hello");
    expect(out).toMatch(/already introduced/);
    expect(out).toContain("day-001.json");
  });

  it("flags a word listed twice in the same lesson", () => {
    expect(text([lessonOf(1, { vocab: ["v-hello", "v-hello"] })], bank).join("\n")).toMatch(/listed twice in vocab/);
  });

  describe("CEFR level rule", () => {
    const b = [vocabOf([word("v-a1", "A1"), word("v-a2", "A2"), word("v-b1", "B1")], "content/vocab/test/words.json")];
    it("flags a word whose Oxford level is above the lesson cefr", () => {
      const out = text([lessonOf(1, { cefr: "A1", vocab: ["v-a2"] })], b);
      expect(out).toHaveLength(1);
      expect(out[0]).toMatch(/v-a2.*A2.*A1/);
    });
    it("accepts words at or below the lesson cefr", () => {
      expect(text([lessonOf(1, { cefr: "B1", vocab: ["v-a1", "v-a2", "v-b1"] })], b)).toEqual([]);
    });
    it("lets a preA1 lesson introduce A1 words (phase 1 rule)", () => {
      expect(text([lessonOf(1, { cefr: "preA1", vocab: ["v-a1"] })], b)).toEqual([]);
    });
    it("still rejects A2 words in a preA1 lesson", () => {
      expect(text([lessonOf(1, { cefr: "preA1", vocab: ["v-a2"] })], b)).toHaveLength(1);
    });
  });

  it("flags duplicate entries in a word's topics", () => {
    const out = text([], [vocabOf([word("v-x", "A1", ["greetings", "greetings"])])]);
    expect(out).toHaveLength(1);
    expect(out[0]).toContain("[v-x]");
    expect(out[0]).toContain("greetings");
  });

  describe("answer keys", () => {
    const check = (ex: Record<string, unknown>) =>
      text([lessonOf(1, {}, [{ id: "d001-listen-01", instruction, ...ex } as Exercise])], bank);

    it("listen_choose answer must index into choices", () => {
      const base = { type: "listen_choose", audioText: "x", question: bi, choices: ["a", "b"] };
      expect(check({ ...base, answer: 1 })).toEqual([]);
      const out = check({ ...base, answer: 2 });
      expect(out).toHaveLength(1);
      expect(out[0]).toContain("[d001-listen-01]");
      expect(out[0]).toContain("answer");
    });

    it("read_passage question answers must index into choices", () => {
      const base = { type: "read_passage", text: "t" };
      const q = (answer: number) => ({ question: bi, choices: ["a", "b"], answer });
      expect(check({ ...base, questions: [q(0), q(1)] })).toEqual([]);
      const out = check({ ...base, questions: [q(0), q(5)] });
      expect(out).toHaveLength(1);
      expect(out[0]).toContain("questions[1]");
    });

    it("arrange_words answer must use exactly the given words", () => {
      const base = { type: "arrange_words", words: ["name", "My", "Sam", "is"] };
      expect(check({ ...base, answer: "My name is Sam" })).toEqual([]);
      expect(check({ ...base, answer: "My name is Tom" })).toHaveLength(1);
      expect(check({ ...base, answer: "My name is" })).toHaveLength(1);
      expect(check({ ...base, answer: "My name is Sam Sam" })).toHaveLength(1);
    });

    it("arrange_words accept entries must use exactly the given words (case-insensitive: tile case follows the answer)", () => {
      const base = { type: "arrange_words", words: ["is", "pen", "This", "my"], answer: "This is my pen" };
      expect(check({ ...base, accept: ["Is this my pen"] })).toEqual([]);
      expect(check({ ...base, accept: ["Is this my pen", "This is my pen"] })).toEqual([]);
      const wrong = check({ ...base, accept: ["Is this my dog"] });
      expect(wrong).toHaveLength(1);
      expect(wrong[0]).toContain("accept");
      expect(check({ ...base, accept: ["Is this my"] })).toHaveLength(1);
      expect(check({ ...base, accept: ["Is  this my pen"] })).toHaveLength(1);
    });

    it("fill_blank needs one answer per ___", () => {
      expect(check({ type: "fill_blank", text: "My ___ is ___.", answer: ["name", "Sam"] })).toEqual([]);
      expect(check({ type: "fill_blank", text: "My ___ is Sam.", answer: ["name", "x"] })).toHaveLength(1);
      expect(check({ type: "fill_blank", text: "My name is Sam.", answer: ["name"] })).toHaveLength(1);
    });
  });

  it("reports every problem, one line each, not just the first", () => {
    const out = text([lessonOf(1, { vocab: ["v-ghost", "v-ghost2"] })], bank);
    expect(out).toHaveLength(2);
    for (const line of out) expect(line).not.toContain("\n");
  });
});

describe("formatProblem", () => {
  it("renders file, optional id and message on one line", () => {
    expect(formatProblem({ file: "f.json", message: "bad" })).toBe("f.json: bad");
    expect(formatProblem({ file: "f.json", id: "d001-x-01", message: "bad" })).toBe("f.json [d001-x-01]: bad");
  });
});

describe("summarize", () => {
  it("counts lessons, bank words, introduced words and the uncovered remainder", () => {
    const bank = [vocabOf([word("v-hello"), word("v-name"), word("v-cat")])];
    const s = summarize({ lessons: [lessonOf(1, { vocab: ["v-hello", "v-name"] })], vocab: bank });
    expect(s).toEqual({ lessons: 1, words: 3, introduced: 2, notIntroduced: 1 });
  });
});

describe("checkContent: bank consistency (M1)", () => {
  const w = (id: string, wordText: string, pos = "noun"): VocabItem => ({ ...word(id), word: wordText, pos });
  const bankOf = (...items: VocabItem[]) => [vocabOf(items)];

  it("flags two entries with the same (word, pos) under different ids", () => {
    const out = text([], bankOf(w("v-book", "book"), w("v-book-2", "Book")));
    expect(out.join("\n")).toMatch(/same word and pos as v-book/);
  });
  it("accepts the same word with a different pos", () => {
    expect(text([], bankOf(w("v-book", "book"), w("v-book-verb", "book", "verb")))).toEqual([]);
  });
  it("flags an id that does not match the word", () => {
    const out = text([], bankOf(w("v-apple", "banana")));
    expect(out).toHaveLength(1);
    expect(out[0]).toContain("[v-apple]");
    expect(out[0]).toContain("v-banana");
  });
  it.each([
    ["v-wake-up", "wake up", "verb"], ["v-o-clock", "o'clock", "adverb"],
    ["v-do", "do", "auxiliary verb"], ["v-do-auxiliary-verb", "do", "auxiliary verb"], ["v-do-verb", "do", "verb"],
  ])("accepts id %s for word %s (%s)", (id, wd, pos) => {
    expect(text([], bankOf(w(id, wd, pos)))).toEqual([]);
  });
  it("does not accept a pos suffix that differs from the pos", () => {
    expect(text([], bankOf(w("v-do-noun", "do", "verb")))).toHaveLength(1);
  });
});

describe("checkContent: files and levels (S4)", () => {
  const at = (file: string, item: VocabItem) => text([], [vocabOf([item], file)]);
  it("flags an entry whose level does not match its oxford-3000 file", () => {
    const out = at("content/vocab/oxford-3000/a2.json", word("v-x", "A1"));
    expect(out).toHaveLength(1);
    expect(out[0]).toContain("a2.json");
  });
  it("flags list 3000 in the oxford-5000 file and list 5000 in oxford-3000", () => {
    expect(at("content/vocab/oxford-5000/b2-c1.json", word("v-x", "B2"))).toHaveLength(1);
    const five: VocabItem = { ...word("v-x", "C1"), oxford: { list: "5000", level: "C1" } };
    expect(at("content/vocab/oxford-3000/b2.json", five).length).toBeGreaterThan(0);
    expect(at("content/vocab/oxford-5000/b2-c1.json", five)).toEqual([]);
  });
});

describe("checkContent: introduction order and limits (S5, S11, S8, N4)", () => {
  const bank = [vocabOf([word("v-hello"), word("v-name")])];
  const spell = (n: number): Exercise => ({ id: `d${String(n).padStart(3, "0")}-vocab-01`, type: "spell_word", instruction, vocabId: "v-name" });

  it("flags an exercise using a word that is introduced only in a later day", () => {
    const out = text([lessonOf(1, { vocab: ["v-hello"] }, [spell(1)]), lessonOf(2, { vocab: ["v-name"] })], bank);
    expect(out).toHaveLength(1);
    expect(out[0]).toContain("[d001-vocab-01]");
    expect(out[0]).toContain("not introduced");
  });
  it("accepts same-day and earlier introductions, whatever the input order", () => {
    const l1 = lessonOf(1, { vocab: ["v-hello"] });
    const l2 = lessonOf(2, { vocab: ["v-name"] }, [spell(2)]);
    const l3 = lessonOf(3, { type: "review" }, [spell(3)]);
    expect(text([l3, l2, l1], bank)).toEqual([]);
  });
  it("flags new vocab on non-lesson days", () => {
    const out = text([lessonOf(5, { type: "review", vocab: ["v-hello"] })], bank);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatch(/allowed only on "lesson" days/);
  });
  it("flags more than 12 new words in one lesson", () => {
    const items = Array.from({ length: 13 }, (_, i) => word(`v-w${i}`));
    const out = text([lessonOf(1, { vocab: items.map((i) => i.id) })], [vocabOf(items)]);
    expect(out).toHaveLength(1);
    expect(out[0]).toContain("13");
  });
  it("accepts exactly 12", () => {
    const items = Array.from({ length: 12 }, (_, i) => word(`v-w${i}`));
    expect(text([lessonOf(1, { vocab: items.map((i) => i.id) })], [vocabOf(items)])).toEqual([]);
  });
  it.each([
    ["week", { week: 3 }], ["phase", { phase: 2 }],
  ])("flags a wrong %s for the day", (_n, over) => {
    const out = text([lessonOf(1, over)], bank);
    expect(out).toHaveLength(1);
    expect(out[0]).toContain(_n);
  });
  it.each([[60, 1], [61, 2], [150, 2], [151, 3], [270, 3], [271, 4], [365, 4]])("day %i is phase %i", (d, ph) => {
    expect(text([lessonOf(d, { phase: ph as 1 | 2 | 3 | 4 })], bank).filter((l) => l.includes("phase"))).toEqual([]);
  });
  it("reports a day/filename mismatch once, not once per exercise", () => {
    const l = lessonOf(1);
    l.file = "content/lessons/day-002.json";
    l.lesson.sections[0].exercises = [
      { id: "d002-listen-01", type: "dictation", instruction, audioText: "a" },
      { id: "d002-listen-02", type: "dictation", instruction, audioText: "b" },
    ];
    expect(text([l], bank)).toHaveLength(1);
  });
  it("includes the vocab[i] path in lesson-level vocab problems", () => {
    expect(text([lessonOf(1, { vocab: ["v-hello", "v-ghost"] })], bank).join("\n")).toContain("vocab[1]");
  });
});

describe("checkContent: stricter answer rules (S3, S6, S10)", () => {
  const bank = [vocabOf([word("v-hello"), word("v-name")])];
  const check = (ex: Record<string, unknown>, vocab: string[] = ["v-hello", "v-name"]) =>
    text([lessonOf(1, { vocab }, [{ id: "d001-listen-01", instruction, ...ex } as Exercise])], bank);

  it("fill_blank: a blank is exactly three underscores", () => {
    expect(check({ type: "fill_blank", text: "My __ is Sam.", answer: ["name"] }).join("\n")).toContain("underscore");
    expect(check({ type: "fill_blank", text: "My ____ is Sam.", answer: ["name"] }).join("\n")).toContain("underscore");
    expect(check({ type: "fill_blank", text: "My ___ is Sam.", answer: ["name"] })).toEqual([]);
  });
  it("rejects duplicate choices (trimmed, case-insensitive)", () => {
    const base = { type: "listen_choose", audioText: "x", question: bi, answer: 0 };
    expect(check({ ...base, choices: ["Sam", "sam "] }).join("\n")).toContain("duplicate choice");
    const rp = { type: "read_passage", text: "t", questions: [{ question: bi, choices: ["a", "A"], answer: 0 }] };
    expect(check(rp).join("\n")).toContain("questions[0]");
  });
  it("rejects minimal_pair with a equal to b", () => {
    expect(check({ type: "minimal_pair", pairs: [{ a: "bad", b: "Bad", answer: "a" }] }).join("\n")).toContain("pairs[0]");
  });
  it("rejects duplicate vocabId in one vocab_match", () => {
    const out = check({ type: "vocab_match", pairs: [{ vocabId: "v-hello" }, { vocabId: "v-hello" }] });
    expect(out.join("\n")).toContain("duplicate");
  });
  it("arrange_words: multi-word tiles are split into tokens", () => {
    const base = { type: "arrange_words", words: ["I", "live", "in", "New York"] };
    expect(check({ ...base, answer: "I live in New York" })).toEqual([]);
  });
  it("arrange_words: answer must be single-spaced", () => {
    const out = check({ type: "arrange_words", words: ["My", "name"], answer: "My  name" });
    expect(out.join("\n")).toContain("single");
  });
});

describe("checkContent: checkpoints", () => {
  const bank = [vocabOf([word("v-hello"), word("v-name"), word("v-cat")])];
  const cp = (exercises: Exercise[], file = "content/checkpoints/checkpoint-030.json"): LoadedCheckpoint => ({
    file, checkpoint: { afterDay: 30, cefr: "preA1", title: bi, estimatedMinutes: 30, sections: [{ skill: "listening", title: bi, weight: 100, reviewDays: [1], exercises }] },
  });
  const dict = (id: string): Exercise => ({ id, type: "dictation", instruction, audioText: "Hi." });
  const run = (checkpoints: LoadedCheckpoint[], lessons = [lessonOf(1, { vocab: ["v-hello", "v-name", "v-cat"] })]) =>
    checkContent({ lessons, vocab: bank, checkpoints }).map(formatProblem);

  it("no checkpoints (field absent or empty): nothing changes", () => {
    expect(run([])).toEqual([]);
    expect(checkContent({ lessons: [lessonOf(1)], vocab: bank }).map(formatProblem)).toEqual([]);
  });
  it("a consistent checkpoint has no structural problems", () => {
    expect(run([cp([dict("c030-listen-01")])])).toEqual([]);
  });
  it("flags a duplicate exercise id inside one checkpoint and across two files, naming the first file", () => {
    const a = cp([dict("c030-listen-01"), dict("c030-listen-01")]);
    expect(run([a])[0]).toMatch(/duplicate exercise id c030-listen-01 \(also in content\/checkpoints\/checkpoint-030\.json\)/);
    const b = cp([dict("c030-listen-01")], "content/checkpoints/checkpoint-060.json");
    expect(run([cp([dict("c030-listen-01")]), b]).join("\n")).toMatch(/checkpoint-060\.json \[c030-listen-01\]: duplicate exercise id/);
  });
  it("flags a c-id in a lesson file (checkpoint ids belong in checkpoint files)", () => {
    const l = lessonOf(1, {}, [dict("c001-listen-01")]);
    const out = text([l], bank);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatch(/\[c001-listen-01\].*lesson.*must start with d001-/);
  });
  it("does not report a lesson id that matches the day twice", () => {
    expect(text([lessonOf(1)], bank)).toEqual([]);
  });
  it("applies the answer checks to checkpoint exercises (arrange_words must use exactly the tiles)", () => {
    const bad: Exercise = { id: "c030-write-01", type: "arrange_words", instruction, words: ["a", "b"], answer: "a c" };
    expect(run([cp([bad])]).join("\n")).toMatch(/checkpoint-030\.json \[c030-write-01\]: answer "a c" does not use exactly the given words/);
  });
  it("flags a vocab_match word that is not in the bank (words not yet taught are the rule's job, rules/checkpoint.ts)", () => {
    const vm: Exercise = { id: "c030-vocab-01", type: "vocab_match", instruction, pairs: [{ vocabId: "v-cat" }, { vocabId: "v-nope" }] };
    expect(run([cp([vm])]).join("\n")).toMatch(/checkpoint-030\.json \[c030-vocab-01\]: v-nope is not in the vocab bank/);
  });
});
