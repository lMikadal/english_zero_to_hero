import fs from "node:fs";
import path from "node:path";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { vocabIdsFor } from "@/app/(learn)/day/[day]/vocab-ids";
import { SUPPORTED_TYPES } from "@/lib/answers/grade";
import { readLesson } from "@/lib/answers/test-content";
import { lessonSchema, type Lesson } from "@/lib/content/schema";
import { getVocabLookup } from "@/lib/content/repo";
import { AudioProvider } from "@/lib/audio/context";
import { createSilentAudioSource } from "@/lib/audio/source";
import { isRegistered, REGISTERED_TYPES, renderExercise } from "./registry";

// Every lesson file that exists for week 1, read from disk (not a hand-kept list).
const lessonsDir = path.resolve(import.meta.dirname, "../../../content/lessons");
const week1: Lesson[] = [1, 2, 3, 4, 5, 6, 7].map((d) => {
  const file = path.join(lessonsDir, `day-${String(d).padStart(3, "0")}.json`);
  return lessonSchema.parse(JSON.parse(fs.readFileSync(file, "utf8")));
});

describe("registry", () => {
  it("registers all 13 types used in week 1", () => {
    expect([...REGISTERED_TYPES].sort()).toEqual([...SUPPORTED_TYPES].sort());
    expect(REGISTERED_TYPES).toHaveLength(13);
  });

  it("only registers types the contract can grade", () => {
    for (const t of REGISTERED_TYPES) expect(SUPPORTED_TYPES).toContain(t);
  });

  it("has the same lessons on disk as test-content (guards the walk below)", () => {
    expect(week1.map((l) => l.day)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(readLesson(7).day).toBe(7);
  });

  describe.each(week1.map((l) => [l.day, l] as const))("day %i", (_day, lesson) => {
    const vocab = getVocabLookup(vocabIdsFor(lesson));
    const exercises = lesson.sections.flatMap((s) => s.exercises);

    it("contains only registered exercise types", () => {
      expect(exercises.filter((e) => !isRegistered(e.type)).map((e) => `${e.id}:${e.type}`)).toEqual([]);
    });

    it("renders every exercise without throwing, given the page's vocab lookup", () => {
      for (const exercise of exercises) {
        const out = renderExercise(exercise, { vocab, onAnswer: () => {}, onContinue: () => {} });
        expect(out, exercise.id).not.toBeNull();
        const view = render(<AudioProvider source={createSilentAudioSource()}>{out}</AudioProvider>);
        expect(view.container.textContent, exercise.id).not.toBe("");
        view.unmount();
      }
    });
  });
});
