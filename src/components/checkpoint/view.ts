// Pure helpers of the checkpoint screens (client-safe): counts, the resume number, and what the result screen shows.
import type { CompleteCheckpointResponse, ReplaySkill } from "@/lib/attempts/contract";
import { CHECKPOINT_INTERVAL, type Checkpoint } from "@/lib/content/checkpoint-schema";
import type { CompleteResult } from "@/lib/offline/sink";

/** Every exercise id of the checkpoint in play order. */
export const exerciseIds = (cp: Checkpoint): string[] => cp.sections.flatMap((s) => s.exercises.map((e) => e.id));
export const totalExercises = (cp: Checkpoint): number => exerciseIds(cp).length;

/** 1-based number of the first exercise with no stored answer, counted in the whole set (the label "ทำต่อ (ข้อ x / n)"). */
export function resumeNumber(cp: Checkpoint, answered: readonly string[]): number {
  const done = new Set(answered);
  const ids = exerciseIds(cp);
  const i = ids.findIndex((id) => !done.has(id));
  return i < 0 ? ids.length + 1 : i + 1;
}

/** Checkpoint after day 30 is number 1, after day 60 number 2 ... (the "ครั้งที่ k" of every title). */
export const checkpointNumber = (afterDay: number): number => afterDay / CHECKPOINT_INTERVAL;

/** What the result screen draws. `streak` is null when it is not known. */
export type ResultDisplay = {
  result: CompleteCheckpointResponse["result"];
  streak: { current: number; longest: number } | null;
  nextDay: number | null;
};
export const displayFromResponse = (r: CompleteCheckpointResponse): ResultDisplay => ({ result: r.result, streak: r.streak, nextDay: r.nextDay });

/** The state of the result screen. */
export type Completion =
  | { kind: "pending" }
  | { kind: "shown"; display: ResultDisplay }
  | { kind: "queued" }
  | { kind: "rejected"; code: 400 | 409 }
  /** completeCheckpoint threw: nothing was decided, asking again is safe. */
  | { kind: "error" };

export function completionOf(r: CompleteResult<CompleteCheckpointResponse> | { status: "error" } | null): Completion {
  if (r === null) return { kind: "pending" };
  switch (r.status) {
    case "done": return { kind: "shown", display: displayFromResponse(r.response) };
    case "queued": return { kind: "queued" };
    case "rejected": return { kind: "rejected", code: r.code };
    case "error": return { kind: "error" };
  }
}

/** The key of a replay link in the set of links already practised after the sitting: "<day>:<skill>". */
export const practisedKey = (day: number, skill: ReplaySkill): string => `${day}:${skill}`;
