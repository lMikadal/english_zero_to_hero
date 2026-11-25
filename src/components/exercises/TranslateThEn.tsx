"use client";
import { useState } from "react";
import type { ExerciseProps } from "./types";
import { CheckButton } from "./ui/CheckButton";
import { Instruction, Prompt } from "./ui/Instruction";
import { rightWrong, toneClass, type Tone } from "./ui/tone";

export function TranslateThEn({ exercise, onAnswer, result }: ExerciseProps<"translate_th_en">) {
  const [text, setText] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const locked = submitted || result !== undefined;
  const tone: Tone = result ? rightWrong(result.correct) : "idle";

  function check() {
    if (locked || text.trim() === "") return;
    setSubmitted(true);
    onAnswer({ kind: "text", text });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        check();
      }}
    >
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
        disabled={locked}
        data-state={tone}
        onChange={(e) => setText(e.target.value)}
        className={`min-h-12 w-full rounded-xl border-2 px-3 text-lg ${toneClass(tone)}`}
      />
      <CheckButton type="submit" disabled={locked || text.trim() === ""} />
    </form>
  );
}
