"use client";
import { useState } from "react";
import { countWords } from "@/lib/answers/grade";
import type { ExerciseProps } from "./types";
import { CheckButton } from "./ui/CheckButton";
import { Instruction, Prompt } from "./ui/Instruction";

// No AI grading yet: after answering the learner sees a neutral "saved" note, never right/wrong styling.
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
        disabled={locked}
        onChange={(e) => setText(e.target.value)}
        className="w-full rounded-xl border-2 border-slate-300 bg-white p-3 text-lg text-slate-900 disabled:bg-slate-100"
      />
      <p data-testid="word-count" className={`mt-1 text-sm ${enough ? "text-green-700" : "text-slate-600"}`}>
        {words} / {exercise.minWords} คำ
      </p>
      {locked ? (
        <p role="status" className="mt-3 rounded-xl bg-slate-100 p-3 text-slate-800">
          บันทึกแล้ว
        </p>
      ) : null}
      <CheckButton disabled={locked || !enough} onClick={check} />
    </section>
  );
}
