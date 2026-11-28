import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { fakeAudio, renderWithAudio } from "@/components/exercises/test-helpers";
import { checkpointFixture } from "@/lib/answers/test-content";
import { attemptInputSchema } from "@/lib/attempts/contract";
import type { Exercise } from "@/lib/content/schema";
import { CheckpointPlayer } from "./CheckpointPlayer";
import { confirm, DONE_RESPONSE, fakeCheckpointSink, fillIn, fixtureVocab, nextButton, SELF_RATED, SESSION } from "./test-support";
import { exerciseIds } from "./view";

vi.spyOn(window, "scrollTo").mockImplementation(() => {}); // jsdom has no layout

const all: Exercise[] = checkpointFixture.sections.flatMap((s) => s.exercises);

function setup(extra: Partial<React.ComponentProps<typeof CheckpointPlayer>> = {}, sinkResult?: Parameters<typeof fakeCheckpointSink>[0], audio = true) {
  const fake = fakeCheckpointSink(sinkResult);
  const props = { checkpoint: checkpointFixture, vocab: fixtureVocab, sink: fake.sink, sessionId: SESSION, practised: new Set<string>(), onRestart: vi.fn(), onDone: vi.fn(), ...extra };
  const view = renderWithAudio(<CheckpointPlayer {...props} />, fakeAudio(audio));
  return { ...fake, ...view, props };
}

/** Answers and moves past the exercise on screen; the last one ends the sitting. */
async function playOne(e: Exercise) {
  const user = userEvent.setup();
  await fillIn(e, user);
  await confirm(e, user);
  await user.click(nextButton());
}
const playAll = async (from = 0) => { for (const e of all.slice(from)) await playOne(e); };

