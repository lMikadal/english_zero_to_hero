import { describe, expect, it } from "vitest";
import type { AttemptAnswer } from "@/lib/attempts/contract";
import type { Exercise, ExerciseType } from "@/lib/content/schema";
import {
  correctAnswerText, countWords, gradeExercise, isRetryable, RETRYABLE_TYPES, SUPPORTED_TYPES, UNGRADED_TYPES,
} from "./grade";
import { allExercises, get } from "./test-content";

const ok = { kind: "self", rating: "ok" } as const;
const unsure = { kind: "self", rating: "unsure" } as const;

type Case = {
  id: string;
  right: AttemptAnswer;
  wrong: AttemptAnswer;
  /** an answer of the wrong kind for this type */
  otherKind: AttemptAnswer;
  /** expected result of `wrong` */
  wrongGrade: { correct: boolean; score: number | null };
  rightGrade?: { correct: boolean; score: number | null };
};
const text = (t: string): AttemptAnswer => ({ kind: "text", text: t });

// one case per exercise type that appears in days 1-7 (phoneme_intro is covered separately)
const cases: Record<Exclude<ExerciseType, "phoneme_intro" | "roleplay" | "spell_word" | "use_in_sentence">, Case> = {
  listen_choose: {
    id: "d001-listen-01", right: { kind: "choice", selected: 0 }, wrong: { kind: "choice", selected: 2 }, otherKind: text("Sam"),
    wrongGrade: { correct: false, score: 0 },
  },
  read_passage: {
    id: "d001-read-01", right: { kind: "choices", selected: [1] }, wrong: { kind: "choices", selected: [0] }, otherKind: { kind: "choice", selected: 1 },
    wrongGrade: { correct: false, score: 0 },
  },
  minimal_pair: {
    id: "d001-pron-02", right: { kind: "pairs", selected: ["a", "b", "a"] }, wrong: { kind: "pairs", selected: ["b", "a", "b"] },
    otherKind: { kind: "choices", selected: [0, 1, 0] }, wrongGrade: { correct: false, score: 0 },
  },
  dictation: {
    id: "d001-listen-02", right: text("nice to meet you"), wrong: text("nice to see you"), otherKind: { kind: "choice", selected: 0 },
    wrongGrade: { correct: false, score: 0 },
  },
  translate_th_en: {
    id: "d001-write-02", right: text("Nice to meet you!"), wrong: text("Hello"), otherKind: { kind: "texts", texts: ["Nice to meet you"] },
    wrongGrade: { correct: false, score: 0 },
  },
  arrange_words: {
    id: "d001-write-01", right: text("My name is Sam"), wrong: text("name My is Sam"), otherKind: { kind: "texts", texts: ["My name is Sam"] },
    wrongGrade: { correct: false, score: 0 },
  },
  fill_blank: {
    id: "d003-write-03", right: { kind: "texts", texts: ["from"] }, wrong: { kind: "texts", texts: ["to"] }, otherKind: text("from"),
    wrongGrade: { correct: false, score: 0 },
  },
  vocab_match: {
    id: "d003-write-04",
    right: { kind: "match", pairs: Object.fromEntries(["v-where", "v-country", "v-city", "v-sit", "v-big", "v-fish"].map((v) => [v, v])) },
    wrong: { kind: "match", pairs: { "v-where": "v-country", "v-country": "v-where", "v-city": "v-sit", "v-sit": "v-city", "v-big": "v-fish", "v-fish": "v-big" } },
    otherKind: { kind: "texts", texts: [] }, wrongGrade: { correct: false, score: 0 },
  },
  repeat_after_me: { id: "d001-pron-03", right: ok, wrong: unsure, otherKind: text("Hello"), wrongGrade: { correct: false, score: null } },
  shadowing: { id: "d001-speak-01", right: ok, wrong: unsure, otherKind: text("Hello"), wrongGrade: { correct: false, score: null } },
  speak_answer: { id: "d001-speak-02", right: ok, wrong: unsure, otherKind: text("Hello"), wrongGrade: { correct: false, score: null } },
  free_write: {
    id: "d007-write-01", right: text("My name is Mai. I am from Thailand. I am fine today. My name is M, A, I."), wrong: text("My name is Mai."),
    otherKind: { kind: "texts", texts: ["My name is Mai."] }, wrongGrade: { correct: false, score: null },
  },
};

