// Test support only (uses node:fs): real week-1 exercises and vocab as fixtures for the text exercise components.
import fs from "node:fs";
import path from "node:path";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { vi } from "vitest";
import { AudioProvider } from "@/lib/audio/context";
import { createSilentAudioSource, type AudioSource } from "@/lib/audio/source";
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

export function fakeAudio(canPlay: boolean): AudioSource & { played: string[] } {
  const played: string[] = [];
  return { ...createSilentAudioSource(), kind: "speech", canPlay: async () => canPlay, play: async (t) => void played.push(t), played };
}

/** Props every component gets; spread then override `exercise` / `result`. */
export function baseProps() {
  return { vocab: vocabLookup(), onAnswer: vi.fn(), onContinue: vi.fn() };
}

export function renderWithAudio(ui: ReactElement, source: AudioSource = createSilentAudioSource()) {
  const wrap = (el: ReactElement) => <AudioProvider source={source}>{el}</AudioProvider>;
  const out = render(wrap(ui));
  // rerender through the same provider so component state survives (a bare rerender would remount)
  return { ...out, rerender: (el: ReactElement) => out.rerender(wrap(el)) };
}
