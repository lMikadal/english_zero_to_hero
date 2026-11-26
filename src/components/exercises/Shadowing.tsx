"use client";
import { useState } from "react";
import { AudioFallback, PlayButtons, useExerciseAudio } from "@/components/audio/AudioControls";
import type { ExerciseProps } from "./types";
import { Instruction } from "./ui/Instruction";
import { SelfRating } from "./ui/SelfRating";

export function Shadowing({ exercise, onAnswer, onContinue, result }: ExerciseProps<"shadowing">) {
  const audio = useExerciseAudio(exercise.lines[0]);
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
      <AudioFallback audio={audio} onSkip={onContinue} />
      <ol className="flex flex-col gap-3">
        {exercise.lines.map((line, i) => (
          <li key={i} className="flex flex-col gap-2 rounded-lg bg-surface p-3">
            <p lang="en" className="text-lg font-medium">{line}</p>
            <PlayButtons audio={audio} text={line} />
          </li>
        ))}
      </ol>
      <SelfRating chosen={chosen} locked={locked} onRate={rate} />
    </section>
  );
}
