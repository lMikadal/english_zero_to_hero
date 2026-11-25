import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AudioUnavailableError } from "@/lib/audio/source";
import { AudioFallback, PlayButtons, useExerciseAudio } from "./AudioControls";
import { fakeAudio, renderWithAudio } from "./audio-test-utils";

function Harness({ onSkip = () => {}, revealable = true }: { onSkip?: () => void; revealable?: boolean }) {
  const audio = useExerciseAudio("Hello there");
  return (
    <div>
      <PlayButtons audio={audio} text="Hello there" />
      <AudioFallback audio={audio} onSkip={onSkip} revealable={revealable}>
        <p>Hello there</p>
      </AudioFallback>
    </div>
  );
}

describe("PlayButtons", () => {
  it("plays at normal speed and at 0.75 with the accent from the provider", async () => {
    const source = fakeAudio();
    renderWithAudio(<Harness />, source, "uk");
    await userEvent.click(screen.getByRole("button", { name: "ฟัง" }));
    expect(source.play).toHaveBeenLastCalledWith("Hello there", expect.objectContaining({ rate: 1, accent: "uk" }));
    await userEvent.click(screen.getByRole("button", { name: /ฟังช้า/ }));
    expect(source.play).toHaveBeenLastCalledWith("Hello there", expect.objectContaining({ rate: 0.75, accent: "uk" }));
  });

  it("shows the fallback when playing fails with AudioUnavailableError", async () => {
    const source = fakeAudio();
    source.play.mockRejectedValueOnce(new AudioUnavailableError());
    renderWithAudio(<Harness />, source);
    await userEvent.click(screen.getByRole("button", { name: "ฟัง" }));
    expect(await screen.findByRole("button", { name: "ข้าม" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "ฟัง" })).not.toBeInTheDocument();
  });

  it("stops the audio when it unmounts", async () => {
    const source = fakeAudio();
    const { unmount } = renderWithAudio(<Harness />, source);
    await waitFor(() => expect(source.canPlay).toHaveBeenCalled());
    unmount();
    expect(source.stop).toHaveBeenCalled();
  });
});

describe("AudioFallback", () => {
  it("is hidden while audio works", async () => {
    renderWithAudio(<Harness />);
    await waitFor(() => expect(screen.getByRole("button", { name: "ฟัง" })).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "ข้าม" })).not.toBeInTheDocument();
  });

  it("without audio: no play buttons, reveal the text, or skip", async () => {
    const onSkip = vi.fn();
    renderWithAudio(<Harness onSkip={onSkip} />, fakeAudio(false));
    expect(await screen.findByRole("button", { name: "แสดงข้อความ" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "ฟัง" })).not.toBeInTheDocument();
    expect(screen.queryByText("Hello there")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "แสดงข้อความ" }));
    expect(screen.getByText("Hello there")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "แสดงข้อความ" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "ข้าม" }));
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it("omits the reveal button when the text is already on screen", async () => {
    renderWithAudio(<Harness revealable={false} />, fakeAudio(false));
    expect(await screen.findByRole("button", { name: "ข้าม" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "แสดงข้อความ" })).not.toBeInTheDocument();
  });
});
