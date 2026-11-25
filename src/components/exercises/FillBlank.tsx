"use client";
import { Fragment, useState } from "react";
import type { ExerciseProps } from "./types";
import { CheckButton } from "./ui/CheckButton";
import { Instruction } from "./ui/Instruction";
import { rightWrong, toneClass, type Tone } from "./ui/tone";

const BLANK = "___";

export function FillBlank({ exercise, onAnswer, result }: ExerciseProps<"fill_blank">) {
  const parts = exercise.text.split(BLANK);
  const blanks = parts.length - 1;
  const [texts, setTexts] = useState<string[]>(() => Array.from({ length: blanks }, () => ""));
  const [submitted, setSubmitted] = useState(false);
  const locked = submitted || result !== undefined;
  const complete = texts.every((t) => t.trim() !== "");

  function check() {
    if (locked || !complete) return;
    setSubmitted(true);
    onAnswer({ kind: "texts", texts });
  }

  const toneOf = (i: number): Tone => {
    if (!result) return "idle";
    return rightWrong(result.items ? result.items[i] === true : result.correct);
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        check();
      }}
    >
      <Instruction th={exercise.instruction.th} en={exercise.instruction.en} />
      <p lang="en" className="my-3 text-lg leading-[3rem] text-slate-900">
        {parts.map((part, i) => (
          <Fragment key={i}>
            {part}
            {i < blanks ? (
              <input
                type="text"
                aria-label={blanks > 1 ? `ช่องว่างที่ ${i + 1}` : "ช่องว่าง"}
                lang="en"
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="off"
                spellCheck={false}
                value={texts[i]}
                disabled={locked}
                data-state={toneOf(i)}
                onChange={(e) => setTexts(texts.map((t, j) => (j === i ? e.target.value : t)))}
                className={`mx-1 inline-block min-h-11 w-28 max-w-full rounded-lg border-2 px-2 text-center align-middle ${toneClass(toneOf(i))}`}
              />
            ) : null}
          </Fragment>
        ))}
      </p>
      <CheckButton type="submit" disabled={locked || !complete} />
    </form>
  );
}