describe("gradeExercise on real days 1-7 content", () => {
  it.each(Object.entries(cases))("%s: right, wrong and wrong-kind (%s)", (type, c) => {
    const ex = get(c.id);
    expect(ex.type).toBe(type);
    const right = gradeExercise(ex, c.right);
    expect(right).toEqual(c.rightGrade ?? { correct: true, score: type === "free_write" || c.right.kind === "self" ? null : 1 });
    expect(gradeExercise(ex, c.wrong)).toEqual(c.wrongGrade);
    expect(gradeExercise(ex, c.otherKind)).toEqual({ error: "kind_mismatch" });
  });

  it("covers every type that appears in days 1-7", () => {
    const types = new Set(allExercises().map((e) => e.exercise.type));
    expect([...types].filter((t) => t !== "phoneme_intro" && !(t in cases))).toEqual([]);
    expect([...types].sort()).toEqual([...SUPPORTED_TYPES].sort());
    expect(SUPPORTED_TYPES).toHaveLength(13);
  });

  it("phoneme_intro has no attempt row: it is unsupported for grading", () => {
    expect(UNGRADED_TYPES).toEqual(["phoneme_intro"]);
    expect(gradeExercise(get("d001-pron-01"), ok)).toEqual({ error: "unsupported" });
  });

  it("roleplay, spell_word and use_in_sentence are unsupported", () => {
    const rp = { id: "d001-speak-09", type: "roleplay", instruction: { th: "ก" }, scenario: { en: "x", th: "ก" }, aiRole: "x", goals: [{ en: "x", th: "ก" }] } as Exercise;
    expect(gradeExercise(rp, ok)).toEqual({ error: "unsupported" });
    expect(gradeExercise({ id: "d001-vocab-01", type: "spell_word", instruction: { th: "ก" }, vocabId: "v-cat" }, text("cat"))).toEqual({ error: "unsupported" });
  });
});

describe("self-rated speaking: score is null (decisions item 1)", () => {
  it.each(["d001-pron-03", "d001-speak-01", "d001-speak-02", "d002-speak-03"])("%s ok -> correct, score null", (id) => {
    expect(gradeExercise(get(id), ok)).toEqual({ correct: true, score: null });
    expect(gradeExercise(get(id), { kind: "self", rating: "unsure", recordingId: "7b0f6f4e-5c1b-4f55-9a43-0d1c2e3f4a5b" })).toEqual({ correct: false, score: null });
  });
});

describe("free_write", () => {
  const ex = get("d007-write-01"); // minWords 15
  const words = (n: number) => text(Array(n).fill("word").join(" "));
  it("passes at exactly minWords and fails below, always with score null", () => {
    expect(gradeExercise(ex, words(15))).toEqual({ correct: true, score: null });
    expect(gradeExercise(ex, words(14))).toEqual({ correct: false, score: null });
    expect(gradeExercise(ex, words(0))).toEqual({ correct: false, score: null });
  });
  it("countWords", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("  Hello   world \n again ")).toBe(3);
    expect(countWords("I am - fine ... ok")).toBe(4); // bare punctuation is not a word
    expect(countWords("M, A, I.")).toBe(3);
  });
});

describe("fractional scores (0..1) for multi-item exercises", () => {
  it("minimal_pair: 2 of 3 right is 2/3 and not fully correct", () => {
    expect(gradeExercise(get("d001-pron-02"), { kind: "pairs", selected: ["a", "b", "b"] })).toEqual({ correct: false, score: 2 / 3 });
  });
  it("read_passage with several questions", () => {
    const multi = allExercises().find((e) => e.exercise.type === "read_passage" && e.exercise.questions.length > 1);
    if (!multi || multi.exercise.type !== "read_passage") throw new Error("expected a multi-question read_passage in days 1-7");
    const q = multi.exercise.questions;
    const sel = q.map((x, i) => (i === 0 ? x.answer : (x.answer + 1) % x.choices.length));
    expect(gradeExercise(multi.exercise, { kind: "choices", selected: sel })).toEqual({ correct: false, score: 1 / q.length });
  });
  it("vocab_match: 3 of 6 right is 0.5; missing keys count as wrong", () => {
    const ex = get("d003-write-04");
    const pairs = { "v-where": "v-where", "v-country": "v-country", "v-city": "v-city" };
    expect(gradeExercise(ex, { kind: "match", pairs })).toEqual({ correct: false, score: 0.5 });
  });
  it("vocab_match ignores keys that are not in the exercise", () => {
    const ex = get("d003-write-04");
    const all = Object.fromEntries(["v-where", "v-country", "v-city", "v-sit", "v-big", "v-fish"].map((v) => [v, v]));
    expect(gradeExercise(ex, { kind: "match", pairs: { ...all, "v-cat": "v-cat" } })).toEqual({ correct: true, score: 1 });
  });
});

