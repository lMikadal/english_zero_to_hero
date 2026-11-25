// Test support only (uses node:fs): loads the real lessons and vocab so contract tests run on real content.
import fs from "node:fs";
import path from "node:path";
import { lessonSchema, vocabFileSchema, type Exercise, type Lesson, type Section } from "@/lib/content/schema";

const root = path.resolve(import.meta.dirname, "../../../content");

export const WEEK_ONE_DAYS = [1, 2, 3, 4, 5, 6, 7] as const;

export function readLesson(day: number): Lesson {
  const file = path.join(root, "lessons", `day-${String(day).padStart(3, "0")}.json`);
  return lessonSchema.parse(JSON.parse(fs.readFileSync(file, "utf8")));
}

export const weekOne: Lesson[] = WEEK_ONE_DAYS.map(readLesson);

/** vocab id -> word, from content/vocab/oxford-3000/a1.json */
export function vocabWords(): Map<string, string> {
  const items = vocabFileSchema.parse(JSON.parse(fs.readFileSync(path.join(root, "vocab/oxford-3000/a1.json"), "utf8")));
  return new Map(items.map((v) => [v.id, v.word]));
}

export type Located = { lesson: Lesson; section: Section; exercise: Exercise };
export function allExercises(): Located[] {
  return weekOne.flatMap((lesson) => lesson.sections.flatMap((section) => section.exercises.map((exercise) => ({ lesson, section, exercise }))));
}

export function get(id: string): Exercise {
  const f = allExercises().find((e) => e.exercise.id === id);
  if (!f) throw new Error(`no exercise ${id} in days 1-7`);
  return f.exercise;
}

/** Every word taught on or before `day` (vocab id -> word), as the server passes it to deriveTags. */
export function taughtWords(day: number): Map<string, string> {
  const words = vocabWords();
  const out = new Map<string, string>();
  for (const l of weekOne) if (l.day <= day) for (const id of l.vocab) out.set(id, words.get(id)!);
  return out;
}
