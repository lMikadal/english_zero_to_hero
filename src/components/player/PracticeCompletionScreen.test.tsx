import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { CompletePracticeResponse, ReplaySkill } from "@/lib/attempts/contract";
import type { CompleteResult } from "@/lib/offline/sink";
import { PracticeCompletionScreen, type PracticeCompletion } from "./PracticeCompletionScreen";

const response = (over: Partial<CompletePracticeResponse> = {}): CompleteResult<CompletePracticeResponse> => ({
  status: "done",
  response: {
    session: { sessionId: "s", day: 3, skill: null, score: 0.7, graded: 4 },
    lessonScore: 0.9,
    streak: { current: 4, longest: 6 },
    countedForStreak: true,
    ...over,
  },
});

function show(result: PracticeCompletion | null, o: { skill?: ReplaySkill | null; localScore?: number | null; onRetry?: () => void; onReplay?: () => void } = {}) {
  return render(<PracticeCompletionScreen day={3} skill={o.skill ?? null} result={result} localScore={o.localScore ?? null} onRetry={o.onRetry ?? (() => {})} onReplay={o.onReplay} />);
}

describe("PracticeCompletionScreen", () => {
  it("shows this session's score next to the unchanged original score and the streak", () => {
    show(response());
    expect(screen.getByRole("heading", { level: 1, name: "จบการเล่นซ้ำแล้ว" })).toBeInTheDocument();
    expect(screen.getByText("คะแนนรอบนี้ 70%")).toBeInTheDocument();
    expect(screen.getByText("คะแนนเดิมของบท 90% (ไม่เปลี่ยน)")).toBeInTheDocument();
    expect(screen.getByText("สตรีค 4 วัน (นานที่สุด 6 วัน)")).toBeInTheDocument();
  });

  it("offers replay, practice list and home, but no next lesson", () => {
    show(response());
    expect(screen.getByRole("link", { name: "เล่นอีกครั้ง" })).toHaveAttribute("href", "/day/3");
    expect(screen.getByRole("link", { name: "กลับไปหน้าฝึกเพิ่ม" })).toHaveAttribute("href", "/practice");
    expect(screen.getByRole("link", { name: "กลับหน้าแรก" })).toHaveAttribute("href", "/");
    expect(screen.queryByText(/ไปบทถัดไป/)).not.toBeInTheDocument();
  });

  it("replays the same skill section", () => {
    show(response(), { skill: "reading" });
    expect(screen.getByRole("link", { name: "เล่นอีกครั้ง" })).toHaveAttribute("href", "/day/3?skill=reading");
  });

  it("calls onReplay instead of navigating when the player can restart itself", async () => {
    const onReplay = vi.fn();
    show(response(), { onReplay });
    await userEvent.click(screen.getByRole("link", { name: "เล่นอีกครั้ง" }));
    expect(onReplay).toHaveBeenCalledTimes(1);
  });

  it("says a skill replay does not count for the streak", () => {
    show(response({ countedForStreak: false }), { skill: "listening" });
    expect(screen.getByText("ฝึกแยกส่วนไม่นับสตรีค นับเมื่อเล่นทั้งบทจนจบ")).toBeInTheDocument();
    expect(screen.queryByText(/สตรีค 4 วัน/)).not.toBeInTheDocument();
  });

  it("says when a whole-lesson replay did not add to the streak", () => {
    show(response({ countedForStreak: false }));
    expect(screen.getByText("รอบนี้ไม่ได้นับเพิ่มในสตรีค")).toBeInTheDocument();
  });

  it("says a session without a scored exercise has no score", () => {
    show(response({ session: { sessionId: "s", day: 3, skill: "speaking", score: null, graded: 0 } }), { skill: "speaking" });
    expect(screen.getByText("ส่วนนี้ประเมินตัวเอง ไม่มีคะแนน")).toBeInTheDocument();
    expect(screen.queryByText(/คะแนนรอบนี้/)).not.toBeInTheDocument();
  });

  it("omits the original score line when the lesson has none", () => {
    show(response({ lessonScore: null }));
    expect(screen.queryByText(/คะแนนเดิมของบท/)).not.toBeInTheDocument();
  });

  it("falls back to the local score while saving, and says so", () => {
    show(null, { localScore: 0.5 });
    expect(screen.getByText("คะแนนรอบนี้ 50%")).toBeInTheDocument();
    expect(screen.getByText("กำลังบันทึก…")).toBeInTheDocument();
  });

  it("explains queued, 409, other rejection and error with a retry", async () => {
    const onRetry = vi.fn();
    const { rerender } = show({ status: "queued" }, { localScore: 1 });
    expect(screen.getByText("จะบันทึกเมื่อออนไลน์")).toBeInTheDocument();
    rerender(<PracticeCompletionScreen day={3} skill={null} result={{ status: "rejected", code: 409 }} localScore={null} onRetry={onRetry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("บทนี้ยังเล่นซ้ำไม่ได้ (ยังเรียนไม่จบ หรือไม่มีส่วนนี้)");
    rerender(<PracticeCompletionScreen day={3} skill={null} result={{ status: "rejected", code: 400 }} localScore={null} onRetry={onRetry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("บันทึกไม่สำเร็จ");
    rerender(<PracticeCompletionScreen day={3} skill={null} result={{ status: "error" }} localScore={null} onRetry={onRetry} />);
    await userEvent.click(screen.getByRole("button", { name: "ลองอีกครั้ง" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
