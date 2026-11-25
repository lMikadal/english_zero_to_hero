import { describe, expect, it, vi } from "vitest";
import { AudioUnavailableError } from "./source";
import { AudioPlaybackError, createSpeechAudioSource } from "./speech-source";

type FakeUtterance = {
  text: string; lang: string; rate: number; voice: unknown;
  onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null;
};
type Voice = { lang: string; name: string; localService?: boolean };

function setup(voices: Voice[]) {
  const spoken: FakeUtterance[] = [];
  const listeners: Array<() => void> = [];
  const synth = {
    getVoices: vi.fn(() => voices),
    speak: vi.fn((u: FakeUtterance) => { spoken.push(u); }),
    cancel: vi.fn(),
    resume: vi.fn(),
    addEventListener: vi.fn((_: string, cb: () => void) => { listeners.push(cb); }),
    removeEventListener: vi.fn(),
  };
  class Utterance {
    text: string; lang = ""; rate = 1; voice: unknown = null;
    onend: (() => void) | null = null; onerror: ((e: { error: string }) => void) | null = null;
    constructor(text: string) { this.text = text; }
  }
  const source = createSpeechAudioSource({
    synth: synth as unknown as SpeechSynthesis,
    Utterance: Utterance as unknown as typeof SpeechSynthesisUtterance,
    voicesTimeoutMs: 20,
  });
  return { source, synth, spoken, listeners };
}

const US = { lang: "en-US", name: "US" };
const GB = { lang: "en-GB", name: "GB" };
const TH = { lang: "th-TH", name: "TH" };

