import { describe, expect, it } from "vitest";
import { classifyAudio, formatDiagnostics, type ScreenReport } from "./diagnostics";

describe("classifyAudio", () => {
  it("is skip as soon as the skip button is visible, whatever the play buttons do", () => {
    expect(classifyAudio(true, [])).toBe("skip");
    expect(classifyAudio(true, [true])).toBe("skip");
  });

  it("is audio when the first play button is enabled", () => {
    expect(classifyAudio(false, [false, false])).toBe("audio");
  });

  it("is pending while the play buttons are disabled", () => {
    expect(classifyAudio(false, [true, true])).toBe("pending");
  });

  // The CI failure (run 46104916046): the play buttons were counted, then removed when the audio check ended, and
  // the wait that followed hung on a button that no longer existed. With plain values there is nothing to hang on:
  // no buttons at all is just "pending" and the next poll sees the skip button.
  it("is pending (not an error) when there are no play buttons at all", () => {
    expect(classifyAudio(false, [])).toBe("pending");
  });
});

const base: ScreenReport = {
  doing: "waiting for the audio check",
  exerciseId: "d001-listen-02",
  exerciseType: "repeat_after_me",
  instruction: "ฟังแล้วพูดตาม",
  stepBefore: "เสียง /æ/ ข้อ 3 / 10",
  stepNow: "เสียง /æ/ ข้อ 3 / 10",
  url: "http://x/day/1",
  buttons: ["ฟัง (disabled)", "พูดได้"],
  mainText: "ฟังแล้วพูดตาม Hello, Sam!",
  loads: 0,
  events: [],
};

describe("formatDiagnostics", () => {
  it("names the exercise, the step, the screen and says there was no reload", () => {
    const text = formatDiagnostics(base);
    expect(text).toContain("d001-listen-02 (repeat_after_me)");
    expect(text).toContain("ข้อ 3 / 10");
    expect(text).toContain("ฟัง (disabled), พูดได้");
    expect(text).toContain("had NOT loaded again");
    expect(text).toContain("browser events (0): none");
  });

  it("says when the page loaded again, and keeps only the newest events and a clipped main text", () => {
    const events = Array.from({ length: 12 }, (_, i) => `console.error #${i}`);
    const text = formatDiagnostics({ ...base, loads: 2, events, mainText: "x".repeat(1000) });
    expect(text).toContain("LOADED AGAIN 2 time(s)");
    expect(text).toContain("console.error #11");
    expect(text).not.toContain("console.error #3 ");
    expect(text).toContain("...");
    expect(text.length).toBeLessThan(1500);
  });

  it("says so when nothing is on screen", () => {
    const text = formatDiagnostics({ ...base, buttons: [], mainText: "" });
    expect(text).toContain("buttons on screen: (none)");
    expect(text).toContain("text of <main>: (empty)");
  });
});
