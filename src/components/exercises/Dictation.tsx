"use client";
import { useState } from "react";
import { AudioFallback, PlayButtons, useExerciseAudio } from "@/components/audio/AudioControls";
import { GRADED_NO_AUDIO_NOTE } from "@/components/audio/AudioControls";
import type { ExerciseProps } from "./types";
import { CheckButton } from "./ui/CheckButton";
import { Instruction } from "./ui/Instruction";
import { rightWrong, toneClass, type Tone } from "./ui/tone";

export function Dictation({ exercise, onAnswer, onContinue, result }: ExerciseProps<"dictation">) {
  const audio = useExerciseAudio(exercise.audioText);
  const [text, setText] = useState("");
  const [sent, setSent] = useState(false);
  const locked = result !== undefined || sent;
  const empty = text.trim() === "";
  const tone: Tone = result ? rightWrong(result.correct) : "idle";

  const check = () => {
    if (empty || locked) return;
    setSent(true);
    onAnswer({ kind: "text", text: text.trim() });
  };

  return (
    <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); check(); }}>
      <Instruction th={exercise.instruction.th} en={exercise.instruction.en} />
      <PlayButtons audio={audio} text={exercise.audioText} />
      <AudioFallback audio={audio} onSkip={onContinue} note={GRADED_NO_AUDIO_NOTE} />
      <input
        type="text"
        value={text}
        disabled={locked}
        data-state={tone}
        aria-invalid={tone === "wrong" || undefined}
        onChange={(e) => setText(e.target.value)}
        lang="en"
        aria-label="พิมพ์สิ่งที่ได้ยิน"
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        className={`min-h-12 w-full rounded-xl border-2 px-3 text-lg ${toneClass(tone)}`}
      />
      <CheckButton type="submit" hidden={result !== undefined} disabled={empty || sent} />
    </form>
  );
}
