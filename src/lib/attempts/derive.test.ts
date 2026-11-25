import { describe, expect, expectTypeOf, it } from "vitest";
import type { Skill } from "@/db/schema"; // type-only
import type { Section } from "@/lib/content/schema";
import { allExercises, readLesson, vocabWords } from "@/lib/answers/test-content";
import { attemptSkill, deriveTags, exerciseEnglishText, findExercise, type AttemptSkill } from "./derive";

const words = vocabWords();
const tagsOf = (id: string) => {
  const f = allExercises().find((e) => e.exercise.id === id);
  if (!f) throw new Error(id);
  return deriveTags(f.lesson, f.exercise, f.section, words);
};
const skillOf = (id: string) => {
  const f = allExercises().find((e) => e.exercise.id === id)!;
  return attemptSkill(f.section, f.exercise);
};

it("AttemptSkill equals the DB Skill", () => {
  expectTypeOf<AttemptSkill>().toEqualTypeOf<Skill>();
});

describe("findExercise", () => {
  const lesson = readLesson(1);
  it("finds an exercise with its section", () => {
    const f = findExercise(lesson, "d001-listen-02");
    expect(f?.exercise.type).toBe("dictation");
    expect(f?.section.skill).toBe("listening");
  });
  it("returns undefined for an unknown id and for an id from another day", () => {
    expect(findExercise(lesson, "d001-listen-99")).toBeUndefined();
    expect(findExercise(lesson, "d002-listen-01")).toBeUndefined();
  });
});

describe("attemptSkill", () => {
  it("uses the section skill by default", () => {
    expect(skillOf("d001-pron-02")).toBe("pronunciation");
    expect(skillOf("d001-listen-01")).toBe("listening");
    expect(skillOf("d001-speak-02")).toBe("speaking");
    expect(skillOf("d001-read-01")).toBe("reading");
    expect(skillOf("d001-write-01")).toBe("writing");
  });
  it("is vocabulary for vocab_match, whatever the section", () => {
    expect(skillOf("d003-write-04")).toBe("vocabulary");
    expect(skillOf("d006-write-01")).toBe("vocabulary");
  });
  it("is vocabulary for spell_word and for a -vocab- id", () => {
    const section: Section = { skill: "writing", title: { en: "w", th: "ก" }, exercises: [] };
    expect(attemptSkill(section, { id: "d001-write-09", type: "spell_word", instruction: { th: "ก" }, vocabId: "v-cat" })).toBe("vocabulary");
    expect(attemptSkill(section, { id: "d001-vocab-01", type: "translate_th_en", instruction: { th: "ก" }, th: "ก", accept: ["x"] })).toBe("vocabulary");
  });
  it("is not vocabulary for fill_blank (writing)", () => {
    expect(skillOf("d003-write-03")).toBe("writing");
  });
});

describe("deriveTags", () => {
  it("d001-pron-02: phoneme tag from the lesson's phoneme_intro, plus the vocab word it uses", () => {
    // the plan lists only [phoneme:ae]; rule 3 also tags v-cat because "cat" is a minimal-pair word and a lesson word
    expect(tagsOf("d001-pron-02")).toEqual(["phoneme:ae", "vocab:v-cat"]);
  });
  it("d001-pron-03 (repeat_after_me in a pronunciation section) gets the phoneme tag and the words it contains", () => {
    expect(tagsOf("d001-pron-03")).toEqual(["phoneme:ae", "vocab:v-cat", "vocab:v-hello", "vocab:v-nice"]);
  });
  it("d001-pron-01 (phoneme_intro)", () => {
    expect(tagsOf("d001-pron-01")).toEqual(["phoneme:ae", "vocab:v-cat"]);
  });
  it("d003-write-04 (vocab_match) has its six vocab tags and no phoneme tag", () => {
    expect(tagsOf("d003-write-04")).toEqual(
      ["vocab:v-big", "vocab:v-city", "vocab:v-country", "vocab:v-fish", "vocab:v-sit", "vocab:v-where"],
    );
  });
  it("d001-listen-02 gets implicit vocab tags for lesson words in its text", () => {
    expect(tagsOf("d001-listen-02")).toEqual(["vocab:v-meet", "vocab:v-nice"]);
  });
  it("matches whole words only and ignores case and punctuation", () => {
    // "Hello, Sam! Nice cat!" -> hello, nice, cat; "name" must not match inside other words
    expect(tagsOf("d001-write-01")).toEqual(["vocab:v-name"]);
  });
  it("d006 pronunciation exercises get no phoneme tag (review day has no phoneme_intro)", () => {
    for (const id of ["d006-pron-01", "d006-pron-02", "d006-pron-03"]) {
      expect(tagsOf(id).filter((t) => t.startsWith("phoneme:"))).toEqual([]);
    }
  });
  it("d006-write-01 (vocab_match, empty lesson.vocab) tags the explicitly named words", () => {
    expect(tagsOf("d006-write-01")).toEqual(
      ["vocab:v-country", "vocab:v-fine", "vocab:v-friend", "vocab:v-goodbye", "vocab:v-hello", "vocab:v-name"],
    );
  });
  it("is sorted, free of duplicates and every tag is phoneme:* or vocab:*, for every exercise in days 1-7", () => {
    for (const { lesson, section, exercise } of allExercises()) {
      const tags = deriveTags(lesson, exercise, section, words);
      expect(tags).toEqual([...new Set(tags)].sort());
      for (const t of tags) expect(t).toMatch(/^(phoneme|vocab):[a-z0-9-]+$/);
    }
  });
  it("skips lesson vocab ids that are missing from the word map", () => {
    const f = allExercises().find((e) => e.exercise.id === "d001-listen-02")!;
    expect(deriveTags(f.lesson, f.exercise, f.section, new Map([["v-nice", "nice"]]))).toEqual(["vocab:v-nice"]);
  });
  it("phoneme tags only on pronunciation sections, minimal_pair and phoneme_intro", () => {
    expect(tagsOf("d001-listen-01").some((t) => t.startsWith("phoneme:"))).toBe(false);
    expect(tagsOf("d001-speak-01").some((t) => t.startsWith("phoneme:"))).toBe(false);
  });
});

describe("exerciseEnglishText", () => {
  it("collects the English text of each type", () => {
    const text = (id: string) => exerciseEnglishText(allExercises().find((e) => e.exercise.id === id)!.exercise);
    expect(text("d001-pron-02")).toEqual(["bad", "bed", "man", "men", "cat", "cut"]);
    expect(text("d001-listen-01")).toEqual(["Hello! My name is Sam. Nice to meet you.", "What is his name?", "Sam", "Ann", "Tom"]);
    expect(text("d001-listen-02")).toEqual(["Nice to meet you."]);
    expect(text("d001-speak-01")).toEqual(["Hello!", "My name is Ann.", "Nice to meet you."]);
    expect(text("d001-speak-02")).toEqual(["Hello! What's your name?", "Hello! My name is Ann. Nice to meet you."]);
    expect(text("d001-write-01")).toEqual(["My name is Sam"]);
    expect(text("d001-write-02")).toEqual(["Nice to meet you", "Nice to meet you."]);
    expect(text("d003-write-03")).toEqual(["Where are you ___?", "from"]);
    expect(text("d003-write-04")).toEqual([]);
  });
});
