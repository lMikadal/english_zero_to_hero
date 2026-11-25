import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AudioUnavailableError } from "@/lib/audio/source";
import { AudioPlaybackError } from "@/lib/audio/speech-source";
import { AudioFallback, PlayButtons, useExerciseAudio } from "./AudioControls";
import { fakeAudio, renderWithAudio } from "@/components/exercises/test-helpers";

function Harness({ onSkip, note }: { onSkip?: () => void; note?: string }) {
  const audio = useExerciseAudio("Hello there");
  return (
    <div>
      <PlayButtons audio={audio} text="Hello there" />
      <AudioFallback audio={audio} onSkip={onSkip} note={note} />
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
    renderWithAudio(<Harness onSkip={() => {}} />, source);
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

  it("without audio: no play buttons, a Thai note and skip; there is never a reveal button", async () => {
    const onSkip = vi.fn();
    renderWithAudio(<Harness onSkip={onSkip} />, fakeAudio(false));
    expect(await screen.findByRole("button", { name: "ข้าม" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "ฟัง" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "แสดงข้อความ" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "ข้าม" }));
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it("shows a custom note, and no skip button when there is no onSkip", async () => {
    renderWithAudio(<Harness note="หมายเหตุ" />, fakeAudio(false));
    expect(await screen.findByText("หมายเหตุ")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "ข้าม" })).not.toBeInTheDocument();
  });
});

describe("PlayButtons errors and loading", () => {
  it("a one-off playback error keeps the buttons and shows a retry hint", async () => {
    const source = fakeAudio();
    source.play.mockRejectedValueOnce(new AudioPlaybackError());
    renderWithAudio(<Harness />, source);
    await userEvent.click(screen.getByRole("button", { name: "ฟัง" }));
    expect(await screen.findByText("เล่นเสียงไม่สำเร็จ ลองอีกครั้ง")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ฟัง" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "ข้าม" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "ฟัง" }));
    await waitFor(() => expect(screen.queryByText("เล่นเสียงไม่สำเร็จ ลองอีกครั้ง")).not.toBeInTheDocument());
  });

  it("keeps the controls in the layout, disabled, while it checks whether sound works", async () => {
    let resolve!: (v: boolean) => void;
    const source = fakeAudio();
    source.canPlay.mockReturnValue(new Promise<boolean>((r) => { resolve = r; }));
    renderWithAudio(<Harness />, source);
    expect(screen.getByRole("button", { name: "ฟัง" })).toBeDisabled();
    resolve(true);
    await waitFor(() => expect(screen.getByRole("button", { name: "ฟัง" })).toBeEnabled());
  });
});
