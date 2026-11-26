"use client";
import { useState } from "react";
import { AudioFallback, PlayButtons, useExerciseAudio } from "@/components/audio/AudioControls";
import type { ExerciseProps } from "./types";
import { GRADED_NO_AUDIO_NOTE } from "@/components/audio/AudioControls";
import { CheckButton } from "./ui/CheckButton";
import { ChoiceButton } from "./ui/ChoiceButton";
import { Instruction } from "./ui/Instruction";
import { Mark } from "./ui/Mark";
import { radioKeys } from "./ui/radio";
import { rightWrong, toneClass, type Tone } from "./ui/tone";

type Pick = "a" | "b";

export function MinimalPair({ exercise, onAnswer, onContinue, result }: ExerciseProps<"minimal_pair">) {
  const first = exercise.pairs[0];
  const audio = useExerciseAudio(first[first.answer]);
  const [picks, setPicks] = useState<(Pick | null)[]>(() => exercise.pairs.map(() => null));
  const [sent, setSent] = useState(false);
  const locked = result !== undefined || sent;
  const complete = picks.every((p) => p !== null);

  const check = () => {
    if (!complete || locked) return;
    setSent(true);
    onAnswer({ kind: "pairs", selected: picks as Pick[] });
  };
  const choose = (i: number, pick: Pick) => setPicks((p) => p.map((v, j) => (j === i ? pick : v)));

  return (
    <section className="flex flex-col gap-4">
      <Instruction th={exercise.instruction.th} en={exercise.instruction.en} />
      <AudioFallback audio={audio} onSkip={onContinue} note={GRADED_NO_AUDIO_NOTE} />
      {exercise.pairs.map((pair, i) => {
        const itemOk = result?.items ? result.items[i] : undefined;
        const itemTone: Tone = itemOk === undefined ? "idle" : rightWrong(itemOk);
        const pickIndex = picks[i] === null ? null : picks[i] === "a" ? 0 : 1;
        return (
          <div key={i} role="group" aria-label={`ข้อ ${i + 1}`} className={`flex flex-col gap-2 rounded-xl border-2 p-3 ${toneClass(itemTone)}`} data-state={itemTone}>
            <p className="text-sm text-slate-600">คู่ที่ {i + 1} {itemOk !== undefined ? <Mark ok={itemOk} /> : null}</p>
            <PlayButtons audio={audio} text={pair[pair.answer]} />
            <div role="radiogroup" aria-label={`คู่ที่ ${i + 1}`} data-state={itemTone} onKeyDown={(e) => { if (!locked) radioKeys(e, 2, pickIndex, (n) => choose(i, n === 0 ? "a" : "b")); }} className="grid grid-cols-2 gap-2">
              {(["a", "b"] as const).map((side, si) => {
                const shown = itemOk !== undefined;
                const tone: Tone = shown ? (side === pair.answer ? "right" : picks[i] === side ? "wrong" : "idle") : picks[i] === side ? "selected" : "idle";
                const mark = shown ? (side === pair.answer ? true : picks[i] === side ? false : undefined) : undefined;
                return (
                  <ChoiceButton key={side} index={si} selectedIndex={pickIndex} selected={picks[i] === side} tone={tone} mark={mark} center disabled={locked} onClick={() => choose(i, side)}>
                    {pair[side]}
                  </ChoiceButton>
                );
              })}
            </div>
          </div>
        );
      })}
      <CheckButton hidden={result !== undefined} disabled={!complete || sent} onClick={check} />
    </section>
  );
}
