import type { ReactNode } from "react";
import { PlayButtons, type ExerciseAudio } from "@/components/audio/AudioControls";
import { Card } from "./Card";

/**
 * A centred card with the play buttons at the bottom (hero sentence, prompt, phoneme). With no children it is only the
 * play buttons, and it disappears when sound is unavailable (the fallback note takes its place).
 */
export function AudioCard({ audio, text, children }: { audio: ExerciseAudio; text: string; children?: ReactNode }) {
  if (!children && audio.unavailable) return null;
  return (
    <Card pad="px-4 py-5" className="flex flex-col items-center gap-3 text-center">
      {children}
      <PlayButtons audio={audio} text={text} />
    </Card>
  );
}
