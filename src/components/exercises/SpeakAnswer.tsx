"use client";
import { useState } from "react";
import { useExerciseAudio } from "@/components/audio/AudioControls";
import type { ExerciseProps } from "./types";
import { AudioCard } from "./ui/AudioCard";
import { Card } from "./ui/Card";
import { ExerciseShell } from "./ui/ExerciseShell";
import { Instruction } from "./ui/Instruction";
import { SelfRating } from "./ui/SelfRating";

// Self-rated speaking: the two rating buttons are the answer. The sample answer appears only after rating.
// The question can be heard through the same play buttons as the sound exercises (hidden without sound).
export function SpeakAnswer({ exercise, onAnswer, result }: ExerciseProps<"speak_answer">) {
  const audio = useExerciseAudio(exercise.prompt);
  const [rating, setRating] = useState<"ok" | "unsure" | null>(null);
  const revealed = rating !== null || result !== undefined;

  function rate(r: "ok" | "unsure") {
    if (revealed) return;
    setRating(r);
    onAnswer({ kind: "self", rating: r });
  }

  return (
    <ExerciseShell>
      <Instruction th={exercise.instruction.th} en={exercise.instruction.en} />
      <AudioCard audio={audio} text={exercise.prompt}>
        <p lang="en" className="whitespace-pre-line break-words text-xl font-bold leading-snug">{exercise.prompt}</p>
      </AudioCard>
      <p className="text-[13px] text-muted">ลองพูดตอบออกเสียงแล้วประเมินตัวเอง</p>
      {revealed ? (
        <Card pad="p-3.5">
          <p className="text-[13px] text-muted">ตัวอย่างคำตอบ</p>
          <p lang="en" className="break-words text-lg text-fg">{exercise.sampleAnswer}</p>
        </Card>
      ) : null}
      <SelfRating chosen={rating} locked={revealed} onRate={rate} />
    </ExerciseShell>
  );
}
