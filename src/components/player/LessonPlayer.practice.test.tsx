// The player in practice (replay) mode: docs/plans/replay-plan.md 3.2, 3.6.
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { fakeAudio, renderWithAudio } from "@/components/exercises/test-helpers";
import { get, readLesson } from "@/lib/answers/test-content";
import type { AttemptInput, CompletePracticeResponse, ReplaySkill } from "@/lib/attempts/contract";
import type { Exercise, Lesson } from "@/lib/content/schema";
import type { CompleteResult, SyncSink } from "@/lib/offline/sink";
import { LessonPlayer } from "./LessonPlayer";

vi.spyOn(window, "scrollTo").mockImplementation(() => {});

const DONE: CompleteResult<CompletePracticeResponse> = {
  status: "done",
  response: {
    session: { sessionId: "x", day: 1, skill: null, score: 0.5, graded: 2 },
    lessonScore: 0.8,
    streak: { current: 3, longest: 5 },
    countedForStreak: true,
  },
};

function listeningLesson(ids: string[]): Lesson {
  return { ...readLesson(1), sections: [{ skill: "listening", title: { en: "Greetings", th: "การทักทาย" }, exercises: ids.map(get) as Exercise[] }] };
}

function setup(ids: string[], opts: { skill?: ReplaySkill | null; result?: CompleteResult<CompletePracticeResponse>; lesson?: Lesson } = {}) {
  const sent: AttemptInput[] = [];
  const sink = {
    sendAttempt: vi.fn((a: AttemptInput) => { sent.push(a); }),
    completeLesson: vi.fn(async () => ({ status: "queued" as const })),
    completePractice: vi.fn(async () => opts.result ?? ({ status: "queued" as const })),
    pendingCount: () => 0,
    subscribe: () => () => {},
  } satisfies SyncSink;
  renderWithAudio(
    <LessonPlayer lesson={opts.lesson ?? listeningLesson(ids)} vocab={{}} sink={sink} mode="practice" skill={opts.skill ?? null} />,
    fakeAudio(),
  );
  return { sink, sent };
}
const choose = (name: string) => userEvent.click(screen.getByRole("radio", { name }));
const check = () => userEvent.click(screen.getByRole("button", { name: "ตรวจคำตอบ" }));
const next = () => userEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
const answer01 = async (right: boolean) => { await choose(right ? "Sam" : "Ann"); await check(); };

