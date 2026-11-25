import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { fakeAudio, renderWithAudio } from "@/components/audio/audio-test-utils";
import { get } from "@/lib/answers/test-content";
import type { ExerciseOf } from "@/lib/content/schema";
import { Dictation } from "./Dictation";

const exercise = get("d001-listen-02") as ExerciseOf<"dictation">; // audioText: "Nice to meet you."

function setup(props: Partial<React.ComponentProps<typeof Dictation>> = {}, available = true) {
  const onAnswer = vi.fn();
  const onContinue = vi.fn();
  const source = fakeAudio(available);
  const view = renderWithAudio(<Dictation exercise={exercise} vocab={{}} onAnswer={onAnswer} onContinue={onContinue} {...props} />, source);
  return { onAnswer, onContinue, source, ...view };
}

describe("Dictation", () => {
  it("shows the Thai instruction and plays the audio text at both speeds", async () => {
    const { source } = setup();
    expect(screen.getByText("ฟังแล้วพิมพ์ตาม")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "ฟัง" }));
    expect(source.play).toHaveBeenLastCalledWith(exercise.audioText, expect.objectContaining({ rate: 1 }));
    await userEvent.click(screen.getByRole("button", { name: /ฟังช้า/ }));
    expect(source.play).toHaveBeenLastCalledWith(exercise.audioText, expect.objectContaining({ rate: 0.75 }));
  });

  it("cannot check an empty answer", async () => {
    setup();
    expect(screen.getByRole("button", { name: "ตรวจคำตอบ" })).toBeDisabled();
    await userEvent.type(screen.getByRole("textbox"), "   ");
    expect(screen.getByRole("button", { name: "ตรวจคำตอบ" })).toBeDisabled();
  });

  it("sends the typed text once, right or wrong", async () => {
    const { onAnswer } = setup();
    await userEvent.type(screen.getByRole("textbox"), "nice to meat you");
    await userEvent.click(screen.getByRole("button", { name: "ตรวจคำตอบ" }));
    await userEvent.click(screen.getByRole("button", { name: "ตรวจคำตอบ" }));
    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(onAnswer).toHaveBeenCalledWith({ kind: "text", text: "nice to meat you" });
  });

  it("can be checked with the Enter key", async () => {
    const { onAnswer } = setup();
    await userEvent.type(screen.getByRole("textbox"), "Nice to meet you.{Enter}");
    expect(onAnswer).toHaveBeenCalledWith({ kind: "text", text: "Nice to meet you." });
  });

  it("locks the input and highlights the result", () => {
    const { rerender } = setup();
    rerender(<Dictation exercise={exercise} vocab={{}} onAnswer={() => {}} onContinue={() => {}} result={{ correct: false, score: 0 }} />);
    expect(screen.getByRole("textbox")).toBeDisabled();
    expect(screen.getByRole("textbox")).toHaveAttribute("data-state", "wrong");
    expect(screen.queryByRole("button", { name: "ตรวจคำตอบ" })).not.toBeInTheDocument();
    rerender(<Dictation exercise={exercise} vocab={{}} onAnswer={() => {}} onContinue={() => {}} result={{ correct: true, score: 1 }} />);
    expect(screen.getByRole("textbox")).toHaveAttribute("data-state", "correct");
  });

  it("without audio: a note and skip through onContinue only; the transcript is never shown", async () => {
    const { onAnswer, onContinue } = setup({}, false);
    expect(await screen.findByText("อุปกรณ์นี้ยังเล่นเสียงภาษาอังกฤษไม่ได้ ข้ามข้อนี้ไปก่อน")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "แสดงข้อความ" })).not.toBeInTheDocument();
    expect(screen.queryByText(exercise.audioText)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "ข้าม" }));
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it("never shows the transcript before the result, even with audio", () => {
    setup();
    expect(screen.queryByText(exercise.audioText)).not.toBeInTheDocument();
  });

  it("marks the input lang=en", () => {
    setup();
    expect(screen.getByRole("textbox")).toHaveAttribute("lang", "en");
  });
});
