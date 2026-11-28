// Test support for the checkpoint rules: a small valid world (lessons 1 and 30, three words, one checkpoint after day 30)
// that variants are cut from, so each negative test changes exactly one thing.
import type { Checkpoint, CheckpointSection } from "../checkpoint-schema";
import type { ContentData, LoadedCheckpoint, LoadedLesson } from "../loader";
import type { Exercise, Lesson } from "../schema";
import { buildContext } from "./context";
import { data, instruction, lessonFile, vocabFile, vocabItem } from "./test-support";

const bi = { en: "Hello", th: "สวัสดี" };
export const cpId = (skill: string, n = 1, day = 30) => `c${String(day).padStart(3, "0")}-${skill}-${String(n).padStart(2, "0")}`;

export const pair = (id: string, phonemes: string[] | null = ["ae"]): Exercise => ({
  id, type: "minimal_pair", instruction, ...(phonemes ? { phonemes } : {}), pairs: [{ a: "cat", b: "big", answer: "a" }],
});
export const dictation = (id: string, audioText = "Hello cat."): Exercise => ({ id, type: "dictation", instruction, audioText });
export const passage = (id: string, text = "Hello cat."): Exercise => ({
  id, type: "read_passage", instruction, text, questions: [{ question: { en: "Is it big?", th: "ใหญ่ไหม" }, choices: ["big", "cat"], answer: 0 }],
});
export const arrange = (id: string): Exercise => ({ id, type: "arrange_words", instruction, words: ["cat", "Hello"], answer: "Hello cat" });
export const fill = (id: string): Exercise => ({ id, type: "fill_blank", instruction, text: "Hello ___.", answer: ["cat"] });
export const match = (id: string, ids = ["v-cat", "v-hello"]): Exercise => ({ id, type: "vocab_match", instruction, pairs: ids.map((vocabId) => ({ vocabId })) });
export const repeatAfter = (id: string): Exercise => ({ id, type: "repeat_after_me", instruction, text: "Hello cat." });

export const section = (skill: CheckpointSection["skill"], weight: number, exercises: Exercise[], reviewDays = [1]): CheckpointSection => ({
  skill, title: bi, weight, reviewDays, exercises,
});

export const baseSections = (): CheckpointSection[] => [
  section("pronunciation", 20, [pair(cpId("pron", 1)), pair(cpId("pron", 2)), pair(cpId("pron", 3))]),
  section("listening", 25, [dictation(cpId("listen", 1)), dictation(cpId("listen", 2)), dictation(cpId("listen", 3))]),
  section("speaking", 0, [repeatAfter(cpId("speak", 1))]),
  section("reading", 20, [passage(cpId("read", 1)), passage(cpId("read", 2)), passage(cpId("read", 3))]),
  section("writing", 35, [arrange(cpId("write", 1)), fill(cpId("write", 2)), match(cpId("write", 3))]),
];

export const checkpointFile = (over: Partial<Checkpoint> = {}, file?: string): LoadedCheckpoint => {
  const afterDay = over.afterDay ?? 30;
  return {
    file: file ?? `content/checkpoints/checkpoint-${String(afterDay).padStart(3, "0")}.json`,
    checkpoint: { afterDay, cefr: "preA1", title: bi, estimatedMinutes: 30, sections: baseSections(), ...over },
  };
};

/** Day 1 teaches the words and holds one section of every skill (the review target) and the sound "ae"; day 30 is a plain lesson. */
export function baseLessons(extra: LoadedLesson[] = []): LoadedLesson[] {
  const day1 = lessonFile(1, ["v-hello", "v-cat", "v-big"], [
    { id: "d001-pron-01", type: "phoneme_intro", instruction, phoneme: "ae", ipa: "/æ/", tipTh: "ก", examples: ["cat"] },
    pair("d001-pron-02"),
    dictation("d001-listen-01", "Hello big cat."),
  ]);
  const skills = ["pronunciation", "listening", "speaking", "reading", "writing"] as const;
  const l1: Lesson = { ...day1.lesson, sections: skills.map((skill) => ({ skill, title: bi, exercises: day1.lesson.sections[0].exercises })) };
  return [{ file: day1.file, lesson: l1 }, lessonFile(30, [], [dictation("d030-listen-01", "Hello big cat.")]), ...extra];
}
export const baseVocab = () => [vocabFile([vocabItem({ id: "v-hello", word: "hello", examples: ["Hello."] }), vocabItem({ id: "v-cat", word: "cat", examples: ["A cat."] }), vocabItem({ id: "v-big", word: "big", pos: "adjective", examples: ["A big cat."] })])];

export function world(opts: { lessons?: LoadedLesson[]; checkpoints?: LoadedCheckpoint[] } = {}): ContentData {
  return { ...data(opts.lessons ?? baseLessons(), baseVocab()), checkpoints: opts.checkpoints ?? [checkpointFile()] };
}
export const ctxOf = (opts: Parameters<typeof world>[0] = {}) => buildContext(world(opts));

/** The one checkpoint with `sections` replaced by `mutate(baseSections())`. */
export const withSections = (mutate: (s: CheckpointSection[]) => CheckpointSection[], over: Partial<Checkpoint> = {}) =>
  ctxOf({ checkpoints: [checkpointFile({ sections: mutate(baseSections()), ...over })] });

/** A checkpoint whose single reading section holds `exercises` (for tests of the shared rules, which ignore weights). */
export const cpOf = (exercises: Exercise[], afterDay = 30): LoadedCheckpoint => checkpointFile({ afterDay, sections: [section("reading", 100, exercises)] });
