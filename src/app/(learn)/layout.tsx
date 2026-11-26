import type { ReactNode } from "react";
import { SpeechAudioProvider } from "@/components/audio/SpeechAudioProvider";
import type { Accent } from "@/lib/audio/source";
import { getAccent } from "./access";

export default async function LearnLayout({ children }: { children: ReactNode }) {
  let accent: Accent = "us";
  try {
    accent = await getAccent();
  } catch (e) {
    // The page itself shows the database-error screen; the layout must not take the whole route down.
    console.error("Cannot read the learner's accent, using us:", e);
  }
  return <SpeechAudioProvider accent={accent}>{children}</SpeechAudioProvider>;
}