describe("CheckpointPlayer", () => {
  it("shows the step counter over the whole set and the first exercise with a ยืนยันคำตอบ button (never ตรวจคำตอบ)", () => {
    setup();
    expect(screen.getByText("ข้อ 1 / 16")).toBeInTheDocument();
    expect(screen.getByText("ออกเสียง")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ยืนยันคำตอบ" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "ตรวจคำตอบ" })).toBeNull();
  });

  it("sends every first answer as a valid checkpoint attempt of one session, and nothing for the others", async () => {
    const { sent } = setup();
    await playAll(0);
    expect(sent).toHaveLength(all.length);
    for (const a of sent) {
      expect(attemptInputSchema.safeParse(a).success, a.exerciseId).toBe(true);
      expect(a.source).toBe("checkpoint");
      expect(a.attemptNo).toBe(1);
      expect(a.sessionId).toBe(SESSION);
    }
    expect(sent.map((a) => a.exerciseId)).toEqual(exerciseIds(checkpointFixture));
    expect(new Set(sent.map((a) => a.id)).size).toBe(all.length);
  });

  it("after a confirmed answer: only 'บันทึกคำตอบแล้ว' and a single ถัดไป; no right/wrong words, no correct answer, no retry", async () => {
    setup();
    const user = userEvent.setup();
    await fillIn(all[0], user);
    expect(screen.queryByRole("button", { name: "ถัดไป" })).toBeNull();
    await confirm(all[0], user);
    expect(screen.getByRole("status")).toHaveTextContent("บันทึกคำตอบแล้ว");
    expect(screen.getAllByRole("button", { name: "ถัดไป" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "ยืนยันคำตอบ" })).toBeNull();
    const text = document.body.textContent ?? "";
    for (const bad of ["ถูกต้อง", "ยังไม่ถูก", "คำตอบที่ถูกต้อง", "ทบทวนข้อที่ตอบผิด", "✓", "✗"]) expect(text, bad).not.toContain(bad);
    expect(document.querySelector("[data-state='right'], [data-state='wrong']")).toBeNull();
    expect(nextButton()).toBeEnabled();
  });

  it("moves focus to ถัดไป after the answer and to the section heading on the next step", async () => {
    setup();
    const user = userEvent.setup();
    await fillIn(all[0], user);
    await confirm(all[0], user);
    expect(nextButton()).toHaveFocus();
    await user.click(nextButton());
    expect(screen.getByRole("heading", { level: 2 })).toHaveFocus();
  });

  it("a self-rated step has no confirm button: the rating is the answer, then ถัดไป", async () => {
    setup();
    for (const e of all.slice(0, 6)) await playOne(e);
    expect(SELF_RATED).toContain(all[6].type);
    expect(screen.getByRole("button", { name: "พูดได้" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "ยืนยันคำตอบ" })).toBeNull();
    expect(screen.queryByRole("button", { name: "ถัดไป" })).toBeNull();
  });

  it("sends the completion once, with the same afterDay and session, after the last answer; the result then shows", async () => {
    const { sink, props } = setup();
    await playAll(0);
    await screen.findByRole("heading", { level: 1, name: "ผลแบบทดสอบ ครั้งที่ 1" });
    expect(sink.completeCheckpoint).toHaveBeenCalledTimes(1);
    expect(sink.completeCheckpoint).toHaveBeenCalledWith({ afterDay: 30, sessionId: SESSION, completedAt: expect.any(String) });
    await waitFor(() => expect(props.onDone).toHaveBeenCalledTimes(1));
  });

  it("a retry after a thrown completion sends the identical request again", async () => {
    const { sink } = setup();
    sink.completeCheckpoint.mockRejectedValueOnce(new Error("boom"));
    await playAll(0);
    await screen.findByText(/บันทึกผลไม่สำเร็จ/);
    await userEvent.click(screen.getByRole("button", { name: "ลองอีกครั้ง" }));
    await screen.findByRole("heading", { level: 1, name: "ผลแบบทดสอบ ครั้งที่ 1" });
    expect(sink.completeCheckpoint).toHaveBeenCalledTimes(2);
    expect(sink.completeCheckpoint.mock.calls[1][0]).toEqual(sink.completeCheckpoint.mock.calls[0][0]);
  });

  it("resume: starts at the first unanswered exercise, counts the whole set, keeps the session, never resends answered exercises", async () => {
    const ids = exerciseIds(checkpointFixture);
    const { sent } = setup({ skipIds: new Set(ids.slice(0, 5)) });
    expect(screen.getByText("ข้อ 6 / 16")).toBeInTheDocument();
    await playAll(5);
    await screen.findByRole("heading", { level: 1, name: "ผลแบบทดสอบ ครั้งที่ 1" });
    expect(sent.map((a) => a.exerciseId)).toEqual(ids.slice(5));
    expect(new Set(sent.map((a) => a.sessionId))).toEqual(new Set([SESSION]));
  });

  it("an exercise is sent once even if the answer is submitted twice", async () => {
    const { sent } = setup();
    const user = userEvent.setup();
    await fillIn(all[0], user);
    const button = screen.getByRole("button", { name: "ยืนยันคำตอบ" });
    await user.click(button);
    await user.click(button).catch(() => {});
    expect(sent).toHaveLength(1);
  });

  it("without English audio the listening exercise can be skipped: nothing is sent for it", async () => {
    const { sent } = setup({}, undefined, false);
    const user = userEvent.setup();
    await fillIn(all[0], user); // minimal_pair needs audio too
    await screen.findByText("อุปกรณ์นี้ยังเล่นเสียงภาษาอังกฤษไม่ได้ ข้ามข้อนี้ไปก่อน");
    await user.click(screen.getByRole("button", { name: "ข้าม" }));
    expect(sent).toHaveLength(0);
    expect(screen.getByText("ข้อ 2 / 16")).toBeInTheDocument();
  });

  it("a queued completion shows the waiting message and turns into the result when the queue is empty", async () => {
    const fake = setup({}, { status: "queued" });
    await playAll(0);
    await screen.findByText("จะแสดงผลเมื่อออนไลน์");
    expect(screen.queryByText(/คะแนนรวม/)).toBeNull();
    fake.sink.completeCheckpoint.mockResolvedValue({ status: "done", response: DONE_RESPONSE });
    await act(async () => { fake.notify(); });
    await screen.findByText("คะแนนรวม 78%");
  });

  it("409 from the server: says there are no answers for this sitting and offers a fresh start, which asks the parent for a new sitting", async () => {
    const { props } = setup({}, { status: "rejected", code: 409 });
    await playAll(0);
    await screen.findByText(/ไม่มีคำตอบของรอบนี้บนเซิร์ฟเวอร์/);
    await userEvent.click(screen.getByRole("button", { name: "เริ่มทำใหม่" }));
    expect(props.onRestart).toHaveBeenCalledTimes(1);
  });

  it("409 retake_tomorrow: the retake message, no fresh start, no second completion call, the same session", async () => {
    const { props, sink, sent } = setup({}, { status: "rejected", code: 409, error: "retake_tomorrow" });
    await playAll(0);
    await screen.findByText("สอบอีกครั้งได้ตั้งแต่พรุ่งนี้");
    expect(screen.queryByRole("button", { name: "เริ่มทำใหม่" })).toBeNull();
    expect(screen.getByRole("link", { name: "กลับหน้าแรก" })).toBeInTheDocument();
    expect(sink.completeCheckpoint).toHaveBeenCalledTimes(1);
    expect(props.onRestart).not.toHaveBeenCalled();
    expect(new Set(sent.map((a) => a.sessionId))).toEqual(new Set([SESSION]));
  });

  it("never grades on the device: the player does not import the grader and does not branch on a grade", () => {
    const code = fs.readFileSync(path.resolve(import.meta.dirname, "CheckpointPlayer.tsx"), "utf8");
    expect(code).not.toMatch(/gradeExercise|answers\/grade|isRetryable|correctAnswerText|\.correct\b/);
    expect(code).toMatch(/reveal:\s*false/);
  });
});
