// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  EXERCISE_ID_PATTERN,
  EXERCISE_TYPES,
  TOPICS,
  exerciseSchema,
  lessonSchema,
  sectionSchema,
  vocabFileSchema,
  vocabItemSchema,
} from "./schema";

const instruction = { th: "ทำตามคำสั่ง" };
const bi = { en: "Hello", th: "สวัสดี" };

// One minimal valid exercise per type.
const valid: Record<string, unknown> = {
  phoneme_intro: { id: "d001-pron-01", type: "phoneme_intro", instruction, phoneme: "ae", ipa: "/æ/", tipTh: "อ้าปากกว้าง", examples: ["cat", "bad"] },
  minimal_pair: { id: "d001-pron-02", type: "minimal_pair", instruction, pairs: [{ a: "bad", b: "bed", answer: "a" }] },
  repeat_after_me: { id: "d001-pron-03", type: "repeat_after_me", instruction, text: "The cat is bad.", ipa: "/ðə kæt ɪz bæd/" },
  listen_choose: { id: "d001-listen-01", type: "listen_choose", instruction, audioText: "Hello, I am Sam.", question: bi, choices: ["Sam", "Ann"], answer: 0 },
  dictation: { id: "d001-listen-02", type: "dictation", instruction, audioText: "Nice to meet you.", accept: ["nice to meet you"] },
  shadowing: { id: "d001-speak-01", type: "shadowing", instruction, lines: ["Hello!", "My name is Ann."] },
  speak_answer: { id: "d001-speak-02", type: "speak_answer", instruction, prompt: "What's your name?", sampleAnswer: "My name is Ann.", keywords: ["name"] },
  roleplay: { id: "d001-speak-03", type: "roleplay", instruction, scenario: bi, aiRole: "A friendly waiter", goals: [bi] },
  read_passage: { id: "d001-read-01", type: "read_passage", instruction, text: "Sam: Hello!", glossary: { too: "ด้วย" }, questions: [{ question: bi, choices: ["Sam", "Ann"], answer: 1 }] },
  arrange_words: { id: "d001-write-01", type: "arrange_words", instruction, words: ["name", "My", "Sam", "is"], answer: "My name is Sam" },
  fill_blank: { id: "d001-write-02", type: "fill_blank", instruction, text: "My ___ is Sam.", answer: ["name"] },
  translate_th_en: { id: "d001-write-03", type: "translate_th_en", instruction, th: "ยินดีที่ได้รู้จัก", accept: ["Nice to meet you"] },
  free_write: { id: "d001-write-04", type: "free_write", instruction, prompt: "Introduce yourself.", minWords: 10, rubric: ["uses 'My name is'"] },
  vocab_match: { id: "d001-vocab-01", type: "vocab_match", instruction, pairs: [{ vocabId: "v-hello" }, { vocabId: "v-name" }] },
  spell_word: { id: "d001-vocab-02", type: "spell_word", instruction, vocabId: "v-hello" },
  use_in_sentence: { id: "d001-vocab-03", type: "use_in_sentence", instruction, vocabId: "v-name", prompt: "Use the word in a sentence." },
};

