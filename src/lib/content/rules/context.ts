// What every rule needs, computed once: lessons in day order, the vocab bank, and the lesson that first teaches each word.
import type { ContentData, LoadedLesson } from "../loader";
import type { VocabItem } from "../schema";

export type RuleContext = {
  /** Sorted by day. */
  lessons: LoadedLesson[];
  /** vocab id -> entry and its file. */
  bank: Map<string, { item: VocabItem; file: string }>;
  /** vocab id -> the first lesson that lists it in `vocab`. */
  taughtIn: Map<string, { day: number; file: string }>;
};

export function buildContext(data: ContentData): RuleContext {
  const lessons = [...data.lessons].sort((a, b) => a.lesson.day - b.lesson.day);
  const bank = new Map<string, { item: VocabItem; file: string }>();
  for (const { file, items } of data.vocab) for (const item of items) if (!bank.has(item.id)) bank.set(item.id, { item, file });
  const taughtIn = new Map<string, { day: number; file: string }>();
  for (const { file, lesson } of lessons) for (const id of lesson.vocab) if (!taughtIn.has(id)) taughtIn.set(id, { day: lesson.day, file });
  return { lessons, bank, taughtIn };
}
