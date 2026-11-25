// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Exercise, Lesson, VocabItem } from "./schema";
import { checkContent, formatProblem, summarize, type LoadedLesson, type LoadedVocab } from "./validate";

const bi = { en: "Hello", th: "สวัสดี" };
const instruction = { th: "ทำตามคำสั่ง" };

function word(id: string, level: VocabItem["oxford"]["level"] = "A1", topics: string[] = ["greetings"]): VocabItem {
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
    day, phase: 1, week: 1, type: "lesson", cefr: "A1",
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
    const out = text([lessonOf(1, {}, [ex])], bank);
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
    expect(text([lessonOf(1, { vocab: ["v-hello", "v-hello"] })], bank).join("\n")).toMatch(/already introduced/);
  });

  describe("CEFR level rule", () => {
    const b = [vocabOf([word("v-a1", "A1"), word("v-a2", "A2"), word("v-b1", "B1")])];
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

  it("flags vocab topics that are not in VOCABULARY.md", () => {
    const out = text([], [vocabOf([word("v-x", "A1", ["greetings", "wibble"])])]);
    expect(out).toHaveLength(1);
    expect(out[0]).toContain("v-x");
    expect(out[0]).toContain("wibble");
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
