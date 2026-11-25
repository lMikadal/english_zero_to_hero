"use client";
import { useState } from "react";
import { AudioFallback, PlayButtons, useExerciseAudio } from "@/components/audio/AudioControls";
import type { ExerciseProps } from "./types";
import { CheckButton, Instruction } from "./sound-ui";

export function Dictation({ exercise, onAnswer, onContinue, result }: ExerciseProps<"dictation">) {
  const audio = useExerciseAudio(exercise.audioText);
  const [text, setText] = useState("");
  const [sent, setSent] = useState(false);
  const locked = result !== undefined || sent;
  const empty = text.trim() === "";

  const check = () => {
    if (empty || locked) return;
    setSent(true);
    onAnswer({ kind: "text", text: text.trim() });
  };

  return (
    <section className="flex flex-col gap-4">
      <Instruction th={exercise.instruction.th} en={exercise.instruction.en} />
      <PlayButtons audio={audio} text={exercise.audioText} />
      <AudioFallback audio={audio} onSkip={onContinue}>
        <p>{exercise.audioText}</p>
      </AudioFallback>
      <input
        type="text"
        value={text}
        disabled={locked}
        data-state={result === undefined ? undefined : result.correct ? "correct" : "wrong"}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") check(); }}
        aria-label="พิมพ์สิ่งที่ได้ยิน"
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        className="min-h-11 w-full rounded-lg border border-zinc-300 px-3 py-2 text-base data-[state=correct]:border-green-600 data-[state=correct]:bg-green-50 data-[state=wrong]:border-red-600 data-[state=wrong]:bg-red-50"
      />
      <CheckButton hidden={result !== undefined} disabled={empty || sent} onClick={check} />
    </section>
  );
}
