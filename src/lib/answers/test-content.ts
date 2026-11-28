// Test support only (uses node:fs): loads the real lessons and vocab so contract tests run on real content.
import fs from "node:fs";
import path from "node:path";
import type { Checkpoint } from "@/lib/content/checkpoint-schema";
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

const fixtureInstruction = { th: "ทำตามคำสั่ง" };
const fixtureQuestion = (en: string, th: string) => ({ en, th });
const fixtureTitle = (en: string, th: string) => ({ en, th });

/**
 * A minimal valid monthly checkpoint after day 30 (not read from content/checkpoints/: tests never depend on the real
 * folder, docs/TESTING.md). It uses only words and sounds taught in days 1-7 (`weekOne`), all five skills, and the
 * weights of the plan (pron 20, listen 25, speak 0, read 20, write 35), a few exercises per section.
 */
export const checkpointFixture: Checkpoint = {
  afterDay: 30, cefr: "preA1", title: fixtureTitle("Checkpoint 1", "แบบทดสอบประจำเดือน ครั้งที่ 1"), estimatedMinutes: 30,
  sections: [
    { skill: "pronunciation", title: fixtureTitle("Pronunciation", "ออกเสียง"), weight: 20, reviewDays: [1, 2, 5], exercises: [
      { id: "c030-pron-01", type: "minimal_pair", instruction: fixtureInstruction, phonemes: ["ae", "eh"],
        pairs: [{ a: "pen", b: "pan", answer: "a" }, { a: "bad", b: "bed", answer: "b" }, { a: "man", b: "men", answer: "a" }] },
      { id: "c030-pron-02", type: "minimal_pair", instruction: fixtureInstruction, phonemes: ["ih", "ah"],
        pairs: [{ a: "cup", b: "cap", answer: "b" }, { a: "bus", b: "boss", answer: "a" }, { a: "sit", b: "set", answer: "a" }] },
      { id: "c030-pron-03", type: "minimal_pair", instruction: fixtureInstruction, phonemes: ["aa"],
        pairs: [{ a: "hot", b: "hat", answer: "a" }, { a: "not", b: "nut", answer: "b" }] },
    ] },
    { skill: "listening", title: fixtureTitle("Listening", "ฟัง"), weight: 25, reviewDays: [2, 4, 5], exercises: [
      { id: "c030-listen-01", type: "listen_choose", instruction: fixtureInstruction, audioText: "Hello, Ann! I'm fine, thank you.",
        question: fixtureQuestion("How is Ann?", "แอนเป็นอย่างไร"), choices: ["Fine", "Hot", "Big"], answer: 0 },
      { id: "c030-listen-02", type: "dictation", instruction: fixtureInstruction, audioText: "My dog is big.", accept: ["My dog is big", "My dog is big."] },
      { id: "c030-listen-03", type: "dictation", instruction: fixtureInstruction, audioText: "Please come, Ben.", accept: ["Please come, Ben", "Please come Ben", "Please come, Ben."] },
    ] },
    { skill: "speaking", title: fixtureTitle("Speaking", "พูด"), weight: 0, reviewDays: [1, 2, 5], exercises: [
      { id: "c030-speak-01", type: "shadowing", instruction: fixtureInstruction, lines: ["Hello, Ann!", "How are you?", "I'm fine, thank you."] },
      { id: "c030-speak-02", type: "repeat_after_me", instruction: fixtureInstruction, text: "The cat is big." },
      { id: "c030-speak-03", type: "speak_answer", instruction: fixtureInstruction, prompt: "What's your name?", sampleAnswer: "My name is Ann.", keywords: ["name"] },
    ] },
    { skill: "reading", title: fixtureTitle("Reading", "อ่าน"), weight: 20, reviewDays: [1, 2, 5], exercises: [
      { id: "c030-read-01", type: "read_passage", instruction: fixtureInstruction,
        text: "Ann: Hello, Sam! How are you?\nSam: I'm fine, thank you. This is my dog.\nAnn: Nice dog! It is big.",
        questions: [{ question: fixtureQuestion("Who is fine?", "ใครสบายดี"), choices: ["Sam", "Ann"], answer: 0 }] },
      { id: "c030-read-02", type: "read_passage", instruction: fixtureInstruction,
        text: "This is my friend, Ben. He is from Bangkok.",
        questions: [{ question: fixtureQuestion("Where is Ben from?", "เบนมาจากไหน"), choices: ["Bangkok", "Japan"], answer: 0 }] },
      { id: "c030-read-03", type: "read_passage", instruction: fixtureInstruction,
        text: "Sam: Is your dog big?\nAnn: Yes, it is.",
        questions: [{ question: fixtureQuestion("Is the dog big?", "สุนัขตัวใหญ่ไหม"), choices: ["Yes", "No"], answer: 0 }] },
    ] },
    { skill: "writing", title: fixtureTitle("Writing", "เขียน"), weight: 35, reviewDays: [1, 2, 5], exercises: [
      { id: "c030-write-01", type: "arrange_words", instruction: fixtureInstruction, words: ["big", "My", "dog", "is"], answer: "My dog is big", accept: ["Is my dog big"] },
      { id: "c030-write-02", type: "fill_blank", instruction: fixtureInstruction, text: "How ___ you?", answer: ["are"] },
      { id: "c030-write-03", type: "translate_th_en", instruction: fixtureInstruction, th: "นี่คือเพื่อนของฉัน", accept: ["This is my friend", "This is my friend."] },
      { id: "c030-vocab-01", type: "vocab_match", instruction: fixtureInstruction, pairs: [{ vocabId: "v-dog" }, { vocabId: "v-cat" }, { vocabId: "v-cup" }, { vocabId: "v-bus" }, { vocabId: "v-box" }] },
    ] },
  ],
};
