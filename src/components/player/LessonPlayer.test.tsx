import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { fakeAudio, renderWithAudio } from "@/components/exercises/test-helpers";
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

vi.spyOn(window, "scrollTo").mockImplementation(() => {}); // jsdom has no layout

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

  it("has one always-mounted live region whose text changes", async () => {
    setup(["d001-listen-01", "d001-listen-02"]);
    const region = screen.getByRole("status");
    expect(region).toHaveTextContent("");
    await answerListen01(false);
    expect(screen.getByRole("status")).toBe(region);
    expect(region).toHaveTextContent("Sam");
  });

  it("marks the correct-answer lines lang=en", async () => {
    setup(["d001-listen-01", "d001-listen-02"]);
    await answerListen01(false);
    expect(within(screen.getByRole("status")).getByText("Sam")).toHaveAttribute("lang", "en");
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
    expect(screen.getByRole("status")).toHaveTextContent("ยังไม่ถูก");
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

  it("measures durationMs on later steps and in the retry round too", async () => {
    let t = 0;
    const { sent } = setup(["d001-listen-01", "d001-listen-02"], undefined, { clock: () => t });
    t = 1000;
    await answerListen01(false);
    t = 1500;
    await next(); // second step shown at 1500
    t = 4000;
    await answerDictation("Nice to meet you.");
    expect(sent[1].durationMs).toBe(2500);
    t = 5000;
    await next(); // retry round starts at 5000
    t = 5700;
    await answerListen01(true);
    expect(sent[2]).toMatchObject({ attemptNo: 2, durationMs: 700 });
  });

  it("moves focus to the step heading and scrolls to the top on every step change", async () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    setup(["d001-listen-01", "d001-listen-02"]);
    scrollTo.mockClear();
    await answerListen01(true);
    await next();
    expect(scrollTo).toHaveBeenCalled();
    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading).toHaveTextContent("ข้อ 2 / 2");
    expect(heading).toHaveFocus();
    scrollTo.mockRestore();
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
    // no week-1 exercise is unsupported any more, so make one: a roleplay (no component, M2)
    const roleplay = { ...get("d001-listen-01"), id: "d001-rp-01", type: "roleplay" } as unknown as Exercise;
    const base = lessonOf(["d001-listen-01"]);
    const lesson: Lesson = { ...base, sections: [{ ...base.sections[0], exercises: [roleplay, get("d001-listen-01")] }] };
    const { sink, sent } = fakeSink();
    renderWithAudio(<LessonPlayer lesson={lesson} vocab={{}} sink={sink} />, fakeAudio());
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

  it("the next-lesson link uses the server's currentDay, not day + 1", async () => {
    const { sink } = fakeSink({ status: "done", response: { ...(DONE as { response: CompleteLessonResponse }).response, currentDay: 5 } });
    renderWithAudio(<LessonPlayer lesson={lessonOf(["d001-listen-01"])} vocab={{}} sink={sink} />, fakeAudio());
    await answerListen01(true);
    await next();
    expect(await screen.findByRole("link", { name: /บทถัดไป/ })).toHaveAttribute("href", "/day/5");
  });

  it("free_write shows บันทึกแล้ว exactly once after submitting", async () => {
    setup(["d007-write-01"]);
    const text = Array.from({ length: 60 }, () => "word").join(" ");
    await userEvent.type(screen.getByRole("textbox"), text);
    await check();
    expect(screen.getAllByText("บันทึกแล้ว")).toHaveLength(1);
  });

  it("when the finished day is the current day cap (365) it does not link to /day/365 again", async () => {
    const { sink } = fakeSink({ status: "done", response: { ...(DONE as { response: CompleteLessonResponse }).response, currentDay: 365 } });
    const lesson = { ...lessonOf(["d001-listen-01"]), day: 365 };
    renderWithAudio(<LessonPlayer lesson={lesson} vocab={{}} sink={sink} />, fakeAudio());
    await answerListen01(true);
    await next();
    await screen.findByText(/สตรีค/);
    expect(screen.queryByRole("link", { name: /บทถัดไป/ })).not.toBeInTheDocument();
  });

  it("completion queued: says it will be saved when online", async () => {
    setup(["d001-listen-01"], { status: "queued" });
    await answerListen01(true);
    await next();
    expect(await screen.findByText("จะบันทึกเมื่อออนไลน์")).toBeInTheDocument();
  });

  it("queued becomes done: when the sink has nothing pending the player asks again with the same day and sessionId", async () => {
    let pending = 1;
    const listeners = new Set<() => void>();
    const answers: CompleteResult[] = [{ status: "queued" }, DONE];
    const sink = {
      sendAttempt: vi.fn(),
      completeLesson: vi.fn(async () => answers.shift() ?? DONE),
      pendingCount: () => pending,
      subscribe: (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    } satisfies SyncSink;
    renderWithAudio(<LessonPlayer lesson={lessonOf(["d001-listen-01"])} vocab={{}} sink={sink} />, fakeAudio());
    await answerListen01(true);
    await next();
    expect(await screen.findByText("จะบันทึกเมื่อออนไลน์")).toBeInTheDocument();
    expect(sink.completeLesson).toHaveBeenCalledTimes(1);

    listeners.forEach((cb) => cb()); // still pending: nothing to do
    expect(sink.completeLesson).toHaveBeenCalledTimes(1);

    pending = 0;
    await act(async () => listeners.forEach((cb) => cb()));
    await waitFor(() => expect(screen.getByText(/สตรีค 3 วัน/)).toBeInTheDocument());
    expect(screen.queryByText("จะบันทึกเมื่อออนไลน์")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /บทถัดไป/ })).toHaveAttribute("href", "/day/2");
    const [first, second] = sink.completeLesson.mock.calls as unknown as [[{ day: number; sessionId: string }], [{ day: number; sessionId: string }]];
    expect(second[0]).toMatchObject({ day: first[0].day, sessionId: first[0].sessionId });
  });

  it("stops listening to the sink when it unmounts while queued", async () => {
    const listeners = new Set<() => void>();
    const sink = {
      sendAttempt: vi.fn(),
      completeLesson: vi.fn(async () => ({ status: "queued" }) as CompleteResult),
      pendingCount: () => 1,
      subscribe: (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    } satisfies SyncSink;
    const view = renderWithAudio(<LessonPlayer lesson={lessonOf(["d001-listen-01"])} vocab={{}} sink={sink} />, fakeAudio());
    await answerListen01(true);
    await next();
    await screen.findByText("จะบันทึกเมื่อออนไลน์");
    expect(listeners.size).toBe(1);
    view.unmount();
    expect(listeners.size).toBe(0);
  });

  it("calls onDone once, and only for a done result", async () => {
    const onDone = vi.fn();
    setup(["d001-listen-01"], DONE, { onDone });
    await answerListen01(true);
    await next();
    await screen.findByText(/สตรีค 3 วัน/);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("does not call onDone when the result is queued", async () => {
    const onDone = vi.fn();
    setup(["d001-listen-01"], { status: "queued" }, { onDone });
    await answerListen01(true);
    await next();
    await screen.findByText("จะบันทึกเมื่อออนไลน์");
    expect(onDone).not.toHaveBeenCalled();
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

  it("a rejected completeLesson shows an error and ลองอีกครั้ง retries with the same sessionId", async () => {
    const { sink } = fakeSink();
    sink.completeLesson.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(DONE);
    renderWithAudio(<LessonPlayer lesson={lessonOf(["d001-listen-01"])} vocab={{}} sink={sink} />, fakeAudio());
    await answerListen01(true);
    await next();
    expect(await screen.findByRole("alert")).toHaveTextContent("บันทึกไม่สำเร็จ");
    await userEvent.click(screen.getByRole("button", { name: "ลองอีกครั้ง" }));
    expect(await screen.findByText(/สตรีค 3 วัน/)).toBeInTheDocument();
    expect(sink.completeLesson).toHaveBeenCalledTimes(2);
    const [a, b] = sink.completeLesson.mock.calls as unknown as [[{ sessionId: string }], [{ sessionId: string }]];
    expect(a[0].sessionId).toBe(b[0].sessionId);
  });

  it("a synchronously throwing completeLesson does not crash the tree", async () => {
    const { sink } = fakeSink();
    sink.completeLesson.mockImplementationOnce(() => { throw new Error("sync boom"); });
    renderWithAudio(<LessonPlayer lesson={lessonOf(["d001-listen-01"])} vocab={{}} sink={sink} />, fakeAudio());
    await answerListen01(true);
    await next();
    expect(await screen.findByRole("alert")).toHaveTextContent("บันทึกไม่สำเร็จ");
    expect(screen.getByRole("button", { name: "ลองอีกครั้ง" })).toBeInTheDocument();
  });

  it("a 409 keeps its lock message and offers no retry", async () => {
    setup(["d001-listen-01"], { status: "rejected", code: 409 });
    await answerListen01(true);
    await next();
    expect(await screen.findByRole("alert")).toHaveTextContent("ล็อก");
    expect(screen.queryByRole("button", { name: "ลองอีกครั้ง" })).not.toBeInTheDocument();
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

describe("LessonPlayer action bar", () => {
  const bar = () => screen.getByTestId("action-bar");

  it("keeps the single live region in a sticky bottom bar, mounted before any answer", () => {
    setup(["d001-listen-01"]);
    expect(bar()).toContainElement(screen.getByRole("status"));
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(bar().className).toMatch(/\bsticky\b/);
    expect(bar().className).toMatch(/\bbottom-0\b/);
    expect(bar().className).not.toMatch(/\bborder-t\b/); // no chrome until there is feedback to show
    expect(bar().className).toMatch(/\bbg-bg\b/); // opaque, so content scrolls under it
    expect(bar().className).toMatch(/safe-area-inset-bottom/);
  });

  it("holds the feedback and ถัดไป together, and the component's ตรวจคำตอบ stays in the content", async () => {
    setup(["d001-listen-01"]);
    await choose("Sam");
    expect(bar()).not.toContainElement(screen.getByRole("button", { name: "ตรวจคำตอบ" }));
    await check();
    expect(bar()).toContainElement(screen.getByRole("button", { name: "ถัดไป" }));
    expect(bar()).toHaveTextContent("ถูกต้อง");
    expect(bar().className).toMatch(/\bborder-t\b/); // feedback panel: card colour with a top border (design 03)
    expect(bar().className).toMatch(/\bbg-card\b/);
  });

  it("lets a long correct-answer list scroll inside the bar instead of pushing the button away", async () => {
    setup(["d001-listen-01"]);
    await answerListen01(false);
    expect(bar()).toHaveTextContent("คำตอบที่ถูกต้อง");
    expect(screen.getByRole("status").className).toMatch(/overflow-y-auto/);
    expect(screen.getByRole("status").className).toMatch(/max-h-/);
  });

  it("has no bar chrome for an exercise with nothing to confirm (phoneme_intro)", () => {
    setup(["d001-pron-01"]);
    expect(bar()).toContainElement(screen.getByRole("status"));
    expect(bar().className).not.toMatch(/\bborder-t\b/);
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
