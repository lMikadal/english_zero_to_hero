import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAudio } from "@/lib/audio/context";
import LearnLayout from "./layout";

const access = vi.hoisted(() => ({ accent: "us" as "us" | "uk" | Error }));
vi.mock("./access", () => ({
  getAccent: async () => {
    if (access.accent instanceof Error) throw access.accent;
    return access.accent;
  },
}));

function Probe() {
  const { source, accent } = useAudio();
  return <p>{`${source.kind}:${accent}`}</p>;
}

const show = async () => render(await LearnLayout({ children: <Probe /> }));

describe("learn layout", () => {
  beforeEach(() => { access.accent = "us"; });

  it("wraps its children in an AudioProvider with the speech source", async () => {
    await show();
    expect(screen.getByText("speech:us")).toBeInTheDocument();
  });

  it("passes the learner's accent from the profile", async () => {
    access.accent = "uk";
    await show();
    expect(screen.getByText("speech:uk")).toBeInTheDocument();
  });

  it("falls back to us (and does not crash) when the profile cannot be read", async () => {
    access.accent = new Error("db down");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await show();
    expect(screen.getByText("speech:us")).toBeInTheDocument();
    error.mockRestore();
  });
});
