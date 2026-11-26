"use client";
import { useState } from "react";
import { AudioFallback, PlayButtons, useExerciseAudio } from "@/components/audio/AudioControls";
import type { ExerciseProps } from "./types";
import { CardList } from "./ui/Card";
import { ExerciseShell } from "./ui/ExerciseShell";
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
    <ExerciseShell>
      <Instruction th={exercise.instruction.th} en={exercise.instruction.en} />
      <AudioFallback audio={audio} onSkip={onContinue} />
      <CardList as="ol">
        {exercise.lines.map((line, i) => (
          <li key={i} className="flex flex-wrap items-center gap-x-2.5 gap-y-2 px-4 py-3">
            <span aria-hidden="true" className="text-xs font-medium text-muted">{i + 1}</span>
            <p lang="en" className="min-w-0 flex-1 basis-40 break-words text-base font-medium">{line}</p>
            <PlayButtons audio={audio} text={line} />
          </li>
        ))}
      </CardList>
      <SelfRating chosen={chosen} locked={locked} onRate={rate} />
    </ExerciseShell>
  );
}
