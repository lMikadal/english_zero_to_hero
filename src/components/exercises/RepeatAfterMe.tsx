"use client";
import { useState } from "react";
import { AudioFallback, PlayButtons, useExerciseAudio } from "@/components/audio/AudioControls";
import type { ExerciseProps } from "./types";
import { Instruction, SelfRating } from "./sound-ui";

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
    <section className="flex flex-col gap-4">
      <Instruction th={exercise.instruction.th} en={exercise.instruction.en} />
      <div className="rounded-lg bg-zinc-50 p-4">
        <p lang="en" className="text-xl font-semibold">{exercise.text}</p>
        {exercise.ipa && <p className="mt-1 text-base text-zinc-600">{exercise.ipa}</p>}
      </div>
      <PlayButtons audio={audio} text={exercise.text} />
      <AudioFallback audio={audio} onSkip={onContinue} />
      <SelfRating chosen={chosen} locked={locked} onRate={rate} />
    </section>
  );
}
