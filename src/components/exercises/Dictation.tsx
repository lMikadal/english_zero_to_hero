"use client";
import { useState } from "react";
import { AudioFallback, useExerciseAudio } from "@/components/audio/AudioControls";
import { GRADED_NO_AUDIO_NOTE } from "@/components/audio/AudioControls";
import type { ExerciseProps } from "./types";
import { AudioCard } from "./ui/AudioCard";
import { CheckButton } from "./ui/CheckButton";
import { ExerciseShell } from "./ui/ExerciseShell";
import { Mark } from "./ui/Mark";
import { Instruction } from "./ui/Instruction";
import { rightWrong, fieldToneClass, FIELD, type Tone } from "./ui/tone";

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
    <ExerciseShell onSubmit={check}>
      <Instruction th={exercise.instruction.th} en={exercise.instruction.en} />
      <AudioCard audio={audio} text={exercise.audioText} />
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
        className={`${FIELD} ${fieldToneClass(tone)}`}
      />
      {result ? <p className="text-[13px] font-medium"><Mark ok={result.correct} /></p> : null}
      <CheckButton type="submit" hidden={result !== undefined} disabled={empty || sent} />
    </ExerciseShell>
  );
}
