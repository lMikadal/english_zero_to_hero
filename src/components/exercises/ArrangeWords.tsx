"use client";
import { useMemo, useState } from "react";
import { normalizeAnswer } from "@/lib/answers/normalize";
import type { ExerciseProps } from "./types";
import { CheckButton } from "./ui/CheckButton";
import { Instruction } from "./ui/Instruction";
import { shuffleSeeded } from "./ui/shuffle";
import { rightWrong, toneClass } from "./ui/tone";

const TILE = "min-h-11 rounded-lg border px-3 py-2 text-base font-medium disabled:opacity-60";

export function ArrangeWords({ exercise, onAnswer, result }: ExerciseProps<"arrange_words">) {
  const [placed, setPlaced] = useState<number[]>([]); // indexes into exercise.words, in tap order
  const [submitted, setSubmitted] = useState(false);
  const locked = submitted || result !== undefined;

  // The pool order is a deterministic shuffle that is never a correct sentence (when another order exists).
  const poolOrder = useMemo(() => {
    const correct = new Set([exercise.answer, ...(exercise.accept ?? [])].map(normalizeAnswer));
    const indexes = exercise.words.map((_, i) => i);
    return shuffleSeeded(indexes, exercise.id, (order) => correct.has(normalizeAnswer(order.map((i) => exercise.words[i]).join(" "))));
  }, [exercise]);

  const remaining = poolOrder.filter((i) => !placed.includes(i));
  const complete = placed.length === exercise.words.length;
  const answerTone = result ? rightWrong(result.correct) : "idle";

  function check() {
    if (locked || !complete) return;
    setSubmitted(true);
    onAnswer({ kind: "text", text: placed.map((i) => exercise.words[i]).join(" ") });
  }

  return (
    <section>
      <Instruction th={exercise.instruction.th} en={exercise.instruction.en} />
      <ul
        aria-label="คำตอบของคุณ"
        data-state={answerTone}
        lang="en"
        className={`flex min-h-14 flex-wrap gap-2 rounded-xl border-2 border-dashed p-2 ${toneClass(answerTone)}`}
      >
        {placed.map((i) => (
          <li key={i}>
            <button type="button" disabled={locked} onClick={() => setPlaced(placed.filter((p) => p !== i))} className={`${TILE} ${toneClass(result ? answerTone : "selected")}`}>
              {exercise.words[i]}
            </button>
          </li>
        ))}
      </ul>
      {placed.length === 0 ? <p className="mt-1 text-sm text-slate-500">แตะคำด้านล่างเพื่อเรียงประโยค</p> : null}
      <ul aria-label="คำที่เหลือ" lang="en" className="mt-4 flex min-h-12 flex-wrap gap-2">
        {remaining.map((i) => (
          <li key={i}>
            <button type="button" disabled={locked} onClick={() => setPlaced([...placed, i])} className={`${TILE} ${toneClass("idle")}`}>
              {exercise.words[i]}
            </button>
          </li>
        ))}
      </ul>
      <CheckButton disabled={locked || !complete} onClick={check} />
    </section>
  );
}
