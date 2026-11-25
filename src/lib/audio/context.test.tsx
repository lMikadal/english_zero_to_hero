import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AudioContext, AudioProvider, useAudio } from "./context";
import { createSilentAudioSource, type AudioSource } from "./source";

function Probe() {
  const { source, accent } = useAudio();
  return <p>{`${source.kind}:${accent}`}</p>;
}

describe("useAudio", () => {
  it("defaults to the silent source and the us accent without a provider", () => {
    render(<Probe />);
    expect(screen.getByText("none:us")).toBeInTheDocument();
  });
  it("returns what the provider supplies, so tests can wrap with a fake", () => {
    const fake: AudioSource = { ...createSilentAudioSource(), kind: "speech" };
    render(<AudioProvider source={fake} accent="uk"><Probe /></AudioProvider>);
    expect(screen.getByText("speech:uk")).toBeInTheDocument();
  });
  it("the provider accent defaults to us", () => {
    render(<AudioProvider source={createSilentAudioSource()}><Probe /></AudioProvider>);
    expect(screen.getByText("none:us")).toBeInTheDocument();
  });
  it("exports the raw context", () => {
    expect(AudioContext).toBeDefined();
  });
});
