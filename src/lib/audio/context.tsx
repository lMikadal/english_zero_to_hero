"use client";
// Client-safe. Exercise components read audio from here so tests can wrap them with a fake provider.
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { createSilentAudioSource, type Accent, type AudioSource } from "./source";

export type AudioValue = { source: AudioSource; accent: Accent };

export const AudioContext = createContext<AudioValue>({ source: createSilentAudioSource(), accent: "us" });

export function AudioProvider({ source, accent = "us", children }: { source: AudioSource; accent?: Accent; children: ReactNode }) {
  const value = useMemo(() => ({ source, accent }), [source, accent]);
  return <AudioContext.Provider value={value}>{children}</AudioContext.Provider>;
}

export function useAudio(): AudioValue {
  return useContext(AudioContext);
}
