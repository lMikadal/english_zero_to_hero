import { describe, expect, it } from "vitest";
import { readLesson } from "@/lib/answers/test-content";
import { vocabIdsFor } from "./vocab-ids";

describe("vocabIdsFor", () => {
  it("returns the lesson vocab", () => {
    const lesson = readLesson(1);
    expect(vocabIdsFor(lesson)).toEqual(expect.arrayContaining(lesson.vocab));
  });

  it("also returns every vocabId named by a vocab_match pair, once", () => {
    const lesson = readLesson(3);
    const fromPairs = lesson.sections.flatMap((s) => s.exercises).flatMap((e) => (e.type === "vocab_match" ? e.pairs.map((p) => p.vocabId) : []));
    expect(fromPairs.length).toBeGreaterThan(0);
    const ids = vocabIdsFor(lesson);
    expect(ids).toEqual(expect.arrayContaining(fromPairs));
    expect(new Set(ids).size).toBe(ids.length);
  });
});
