"use client";
import { useState } from "react";
import { AudioFallback, PlayButtons, useExerciseAudio } from "@/components/audio/AudioControls";
import { GRADED_NO_AUDIO_NOTE } from "@/components/audio/AudioControls";
import type { ExerciseProps } from "./types";
import { CheckButton } from "./ui/CheckButton";
import { ChoiceButton } from "./ui/ChoiceButton";
import { Instruction } from "./ui/Instruction";
import { MixedText } from "./ui/MixedText";
import { radioKeys } from "./ui/radio";
import type { Tone } from "./ui/tone";

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
  const toneOf = (i: number): Tone =>
    result === undefined ? (i === selected ? "selected" : "idle") : i === exercise.answer ? "right" : i === selected ? "wrong" : "idle";
  const markOf = (i: number) => (result === undefined ? undefined : i === exercise.answer ? true : i === selected ? false : undefined);

  return (
    <section className="flex flex-col gap-4">
      <Instruction th={exercise.instruction.th} en={exercise.instruction.en} />
      <PlayButtons audio={audio} text={exercise.audioText} />
      <AudioFallback audio={audio} onSkip={onContinue} note={GRADED_NO_AUDIO_NOTE} />
      <div>
        <p lang="en" className="text-base font-medium">{exercise.question.en}</p>
        <p className="text-sm text-muted"><MixedText text={exercise.question.th} /></p>
      </div>
      <div role="radiogroup" aria-label={exercise.question.en} onKeyDown={(e) => { if (!locked) radioKeys(e, exercise.choices.length, selected, setSelected); }} className="flex flex-col gap-2">
        {exercise.choices.map((choice, i) => (
          <ChoiceButton key={i} index={i} selectedIndex={selected} selected={selected === i} tone={toneOf(i)} mark={markOf(i)} disabled={locked} onClick={() => setSelected(i)}>
            {choice}
          </ChoiceButton>
        ))}
      </div>
      <CheckButton hidden={result !== undefined} disabled={selected === null || sent} onClick={check} />
    </section>
  );
}
