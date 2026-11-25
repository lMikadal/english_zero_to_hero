"use client";
import { AudioFallback, BUTTON, PlayButtons, useExerciseAudio } from "@/components/audio/AudioControls";
import type { ExerciseProps } from "./types";
import { Instruction } from "./ui/Instruction";

/** Teaching card, no question: it never calls `onAnswer`, only `onContinue`. */
export function PhonemeIntro({ exercise, onContinue }: ExerciseProps<"phoneme_intro">) {
  const audio = useExerciseAudio(exercise.examples[0]);
  return (
    <section className="flex flex-col gap-4">
      <Instruction th={exercise.instruction.th} en={exercise.instruction.en} />
      <p className="text-center text-5xl font-bold">{exercise.ipa}</p>
      <p className="rounded-lg bg-amber-50 p-3 text-base">{exercise.tipTh}</p>
      <AudioFallback audio={audio} />
      <ul className="flex flex-col gap-3">
        {exercise.examples.map((word) => (
          <li key={word} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-zinc-50 p-3">
            <span lang="en" className="text-xl font-semibold">{word}</span>
            <PlayButtons audio={audio} text={word} />
          </li>
        ))}
      </ul>
      <button type="button" className={`${BUTTON} w-full bg-sky-600 text-white`} onClick={onContinue}>ถัดไป</button>
    </section>
  );
}
