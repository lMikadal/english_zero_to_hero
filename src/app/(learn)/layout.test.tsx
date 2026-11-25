import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAudio } from "@/lib/audio/context";
import LearnLayout from "./layout";

const getAccent = vi.hoisted(() => vi.fn<() => Promise<"us" | "uk">>());
vi.mock("./access", () => ({ getAccent }));

function Probe() {
  const { source, accent } = useAudio();
  return <p>{`${source.kind}:${accent}`}</p>;
}

const show = async () => render(await LearnLayout({ children: <Probe /> }));

describe("learn layout", () => {
  beforeEach(() => getAccent.mockResolvedValue("us"));

  it("wraps its children in an AudioProvider with the speech source", async () => {
    await show();
    expect(screen.getByText("speech:us")).toBeInTheDocument();
  });

  it("passes the learner's accent from the profile", async () => {
    getAccent.mockResolvedValue("uk");
    await show();
    expect(screen.getByText("speech:uk")).toBeInTheDocument();
  });

  it("falls back to us (and does not crash) when the profile cannot be read", async () => {
    getAccent.mockRejectedValue(new Error("db down"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await show();
    expect(screen.getByText("speech:us")).toBeInTheDocument();
    error.mockRestore();
  });
});
