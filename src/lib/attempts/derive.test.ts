import { describe, expect, expectTypeOf, it } from "vitest";
import type { Skill } from "@/db/schema"; // type-only
import type { Exercise, Section } from "@/lib/content/schema";
import { allExercises, checkpointFixture, readLesson, taughtWords } from "@/lib/answers/test-content";
import { attemptSkill, deriveTags, exerciseEnglishText, exerciseTagText, findExercise, type AttemptSkill } from "./derive";

const tagsOf = (id: string) => {
  const f = allExercises().find((e) => e.exercise.id === id);
  if (!f) throw new Error(id);
  return deriveTags(f.lesson, f.exercise, f.section, taughtWords(f.lesson.day));
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
  it("d001-pron-02: only the phoneme tag (a sound-discrimination miss is not a vocabulary miss)", () => {
    expect(tagsOf("d001-pron-02")).toEqual(["phoneme:ae"]);
  });
  it("d001-pron-03 (repeat_after_me in a pronunciation section) gets only the phoneme tag", () => {
    expect(tagsOf("d001-pron-03")).toEqual(["phoneme:ae"]);
  });
  it("d001-pron-01 (phoneme_intro) gets only the phoneme tag", () => {
    expect(tagsOf("d001-pron-01")).toEqual(["phoneme:ae"]);
  });
  it("no implicit vocab tags in pronunciation sections, minimal_pair or phoneme_intro, anywhere in days 1-7", () => {
    for (const { section, exercise } of allExercises()) {
      if (section.skill !== "pronunciation" && exercise.type !== "minimal_pair" && exercise.type !== "phoneme_intro") continue;
      expect(tagsOf(exercise.id).filter((t) => t.startsWith("vocab:")), exercise.id).toEqual([]);
    }
  });
  it("explicit vocabId references still tag inside a pronunciation section", () => {
    const f = allExercises().find((e) => e.exercise.id === "d001-pron-02")!;
    const section: Section = { ...f.section, exercises: [] };
    const ex = { id: "d001-pron-09", type: "spell_word", instruction: { th: "ก" }, vocabId: "v-cat" } as const;
    expect(deriveTags(f.lesson, ex, section, taughtWords(1))).toEqual(["phoneme:ae", "vocab:v-cat"]);
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
      const tags = deriveTags(lesson, exercise, section, taughtWords(lesson.day));
      expect(tags).toEqual([...new Set(tags)].sort());
      for (const t of tags) expect(t).toMatch(/^(phoneme|vocab):[a-z0-9-]+$/);
    }
  });
  it("implicit tagging uses every word taught on or before the lesson day, not just lesson.vocab", () => {
    // review day 6 teaches nothing new but its speaking prompt uses words from days 1 and 3
    expect(tagsOf("d006-speak-02")).toEqual(["vocab:v-from", "vocab:v-hello", "vocab:v-name", "vocab:v-where"]);
    expect(tagsOf("d007-listen-03")).toEqual(["vocab:v-name"]);
  });
  it("only tags words that are in the taught-words map", () => {
    const f = allExercises().find((e) => e.exercise.id === "d001-listen-02")!;
    expect(deriveTags(f.lesson, f.exercise, f.section, new Map([["v-nice", "nice"], ["v-meet", "meet"]]))).toEqual(["vocab:v-meet", "vocab:v-nice"]);
    expect(deriveTags(f.lesson, f.exercise, f.section, new Map([["v-nice", "nice"]]))).toEqual(["vocab:v-nice"]);
    expect(deriveTags(f.lesson, f.exercise, f.section, new Map())).toEqual([]);
  });
  it("d004-listen-01: wrong choices do not tag (morning and evening are not heard)", () => {
    expect(tagsOf("d004-listen-01")).toEqual(["vocab:v-afternoon", "vocab:v-good", "vocab:v-how"]);
  });
  it("d006-read-01: only the passage and correct choices are tagged", () => {
    const tags = tagsOf("d006-read-01");
    expect(tags).toContain("vocab:v-goodbye");
    expect(tags).toContain("vocab:v-see");
    expect(tags).not.toContain("vocab:v-night");
  });
  it("matches whole words, not substrings: cat does not match category", () => {
    const f = allExercises().find((e) => e.exercise.id === "d001-listen-02")!;
    const ex = { id: "d001-listen-09", type: "repeat_after_me", instruction: { th: "ก" }, text: "A category of cats and a CAT." } as const;
    expect(deriveTags(f.lesson, ex, f.section, new Map([["v-cat", "cat"]]))).toEqual(["vocab:v-cat"]); // the standalone "CAT"
    const none = { ...ex, text: "A category of cats" };
    expect(deriveTags(f.lesson, none, f.section, new Map([["v-cat", "cat"]]))).toEqual([]);
  });
  it("tokenises around punctuation: Sam: and (pen) still match", () => {
    const f = allExercises().find((e) => e.exercise.id === "d001-listen-02")!;
    const ex: Exercise = { id: "d001-listen-09", type: "shadowing", instruction: { th: "ก" }, lines: ["Sam: this is (pen)", "my \"name\"-tag"] };
    expect(deriveTags(f.lesson, ex, f.section, new Map([["v-pen", "pen"], ["v-name", "name"], ["v-sam", "sam"]]))).toEqual(["vocab:v-name", "vocab:v-pen", "vocab:v-sam"]);
  });
  it("multi-word vocab entries match as a whole word sequence", () => {
    const f = allExercises().find((e) => e.exercise.id === "d001-listen-02")!;
    const ex = { id: "d001-listen-09", type: "repeat_after_me", instruction: { th: "ก" }, text: "I live in New York." } as const;
    expect(deriveTags(f.lesson, ex, f.section, new Map([["v-new-york", "New York"]]))).toEqual(["vocab:v-new-york"]);
    expect(deriveTags(f.lesson, { ...ex, text: "York is new" }, f.section, new Map([["v-new-york", "New York"]]))).toEqual([]);
  });
  it("an exercise's phonemes field defines its phoneme tags (any exercise type)", () => {
    const f = allExercises().find((e) => e.exercise.id === "d001-pron-02")!;
    expect(deriveTags(f.lesson, { ...f.exercise, phonemes: ["eh", "ih"] }, f.section, new Map())).toEqual(["phoneme:eh", "phoneme:ih"]);
    const listen = allExercises().find((e) => e.exercise.id === "d001-listen-01")!;
    expect(deriveTags(listen.lesson, { ...listen.exercise, phonemes: ["ae"] }, listen.section, new Map())).toEqual(["phoneme:ae"]);
  });
  it("phonemes also work on a review day without phoneme_intro; sound exercises still get no implicit vocab", () => {
    const f = allExercises().find((e) => e.exercise.id === "d006-pron-02")!;
    expect(deriveTags(f.lesson, { ...f.exercise, phonemes: ["ih", "eh"] }, f.section, taughtWords(6))).toEqual(["phoneme:eh", "phoneme:ih"]);
  });
  it("phoneme tags only on pronunciation sections, minimal_pair and phoneme_intro", () => {
    expect(tagsOf("d001-listen-01").some((t) => t.startsWith("phoneme:"))).toBe(false);
    expect(tagsOf("d001-speak-01").some((t) => t.startsWith("phoneme:"))).toBe(false);
  });
});

