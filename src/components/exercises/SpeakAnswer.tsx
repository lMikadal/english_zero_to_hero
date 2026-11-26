"use client";
import { useState } from "react";
import { PlayButtons, useExerciseAudio } from "@/components/audio/AudioControls";
import type { ExerciseProps } from "./types";
import { Instruction, Prompt } from "./ui/Instruction";
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
    <section className="flex flex-col gap-3">
      <Instruction th={exercise.instruction.th} en={exercise.instruction.en} />
      <Prompt lang="en">{exercise.prompt}</Prompt>
      <PlayButtons audio={audio} text={exercise.prompt} />
      <p className="text-sm text-muted">ลองพูดตอบออกเสียงแล้วประเมินตัวเอง</p>
      <SelfRating chosen={rating} locked={revealed} onRate={rate} />
      {revealed ? (
        <div className="rounded-xl bg-surface p-3">
          <p className="text-sm text-muted">ตัวอย่างคำตอบ</p>
          <p lang="en" className="text-lg text-fg">{exercise.sampleAnswer}</p>
        </div>
      ) : null}
    </section>
  );
}
