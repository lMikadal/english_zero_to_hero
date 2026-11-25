import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SpeakAnswer } from "./SpeakAnswer";
import { baseProps, exercise, fakeAudio, renderWithAudio } from "./text-test-helpers";

const ex = exercise("d001-speak-02", "speak_answer");

describe("SpeakAnswer", () => {
  it("shows the instruction and prompt, offers two ratings and hides the sample answer", () => {
    renderWithAudio(<SpeakAnswer {...baseProps()} exercise={ex} />);
    expect(screen.getByText(ex.instruction.th)).toBeInTheDocument();
    expect(screen.getByText(ex.prompt)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "พูดได้" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "ยังไม่คล่อง" })).toBeEnabled();
    expect(screen.queryByText(ex.sampleAnswer)).toBeNull();
  });

  it.each([
    ["พูดได้", "ok"],
    ["ยังไม่คล่อง", "unsure"],
  ] as const)("rating %s answers once with %s and reveals the sample answer", (label, rating) => {
    const props = baseProps();
    renderWithAudio(<SpeakAnswer {...props} exercise={ex} />);
    fireEvent.click(screen.getByRole("button", { name: label }));
    expect(props.onAnswer).toHaveBeenCalledTimes(1);
    expect(props.onAnswer).toHaveBeenCalledWith({ kind: "self", rating });
    expect(screen.getByText(ex.sampleAnswer)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "พูดได้" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "ยังไม่คล่อง" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "พูดได้" }));
    expect(props.onAnswer).toHaveBeenCalledTimes(1);
  });

  it("has no play button when audio is unavailable", async () => {
    renderWithAudio(<SpeakAnswer {...baseProps()} exercise={ex} />, fakeAudio(false));
    await Promise.resolve();
    expect(screen.queryByRole("button", { name: /ฟัง/ })).toBeNull();
  });

  it("plays the prompt when audio is available", async () => {
    const audio = fakeAudio(true);
    renderWithAudio(<SpeakAnswer {...baseProps()} exercise={ex} />, audio);
    const play = await screen.findByRole("button", { name: /ฟัง/ });
    fireEvent.click(play);
    await waitFor(() => expect(audio.played).toEqual([ex.prompt]));
  });
});
