import type { ReactNode } from "react";
import { SpeechAudioProvider } from "@/components/audio/SpeechAudioProvider";

// TODO: take the accent from the learner's profile once profiles are wired in (defaults to US English).
export default function LearnLayout({ children }: { children: ReactNode }) {
  return <SpeechAudioProvider>{children}</SpeechAudioProvider>;
}
