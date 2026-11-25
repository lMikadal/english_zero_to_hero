// Test support: a fake audio source and a render helper that wraps a component in AudioProvider.
import { render } from "@testing-library/react";
import { vi } from "vitest";
import type { ReactElement } from "react";
import { AudioProvider } from "@/lib/audio/context";
import type { Accent, AudioSource } from "@/lib/audio/source";

export function fakeAudio(available = true) {
  const source = {
    kind: "speech",
    canPlay: vi.fn(async () => available),
    play: vi.fn(async () => {}),
    stop: vi.fn(),
  } satisfies AudioSource;
  return source;
}

export function renderWithAudio(ui: ReactElement, source: AudioSource = fakeAudio(), accent: Accent = "us") {
  const wrap = (el: ReactElement) => <AudioProvider source={source} accent={accent}>{el}</AudioProvider>;
  const view = render(wrap(ui));
  // rerender keeps the provider, so the component under test is updated rather than remounted
  return { ...view, rerender: (next: ReactElement) => view.rerender(wrap(next)) };
}