describe("createSpeechAudioSource", () => {
  it("is a speech source", () => {
    expect(setup([US]).source.kind).toBe("speech");
  });

  it("canPlay is true with an English voice and false without one", async () => {
    expect(await setup([TH, US]).source.canPlay("hi")).toBe(true);
    expect(await setup([TH]).source.canPlay("hi")).toBe(false);
  });

  it("waits briefly for voices that load late", async () => {
    const voices: Voice[] = [];
    const { source, listeners } = setup(voices);
    const p = source.canPlay("hi");
    voices.push(GB);
    listeners.forEach((cb) => cb());
    expect(await p).toBe(true);
  });

  it("picks the voice for the accent", async () => {
    const { source, spoken } = setup([GB, US]);
    const p = source.play("hello", { accent: "uk" });
    await vi.waitFor(() => expect(spoken).toHaveLength(1));
    expect(spoken[0].lang).toBe("en-GB");
    expect(spoken[0].voice).toEqual(GB);
    spoken[0].onend?.();
    await p;
    const q = source.play("hello", { accent: "us" });
    await vi.waitFor(() => expect(spoken).toHaveLength(2));
    expect(spoken[1].voice).toEqual(US);
    spoken[1].onend?.();
    await q;
  });

  it("falls back to any English voice when the accent has none", async () => {
    const { source, spoken } = setup([GB]);
    const p = source.play("hello", { accent: "us" });
    await vi.waitFor(() => expect(spoken).toHaveLength(1));
    expect(spoken[0].voice).toEqual(GB);
    spoken[0].onend?.();
    await p;
  });

  it("uses rate 1 by default and 0.75 when asked", async () => {
    const { source, spoken } = setup([US]);
    const a = source.play("hello");
    await vi.waitFor(() => expect(spoken).toHaveLength(1));
    expect(spoken[0].rate).toBe(1);
    expect(spoken[0].text).toBe("hello");
    spoken[0].onend?.();
    await a;
    const b = source.play("hello", { rate: 0.75 });
    await vi.waitFor(() => expect(spoken).toHaveLength(2));
    expect(spoken[1].rate).toBe(0.75);
    spoken[1].onend?.();
    await b;
  });

  it("rejects with AudioUnavailableError when there is no English voice", async () => {
    const { source, synth } = setup([TH]);
    await expect(source.play("hello")).rejects.toBeInstanceOf(AudioUnavailableError);
    expect(synth.speak).not.toHaveBeenCalled();
  });

  it("a one-off engine error is an AudioPlaybackError, not 'unavailable'", async () => {
    const { source, spoken } = setup([US]);
    for (const code of ["not-allowed", "network", "audio-busy", "synthesis-failed"]) {
      const before = spoken.length;
      const p = source.play("hello");
      await vi.waitFor(() => expect(spoken).toHaveLength(before + 1));
      spoken[before].onerror?.({ error: code });
      const err = await p.catch((e: unknown) => e);
      expect(err).toBeInstanceOf(AudioPlaybackError);
      expect(err).not.toBeInstanceOf(AudioUnavailableError);
    }
  });

  it("language-unavailable and voice-unavailable mean unavailable", async () => {
    const { source, spoken } = setup([US]);
    const p = source.play("hello");
    await vi.waitFor(() => expect(spoken).toHaveLength(1));
    spoken[0].onerror?.({ error: "language-unavailable" });
    await expect(p).rejects.toBeInstanceOf(AudioUnavailableError);
  });

  it("speaks synchronously when voices are already known (inside the user gesture)", () => {
    const { source, synth } = setup([US]);
    void source.play("hello");
    expect(synth.speak).toHaveBeenCalledTimes(1);
  });

  it("when voices are not loaded yet it speaks with lang only instead of waiting", () => {
    const { source, synth, spoken } = setup([]);
    void source.play("hello", { accent: "uk" });
    expect(synth.speak).toHaveBeenCalledTimes(1);
    expect(spoken[0].lang).toBe("en-GB");
    expect(spoken[0].voice).toBeNull();
  });

  it("calls resume() before speak()", () => {
    const { source, synth } = setup([US]);
    void source.play("hello");
    expect(synth.resume.mock.invocationCallOrder[0]).toBeLessThan(synth.speak.mock.invocationCallOrder[0]);
  });

  it("prefers a local voice and normalises en_US", () => {
    const remote = { lang: "en-US", name: "remote", localService: false };
    const local = { lang: "en_US", name: "local", localService: true };
    const { source, spoken } = setup([remote, local]);
    void source.play("hello");
    expect(spoken[0].voice).toEqual(local);
  });

  it("always settles: a play that never ends resolves after the safety timeout", async () => {
    vi.useFakeTimers();
    try {
      const { source } = setup([US]);
      const p = source.play("hello");
      await vi.advanceTimersByTimeAsync(60_000);
      await expect(p).resolves.toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("stop() cancels the speech and the pending play resolves", async () => {
    const { source, spoken, synth } = setup([US]);
    const p = source.play("hello");
    await vi.waitFor(() => expect(spoken).toHaveLength(1));
    source.stop();
    expect(synth.cancel).toHaveBeenCalled();
    spoken[0].onerror?.({ error: "canceled" });
    await expect(p).resolves.toBeUndefined();
  });

  it("aborting the signal cancels and resolves; an already aborted signal never speaks", async () => {
    const { source, spoken, synth } = setup([US]);
    const ac = new AbortController();
    const p = source.play("hello", { signal: ac.signal });
    await vi.waitFor(() => expect(spoken).toHaveLength(1));
    ac.abort();
    expect(synth.cancel).toHaveBeenCalled();
    await expect(p).resolves.toBeUndefined();

    const done = new AbortController();
    done.abort();
    await expect(source.play("again", { signal: done.signal })).resolves.toBeUndefined();
    expect(spoken).toHaveLength(1);
  });

  it("is unavailable when the browser has no speechSynthesis", async () => {
    const source = createSpeechAudioSource({ synth: null });
    expect(await source.canPlay("hi")).toBe(false);
    await expect(source.play("hi")).rejects.toBeInstanceOf(AudioUnavailableError);
    expect(() => source.stop()).not.toThrow();
  });
});