describe("dictation", () => {
  it("accepts punctuation, case and curly-apostrophe variants of accept[]", () => {
    expect(gradeExercise(get("d003-listen-03"), text("i’m from bangkok"))).toEqual({ correct: true, score: 1 });
    expect(gradeExercise(get("d003-listen-03"), text("I AM FROM BANGKOK."))).toEqual({ correct: true, score: 1 });
  });
  it("falls back to audioText when there is no accept list", () => {
    const ex = { ...get("d001-listen-02"), accept: undefined } as Exercise;
    expect(gradeExercise(ex, text("Nice to meet you!"))).toEqual({ correct: true, score: 1 });
    expect(gradeExercise(ex, text("Nice to meet"))).toEqual({ correct: false, score: 0 });
  });
  it("always accepts audioText even if accept[] omits it", () => {
    const ex = { ...get("d001-listen-02"), accept: ["Hi there"] } as Exercise;
    expect(gradeExercise(ex, text("nice to meet you"))).toEqual({ correct: true, score: 1 });
    expect(gradeExercise(ex, text("hi there"))).toEqual({ correct: true, score: 1 });
  });
  it("an empty answer is wrong", () => {
    expect(gradeExercise(get("d001-listen-02"), text("  "))).toEqual({ correct: false, score: 0 });
  });
  it("d005-listen-02 (spelled letters): BUS and b-u-s variants", () => {
    expect(gradeExercise(get("d005-listen-02"), text("bus"))).toEqual({ correct: true, score: 1 });
    expect(gradeExercise(get("d005-listen-02"), text("b-u-s"))).toEqual({ correct: true, score: 1 });
  });
});

describe("length mismatches are kind_mismatch", () => {
  it("minimal_pair with the wrong number of selections", () => {
    expect(gradeExercise(get("d001-pron-02"), { kind: "pairs", selected: ["a"] })).toEqual({ error: "kind_mismatch" });
  });
  it("read_passage with the wrong number of selections", () => {
    expect(gradeExercise(get("d001-read-01"), { kind: "choices", selected: [1, 1] })).toEqual({ error: "kind_mismatch" });
  });
  it("fill_blank with the wrong number of blanks", () => {
    expect(gradeExercise(get("d003-write-03"), { kind: "texts", texts: ["from", "x"] })).toEqual({ error: "kind_mismatch" });
  });
});

describe("isRetryable (end-of-lesson retry round)", () => {
  it("is true only for auto-graded types", () => {
    for (const t of ["listen_choose", "read_passage", "minimal_pair", "dictation", "translate_th_en", "arrange_words", "fill_blank", "vocab_match"] as const) {
      expect(isRetryable(t)).toBe(true);
    }
    expect([...RETRYABLE_TYPES]).toHaveLength(8);
  });
  it("is false for phoneme_intro, self-rated speaking, free_write and unsupported types", () => {
    for (const t of ["phoneme_intro", "repeat_after_me", "shadowing", "speak_answer", "free_write", "roleplay", "spell_word", "use_in_sentence"] as const) {
      expect(isRetryable(t)).toBe(false);
    }
  });
});

describe("correctAnswerText", () => {
  it.each([
    ["d001-listen-01", "Sam"],
    ["d001-read-01", "Ann"],
    ["d001-pron-02", "bad, men, cat"],
    ["d001-listen-02", "Nice to meet you."],
    ["d001-write-02", "Nice to meet you"],
    ["d001-write-01", "My name is Sam"],
    ["d003-write-03", "from"],
  ])("%s -> %s", (id, text) => expect(correctAnswerText(get(id))).toBe(text));
  it("is null for types with nothing to reveal", () => {
    for (const id of ["d001-pron-01", "d001-pron-03", "d001-speak-01", "d001-speak-02", "d007-write-01", "d003-write-04"]) {
      expect(correctAnswerText(get(id))).toBeNull();
    }
  });
});
