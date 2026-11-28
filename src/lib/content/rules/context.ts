// What every rule needs, computed once: lessons in day order, the vocab bank, and the lesson that first teaches each word.
import type { Checkpoint } from "../checkpoint-schema";
import type { ContentData, LoadedCheckpoint, LoadedLesson } from "../loader";
import type { Lesson, Section, VocabItem } from "../schema";

/** A body of learner-facing text that is read as of one day: a lesson, or a checkpoint (day = afterDay). */
export type Unit = { file: string; day: number; sections: Section[]; kind: "lesson" | "checkpoint"; doc: Lesson | Checkpoint };

export type RuleContext = {
  /** Sorted by day. */
  lessons: LoadedLesson[];
  /** Checkpoint files (none in a repo without content/checkpoints/). */
  checkpoints: LoadedCheckpoint[];
  /** Lessons, then checkpoints, sorted by day: what the text rules walk. A checkpoint counts as the text of day `afterDay`. */
  units: Unit[];
  /** vocab id -> entry and its file. */
  bank: Map<string, { item: VocabItem; file: string }>;
  /** vocab id -> the first lesson that lists it in `vocab`. */
  taughtIn: Map<string, { day: number; file: string }>;
};

export function buildContext(data: ContentData): RuleContext {
  const lessons = [...data.lessons].sort((a, b) => a.lesson.day - b.lesson.day);
  const checkpoints = [...(data.checkpoints ?? [])].sort((a, b) => a.checkpoint.afterDay - b.checkpoint.afterDay);
  const units: Unit[] = [
    ...lessons.map(({ file, lesson }): Unit => ({ file, day: lesson.day, sections: lesson.sections, kind: "lesson", doc: lesson })),
    ...checkpoints.map(({ file, checkpoint }): Unit => ({ file, day: checkpoint.afterDay, sections: checkpoint.sections, kind: "checkpoint", doc: checkpoint })),
  ].sort((a, b) => a.day - b.day);
  const bank = new Map<string, { item: VocabItem; file: string }>();
  for (const { file, items } of data.vocab) for (const item of items) if (!bank.has(item.id)) bank.set(item.id, { item, file });
  const taughtIn = new Map<string, { day: number; file: string }>();
  for (const { file, lesson } of lessons) for (const id of lesson.vocab) if (!taughtIn.has(id)) taughtIn.set(id, { day: lesson.day, file });
  return { lessons, checkpoints, units, bank, taughtIn };
}
