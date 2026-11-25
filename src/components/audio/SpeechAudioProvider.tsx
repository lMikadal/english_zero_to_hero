"use client";
// Client wrapper so a server layout can provide the speechSynthesis-backed audio source.
import { useState, type ReactNode } from "react";
import { AudioProvider } from "@/lib/audio/context";
import type { Accent } from "@/lib/audio/source";
import { createSpeechAudioSource } from "@/lib/audio/speech-source";

export function SpeechAudioProvider({ accent = "us", children }: { accent?: Accent; children: ReactNode }) {
  const [source] = useState(() => createSpeechAudioSource());
  return <AudioProvider source={source} accent={accent}>{children}</AudioProvider>;
}
