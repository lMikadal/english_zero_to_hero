import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { readLesson } from "@/lib/answers/test-content";
import type { CompleteLessonResponse } from "@/lib/attempts/contract";
import type { AttemptInput } from "@/lib/attempts/contract";
import type { SyncSink } from "@/lib/offline/sink";
import { DayPlayer } from "./DayPlayer";

const sent: AttemptInput[] = [];
const response: CompleteLessonResponse = {
  progress: { day: 1, status: "done", score: 1, completedAt: "2026-11-25T10:00:00.000Z" },
  streak: { current: 1, longest: 1 },
  currentDay: 2,
};
const shared = vi.hoisted(() => ({ sink: null as unknown as SyncSink }));
vi.mock("@/lib/offline/http-sink", () => ({ getSyncSink: () => shared.sink }));

vi.spyOn(window, "scrollTo").mockImplementation(() => {});

describe("DayPlayer", () => {
  it("plays through the shared HTTP sink and shows the server's completion result", async () => {
    shared.sink = {
      sendAttempt: vi.fn((a: AttemptInput) => { sent.push(a); }),
      completeLesson: vi.fn(async () => ({ status: "done" as const, response })),
      pendingCount: () => 0,
      subscribe: () => () => {},
    };
    const day1 = readLesson(1);
    // one phoneme_intro only: no answer needed, just "ถัดไป"
    const intro = day1.sections.flatMap((s) => s.exercises).find((e) => e.type === "phoneme_intro")!;
    const lesson = { ...day1, sections: [{ ...day1.sections[0], exercises: [intro] }] };
    render(<DayPlayer lesson={lesson} vocab={{}} />);
    await userEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
    expect(await screen.findByText(/สตรีค 1 วัน/)).toBeInTheDocument();
    expect(shared.sink.completeLesson).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: /บทถัดไป/ })).toHaveAttribute("href", "/day/2");
  });
});
