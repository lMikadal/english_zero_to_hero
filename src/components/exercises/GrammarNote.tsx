"use client";
import { AudioFallback, PlayButtons, useExerciseAudio } from "@/components/audio/AudioControls";
import { buttonClass } from "@/components/ui/button-styles";
import type { ExerciseProps } from "./types";
import { Card, CardList } from "./ui/Card";
import { ExerciseShell } from "./ui/ExerciseShell";
import { Instruction } from "./ui/Instruction";
import { MixedText } from "./ui/MixedText";

/**
 * Grammar explanation card: read, listen, then ถัดไป. Like PhonemeIntro it never calls `onAnswer` (no attempt, nothing queued).
 * Top to bottom: instruction (h3), a card with the "ไวยากรณ์" label, the title (h4), the body paragraphs and the optional table,
 * then the examples with their play buttons. The table scrolls inside its own wrapper only as a last resort; cells wrap first.
 */
export function GrammarNote({ exercise, onContinue }: ExerciseProps<"grammar_note">) {
  const audio = useExerciseAudio(exercise.examples[0].en);
  const paragraphs = exercise.bodyTh.split("\n").map((p) => p.trim()).filter(Boolean);
  const [head, ...rows] = exercise.table ?? [];
  return (
    <ExerciseShell>
      <Instruction th={exercise.instruction.th} en={exercise.instruction.en} />
      <Card pad="p-4" className="flex flex-col gap-3">
        <p className="self-start rounded-full border border-accent/40 px-2.5 py-0.5 text-xs font-medium text-accent">ไวยากรณ์</p>
        <h4 className="text-balance break-words text-lg font-bold leading-snug text-fg">{exercise.titleTh}</h4>
        <div className="flex flex-col gap-2 text-[15px] leading-relaxed text-fg">
          {paragraphs.map((p, i) => <p key={i} className="break-words"><MixedText text={p} /></p>)}
        </div>
      </Card>
      {head ? (
        <div
          role="region" tabIndex={0} aria-label={`ตาราง ${exercise.titleTh}`}
          className="overflow-x-auto rounded-[14px] border border-line bg-card"
        >
          <table className="w-full border-collapse text-left text-[15px]">
            <caption className="sr-only">{exercise.titleTh}</caption>
            <thead>
              <tr className="bg-surface">
                {head.map((cell, c) => <th key={c} scope="col" className="break-words px-3 py-2.5 align-top text-[13px] font-semibold text-muted"><MixedText text={cell} /></th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((row, r) => (
                <tr key={r} className="border-t border-line">
                  {row.map((cell, c) => <td key={c} className="break-words px-3 py-2.5 align-top leading-snug"><MixedText text={cell} /></td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <AudioFallback audio={audio} />
      <CardList>
        {exercise.examples.map((e, i) => (
          <li key={i} className="flex flex-col items-start gap-2.5 px-4 py-3">
            <span className="min-w-0">
              <span lang="en" className="block break-words text-[17px] font-medium leading-snug text-fg">{e.en}</span>
              <span className="mt-0.5 block break-words text-[13px] text-muted">{e.th}</span>
            </span>
            <PlayButtons audio={audio} text={e.en} named />
          </li>
        ))}
      </CardList>
      <button type="button" className={buttonClass("primary", "mt-auto")} onClick={onContinue}>ถัดไป</button>
    </ExerciseShell>
  );
}
