"use client";
import { useState } from "react";
import { AudioFallback, PlayButtons, useExerciseAudio } from "@/components/audio/AudioControls";
import type { ExerciseProps } from "./types";
import { CHOICE, CheckButton, Instruction } from "./sound-ui";

export function ListenChoose({ exercise, onAnswer, onContinue, result }: ExerciseProps<"listen_choose">) {
  const audio = useExerciseAudio(exercise.audioText);
  const [selected, setSelected] = useState<number | null>(null);
  const [sent, setSent] = useState(false);
  const locked = result !== undefined || sent;

  const check = () => {
    if (selected === null || locked) return;
    setSent(true);
    onAnswer({ kind: "choice", selected });
  };
  const stateOf = (i: number) =>
    result === undefined ? undefined : i === exercise.answer ? "correct" : i === selected ? "wrong" : undefined;

  return (
    <section className="flex flex-col gap-4">
      <Instruction th={exercise.instruction.th} en={exercise.instruction.en} />
      <PlayButtons audio={audio} text={exercise.audioText} />
      <AudioFallback audio={audio} onSkip={onContinue}>
        <p>{exercise.audioText}</p>
      </AudioFallback>
      <div>
        <p className="text-base font-medium">{exercise.question.en}</p>
        <p className="text-sm text-zinc-600">{exercise.question.th}</p>
      </div>
      <div role="radiogroup" aria-label={exercise.question.en} className="flex flex-col gap-2">
        {exercise.choices.map((choice, i) => (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={selected === i}
            data-state={stateOf(i)}
            disabled={locked}
            onClick={() => setSelected(i)}
            className={CHOICE}
          >
            {choice}
          </button>
        ))}
      </div>
      <CheckButton hidden={result !== undefined} disabled={selected === null || sent} onClick={check} />
    </section>
  );
}
