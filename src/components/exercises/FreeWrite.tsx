"use client";
import { useState } from "react";
import { countWords } from "@/lib/answers/grade";
import type { ExerciseProps } from "./types";
import { CheckButton } from "./ui/CheckButton";
import { Instruction, Prompt } from "./ui/Instruction";

// No AI grading yet: never styled right/wrong. The player shows the "saved" status for non-retryable exercises.
export function FreeWrite({ exercise, onAnswer, result }: ExerciseProps<"free_write">) {
  const [text, setText] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const locked = submitted || result !== undefined;
  const words = countWords(text);
  const enough = words >= exercise.minWords;

  function check() {
    if (locked || !enough) return;
    setSubmitted(true);
    onAnswer({ kind: "text", text });
  }

  return (
    <section>
      <Instruction th={exercise.instruction.th} en={exercise.instruction.en} />
      <Prompt lang="en">{exercise.prompt}</Prompt>
      <textarea
        aria-label="เขียนคำตอบ"
        lang="en"
        rows={7}
        autoCapitalize="sentences"
        autoCorrect="off"
        spellCheck={false}
        value={text}
        readOnly={locked}
        aria-readonly={locked || undefined}
        onChange={(e) => setText(e.target.value)}
        className="w-full rounded-xl border-2 border-control bg-card p-3 text-lg text-fg read-only:bg-surface"
      />
      <p data-testid="word-count" className={`mt-1 text-sm ${enough ? "text-good-fg" : "text-muted"}`}>
        {words} / {exercise.minWords} คำ
      </p>
      <CheckButton hidden={result !== undefined} disabled={locked || !enough} onClick={check} />
    </section>
  );
}
