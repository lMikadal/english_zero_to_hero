import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { fakeAudio, renderWithAudio } from "@/components/exercises/test-helpers";
import { get } from "@/lib/answers/test-content";
import type { ExerciseOf } from "@/lib/content/schema";
import { RepeatAfterMe } from "./RepeatAfterMe";

const exercise = get("d001-pron-03") as ExerciseOf<"repeat_after_me">;

function setup(props: Partial<React.ComponentProps<typeof RepeatAfterMe>> = {}, available = true) {
  const onAnswer = vi.fn();
  const onContinue = vi.fn();
  const source = fakeAudio(available);
  const view = renderWithAudio(<RepeatAfterMe exercise={exercise} vocab={{}} onAnswer={onAnswer} onContinue={onContinue} {...props} />, source);
  return { onAnswer, onContinue, source, ...view };
}

describe("RepeatAfterMe", () => {
  it("marks the English text lang=en", () => {
    setup();
    expect(document.querySelector('[lang="en"]')).not.toBeNull();
  });

  it("shows the Thai instruction, the text and the IPA", () => {
    setup();
    expect(screen.getByText("ฟังแล้วพูดตาม")).toBeInTheDocument();
    expect(screen.getByText(exercise.text)).toBeInTheDocument();
    expect(screen.getByText(exercise.ipa!)).toBeInTheDocument();
  });

  it("plays the text at both speeds", async () => {
    const { source } = setup();
    await userEvent.click(screen.getByRole("button", { name: "ฟัง" }));
    expect(source.play).toHaveBeenLastCalledWith(exercise.text, expect.objectContaining({ rate: 1 }));
    await userEvent.click(screen.getByRole("button", { name: /ฟังช้า/ }));
    expect(source.play).toHaveBeenLastCalledWith(exercise.text, expect.objectContaining({ rate: 0.75 }));
  });

  it("sends self rating ok once", async () => {
    const { onAnswer } = setup();
    await userEvent.click(screen.getByRole("button", { name: "พูดได้" }));
    await userEvent.click(screen.getByRole("button", { name: "ยังไม่คล่อง" }));
    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(onAnswer).toHaveBeenCalledWith({ kind: "self", rating: "ok" });
  });

  it("sends self rating unsure", async () => {
    const { onAnswer } = setup();
    await userEvent.click(screen.getByRole("button", { name: "ยังไม่คล่อง" }));
    expect(onAnswer).toHaveBeenCalledWith({ kind: "self", rating: "unsure" });
  });

  it("locks both buttons after the result", () => {
    const { rerender } = setup();
    rerender(<RepeatAfterMe exercise={exercise} vocab={{}} onAnswer={() => {}} onContinue={() => {}} result={{ correct: false, score: null }} />);
    expect(screen.getByRole("button", { name: "พูดได้" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "ยังไม่คล่อง" })).toBeDisabled();
  });

  it("without audio: the text stays visible and the learner can skip with onContinue only", async () => {
    const { onAnswer, onContinue } = setup({}, false);
    await userEvent.click(await screen.findByRole("button", { name: "ข้าม" }));
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(onAnswer).not.toHaveBeenCalled();
    expect(screen.getByText(exercise.text)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "แสดงข้อความ" })).not.toBeInTheDocument();
  });
});
