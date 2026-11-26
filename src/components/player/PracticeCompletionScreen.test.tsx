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

describe("PracticeCompletionScreen score and streak lines (skill/whole x score x counted)", () => {
  const session = (skill: ReplaySkill | null, score: number | null) => ({ sessionId: "s", day: 3, skill, score, graded: score === null ? 0 : 2 });
  const NO_ANSWERS = "ไม่มีคำตอบที่บันทึกในรอบนี้ จึงไม่นับสตรีค";
  const NO_SCORED = "รอบนี้ไม่มีข้อที่ให้คะแนน";
  const SELF_RATED = "ส่วนนี้ประเมินตัวเอง ไม่มีคะแนน";
  const BARE = "รอบนี้ไม่ได้นับเพิ่มในสตรีค";

  it("whole lesson, score, counted: score and streak", () => {
    show(response({ session: session(null, 0.7), countedForStreak: true }));
    expect(screen.getByText("คะแนนรอบนี้ 70%")).toBeInTheDocument();
    expect(screen.getByText(/^สตรีค 4 วัน/)).toBeInTheDocument();
  });

  it("whole lesson, score, not counted: score and the bare not-counted line", () => {
    show(response({ session: session(null, 0.7), countedForStreak: false }));
    expect(screen.getByText("คะแนนรอบนี้ 70%")).toBeInTheDocument();
    expect(screen.getByText(BARE)).toBeInTheDocument();
  });

  it("whole lesson, no score, counted (self-rated answers stored): says nothing was scored, still shows the streak", () => {
    show(response({ session: session(null, null), countedForStreak: true }));
    expect(screen.getByText(NO_SCORED)).toBeInTheDocument();
    expect(screen.getByText(/^สตรีค 4 วัน/)).toBeInTheDocument();
    expect(screen.queryByText(SELF_RATED)).not.toBeInTheDocument();
  });

  it("whole lesson, no score, not counted (no answer stored): honest line only, no bare line, no self-rated claim", () => {
    show(response({ session: session(null, null), countedForStreak: false }));
    expect(screen.getByText(NO_ANSWERS)).toBeInTheDocument();
    expect(screen.queryByText(BARE)).not.toBeInTheDocument();
    expect(screen.queryByText(SELF_RATED)).not.toBeInTheDocument();
    expect(screen.queryByText(/^สตรีค 4 วัน/)).not.toBeInTheDocument();
  });

  it.each([true, false])("skill, no score (counted %s): self-rated line and the skill note", (counted) => {
    show(response({ session: session("speaking", null), countedForStreak: counted }), { skill: "speaking" });
    expect(screen.getByText(SELF_RATED)).toBeInTheDocument();
    expect(screen.getByText("ฝึกแยกส่วนไม่นับสตรีค นับเมื่อเล่นทั้งบทจนจบ")).toBeInTheDocument();
    expect(screen.queryByText(NO_ANSWERS)).not.toBeInTheDocument();
    expect(screen.queryByText(NO_SCORED)).not.toBeInTheDocument();
  });

  it.each([true, false])("skill, score (counted %s): score and the skill note, no streak line", (counted) => {
    show(response({ session: session("reading", 0.5), countedForStreak: counted }), { skill: "reading" });
    expect(screen.getByText("คะแนนรอบนี้ 50%")).toBeInTheDocument();
    expect(screen.getByText("ฝึกแยกส่วนไม่นับสตรีค นับเมื่อเล่นทั้งบทจนจบ")).toBeInTheDocument();
    expect(screen.queryByText(/^สตรีค 4 วัน/)).not.toBeInTheDocument();
    expect(screen.queryByText(BARE)).not.toBeInTheDocument();
  });

  it("whole lesson still saving with no local score: does not claim self-rating", () => {
    show(null, { localScore: null });
    expect(screen.queryByText(SELF_RATED)).not.toBeInTheDocument();
  });
});

