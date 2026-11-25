import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { fakeAudio, renderWithAudio } from "@/components/audio/audio-test-utils";
import { get } from "@/lib/answers/test-content";
import type { ExerciseOf } from "@/lib/content/schema";
import { Shadowing } from "./Shadowing";

const exercise = get("d001-speak-01") as ExerciseOf<"shadowing">; // 3 lines

function setup(props: Partial<React.ComponentProps<typeof Shadowing>> = {}, available = true) {
  const onAnswer = vi.fn();
  const onContinue = vi.fn();
  const source = fakeAudio(available);
  const view = renderWithAudio(<Shadowing exercise={exercise} vocab={{}} onAnswer={onAnswer} onContinue={onContinue} {...props} />, source);
  return { onAnswer, onContinue, source, ...view };
}

describe("Shadowing", () => {
  it("marks the English text lang=en", () => {
    setup();
    expect(document.querySelector('[lang="en"]')).not.toBeNull();
  });

  it("shows the Thai instruction and every line", () => {
    setup();
    expect(screen.getByText("พูดตามทันทีทีละประโยค")).toBeInTheDocument();
    for (const line of exercise.lines) expect(screen.getByText(line)).toBeInTheDocument();
  });

  it("plays each line at both speeds", async () => {
    const { source } = setup();
    const play = screen.getAllByRole("button", { name: "ฟัง" });
    expect(play).toHaveLength(3);
    await userEvent.click(play[1]);
    expect(source.play).toHaveBeenLastCalledWith(exercise.lines[1], expect.objectContaining({ rate: 1 }));
    await userEvent.click(screen.getAllByRole("button", { name: /ฟังช้า/ })[2]);
    expect(source.play).toHaveBeenLastCalledWith(exercise.lines[2], expect.objectContaining({ rate: 0.75 }));
  });

  it("sends the self rating once", async () => {
    const { onAnswer } = setup();
    await userEvent.click(screen.getByRole("button", { name: "ยังไม่คล่อง" }));
    await userEvent.click(screen.getByRole("button", { name: "พูดได้" }));
    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(onAnswer).toHaveBeenCalledWith({ kind: "self", rating: "unsure" });
  });

  it("sends ok", async () => {
    const { onAnswer } = setup();
    await userEvent.click(screen.getByRole("button", { name: "พูดได้" }));
    expect(onAnswer).toHaveBeenCalledWith({ kind: "self", rating: "ok" });
  });

  it("locks both buttons after the result", () => {
    const { rerender } = setup();
    rerender(<Shadowing exercise={exercise} vocab={{}} onAnswer={() => {}} onContinue={() => {}} result={{ correct: true, score: null }} />);
    expect(screen.getByRole("button", { name: "พูดได้" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "ยังไม่คล่อง" })).toBeDisabled();
  });

  it("without audio: lines stay visible and the learner can skip with onContinue only", async () => {
    const { onAnswer, onContinue } = setup({}, false);
    await userEvent.click(await screen.findByRole("button", { name: "ข้าม" }));
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(onAnswer).not.toHaveBeenCalled();
  });
});
