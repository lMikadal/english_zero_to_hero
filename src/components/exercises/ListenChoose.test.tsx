import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { fakeAudio, renderWithAudio } from "@/components/exercises/test-helpers";
import { get } from "@/lib/answers/test-content";
import type { ExerciseOf } from "@/lib/content/schema";
import { ListenChoose } from "./ListenChoose";

const exercise = get("d001-listen-01") as ExerciseOf<"listen_choose">; // answer: Sam (0)

function setup(props: Partial<React.ComponentProps<typeof ListenChoose>> = {}, available = true) {
  const onAnswer = vi.fn();
  const onContinue = vi.fn();
  const source = fakeAudio(available);
  const view = renderWithAudio(<ListenChoose exercise={exercise} vocab={{}} onAnswer={onAnswer} onContinue={onContinue} {...props} />, source);
  return { onAnswer, onContinue, source, ...view };
}

describe("ListenChoose", () => {
  it("shows the Thai instruction, the question and the choices", () => {
    setup();
    expect(screen.getByText("ฟังแล้วตอบว่าเขาชื่ออะไร")).toBeInTheDocument();
    expect(screen.getByText("What is his name?")).toBeInTheDocument();
    expect(screen.getByText("เขาชื่ออะไร")).toBeInTheDocument();
    expect(screen.getAllByRole("radio").map((r) => r.textContent)).toEqual(["Sam", "Ann", "Tom"]);
  });

  it("plays the audio text at both speeds", async () => {
    const { source } = setup();
    await userEvent.click(screen.getByRole("button", { name: "ฟัง" }));
    expect(source.play).toHaveBeenLastCalledWith(exercise.audioText, expect.objectContaining({ rate: 1 }));
    await userEvent.click(screen.getByRole("button", { name: /ฟังช้า/ }));
    expect(source.play).toHaveBeenLastCalledWith(exercise.audioText, expect.objectContaining({ rate: 0.75 }));
  });

  it("cannot check before a choice is made", () => {
    setup();
    expect(screen.getByRole("button", { name: "ตรวจคำตอบ" })).toBeDisabled();
  });

  it("sends the chosen index once, whatever the answer", async () => {
    const { onAnswer } = setup();
    await userEvent.click(screen.getByRole("radio", { name: "Ann" }));
    await userEvent.click(screen.getByRole("button", { name: "ตรวจคำตอบ" }));
    await userEvent.click(screen.getByRole("button", { name: "ตรวจคำตอบ" }));
    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(onAnswer).toHaveBeenCalledWith({ kind: "choice", selected: 1 });
  });

  it("sends the right index for the right choice", async () => {
    const { onAnswer } = setup();
    await userEvent.click(screen.getByRole("radio", { name: "Sam" }));
    await userEvent.click(screen.getByRole("button", { name: "ตรวจคำตอบ" }));
    expect(onAnswer).toHaveBeenCalledWith({ kind: "choice", selected: 0 });
  });

  it("locks the inputs and highlights right and wrong after the result", async () => {
    const onAnswer = vi.fn();
    const { rerender } = setup({ onAnswer });
    await userEvent.click(screen.getByRole("radio", { name: "Ann" }));
    expect(screen.getByRole("radio", { name: "Ann" })).toHaveAttribute("aria-checked", "true");
    rerender(
      <ListenChoose exercise={exercise} vocab={{}} onAnswer={onAnswer} onContinue={() => {}} result={{ correct: false, score: 0 }} />,
    );
    expect(screen.getByRole("radio", { name: /Ann/ })).toHaveAttribute("data-state", "wrong");
    expect(screen.getByRole("radio", { name: /Sam/ })).toHaveAttribute("data-state", "right");
    expect(screen.getByRole("radio", { name: /Tom/ })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "ตรวจคำตอบ" })).not.toBeInTheDocument();
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

  it("marks English content lang=en", () => {
    setup();
    expect(screen.getByRole("radio", { name: "Sam" })).toHaveAttribute("lang", "en");
    expect(screen.getByText("What is his name?")).toHaveAttribute("lang", "en");
  });

  it("marks right and wrong with a glyph and hidden Thai text, not colour alone", async () => {
    const { rerender } = setup();
    await userEvent.click(screen.getByRole("radio", { name: "Ann" }));
    rerender(<ListenChoose exercise={exercise} vocab={{}} onAnswer={() => {}} onContinue={() => {}} result={{ correct: false, score: 0 }} />);
    expect(screen.getByRole("radio", { name: /Ann/ })).toHaveTextContent("✗");
    expect(screen.getByRole("radio", { name: /Ann/ })).toHaveTextContent("ผิด");
    expect(screen.getByRole("radio", { name: /Sam/ })).toHaveTextContent("✓");
    expect(screen.getByRole("radio", { name: /Sam/ })).toHaveTextContent("ถูก");
  });

  it("moves and selects with the arrow keys (radio pattern, roving tabindex)", async () => {
    setup();
    const radios = screen.getAllByRole("radio");
    expect(radios.map((r) => r.tabIndex)).toEqual([0, -1, -1]);
    radios[0].focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(radios[1]).toHaveAttribute("aria-checked", "true");
    expect(radios[1]).toHaveFocus();
    expect(radios.map((r) => r.tabIndex)).toEqual([-1, 0, -1]);
    await userEvent.keyboard("{ArrowUp}{ArrowUp}");
    expect(radios[2]).toHaveAttribute("aria-checked", "true"); // wraps
  });
});
