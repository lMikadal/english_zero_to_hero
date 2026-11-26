"use client";
import { useState } from "react";
import type { ExerciseProps } from "./types";
import { Card } from "./ui/Card";
import { CheckButton } from "./ui/CheckButton";
import { ExerciseShell } from "./ui/ExerciseShell";
import { Instruction } from "./ui/Instruction";
import { Mark } from "./ui/Mark";
import { rightWrong, fieldToneClass, type Tone } from "./ui/tone";

const BLANK = "___";

/** Each blank keeps the punctuation or text glued to it (no space) so a line never starts with an orphan "?". */
function layout(parts: string[]) {
  const lead = parts.map((p, i) => (i === 0 ? "" : (/^\S*/.exec(p)?.[0] ?? "")));
  return parts.map((p, i) => {
    const rest = p.slice(lead[i].length);
    const trail = i === parts.length - 1 ? "" : (/\S*$/.exec(rest)?.[0] ?? "");
    return { lead: lead[i], middle: rest.slice(0, rest.length - trail.length), trail };
  });
}

export function FillBlank({ exercise, onAnswer, result }: ExerciseProps<"fill_blank">) {
  const parts = exercise.text.split(BLANK);
  const blanks = parts.length - 1;
  const segments = layout(parts);
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
    <ExerciseShell onSubmit={check}>
      <Instruction th={exercise.instruction.th} en={exercise.instruction.en} />
      <Card pad="px-4 py-5"><p lang="en" className="text-lg font-medium leading-[3rem] text-fg">
        {segments.map((seg, i) => (
          <span key={i}>
            {seg.middle}
            {i < blanks ? (
              <span className="whitespace-nowrap">
                {seg.trail}
                <input
                  type="text"
                  aria-label={blanks > 1 ? `ช่องว่างที่ ${i + 1}` : "ช่องว่าง"}
                  lang="en"
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="off"
                  spellCheck={false}
                  enterKeyHint="done"
                  value={texts[i]}
                  readOnly={locked}
                  aria-readonly={locked || undefined}
                  aria-invalid={toneOf(i) === "wrong" || undefined}
                  data-state={toneOf(i)}
                  onChange={(e) => setTexts(texts.map((t, j) => (j === i ? e.target.value : t)))}
                  className={`mx-1 inline-block min-h-11 w-28 max-w-full rounded-[9px] border px-2 text-center align-middle font-medium ${fieldToneClass(toneOf(i))}`}
                />
                {result ? <span className="mr-1.5"><Mark ok={toneOf(i) === "right"} /></span> : null}
                {segments[i + 1].lead}
              </span>
            ) : null}
          </span>
        ))}
      </p></Card>
      <CheckButton type="submit" hidden={result !== undefined} disabled={locked || !complete} />
    </ExerciseShell>
  );
}