describe("exerciseEnglishText", () => {
  const get = (id: string) => allExercises().find((e) => e.exercise.id === id)!.exercise;
  const text = (id: string) => exerciseEnglishText(get(id));
  it("collects every English text field of each type", () => {
    expect(text("d001-pron-02")).toEqual(["bad", "bed", "man", "men", "cat", "cut"]);
    expect(text("d001-listen-01")).toEqual(["Hello! My name is Sam. Nice to meet you.", "What is his name?", "Sam", "Ann", "Tom"]);
    expect(text("d001-listen-02")).toEqual(["Nice to meet you."]);
    expect(text("d001-speak-01")).toEqual(["Hello!", "My name is Ann.", "Nice to meet you."]);
    expect(text("d001-speak-02")).toEqual(["Hello! What's your name?", "Hello! My name is Ann. Nice to meet you."]);
    expect(text("d001-write-01")).toEqual(["My name is Sam", "Sam is my name", "Is my name Sam"]);
    expect(text("d001-write-02")).toEqual(expect.arrayContaining(["Nice to meet you", "Nice to meet you."]));
    expect(text("d003-write-03")).toEqual(["Where are you ___?", "from"]);
    expect(text("d003-write-04")).toEqual([]);
  });
});

describe("exerciseTagText (what implicit vocab tagging reads)", () => {
  const get = (id: string) => allExercises().find((e) => e.exercise.id === id)!.exercise;
  it("listen_choose: audioText and the correct choice only", () => {
    expect(exerciseTagText(get("d004-listen-01"))).toEqual(["Good afternoon, Ann! How are you?", "Good afternoon"]);
  });
  it("read_passage: passage text and the correct choices only", () => {
    const t = exerciseTagText(get("d001-read-01"));
    expect(t).toEqual([(get("d001-read-01") as { text: string }).text, "Ann"]);
  });
  it("other types are the same as exerciseEnglishText", () => {
    for (const id of ["d001-pron-02", "d001-listen-02", "d001-speak-02", "d003-write-03"]) expect(exerciseTagText(get(id))).toEqual(exerciseEnglishText(get(id)));
  });
});

describe("a checkpoint is not a Lesson: findExercise and deriveTags need only its sections", () => {
  it("finds a checkpoint exercise and tags it from its own phonemes (a checkpoint has no phoneme_intro)", () => {
    const found = findExercise(checkpointFixture, "c030-pron-01");
    expect(found?.exercise.type).toBe("minimal_pair");
    expect(deriveTags(checkpointFixture, found!.exercise, found!.section, taughtWords(30))).toEqual(["phoneme:ae", "phoneme:eh"]);
    expect(findExercise(checkpointFixture, "c030-nope-01")).toBeUndefined();
  });
  it("accepts a bare { sections } object", () => {
    const sections: Pick<typeof checkpointFixture, "sections"> = { sections: checkpointFixture.sections };
    expect(findExercise(sections, "c030-vocab-01")?.section.skill).toBe("writing");
  });
});
