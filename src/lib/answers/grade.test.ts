import { describe, expect, it } from "vitest";
import type { AttemptAnswer } from "@/lib/attempts/contract";
import type { Exercise, ExerciseType } from "@/lib/content/schema";
import {
  correctAnswerText, countWords, gradeExercise, isAttemptNoAllowed, isRetryable, RETRYABLE_TYPES, SUPPORTED_TYPES, UNGRADED_TYPES,
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
const cases: Record<Exclude<ExerciseType, "phoneme_intro" | "grammar_note" | "roleplay" | "spell_word" | "use_in_sentence">, Case> = {
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
    expect(right).toMatchObject(c.rightGrade ?? { correct: true, score: type === "free_write" || c.right.kind === "self" ? null : 1 });
    expect(gradeExercise(ex, c.wrong)).toMatchObject(c.wrongGrade);
    expect(gradeExercise(ex, c.otherKind)).toEqual({ error: "kind_mismatch" });
  });

  it("covers every type that appears in days 1-7", () => {
    const types = new Set(allExercises().map((e) => e.exercise.type));
    expect([...types].filter((t) => t !== "phoneme_intro" && !(t in cases))).toEqual([]);
    expect([...types].sort()).toEqual([...SUPPORTED_TYPES].filter((t) => t !== "grammar_note").sort());
    expect(SUPPORTED_TYPES).toHaveLength(14);
  });

  it("phoneme_intro has no attempt row: it is unsupported for grading", () => {
    expect(UNGRADED_TYPES).toEqual(["phoneme_intro", "grammar_note"]);
    expect(gradeExercise(get("d001-pron-01"), ok)).toEqual({ error: "unsupported" });
  });

  it("grammar_note is a teaching card like phoneme_intro: no attempt, no grade, no retry", () => {
    const note = { id: "d036-read-01", type: "grammar_note", instruction: { th: "ก" }, titleTh: "ก", bodyTh: "ก", examples: [{ en: "I like tea.", th: "ก" }], structures: ["third-person-s"] } as Exercise;
    expect(UNGRADED_TYPES).toContain("grammar_note");
    expect(gradeExercise(note, ok)).toEqual({ error: "unsupported" });
    expect(isRetryable("grammar_note")).toBe(false);
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

describe("fractional scores (0..1) and per-item feedback for multi-item exercises", () => {
  it("minimal_pair: 2 of 3 right is 2/3, not fully correct, items in pair order", () => {
    expect(gradeExercise(get("d001-pron-02"), { kind: "pairs", selected: ["a", "b", "b"] })).toEqual({ correct: false, score: 2 / 3, items: [true, true, false] });
  });
  it("read_passage with several questions", () => {
    const multi = allExercises().find((e) => e.exercise.type === "read_passage" && e.exercise.questions.length > 1);
    if (!multi || multi.exercise.type !== "read_passage") throw new Error("expected a multi-question read_passage in days 1-7");
    const q = multi.exercise.questions;
    const sel = q.map((x, i) => (i === 0 ? x.answer : (x.answer + 1) % x.choices.length));
    expect(gradeExercise(multi.exercise, { kind: "choices", selected: sel })).toEqual({
      correct: false, score: 1 / q.length, items: q.map((_, i) => i === 0),
    });
  });
  it("fill_blank carries items too", () => {
    expect(gradeExercise(get("d003-write-03"), { kind: "texts", texts: ["from"] })).toEqual({ correct: true, score: 1, items: [true] });
    expect(gradeExercise(get("d003-write-03"), { kind: "texts", texts: ["to"] })).toEqual({ correct: false, score: 0, items: [false] });
  });
  const six = ["v-where", "v-country", "v-city", "v-sit", "v-big", "v-fish"];
  it("vocab_match: 3 of 6 right is 0.5, items in pair order", () => {
    const pairs = { "v-where": "v-where", "v-country": "v-country", "v-city": "v-city", "v-sit": "v-big", "v-big": "v-fish", "v-fish": "v-sit" };
    expect(gradeExercise(get("d003-write-04"), { kind: "match", pairs })).toEqual({ correct: false, score: 0.5, items: [true, true, true, false, false, false] });
  });
  it("vocab_match: an incomplete or oversized key set is kind_mismatch (the UI only submits complete answers)", () => {
    const ex = get("d003-write-04");
    const all = Object.fromEntries(six.map((v) => [v, v]));
    expect(gradeExercise(ex, { kind: "match", pairs: { "v-where": "v-where" } })).toEqual({ error: "kind_mismatch" });
    expect(gradeExercise(ex, { kind: "match", pairs: { ...all, "v-cat": "v-cat" } })).toEqual({ error: "kind_mismatch" });
    expect(gradeExercise(ex, { kind: "match", pairs: { ...Object.fromEntries(six.slice(1).map((v) => [v, v])), "v-cat": "v-cat" } })).toEqual({ error: "kind_mismatch" });
    expect(gradeExercise(ex, { kind: "match", pairs: all })).toEqual({ correct: true, score: 1, items: [true, true, true, true, true, true] });
  });
  it("single-item types return no items", () => {
    expect(gradeExercise(get("d001-listen-01"), { kind: "choice", selected: 0 })).toEqual({ correct: true, score: 1 });
  });
});

describe("listen_choose index range", () => {
  it("an out-of-range or choice index is kind_mismatch", () => {
    expect(gradeExercise(get("d001-listen-01"), { kind: "choice", selected: 3 })).toEqual({ error: "kind_mismatch" });
    expect(gradeExercise(get("d001-listen-01"), { kind: "choice", selected: 999 })).toEqual({ error: "kind_mismatch" });
  });
});

describe("arrange_words accept", () => {
  it.each([
    ["d001-write-01", "Sam is my name"],
    ["d002-write-02", "Is this my pen"],
    ["d004-write-01", "Is this my dog"],
  ])("%s also accepts %s", (id, alt) => {
    expect(gradeExercise(get(id), { kind: "text", text: alt })).toEqual({ correct: true, score: 1 });
    // what the tile UI submits: tiles joined with spaces, in the learner's order
    const tiles = (get(id) as { words: string[] }).words;
    expect(gradeExercise(get(id), { kind: "text", text: [...tiles].reverse().join(" ") })).toMatchObject({ correct: false });
  });
  it("still accepts the answer and rejects a different sentence", () => {
    expect(gradeExercise(get("d001-write-01"), { kind: "text", text: "My name is Sam" })).toEqual({ correct: true, score: 1 });
    expect(gradeExercise(get("d001-write-01"), { kind: "text", text: "Sam my is name" })).toEqual({ correct: false, score: 0 });
  });
});

describe("translate_th_en accepted alternatives added after review (S4)", () => {
  it.each([
    ["d002-write-03", ["I'm fine, thanks", "Fine, thanks"]],
    ["d001-write-02", ["Pleased to meet you", "Glad to meet you"]],
    ["d003-write-02", ["I come from Thailand"]],
    ["d005-write-03", ["Can you spell your name", "Could you spell your name, please"]],
    ["d006-write-03", ["My name's Ann. I'm from Thailand", "My name is Ann and I'm from Thailand", "My name's Ann and I'm from Thailand", "I'm Ann and I'm from Thailand"]],
  ])("%s", (id, alts) => {
    for (const a of alts) expect(gradeExercise(get(id), { kind: "text", text: a }), a).toEqual({ correct: true, score: 1 });
  });
});

describe("real-content sweep", () => {
  it("every dictation audioText and accept entry grades correct", () => {
    for (const { exercise: ex } of allExercises()) {
      if (ex.type !== "dictation") continue;
      for (const t of [ex.audioText, ...(ex.accept ?? [])]) expect(gradeExercise(ex, { kind: "text", text: t }), `${ex.id}: ${t}`).toEqual({ correct: true, score: 1 });
    }
  });
  it("every translate_th_en accept entry grades correct", () => {
    for (const { exercise: ex } of allExercises()) {
      if (ex.type !== "translate_th_en") continue;
      for (const t of ex.accept) expect(gradeExercise(ex, { kind: "text", text: t }), `${ex.id}: ${t}`).toEqual({ correct: true, score: 1 });
    }
  });
  it("every arrange_words tile set can produce its answer and each accept", () => {
    const toks = (s: string) => s.split(/\s+/).filter(Boolean).map((w) => w.toLowerCase()).sort().join("|");
    for (const { exercise: ex } of allExercises()) {
      if (ex.type !== "arrange_words") continue;
      const tiles = toks(ex.words.join(" "));
      for (const t of [ex.answer, ...(ex.accept ?? [])]) {
        expect(toks(t), `${ex.id}: ${t}`).toBe(tiles);
        expect(gradeExercise(ex, { kind: "text", text: t }), `${ex.id}: ${t}`).toEqual({ correct: true, score: 1 });
      }
    }
  });
});

describe("isAttemptNoAllowed", () => {
  it("attemptNo 1 is always allowed; attemptNo 2 only for retryable types", () => {
    expect(isAttemptNoAllowed("phoneme_intro", 1)).toBe(true);
    expect(isAttemptNoAllowed("repeat_after_me", 1)).toBe(true);
    expect(isAttemptNoAllowed("dictation", 2)).toBe(true);
    for (const t of ["repeat_after_me", "shadowing", "speak_answer", "free_write", "phoneme_intro"] as const) expect(isAttemptNoAllowed(t, 2)).toBe(false);
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

describe("correctAnswerText: one entry per item", () => {
  it.each([
    ["d001-listen-01", ["Sam"]],
    ["d001-read-01", ["Ann"]],
    ["d001-pron-02", ["bad", "men", "cat"]],
    ["d001-listen-02", ["Nice to meet you."]],
    ["d001-write-02", ["Nice to meet you"]],
    ["d001-write-01", ["My name is Sam"]],
    ["d003-write-03", ["from"]],
  ])("%s -> %j", (id, text) => expect(correctAnswerText(get(id))).toEqual(text));
  it("keeps choices that contain commas whole", () => {
    const f = allExercises().find((e) => e.exercise.type === "listen_choose" && e.exercise.choices[e.exercise.answer].includes(","));
    if (!f || f.exercise.type !== "listen_choose") throw new Error("expected a listen_choose whose correct choice has a comma in days 1-7");
    expect(correctAnswerText(f.exercise)).toEqual([f.exercise.choices[f.exercise.answer]]);
  });
  it("is empty for types with nothing to reveal", () => {
    for (const id of ["d001-pron-01", "d001-pron-03", "d001-speak-01", "d001-speak-02", "d007-write-01", "d003-write-04"]) {
      expect(correctAnswerText(get(id))).toEqual([]);
    }
  });
});
