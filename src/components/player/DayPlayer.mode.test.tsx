// R1 of docs/plans/replay-plan.md: router.refresh() after the first completion re-renders the day page, and by then
// the day is done, so the page passes mode="practice". The first-time completion screen must not be replaced.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { readLesson } from "@/lib/answers/test-content";
import type { AttemptInput, CompleteLessonResponse } from "@/lib/attempts/contract";
import type { HttpSink } from "@/lib/offline/http-sink";
import { DayPlayer } from "./DayPlayer";

const response: CompleteLessonResponse = {
  progress: { day: 1, status: "done", score: 1, completedAt: "2026-11-25T10:00:00.000Z" },
  streak: { current: 1, longest: 1 },
  pendingCheckpoint: null,
  currentDay: 2,
};
const shared = vi.hoisted(() => ({ sink: null as unknown as HttpSink }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock("@/lib/offline/http-sink", () => ({ getSyncSink: () => shared.sink }));
vi.spyOn(window, "scrollTo").mockImplementation(() => {});

function makeSink() {
  return {
    sendAttempt: vi.fn<(a: AttemptInput) => void>(),
    completeLesson: vi.fn(async () => ({ status: "done" as const, response })),
    completePractice: vi.fn(async () => ({ status: "queued" as const })),
    completeCheckpoint: async () => ({ status: "queued" as const }),
    sendReview: () => {},
    completeReview: async () => ({ status: "queued" as const }),
    pendingCount: () => 0,
    subscribe: () => () => {},
    getState: () => ({ pending: 0, pendingAttempts: 0, pendingReviews: 0, pendingReviewCompletions: 0, status: "idle" as const }),
    dispose: () => {},
    onReviewResult: () => () => {},
  } satisfies HttpSink;
}

function oneIntro() {
  const day1 = readLesson(1);
  const intro = day1.sections.flatMap((s) => s.exercises).find((e) => e.type === "phoneme_intro")!;
  return { ...day1, sections: [{ ...day1.sections[0], exercises: [intro] }] };
}

describe("DayPlayer mode", () => {
  it("keeps the first-time completion screen when the page re-renders with mode=practice after the day became done", async () => {
    shared.sink = makeSink();
    const lesson = oneIntro();
    const { rerender } = render(<DayPlayer lesson={lesson} vocab={{}} mode="lesson" skill={null} />);
    await userEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
    expect(await screen.findByText("จบบทเรียนแล้ว")).toBeInTheDocument();

    rerender(<DayPlayer lesson={lesson} vocab={{}} mode="practice" skill={null} />); // what router.refresh() produces

    expect(screen.getByText("จบบทเรียนแล้ว")).toBeInTheDocument();
    expect(screen.getByText(/สตรีค 1 วัน/)).toBeInTheDocument();
    expect(screen.queryByText("จบการเล่นซ้ำแล้ว")).not.toBeInTheDocument();
    expect(shared.sink.completeLesson).toHaveBeenCalledTimes(1);
    expect(shared.sink.completePractice).not.toHaveBeenCalled();
  });

  it("starts a fresh session when the learner chooses เล่นอีกครั้ง", async () => {
    shared.sink = makeSink();
    shared.sink.completePractice = vi.fn(async () => ({ status: "queued" as const }));
    render(<DayPlayer lesson={oneIntro()} vocab={{}} mode="practice" skill={null} />);
    await userEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
    await screen.findByText("จบการเล่นซ้ำแล้ว");
    await userEvent.click(screen.getByRole("link", { name: "เล่นอีกครั้ง" }));
    expect(await screen.findByRole("button", { name: "ถัดไป" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
    await screen.findByText("จบการเล่นซ้ำแล้ว");
    const calls = (shared.sink.completePractice as ReturnType<typeof vi.fn>).mock.calls as unknown as [{ sessionId: string }][];
    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(new Set(calls.map((c) => c[0].sessionId)).size).toBe(2);
  });
});
