"use client";
import { useMemo, useState } from "react";
import { comparableAnswer } from "@/lib/answers/normalize";
import { shown, type ExerciseProps } from "./types";
import { CheckButton } from "./ui/CheckButton";
import { Instruction } from "./ui/Instruction";
import { shuffleSeeded } from "./ui/shuffle";
import { Mark } from "./ui/Mark";
import { ExerciseShell } from "./ui/ExerciseShell";
import { Tile } from "./ui/Tile";
import { capitaliseFirst, tileLabel } from "./ui/tile-label";
import { rightWrong, toneClass } from "./ui/tone";

export function ArrangeWords({ exercise, onAnswer, result, reveal = true }: ExerciseProps<"arrange_words">) {
  const seen = shown(result, reveal);
  const [placed, setPlaced] = useState<number[]>([]); // indexes into exercise.words, in tap order
  const [submitted, setSubmitted] = useState(false);
  const locked = submitted || result !== undefined;

  // The pool order is a deterministic shuffle that is never a correct sentence (when another order exists).
  const poolOrder = useMemo(() => {
    const correct = new Set([exercise.answer, ...(exercise.accept ?? [])].map((a) => comparableAnswer(a)));
    const indexes = exercise.words.map((_, i) => i);
    return shuffleSeeded(indexes, exercise.id, (order) => correct.has(comparableAnswer(order.map((i) => exercise.words[i]).join(" "))));
  }, [exercise]);

  const sentences = [exercise.answer, ...(exercise.accept ?? [])];
  const label = (i: number) => tileLabel(exercise.words[i], sentences);
  const remaining = poolOrder.filter((i) => !placed.includes(i));
  const complete = placed.length === exercise.words.length;
  const answerTone = seen ? rightWrong(seen.correct) : "idle";

  function check() {
    if (locked || !complete) return;
    setSubmitted(true);
    onAnswer({ kind: "text", text: placed.map((i) => exercise.words[i]).join(" ") });
  }

  return (
    <ExerciseShell>
      <Instruction th={exercise.instruction.th} en={exercise.instruction.en} />
      <ul
        aria-label="คำตอบของคุณ"
        data-state={answerTone}
        lang="en"
        className={`flex min-h-16 flex-wrap gap-2 rounded-[14px] border border-dashed p-3 ${toneClass(answerTone)}`}
      >
        {placed.map((i, n) => (
          <li key={i}>
            <Tile tone={seen ? answerTone : "selected"} disabled={locked} onClick={() => setPlaced(placed.filter((p) => p !== i))}>
              {n === 0 ? capitaliseFirst(label(i)) : label(i)}
            </Tile>
          </li>
        ))}
        {seen ? (
          <li className={`self-center text-sm font-semibold ${answerTone === "right" ? "text-good-fg" : "text-bad-fg"}`}>
            <Mark ok={seen.correct} />
          </li>
        ) : null}
      </ul>
      {placed.length === 0 ? <p className="-mt-2 text-xs text-muted">แตะคำด้านล่างเพื่อเรียงประโยค</p> : null}
      <ul aria-label="คำที่เหลือ" lang="en" className="flex min-h-12 flex-wrap gap-2">
        {remaining.map((i) => (
          <li key={i}>
            <Tile tone="idle" disabled={locked} onClick={() => setPlaced([...placed, i])}>
              {label(i)}
            </Tile>
          </li>
        ))}
      </ul>
      <CheckButton hidden={result !== undefined} disabled={locked || !complete} onClick={check} />
    </ExerciseShell>
  );
}
