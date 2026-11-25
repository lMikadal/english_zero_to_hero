"use client";
import { useEffect, useState } from "react";
import { useAudio } from "@/lib/audio/context";
import type { ExerciseProps } from "./types";
import { Instruction, Prompt } from "./ui/Instruction";
import { toneClass } from "./ui/tone";

// Self-rated speaking: the two rating buttons are the answer. The sample answer appears only after rating.
export function SpeakAnswer({ exercise, onAnswer, result }: ExerciseProps<"speak_answer">) {
  const { source, accent } = useAudio();
  const [canPlay, setCanPlay] = useState(false);
  const [rating, setRating] = useState<"ok" | "unsure" | null>(null);
  const revealed = rating !== null || result !== undefined;

  useEffect(() => {
    let cancelled = false;
    source.canPlay(exercise.prompt).then(
      (ok) => !cancelled && setCanPlay(ok),
      () => !cancelled && setCanPlay(false),
    );
    return () => {
      cancelled = true;
      source.stop();
    };
  }, [source, exercise.prompt]);

  function rate(r: "ok" | "unsure") {
    if (revealed) return;
    setRating(r);
    onAnswer({ kind: "self", rating: r });
  }

  const button = (r: "ok" | "unsure", label: string) => (
    <button
      type="button"
      disabled={revealed}
      aria-pressed={rating === r}
      onClick={() => rate(r)}
      className={`min-h-12 flex-1 rounded-xl border-2 px-3 text-base font-semibold disabled:opacity-80 ${toneClass(rating === r ? "selected" : "idle")}`}
    >
      {label}
    </button>
  );

  return (
    <section>
      <Instruction th={exercise.instruction.th} en={exercise.instruction.en} />
      <Prompt lang="en">{exercise.prompt}</Prompt>
      {canPlay ? (
        <button
          type="button"
          onClick={() => void source.play(exercise.prompt, { accent }).catch(() => {})}
          className="mb-3 min-h-11 rounded-xl border-2 border-slate-300 bg-white px-4 text-base"
        >
          ฟังคำถาม
        </button>
      ) : null}
      <p className="mb-2 text-sm text-slate-600">ลองพูดตอบออกเสียงแล้วประเมินตัวเอง</p>
      <div className="flex gap-3">
        {button("ok", "พูดได้")}
        {button("unsure", "ยังไม่คล่อง")}
      </div>
      {revealed ? (
        <div className="mt-4 rounded-xl bg-slate-100 p-3">
          <p className="text-sm text-slate-600">ตัวอย่างคำตอบ</p>
          <p lang="en" className="text-lg text-slate-900">{exercise.sampleAnswer}</p>
        </div>
      ) : null}
    </section>
  );
}
