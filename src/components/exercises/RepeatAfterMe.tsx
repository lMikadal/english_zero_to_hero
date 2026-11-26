"use client";
import { useState } from "react";
import { AudioFallback, useExerciseAudio } from "@/components/audio/AudioControls";
import type { ExerciseProps } from "./types";
import { AudioCard } from "./ui/AudioCard";
import { ExerciseShell } from "./ui/ExerciseShell";
import { Instruction } from "./ui/Instruction";
import { SelfRating } from "./ui/SelfRating";

export function RepeatAfterMe({ exercise, onAnswer, onContinue, result }: ExerciseProps<"repeat_after_me">) {
  const audio = useExerciseAudio(exercise.text);
  const [chosen, setChosen] = useState<"ok" | "unsure" | null>(null);
  const locked = result !== undefined || chosen !== null;

  const rate = (rating: "ok" | "unsure") => {
    if (locked) return;
    setChosen(rating);
    onAnswer({ kind: "self", rating });
  };

  return (
    <ExerciseShell>
      <Instruction th={exercise.instruction.th} en={exercise.instruction.en} />
      <AudioCard audio={audio} text={exercise.text}>
        <p lang="en" className="break-words text-[22px] font-bold leading-snug">{exercise.text}</p>
        {exercise.ipa && <p lang="en-fonipa" className="break-words text-sm text-muted">{exercise.ipa}</p>}
      </AudioCard>
      <AudioFallback audio={audio} onSkip={onContinue} />
      <SelfRating chosen={chosen} locked={locked} onRate={rate} />
    </ExerciseShell>
  );
}
