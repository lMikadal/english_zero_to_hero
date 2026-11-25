// Test support only (uses node:fs): real week-1 exercises and vocab as fixtures, a fake audio source and a render
// helper, shared by every exercise, audio and player test.
import fs from "node:fs";
import path from "node:path";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { vi } from "vitest";
import { AudioProvider } from "@/lib/audio/context";
import { createSilentAudioSource, type Accent, type AudioSource } from "@/lib/audio/source";
import { get } from "@/lib/answers/test-content";
import { vocabFileSchema, type ExerciseOf, type ExerciseType } from "@/lib/content/schema";
import type { VocabLookup } from "./types";

export function exercise<T extends ExerciseType>(id: string, type: T): ExerciseOf<T> {
  const e = get(id);
  if (e.type !== type) throw new Error(`${id} is ${e.type}, not ${type}`);
  return e as ExerciseOf<T>;
}

export function vocabLookup(): VocabLookup {
  const file = path.resolve(import.meta.dirname, "../../../content/vocab/oxford-3000/a1.json");
  const items = vocabFileSchema.parse(JSON.parse(fs.readFileSync(file, "utf8")));
  return Object.fromEntries(items.map((v) => [v.id, { word: v.word, th: v.th, ipa: v.ipa }]));
}

/** A source whose `canPlay` answers `available`; `play`/`stop` are spies and `played` lists the texts played. */
export function fakeAudio(available = true) {
  const played: string[] = [];
  return {
    ...createSilentAudioSource(),
    kind: "speech" as const,
    canPlay: vi.fn(async () => available),
    play: vi.fn(async (text: string) => void played.push(text)),
    stop: vi.fn(),
    played,
  } satisfies AudioSource & { played: string[] };
}

/** Props every component gets; spread then override `exercise` / `result`. */
export function baseProps() {
  return { vocab: vocabLookup(), onAnswer: vi.fn(), onContinue: vi.fn() };
}

export function renderWithAudio(ui: ReactElement, source: AudioSource = fakeAudio(), accent: Accent = "us") {
  const wrap = (el: ReactElement) => <AudioProvider source={source} accent={accent}>{el}</AudioProvider>;
  const out = render(wrap(ui));
  // rerender through the same provider so component state survives (a bare rerender would remount)
  return { ...out, rerender: (el: ReactElement) => out.rerender(wrap(el)) };
}
