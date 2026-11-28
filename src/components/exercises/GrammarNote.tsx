"use client";
import { AudioFallback, PlayButtons, useExerciseAudio } from "@/components/audio/AudioControls";
import { buttonClass } from "@/components/ui/button-styles";
import type { ExerciseProps } from "./types";
import { Card, CardList } from "./ui/Card";
import { ExerciseShell } from "./ui/ExerciseShell";
import { Instruction } from "./ui/Instruction";
import { MixedText } from "./ui/MixedText";

/**
 * PLACEHOLDER card (content schema PR): shows the title, body, table and examples as plain text so the player never hits
 * "not supported" on a grammar_note. Teaching card like PhonemeIntro: it never calls `onAnswer`, only `onContinue`.
 * The real design is a separate frontend task.
 */
export function GrammarNote({ exercise, onContinue }: ExerciseProps<"grammar_note">) {
  const audio = useExerciseAudio(exercise.examples[0].en);
  return (
    <ExerciseShell>
      <Instruction th={exercise.instruction.th} en={exercise.instruction.en} />
      <Card>
        <h2 className="text-lg font-bold">{exercise.titleTh}</h2>
        <p className="mt-2 text-[15px] leading-relaxed"><MixedText text={exercise.bodyTh} /></p>
      </Card>
      {exercise.table ? (
        <Card pad="p-0" className="overflow-x-auto">
          <table className="w-full text-left text-[15px]">
            <tbody className="divide-y divide-line">
              {exercise.table.map((row, r) => (
                <tr key={r} className={r === 0 ? "bg-hint-soft font-semibold" : ""}>
                  {row.map((cell, c) => <td key={c} className="px-3 py-2 align-top"><MixedText text={cell} /></td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}
      <AudioFallback audio={audio} />
      <CardList>
        {exercise.examples.map((e, i) => (
          <li key={i} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
            <span><span lang="en" className="block text-[17px] font-medium">{e.en}</span><span className="block text-[13px] text-muted">{e.th}</span></span>
            <PlayButtons audio={audio} text={e.en} />
          </li>
        ))}
      </CardList>
      <button type="button" className={buttonClass("primary", "mt-auto")} onClick={onContinue}>ถัดไป</button>
    </ExerciseShell>
  );
}
