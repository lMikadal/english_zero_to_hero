"use client";
import { AudioFallback, PlayButtons, useExerciseAudio } from "@/components/audio/AudioControls";
import { buttonClass } from "@/components/ui/button-styles";
import type { ExerciseProps } from "./types";
import { Card, CardList } from "./ui/Card";
import { ExerciseShell } from "./ui/ExerciseShell";
import { Instruction } from "./ui/Instruction";
import { MixedText } from "./ui/MixedText";

/** Teaching card, no question: it never calls `onAnswer`, only `onContinue`. */
export function PhonemeIntro({ exercise, onContinue }: ExerciseProps<"phoneme_intro">) {
  const audio = useExerciseAudio(exercise.examples[0]);
  return (
    <ExerciseShell>
      <Instruction th={exercise.instruction.th} en={exercise.instruction.en} />
      <Card pad="px-4 py-6" className="text-center">
        <p lang="en-fonipa" className="text-5xl font-bold">{exercise.ipa}</p>
      </Card>
      <p className="rounded-xl border border-hint/40 bg-hint-soft p-3.5 text-[13px] leading-relaxed text-hint-fg"><MixedText text={exercise.tipTh} /></p>
      <AudioFallback audio={audio} />
      <CardList>
        {exercise.examples.map((word) => (
          <li key={word} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
            <span lang="en" className="text-[17px] font-medium">{word}</span>
            <PlayButtons audio={audio} text={word} />
          </li>
        ))}
      </CardList>
      <button type="button" className={buttonClass("primary", "mt-auto")} onClick={onContinue}>ถัดไป</button>
    </ExerciseShell>
  );
}
