// Test support for the rule files: small builders for lessons, exercises and vocab entries.
import type { ContentData, LoadedLesson, LoadedVocab } from "../loader";
import type { Exercise, Lesson, VocabItem } from "../schema";

const bi = { en: "Hello", th: "สวัสดี" };
export const instruction = { th: "ทำตามคำสั่ง" };

export type WordSpec = { id: string; word?: string; th?: string; examples?: string[]; forms?: Record<string, string>; pos?: string };

export function vocabItem(spec: WordSpec): VocabItem {
  return {
    id: spec.id, word: spec.word ?? spec.id.slice(2), pos: spec.pos ?? "noun",
    oxford: { list: "3000", level: "A1" }, ipa: { us: "/x/", uk: "/x/" },
    th: spec.th ?? `คำ${spec.id}`, topics: ["greetings"],
    examples: (spec.examples ?? ["A."]).map((en) => ({ en, th: "ตัวอย่าง" })),
    ...(spec.forms ? { forms: spec.forms } : {}),
  };
}

export const vocabFile = (items: VocabItem[], file = "content/vocab/oxford-3000/a1.json"): LoadedVocab => ({ file, items });

export function lessonFile(day: number, vocab: string[], exercises: Exercise[]): LoadedLesson {
  const dd = String(day).padStart(3, "0");
  const lesson: Lesson = {
    day, phase: 1, week: Math.ceil(day / 7), type: "lesson", cefr: "preA1", title: bi, objectives: [bi],
    estimatedMinutes: 20, vocab, sections: [{ skill: "listening", title: bi, exercises }],
  };
  return { file: `content/lessons/day-${dd}.json`, lesson };
}

/** An exercise id for day `day`, e.g. ex(1, "listen", 2) = "d001-listen-02". */
export const exId = (day: number, skill: string, n = 1) => `d${String(day).padStart(3, "0")}-${skill}-${String(n).padStart(2, "0")}`;

export const data = (lessons: LoadedLesson[], vocab: LoadedVocab[]): ContentData => ({ lessons, vocab });
