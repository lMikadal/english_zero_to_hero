import type { Lesson } from "@/lib/content/schema";

/** Every vocab id the player needs: the lesson's own words plus every word a vocab_match pair names. */
export function vocabIdsFor(lesson: Lesson): string[] {
  const ids = new Set(lesson.vocab);
  for (const section of lesson.sections) {
    for (const ex of section.exercises) {
      if (ex.type === "vocab_match") for (const p of ex.pairs) ids.add(p.vocabId);
    }
  }
  return [...ids];
}
