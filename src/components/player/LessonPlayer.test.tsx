import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { fakeAudio, renderWithAudio } from "@/components/audio/audio-test-utils";
import { get, readLesson } from "@/lib/answers/test-content";
import { attemptInputSchema, type AttemptInput, type CompleteLessonResponse } from "@/lib/attempts/contract";
import type { Exercise, Lesson } from "@/lib/content/schema";
import type { CompleteResult, SyncSink } from "@/lib/offline/sink";
import { LessonPlayer } from "./LessonPlayer";

function lessonOf(ids: string[], day = 1): Lesson {
  const exercises = ids.map(get) as Exercise[];
  return { ...readLesson(day), sections: [{ skill: "listening", title: { en: "Greetings", th: "การทักทาย" }, exercises }] };
}

function fakeSink(result: CompleteResult = { status: "queued" }) {
  const sent: AttemptInput[] = [];
  const sink = {
    sendAttempt: vi.fn((a: AttemptInput) => { sent.push(a); }),
    completeLesson: vi.fn(async () => result),
    pendingCount: () => 0,
    subscribe: () => () => {},
  } satisfies SyncSink;
  return { sink, sent };
}

function setup(ids: string[], result?: CompleteResult, extra: Partial<React.ComponentProps<typeof LessonPlayer>> = {}) {
  const { sink, sent } = fakeSink(result);
  const view = renderWithAudio(<LessonPlayer lesson={lessonOf(ids)} vocab={{}} sink={sink} {...extra} />, fakeAudio());
  return { sink, sent, ...view };
}

const check = () => userEvent.click(screen.getByRole("button", { name: "ตรวจคำตอบ" }));
const next = () => userEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
const choose = (name: string) => userEvent.click(screen.getByRole("radio", { name }));
const answerListen01 = async (right: boolean) => { await choose(right ? "Sam" : "Ann"); await check(); };
const answerDictation = async (text: string) => { await userEvent.type(screen.getByRole("textbox"), text); await check(); };

const DONE: CompleteResult = {
  status: "done",
  response: { progress: { day: 1, status: "done", score: 0.8, completedAt: "2026-11-25T10:00:00.000Z" }, streak: { current: 3, longest: 5 }, currentDay: 2 } satisfies CompleteLessonResponse,
};

