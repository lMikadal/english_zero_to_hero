// Misbehaving exercise components (double calls, wrong answer kinds), driven through a stub registry.
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { fakeAudio, renderWithAudio } from "@/components/exercises/test-helpers";
import { get, readLesson } from "@/lib/answers/test-content";
import type { AttemptInput } from "@/lib/attempts/contract";
import type { Exercise, Lesson } from "@/lib/content/schema";
import type { SyncSink } from "@/lib/offline/sink";
import { LessonPlayer } from "./LessonPlayer";

vi.mock("@/components/exercises/registry", async () => {
  const { createElement: h } = await import("react");
  type Handlers = { onAnswer(a: unknown): void; onContinue(): void };
  return {
    isRegistered: () => true,
    renderExercise: (ex: { type: string; answer?: number }, p: Handlers) => {
      const wrong = { kind: "choice", selected: ex.answer === 0 ? 1 : 0 };
      return h("div", null,
        h("button", { onClick: () => { p.onAnswer(wrong); p.onAnswer(wrong); } }, "double-answer"),
        h("button", { onClick: () => { p.onContinue(); p.onContinue(); } }, "double-skip"),
        h("button", { onClick: () => p.onAnswer({ kind: "text", text: "x" }) }, "bad-kind"));
    },
  };
});

vi.spyOn(window, "scrollTo").mockImplementation(() => {});

function setup(ids: string[]) {
  const sent: AttemptInput[] = [];
  const sink = {
    sendAttempt: vi.fn((a: AttemptInput) => { sent.push(a); }),
    completeLesson: vi.fn(async () => ({ status: "queued" as const })),
    completePractice: vi.fn(async () => ({ status: "queued" as const })),
    completeCheckpoint: async () => ({ status: "queued" as const }),
    sendReview: () => {},
    completeReview: async () => ({ status: "queued" as const }),
    pendingCount: () => 0,
    subscribe: () => () => {},
  } satisfies SyncSink;
  const lesson: Lesson = { ...readLesson(1), sections: [{ skill: "listening", title: { en: "A", th: "ก" }, exercises: ids.map(get) as Exercise[] }] };
  renderWithAudio(<LessonPlayer lesson={lesson} vocab={{}} sink={sink} />, fakeAudio());
  return { sent, sink };
}
const click = (name: string) => userEvent.click(screen.getByRole("button", { name }));

describe("LessonPlayer guards", () => {
  it("never sends two attempts for one presentation (onAnswer twice in one tick)", async () => {
    const { sent } = setup(["d001-listen-01", "d002-listen-01"]);
    await click("double-answer");
    expect(sent).toHaveLength(1);
  });

  it("a double onContinue skips one step, not two", async () => {
    setup(["d001-listen-01", "d002-listen-01", "d002-listen-02"]);
    await click("double-skip");
    expect(screen.getByText("ข้อ 2 / 3")).toBeInTheDocument();
  });

  it("an answer that cannot be graded makes the step unsupported: skippable, nothing sent, logged", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { sent } = setup(["d001-listen-01", "d002-listen-01"]);
    await click("bad-kind");
    expect(error).toHaveBeenCalled();
    expect(sent).toHaveLength(0);
    expect(screen.getByText("ยังไม่รองรับ")).toBeInTheDocument();
    await click("ข้าม");
    expect(screen.getByText("ข้อ 2 / 2")).toBeInTheDocument();
    error.mockRestore();
  });

  it("skipping during the retry round moves on and then completes", async () => {
    const { sink } = setup(["d001-listen-01"]);
    await click("double-answer");
    await click("ถัดไป");
    expect(screen.getByText("ทบทวนข้อที่ตอบผิด")).toBeInTheDocument();
    await click("double-skip");
    await screen.findByText("จบบทเรียนแล้ว");
    expect(sink.completeLesson).toHaveBeenCalledTimes(1);
  });
});
