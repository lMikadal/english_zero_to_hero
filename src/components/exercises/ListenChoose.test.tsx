import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { fakeAudio, renderWithAudio } from "@/components/audio/audio-test-utils";
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
    expect(screen.getByRole("radio", { name: "Ann" })).toHaveAttribute("data-state", "wrong");
    expect(screen.getByRole("radio", { name: "Sam" })).toHaveAttribute("data-state", "correct");
    expect(screen.getByRole("radio", { name: "Tom" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "ตรวจคำตอบ" })).not.toBeInTheDocument();
  });

  it("without audio: reveal the text, or skip through onContinue only", async () => {
    const { onAnswer, onContinue } = setup({}, false);
    await userEvent.click(await screen.findByRole("button", { name: "แสดงข้อความ" }));
    expect(screen.getByText(exercise.audioText)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "ข้าม" }));
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(onAnswer).not.toHaveBeenCalled();
  });
});
