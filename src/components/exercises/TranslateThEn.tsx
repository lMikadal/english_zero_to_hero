"use client";
import { useState } from "react";
import { shown, type ExerciseProps } from "./types";
import { CheckButton } from "./ui/CheckButton";
import { ExerciseShell } from "./ui/ExerciseShell";
import { Mark } from "./ui/Mark";
import { Instruction, Prompt } from "./ui/Instruction";
import { rightWrong, fieldToneClass, FIELD, type Tone } from "./ui/tone";

export function TranslateThEn({ exercise, onAnswer, result, reveal = true }: ExerciseProps<"translate_th_en">) {
  const seen = shown(result, reveal);
  const [text, setText] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const locked = submitted || result !== undefined;
  const tone: Tone = seen ? rightWrong(seen.correct) : "idle";

  function check() {
    if (locked || text.trim() === "") return;
    setSubmitted(true);
    onAnswer({ kind: "text", text });
  }

  return (
    <ExerciseShell onSubmit={check}>
      <Instruction th={exercise.instruction.th} en={exercise.instruction.en} />
      <Prompt lang="th">{exercise.th}</Prompt>
      <input
        type="text"
        aria-label="คำแปลภาษาอังกฤษ"
        lang="en"
        autoCapitalize="none"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        value={text}
        readOnly={locked}
        aria-readonly={locked || undefined}
        aria-invalid={tone === "wrong" || undefined}
        enterKeyHint="done"
        data-state={tone}
        onChange={(e) => setText(e.target.value)}
        className={`${FIELD} ${fieldToneClass(tone)}`}
      />
      {seen ? <p className="-mt-2 text-[13px] font-medium"><Mark ok={seen.correct} /></p> : null}
      <CheckButton type="submit" hidden={result !== undefined} disabled={locked || text.trim() === ""} />
    </ExerciseShell>
  );
}
