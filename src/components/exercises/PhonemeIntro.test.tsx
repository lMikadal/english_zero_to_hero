import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { fakeAudio, renderWithAudio } from "@/components/exercises/test-helpers";
import { get } from "@/lib/answers/test-content";
import type { ExerciseOf } from "@/lib/content/schema";
import { PhonemeIntro } from "./PhonemeIntro";

const exercise = get("d001-pron-01") as ExerciseOf<"phoneme_intro">; // /æ/: cat, bad, man, apple

function setup(available = true) {
  const onAnswer = vi.fn();
  const onContinue = vi.fn();
  const source = fakeAudio(available);
  renderWithAudio(<PhonemeIntro exercise={exercise} vocab={{}} onAnswer={onAnswer} onContinue={onContinue} />, source);
  return { onAnswer, onContinue, source };
}

describe("PhonemeIntro", () => {
  it("shows the Thai instruction, the IPA, the Thai tip and the examples", () => {
    setup();
    expect(screen.getByText("ฟังและสังเกตรูปปาก")).toBeInTheDocument();
    expect(screen.getByText("/æ/")).toBeInTheDocument();
    expect(screen.getByText(exercise.tipTh)).toBeInTheDocument();
    for (const ex of exercise.examples) expect(screen.getByText(ex)).toBeInTheDocument();
  });

  it("plays each example at both speeds", async () => {
    const { source } = setup();
    await userEvent.click(screen.getAllByRole("button", { name: "ฟัง" })[1]);
    expect(source.play).toHaveBeenLastCalledWith("bad", expect.objectContaining({ rate: 1 }));
    await userEvent.click(screen.getAllByRole("button", { name: /ฟังช้า/ })[3]);
    expect(source.play).toHaveBeenLastCalledWith("apple", expect.objectContaining({ rate: 0.75 }));
  });

  it("continues through onContinue and never calls onAnswer", async () => {
    const { onAnswer, onContinue } = setup();
    await userEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it("without audio: examples stay visible and there is exactly one way on, ถัดไป (no ข้าม)", async () => {
    const { onAnswer, onContinue } = setup(false);
    await screen.findByText("อุปกรณ์นี้ไม่มีเสียงภาษาอังกฤษ");
    expect(screen.getByText("cat")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "ข้าม" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(onAnswer).not.toHaveBeenCalled();
  });
});