describe("LessonPlayer", () => {
  it("shows the step counter, the section title and the first exercise", () => {
    setup(["d001-listen-01", "d001-listen-02"]);
    expect(screen.getByText("ข้อ 1 / 2")).toBeInTheDocument();
    expect(screen.getByText("การทักทาย")).toBeInTheDocument();
    expect(screen.getByText("ฟังแล้วตอบว่าเขาชื่ออะไร")).toBeInTheDocument();
  });

  it("locks the next button until the exercise is answered", async () => {
    setup(["d001-listen-01", "d001-listen-02"]);
    expect(screen.getByRole("button", { name: "ถัดไป" })).toBeDisabled();
    await answerListen01(true);
    expect(screen.getByRole("button", { name: "ถัดไป" })).toBeEnabled();
  });

  it("shows ถูกต้อง for a right answer", async () => {
    setup(["d001-listen-01", "d001-listen-02"]);
    await answerListen01(true);
    expect(screen.getByRole("status")).toHaveTextContent("ถูกต้อง");
  });

  it("shows the correct answer after a wrong answer", async () => {
    setup(["d001-listen-01", "d001-listen-02"]);
    await answerListen01(false);
    expect(screen.getByRole("status")).toHaveTextContent("Sam");
    expect(screen.getByRole("status")).not.toHaveTextContent("ถูกต้อง");
  });

  it("sends a valid attempt payload with the same sessionId all lesson long", async () => {
    const { sent } = setup(["d001-listen-01", "d001-listen-02"]);
    await answerListen01(true);
    await next();
    await answerDictation("Nice to meet you.");
    expect(sent).toHaveLength(2);
    for (const a of sent) {
      expect(attemptInputSchema.safeParse(a).success).toBe(true);
      expect(a.source).toBe("lesson");
      expect(a.attemptNo).toBe(1);
    }
    expect(sent[0]).toMatchObject({ exerciseId: "d001-listen-01", answer: { kind: "choice", selected: 0 } });
    expect(sent[1]).toMatchObject({ exerciseId: "d001-listen-02", answer: { kind: "text", text: "Nice to meet you." } });
    expect(sent[0].sessionId).toBe(sent[1].sessionId);
    expect(sent[0].id).not.toBe(sent[1].id);
  });

  it("measures durationMs from the moment the exercise was shown (monotonic clock)", async () => {
    let t = 1000;
    const { sent } = setup(["d001-listen-01"], undefined, { clock: () => t });
    t = 4200;
    await answerListen01(true);
    expect(sent[0].durationMs).toBe(3200);
  });

  it("sends nothing for phoneme_intro and advances", async () => {
    const { sent, sink } = setup(["d001-pron-01", "d001-listen-01"]);
    expect(screen.getByText("ข้อ 1 / 2")).toBeInTheDocument();
    await next();
    expect(screen.getByText("ข้อ 2 / 2")).toBeInTheDocument();
    expect(sent).toHaveLength(0);
    expect(sink.sendAttempt).not.toHaveBeenCalled();
  });

  it("shows ยังไม่รองรับ for a type without a component, lets the learner skip, and records nothing", async () => {
    const { sent, sink } = setup(["d003-write-04", "d001-listen-01"]);
    expect(screen.getByText("ยังไม่รองรับ")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "ข้าม" }));
    expect(screen.getByText("ข้อ 2 / 2")).toBeInTheDocument();
    expect(sent).toHaveLength(0);
    expect(sink.sendAttempt).not.toHaveBeenCalled();
  });

  it("completes straight away when nothing was wrong: completeLesson once, no retry", async () => {
    const { sink } = setup(["d001-listen-01"], DONE);
    await answerListen01(true);
    await next();
    await screen.findByText("จบบทเรียนแล้ว");
    expect(sink.completeLesson).toHaveBeenCalledTimes(1);
    const arg = sink.completeLesson.mock.calls[0] as unknown as [{ day: number; sessionId: string; completedAt: string }];
    expect(arg[0].day).toBe(1);
  });

  it("brings wrong answers back once with attemptNo 2 and a fresh component", async () => {
    const { sent, sink } = setup(["d001-listen-01", "d001-listen-02"], DONE);
    await answerListen01(false);
    await next();
    await answerDictation("Nice to meet you.");
    await next();
    // retry round: only the wrong one, remounted (nothing selected)
    expect(screen.getByText(/ทบทวน/)).toBeInTheDocument();
    expect(screen.getByText("ข้อ 1 / 1")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Ann" })).toHaveAttribute("aria-checked", "false");
    expect(sink.completeLesson).not.toHaveBeenCalled();
    await answerListen01(false); // wrong again: no loop
    expect(screen.getByRole("status")).toHaveTextContent("Sam");
    await next();
    await screen.findByText("จบบทเรียนแล้ว");
    expect(sent.map((a) => [a.exerciseId, a.attemptNo])).toEqual([["d001-listen-01", 1], ["d001-listen-02", 1], ["d001-listen-01", 2]]);
    expect(new Set(sent.map((a) => a.sessionId)).size).toBe(1);
    expect(sink.completeLesson).toHaveBeenCalledTimes(1);
    for (const a of sent) expect(attemptInputSchema.safeParse(a).success).toBe(true);
  });

  it("does not retry self-rated exercises", async () => {
    const { sink } = setup(["d001-pron-03"], DONE);
    await userEvent.click(screen.getByRole("button", { name: "ยังไม่คล่อง" }));
    await next();
    await screen.findByText("จบบทเรียนแล้ว");
    expect(sink.completeLesson).toHaveBeenCalledTimes(1);
  });

  it("completion done: shows the streak and the lesson score", async () => {
    setup(["d001-listen-01"], DONE);
    await answerListen01(true);
    await next();
    expect(await screen.findByText(/สตรีค 3 วัน/)).toBeInTheDocument();
    expect(screen.getByText(/80%/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /บทถัดไป/ })).toHaveAttribute("href", "/day/2");
  });

  it("completion queued: says it will be saved when online", async () => {
    setup(["d001-listen-01"], { status: "queued" });
    await answerListen01(true);
    await next();
    expect(await screen.findByText("จะบันทึกเมื่อออนไลน์")).toBeInTheDocument();
  });

  it("completion rejected: shows a clear Thai error", async () => {
    setup(["d001-listen-01"], { status: "rejected", code: 409 });
    await answerListen01(true);
    await next();
    expect(await screen.findByRole("alert")).toHaveTextContent("ล็อก");
  });

  it("completion rejected with 400 shows a generic save error", async () => {
    setup(["d001-listen-01"], { status: "rejected", code: 400 });
    await answerListen01(true);
    await next();
    expect(await screen.findByRole("alert")).toHaveTextContent("บันทึกไม่สำเร็จ");
  });

  it("shows a pending message while completeLesson is in flight", async () => {
    const { sink } = fakeSink();
    let resolve!: (r: CompleteResult) => void;
    sink.completeLesson.mockReturnValue(new Promise<CompleteResult>((r) => { resolve = r; }));
    renderWithAudio(<LessonPlayer lesson={lessonOf(["d001-listen-01"])} vocab={{}} sink={sink} />, fakeAudio());
    await answerListen01(true);
    await next();
    expect(await screen.findByText("กำลังบันทึก…")).toBeInTheDocument();
    await act(async () => resolve(DONE));
    await waitFor(() => expect(screen.getByText(/สตรีค 3 วัน/)).toBeInTheDocument());
  });
});

describe("LessonPlayer with no audio", () => {
  it("skipping with ข้าม goes to the next exercise and sends nothing", async () => {
    const { sink } = fakeSink();
    renderWithAudio(<LessonPlayer lesson={lessonOf(["d001-listen-01", "d001-listen-02"])} vocab={{}} sink={sink} />, fakeAudio(false));
    await userEvent.click(await screen.findByRole("button", { name: "ข้าม" }));
    expect(screen.getByText("ข้อ 2 / 2")).toBeInTheDocument();
    expect(sink.sendAttempt).not.toHaveBeenCalled();
    expect(within(document.body).queryByText("ยังไม่รองรับ")).not.toBeInTheDocument();
  });
});
