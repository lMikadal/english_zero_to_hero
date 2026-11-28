// Test support only: a grade-less fake sink, the fixture vocabulary and a learner who answers every exercise type of the
// checkpoint fixture the same way every time (the leak test needs identical inputs).
import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import type { VocabLookup } from "@/components/exercises/types";
import type { AttemptInput, CompleteCheckpointRequest, CompleteCheckpointResponse } from "@/lib/attempts/contract";
import type { Exercise } from "@/lib/content/schema";
import type { CompleteResult, SyncSink } from "@/lib/offline/sink";

export const SESSION = "5e2a6c1e-0b53-4a0e-9c43-7d6f1b8e0010";

const word = (w: string, th: string) => ({ word: w, th, ipa: { us: w, uk: w } });
export const fixtureVocab: VocabLookup = {
  "v-dog": word("dog", "สุนัข"), "v-cat": word("cat", "แมว"), "v-cup": word("cup", "ถ้วย"), "v-bus": word("bus", "รถบัส"), "v-box": word("box", "กล่อง"),
};

export const DONE_RESPONSE: CompleteCheckpointResponse = {
  result: {
    sessionId: SESSION, afterDay: 30, score: 0.78, passed: true, completedAt: "2026-11-28T10:00:00.000Z", sitting: 1, best: 0.78,
    skills: [
      { skill: "pronunciation", weight: 20, score: 0.8, answered: 3, total: 3, selfOk: null },
      { skill: "listening", weight: 25, score: 0.9, answered: 3, total: 3, selfOk: null },
      { skill: "speaking", weight: 0, score: null, answered: 3, total: 3, selfOk: 2 },
      { skill: "reading", weight: 20, score: 0.9, answered: 3, total: 3, selfOk: null },
      { skill: "writing", weight: 35, score: 0.75, answered: 4, total: 4, selfOk: null },
    ],
  },
  streak: { current: 4, longest: 6 },
  nextDay: 31,
};

/** The sink never returns a grade for an attempt (the server does not, for checkpoints): `sendAttempt` returns nothing. */
export function fakeCheckpointSink(result: CompleteResult<CompleteCheckpointResponse> = { status: "done", response: DONE_RESPONSE }) {
  const sent: AttemptInput[] = [];
  const listeners = new Set<() => void>();
  let pending = 0;
  const sink = {
    sendAttempt: vi.fn((a: AttemptInput) => { sent.push(a); }),
    completeLesson: async () => ({ status: "queued" as const }),
    completePractice: async () => ({ status: "queued" as const }),
    completeCheckpoint: vi.fn(async (...args: [CompleteCheckpointRequest]) => (void args, result)),
    sendReview: () => {},
    completeReview: async () => ({ status: "queued" as const }),
    pendingCount: () => pending,
    subscribe: (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
  } satisfies SyncSink;
  return { sink, sent, setPending: (n: number) => { pending = n; }, notify: () => listeners.forEach((l) => l()) };
}

const radios = (root: HTMLElement) => Array.from(root.querySelectorAll<HTMLElement>("[role=radiogroup]"));

/**
 * Answers the exercise on screen like a learner who always picks the first option and types "zzz", WITHOUT pressing the
 * confirm button (see `confirm`). The same input every time, whatever the answer key says.
 */
export async function fillIn(e: Exercise, user = userEvent.setup()) {
  const main = document.querySelector("main") as HTMLElement;
  switch (e.type) {
    case "minimal_pair": case "listen_choose": case "read_passage":
      for (const g of radios(main)) await user.click(within(g).getAllByRole("radio")[0]);
      return;
    case "dictation": case "translate_th_en":
      await user.type(screen.getByRole("textbox"), "zzz");
      return;
    case "fill_blank":
      for (const box of screen.getAllByRole("textbox")) await user.type(box, "zzz");
      return;
    case "arrange_words": {
      const pool = screen.getByRole("list", { name: "คำที่เหลือ" });
      while (within(pool).queryAllByRole("button").length > 0) await user.click(within(pool).getAllByRole("button")[0]);
      return;
    }
    case "vocab_match": {
      const left = () => within(screen.getByRole("group", { name: "คำภาษาอังกฤษ" })).getAllByRole("button").filter((b) => !b.getAttribute("aria-label")?.includes("จับคู่กับ"));
      const right = () => within(screen.getByRole("group", { name: "ความหมายภาษาไทย" })).getAllByRole("button").filter((b) => !b.getAttribute("aria-label")?.includes("จับคู่กับ"));
      while (left().length > 0) {
        fireEvent.click(left()[0]);
        fireEvent.click(right()[0]);
      }
      return;
    }
    case "repeat_after_me": case "shadowing": case "speak_answer":
      await user.click(screen.getByRole("button", { name: "พูดได้" }));
      return;
    default:
      throw new Error(`no recipe for ${e.type}`);
  }
}

export const SELF_RATED = ["repeat_after_me", "shadowing", "speak_answer"];

/** Presses the confirm button of a graded step (self-rated steps record on the first tap and have none). */
export async function confirm(e: Exercise, user = userEvent.setup()) {
  if (SELF_RATED.includes(e.type)) return;
  await user.click(screen.getByRole("button", { name: "ยืนยันคำตอบ" }));
}

export const nextButton = () => screen.getByRole("button", { name: "ถัดไป" });
