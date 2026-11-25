import { describe, expect, expectTypeOf, it } from "vitest";
import { AudioUnavailableError, createSilentAudioSource, type Accent, type AudioSource, type PlayOptions } from "./source";

describe("AudioUnavailableError", () => {
  it("is an Error that callers can tell apart from other failures", () => {
    const e = new AudioUnavailableError("no voice");
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(AudioUnavailableError);
    expect(e.name).toBe("AudioUnavailableError");
    expect(e.message).toBe("no voice");
    expect(new Error("x")).not.toBeInstanceOf(AudioUnavailableError);
  });
});

describe("AudioSource contract", () => {
  it("can be implemented by a fake", async () => {
    const calls: string[] = [];
    const fake: AudioSource = {
      kind: "none",
      canPlay: async () => false,
      play: async (text) => {
        calls.push(text);
        throw new AudioUnavailableError("none");
      },
      stop: () => {},
    };
    await expect(fake.play("hi", { rate: 0.75, accent: "uk" })).rejects.toBeInstanceOf(AudioUnavailableError);
    expect(calls).toEqual(["hi"]);
  });
  it("has the documented option types", () => {
    expectTypeOf<Accent>().toEqualTypeOf<"us" | "uk">();
    expectTypeOf<PlayOptions["rate"]>().toEqualTypeOf<0.75 | 1 | undefined>();
    expectTypeOf<AudioSource["kind"]>().toEqualTypeOf<"file" | "speech" | "none">();
  });
});

describe("createSilentAudioSource", () => {
  it("is a source of kind none that cannot play and rejects with AudioUnavailableError", async () => {
    const a = createSilentAudioSource();
    expect(a.kind).toBe("none");
    expect(await a.canPlay("hello")).toBe(false);
    await expect(a.play("hello")).rejects.toBeInstanceOf(AudioUnavailableError);
    expect(() => a.stop()).not.toThrow();
  });
});
