import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useAudio } from "@/lib/audio/context";
import LearnLayout from "./layout";

function Probe() {
  const { source, accent } = useAudio();
  return <p>{`${source.kind}:${accent}`}</p>;
}

describe("learn layout", () => {
  it("wraps its children in an AudioProvider with the speech source", () => {
    render(<LearnLayout><Probe /></LearnLayout>);
    expect(screen.getByText("speech:us")).toBeInTheDocument();
  });
});
