// Pure: works out what an attempt practised from the lesson content. Client-safe (types only from content/schema).
import { normalizeAnswer } from "@/lib/answers/normalize";
import type { Exercise, Lesson, Section } from "@/lib/content/schema";

/** Same values as `Skill` in src/db/schema.ts (checked by a type test in derive.test.ts). */
export type AttemptSkill = Section["skill"] | "vocabulary";

export function findExercise(lesson: Lesson, exerciseId: string): { section: Section; exercise: Exercise } | undefined {
  for (const section of lesson.sections) {
    const exercise = section.exercises.find((e) => e.id === exerciseId);
    if (exercise) return { section, exercise };
  }
  return undefined;
}

/** "vocabulary" if the type is vocab_match/spell_word or the id segment is `vocab`, else the section's skill. */
export function attemptSkill(section: Section, ex: Exercise): AttemptSkill {
  if (ex.type === "vocab_match" || ex.type === "spell_word" || ex.id.split("-")[1] === "vocab") return "vocabulary";
  return section.skill;
}

/** Every English text field of the exercise (what a learner reads or hears). */
export function exerciseEnglishText(ex: Exercise): string[] {
  switch (ex.type) {
    case "phoneme_intro": return [...ex.examples];
    case "minimal_pair": return ex.pairs.flatMap((p) => [p.a, p.b]);
    case "repeat_after_me": return [ex.text];
    case "listen_choose": return [ex.audioText, ex.question.en, ...ex.choices];
    case "dictation": return [ex.audioText];
    case "shadowing": return [...ex.lines];
    case "speak_answer": return [ex.prompt, ex.sampleAnswer];
    case "roleplay": return [ex.scenario.en, ex.aiRole, ...ex.goals.map((g) => g.en)];
    case "read_passage": return [ex.text, ...ex.questions.flatMap((q) => [q.question.en, ...q.choices])];
    case "arrange_words": return [ex.answer];
    case "fill_blank": return [ex.text, ...ex.answer];
    case "translate_th_en": return [...ex.accept];
    case "free_write": return [ex.prompt];
    case "use_in_sentence": return [ex.prompt];
    case "vocab_match":
    case "spell_word": return [];
  }
}

function namedVocabIds(ex: Exercise): string[] {
  switch (ex.type) {
    case "vocab_match": return ex.pairs.map((p) => p.vocabId);
    case "spell_word":
    case "use_in_sentence": return [ex.vocabId];
    default: return [];
  }
}

/** Sorted, de-duplicated `phoneme:<p>` and `vocab:<id>` tags (docs/PROGRESS.md section 1). */
export function deriveTags(lesson: Lesson, ex: Exercise, section: Section, vocabWords: ReadonlyMap<string, string>): string[] {
  const tags = new Set<string>();
  if (section.skill === "pronunciation" || ex.type === "minimal_pair" || ex.type === "phoneme_intro") {
    for (const s of lesson.sections) for (const e of s.exercises) if (e.type === "phoneme_intro") tags.add(`phoneme:${e.phoneme}`);
  }
  for (const id of namedVocabIds(ex)) tags.add(`vocab:${id}`);
  const haystack = exerciseEnglishText(ex).map((t) => ` ${normalizeAnswer(t)} `);
  for (const id of lesson.vocab) {
    const word = vocabWords.get(id);
    if (!word) continue;
    const needle = ` ${normalizeAnswer(word)} `;
    if (haystack.some((h) => h.includes(needle))) tags.add(`vocab:${id}`);
  }
  return [...tags].sort();
}