describe("exerciseSchema", () => {
  it("covers every documented exercise type", () => {
    expect([...EXERCISE_TYPES].sort()).toEqual(Object.keys(valid).sort());
  });

  it.each(Object.entries(valid))("accepts a valid %s", (_type, ex) => {
    expect(exerciseSchema.safeParse(ex).success).toBe(true);
  });

  it.each(Object.entries(valid))("rejects an unknown key on %s", (_type, ex) => {
    const r = exerciseSchema.safeParse({ ...(ex as object), anserr: 1 });
    expect(r.success).toBe(false);
  });

  it.each(Object.entries(valid))("accepts an optional phonemes list on %s", (_type, ex) => {
    expect(exerciseSchema.safeParse({ ...(ex as object), phonemes: ["ae", "eh"] }).success).toBe(true);
  });

  it("rejects an empty or blank phonemes list", () => {
    const ex = valid.dictation as object;
    expect(exerciseSchema.safeParse({ ...ex, phonemes: [] }).success).toBe(false);
    expect(exerciseSchema.safeParse({ ...ex, phonemes: [" ae"] }).success).toBe(false);
  });

  it("arrange_words takes an optional accept list of alternative sentences", () => {
    const ex = valid.arrange_words as object;
    expect(exerciseSchema.safeParse({ ...ex, accept: ["Sam is my name"] }).success).toBe(true);
    expect(exerciseSchema.safeParse({ ...ex, accept: [] }).success).toBe(false);
  });

  it("exports the exercise id pattern", () => {
    expect(EXERCISE_ID_PATTERN.test("d001-pron-01")).toBe(true);
    expect(EXERCISE_ID_PATTERN.test("d001-foo-01")).toBe(false);
    expect(EXERCISE_ID_PATTERN.test("d1-pron-01")).toBe(false);
  });

  it("rejects an unknown type", () => {
    expect(exerciseSchema.safeParse({ ...(valid.dictation as object), type: "dictaton" }).success).toBe(false);
  });

  it("requires instruction.th", () => {
    const { instruction: _omit, ...rest } = valid.dictation as Record<string, unknown>;
    void _omit;
    expect(exerciseSchema.safeParse(rest).success).toBe(false);
    expect(exerciseSchema.safeParse({ ...rest, instruction: { en: "x" } }).success).toBe(false);
  });

  it("accepts instruction.en as optional extra", () => {
    expect(exerciseSchema.safeParse({ ...(valid.dictation as object), instruction: { th: "ก", en: "a" } }).success).toBe(true);
  });

  it.each(["x001-pron-01", "d1-pron-01", "d001-pron-1", "d001-Pron-01", "d001_pron_01", "d001-pron-01-b", "d001-foo-01"])(
    "rejects malformed exercise id %s",
    (id) => {
      expect(exerciseSchema.safeParse({ ...(valid.dictation as object), id }).success).toBe(false);
    },
  );

  it("rejects minimal_pair answer other than a or b", () => {
    const bad = { ...(valid.minimal_pair as object), pairs: [{ a: "bad", b: "bed", answer: "c" }] };
    expect(exerciseSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects listen_choose with a plain-string question (must be {en, th})", () => {
    expect(exerciseSchema.safeParse({ ...(valid.listen_choose as object), question: "What?" }).success).toBe(false);
  });

  it("rejects listen_choose with a non-integer or negative answer", () => {
    expect(exerciseSchema.safeParse({ ...(valid.listen_choose as object), answer: 0.5 }).success).toBe(false);
    expect(exerciseSchema.safeParse({ ...(valid.listen_choose as object), answer: -1 }).success).toBe(false);
  });

  it("rejects read_passage question items with unknown keys or missing choices", () => {
    const q = { question: bi, choices: ["a", "b"], answer: 0 };
    const mk = (item: unknown) => ({ ...(valid.read_passage as object), questions: [item] });
    expect(exerciseSchema.safeParse(mk({ ...q, extra: 1 })).success).toBe(false);
    expect(exerciseSchema.safeParse(mk({ question: bi, answer: 0 })).success).toBe(false);
  });

  it("rejects empty lists where at least one item is required", () => {
    expect(exerciseSchema.safeParse({ ...(valid.shadowing as object), lines: [] }).success).toBe(false);
    expect(exerciseSchema.safeParse({ ...(valid.translate_th_en as object), accept: [] }).success).toBe(false);
    expect(exerciseSchema.safeParse({ ...(valid.minimal_pair as object), pairs: [] }).success).toBe(false);
  });

  it("rejects a malformed vocab id reference", () => {
    expect(exerciseSchema.safeParse({ ...(valid.spell_word as object), vocabId: "hello" }).success).toBe(false);
  });

  it("rejects free_write minWords that is not a positive integer", () => {
    expect(exerciseSchema.safeParse({ ...(valid.free_write as object), minWords: 0 }).success).toBe(false);
  });

  it("lets optional fields be omitted", () => {
    const { ipa: _i, ...r } = valid.repeat_after_me as Record<string, unknown>;
    void _i;
    expect(exerciseSchema.safeParse(r).success).toBe(true);
    const { accept: _a, ...d } = valid.dictation as Record<string, unknown>;
    void _a;
    expect(exerciseSchema.safeParse(d).success).toBe(true);
  });
});

describe("string rules (S2)", () => {
  const dict = valid.dictation as Record<string, unknown>;
  it.each(["   ", " hello", "hello ", "\thello"])("rejects whitespace-padded or blank string %j", (v) => {
    expect(exerciseSchema.safeParse({ ...dict, audioText: v }).success).toBe(false);
    expect(exerciseSchema.safeParse({ ...dict, accept: [v] }).success).toBe(false);
  });
  it("requires Thai characters in every th field", () => {
    expect(exerciseSchema.safeParse({ ...dict, instruction: { th: "do it" } }).success).toBe(false);
    expect(exerciseSchema.safeParse({ ...(valid.listen_choose as object), question: { en: "x", th: "x" } }).success).toBe(false);
    expect(exerciseSchema.safeParse({ ...(valid.phoneme_intro as object), tipTh: "open wide" }).success).toBe(false);
    expect(exerciseSchema.safeParse({ ...(valid.translate_th_en as object), th: "hello" }).success).toBe(false);
    expect(exerciseSchema.safeParse({ ...(valid.read_passage as object), glossary: { too: "also" } }).success).toBe(false);
    expect(lessonSchema.safeParse({ ...lesson, title: { en: "x", th: "x" } }).success).toBe(false);
  });
  it("requires Thai in vocab th and example th", () => {
    expect(vocabItemSchema.safeParse({ ...word, th: "meet" }).success).toBe(false);
    expect(vocabItemSchema.safeParse({ ...word, examples: [{ en: "x", th: "x" }] }).success).toBe(false);
  });
});

describe("oxford list/level (S4) and topics (S13)", () => {
  it.each([["3000", "C1"], ["5000", "A1"], ["5000", "A2"], ["5000", "B1"]])("rejects list %s with level %s", (list, level) => {
    expect(vocabItemSchema.safeParse({ ...word, oxford: { list, level } }).success).toBe(false);
  });
  it.each([["3000", "B2"], ["5000", "B2"], ["5000", "C1"]])("accepts list %s with level %s", (list, level) => {
    expect(vocabItemSchema.safeParse({ ...word, oxford: { list, level } }).success).toBe(true);
  });
  it("names the bad topic slug in the error", () => {
    const r = vocabItemSchema.safeParse({ ...word, topics: ["greetings", "wibble"] });
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain("wibble");
  });
});

describe("sectionSchema", () => {
  const section = { skill: "listening", title: bi, exercises: [valid.dictation] };
  it("accepts a valid section", () => {
    expect(sectionSchema.safeParse(section).success).toBe(true);
  });
  it("rejects an unknown skill, empty exercises and unknown keys", () => {
    expect(sectionSchema.safeParse({ ...section, skill: "singing" }).success).toBe(false);
    expect(sectionSchema.safeParse({ ...section, exercises: [] }).success).toBe(false);
    expect(sectionSchema.safeParse({ ...section, extra: 1 }).success).toBe(false);
  });
});

const lesson = {
  day: 1, phase: 1, week: 1, type: "lesson", cefr: "preA1",
  title: bi, objectives: [bi], estimatedMinutes: 30,
  vocab: ["v-hello"],
  sections: [{ skill: "listening", title: bi, exercises: [valid.dictation] }],
};

describe("lessonSchema", () => {
  it("accepts a valid lesson", () => {
    expect(lessonSchema.safeParse(lesson).success).toBe(true);
  });
  it("rejects unknown top-level keys", () => {
    expect(lessonSchema.safeParse({ ...lesson, estimatedMinuts: 5 }).success).toBe(false);
  });
  it.each([
    ["day", 0], ["day", 366], ["phase", 5], ["week", 54], ["type", "quiz"], ["cefr", "Z9"], ["estimatedMinutes", 0],
  ])("rejects out-of-range %s=%s", (k, v) => {
    expect(lessonSchema.safeParse({ ...lesson, [k]: v }).success).toBe(false);
  });
  it("accepts C1 as lesson cefr (phase 4 introduces C1 words)", () => {
    expect(lessonSchema.safeParse({ ...lesson, cefr: "C1" }).success).toBe(true);
  });
  it("allows empty vocab (review days) but not empty sections", () => {
    expect(lessonSchema.safeParse({ ...lesson, vocab: [] }).success).toBe(true);
    expect(lessonSchema.safeParse({ ...lesson, sections: [] }).success).toBe(false);
  });
  it("rejects titles that are not bilingual", () => {
    expect(lessonSchema.safeParse({ ...lesson, title: "Hello" }).success).toBe(false);
    expect(lessonSchema.safeParse({ ...lesson, title: { en: "Hello" } }).success).toBe(false);
  });
});

const word = {
  id: "v-meet", word: "meet", pos: "verb",
  oxford: { list: "3000", level: "A1" },
  ipa: { us: "/miːt/", uk: "/miːt/" },
  th: "พบ", topics: ["greetings"],
  examples: [{ en: "Nice to meet you.", th: "ยินดีที่ได้รู้จัก" }],
  forms: { past: "met", pastParticiple: "met" },
};

describe("vocabItemSchema", () => {
  it("accepts a valid item, with and without optional fields", () => {
    expect(vocabItemSchema.safeParse(word).success).toBe(true);
    expect(vocabItemSchema.safeParse({ ...word, collocations: ["meet up"] }).success).toBe(true);
  });
  it("rejects unknown keys, bad ids, empty topics and empty examples", () => {
    expect(vocabItemSchema.safeParse({ ...word, level: "A1" }).success).toBe(false);
    expect(vocabItemSchema.safeParse({ ...word, id: "meet" }).success).toBe(false);
    expect(vocabItemSchema.safeParse({ ...word, topics: [] }).success).toBe(false);
    expect(vocabItemSchema.safeParse({ ...word, examples: [] }).success).toBe(false);
  });
  it("rejects bad oxford values", () => {
    expect(vocabItemSchema.safeParse({ ...word, oxford: { list: "3000", level: "C2" } }).success).toBe(false);
    expect(vocabItemSchema.safeParse({ ...word, oxford: { list: "4000", level: "A1" } }).success).toBe(false);
  });
  it("accepts v-book-verb style ids", () => {
    expect(vocabItemSchema.safeParse({ ...word, id: "v-book-verb" }).success).toBe(true);
  });
  it("vocab file is an array of items", () => {
    expect(vocabFileSchema.safeParse([word]).success).toBe(true);
    expect(vocabFileSchema.safeParse(word).success).toBe(false);
  });
});

describe("TOPICS", () => {
  it("has the 19 topics of VOCABULARY.md section 3", () => {
    expect(TOPICS).toHaveLength(19);
    expect(TOPICS).toContain("greetings");
    expect(TOPICS).toContain("function_words");
  });
});
