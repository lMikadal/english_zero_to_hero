"use client";
import { useState } from "react";
import { AudioFallback, PlayButtons, useExerciseAudio } from "@/components/audio/AudioControls";
import type { ExerciseProps } from "./types";
import { CHOICE, CheckButton, Instruction } from "./sound-ui";

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
      <AudioFallback audio={audio} onSkip={onContinue}>
        <p data-revealed>{exercise.pairs.map((p) => p[p.answer]).join(", ")}</p>
      </AudioFallback>
      {exercise.pairs.map((pair, i) => {
        const itemState = result?.items ? (result.items[i] ? "correct" : "wrong") : undefined;
        return (
          <div key={i} role="group" aria-label={`ข้อ ${i + 1}`} className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-3 data-[state=correct]:border-green-600 data-[state=wrong]:border-red-600" data-state={itemState}>
            <PlayButtons audio={audio} text={pair[pair.answer]} />
            <div role="radiogroup" aria-label={`คู่ที่ ${i + 1}`} data-state={itemState} className="grid grid-cols-2 gap-2">
              {(["a", "b"] as const).map((side) => {
                const state = itemState === undefined ? undefined : side === pair.answer ? "correct" : picks[i] === side ? "wrong" : undefined;
                return (
                  <button
                    key={side}
                    type="button"
                    role="radio"
                    aria-checked={picks[i] === side}
                    data-state={state}
                    disabled={locked}
                    onClick={() => choose(i, side)}
                    className={`${CHOICE} text-center`}
                  >
                    {pair[side]}
                  </button>
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