describe("LessonPlayer in practice mode", () => {
  it("marks the screen as a replay in the header (whole lesson)", () => {
    setup(["d001-listen-01"]);
    expect(screen.getByText("ฝึกซ้ำ")).toBeInTheDocument();
  });

  it("names the skill in the header for a section replay", () => {
    setup(["d001-listen-01"], { skill: "listening" });
    expect(screen.getByText("ฝึกซ้ำ · ฟัง")).toBeInTheDocument();
  });

  it("sends every attempt as source practice, retry round included, and never completeLesson", async () => {
    const { sent, sink } = setup(["d001-listen-01"], { result: DONE });
    await answer01(false);
    await next();
    expect(screen.getByText("ทบทวนข้อที่ตอบผิด")).toBeInTheDocument(); // the retry round stays in replay mode
    expect(screen.getByText("ฝึกซ้ำ")).toBeInTheDocument();
    await answer01(true);
    await next();
    await screen.findByText("จบการเล่นซ้ำแล้ว");
    expect(sent.map((a) => [a.source, a.attemptNo])).toEqual([["practice", 1], ["practice", 2]]);
    expect(sink.completeLesson).not.toHaveBeenCalled();
  });

  it("completes with completePractice({ kind: replay, day, skill, sessionId, completedAt })", async () => {
    const { sink, sent } = setup(["d001-listen-01"], { skill: "listening", result: DONE });
    await answer01(true);
    await next();
    await screen.findByText("จบการเล่นซ้ำแล้ว");
    expect(sink.completePractice).toHaveBeenCalledTimes(1);
    const req = (sink.completePractice.mock.calls[0] as unknown[])[0];
    expect(req).toEqual({ kind: "replay", day: 1, skill: "listening", sessionId: sent[0].sessionId, completedAt: expect.any(String) });
  });

  it("shows the session score next to the original score, with no next-lesson link", async () => {
    setup(["d001-listen-01"], { result: DONE });
    await answer01(true);
    await next();
    expect(await screen.findByText("คะแนนรอบนี้ 50%")).toBeInTheDocument();
    expect(screen.getByText(/คะแนนเดิมของบท 80%/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /บทถัดไป/ })).not.toBeInTheDocument();
    expect(screen.queryByText("จบบทเรียนแล้ว")).not.toBeInTheDocument();
  });

  it("shows the local score and a queued note while the result is queued", async () => {
    setup(["d001-listen-01"]);
    await answer01(true);
    await next();
    expect(await screen.findByText("จะบันทึกเมื่อออนไลน์")).toBeInTheDocument();
    expect(screen.getByText("คะแนนรอบนี้ 100%")).toBeInTheDocument();
  });

  it("asks again when the queue drains and moves on to the real result", async () => {
    const sent: AttemptInput[] = [];
    let drained: () => void = () => {};
    let pending = 1;
    const completePractice = vi.fn()
      .mockResolvedValueOnce({ status: "queued" })
      .mockResolvedValue(DONE);
    const sink = {
      sendAttempt: vi.fn((a: AttemptInput) => { sent.push(a); }),
      completeLesson: vi.fn(async () => ({ status: "queued" as const })),
      completePractice,
      pendingCount: () => pending,
      subscribe: (cb: () => void) => { drained = cb; return () => {}; },
    } satisfies SyncSink;
    renderWithAudio(<LessonPlayer lesson={listeningLesson(["d001-listen-01"])} vocab={{}} sink={sink} mode="practice" skill={null} />, fakeAudio());
    await answer01(true);
    await next();
    await screen.findByText("จะบันทึกเมื่อออนไลน์");
    pending = 0;
    drained();
    expect(await screen.findByText(/คะแนนเดิมของบท 80%/)).toBeInTheDocument();
    expect(completePractice).toHaveBeenCalledTimes(2);
  });

  it("says a session with nothing to score has no score", async () => {
    setup(["d001-pron-01"], { // phoneme_intro: ungraded, only "ถัดไป"
      result: { status: "done", response: { ...DONE.response, session: { ...DONE.response.session, score: null, graded: 0 } } },
    });
    await next();
    await screen.findByText("จบการเล่นซ้ำแล้ว");
    expect(screen.getByText("ส่วนนี้ประเมินตัวเอง ไม่มีคะแนน")).toBeInTheDocument();
  });
});

describe("LessonPlayer in lesson mode (unchanged)", () => {
  it("sends source lesson and calls completeLesson, not completePractice", async () => {
    const sent: AttemptInput[] = [];
    const sink = {
      sendAttempt: vi.fn((a: AttemptInput) => { sent.push(a); }),
      completeLesson: vi.fn(async () => ({ status: "queued" as const })),
      completePractice: vi.fn(async () => ({ status: "queued" as const })),
      pendingCount: () => 0,
      subscribe: () => () => {},
    } satisfies SyncSink;
    renderWithAudio(<LessonPlayer lesson={listeningLesson(["d001-listen-01"])} vocab={{}} sink={sink} />, fakeAudio());
    await answer01(true);
    await next();
    await screen.findByText("จบบทเรียนแล้ว");
    expect(sent[0].source).toBe("lesson");
    expect(sink.completeLesson).toHaveBeenCalledTimes(1);
    expect(sink.completePractice).not.toHaveBeenCalled();
    expect(screen.queryByText("ฝึกซ้ำ")).not.toBeInTheDocument();
  });
});
