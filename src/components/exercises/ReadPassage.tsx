"use client";
import { useState } from "react";
import { shown, type ExerciseProps } from "./types";
import { CheckButton } from "./ui/CheckButton";
import { ExerciseShell } from "./ui/ExerciseShell";
import { Instruction } from "./ui/Instruction";
import { MixedText } from "./ui/MixedText";
import { ChoiceButton } from "./ui/ChoiceButton";
import { radioKeys } from "./ui/radio";
import { rightWrong, type Tone } from "./ui/tone";

export function ReadPassage({ exercise, onAnswer, result, reveal = true }: ExerciseProps<"read_passage">) {
  const seen = shown(result, reveal);
  const [selected, setSelected] = useState<(number | null)[]>(() => exercise.questions.map(() => null));
  const [submitted, setSubmitted] = useState(false);
  const locked = submitted || result !== undefined;
  const complete = selected.every((s) => s !== null);
  const glossary = Object.entries(exercise.glossary ?? {});

  function check() {
    if (locked || !complete) return;
    setSubmitted(true);
    onAnswer({ kind: "choices", selected: selected as number[] });
  }

  const choose = (qi: number, ci: number) => setSelected(selected.map((s, i) => (i === qi ? ci : s)));
  const questionTone = (qi: number): Tone => (seen ? rightWrong(seen.items ? seen.items[qi] === true : seen.correct) : "idle");

  return (
    <ExerciseShell>
      <Instruction th={exercise.instruction.th} en={exercise.instruction.en} />
      <p data-testid="passage" lang="en" className="whitespace-pre-line break-words rounded-[14px] border border-line bg-card p-4 text-[15px] leading-relaxed text-fg">
        {exercise.text}
      </p>
      {glossary.length > 0 ? (
        <dl className="flex flex-col gap-1 rounded-[10px] bg-surface px-3 py-2.5 text-[13px]">
          {glossary.map(([word, th]) => (
            <div key={word} className="flex flex-wrap gap-x-2">
              <dt lang="en" className="font-semibold text-fg">{word}</dt>
              <dd className="text-fg"><MixedText text={th} /></dd>
            </div>
          ))}
        </dl>
      ) : null}

      {exercise.questions.map((q, qi) => (
        <div key={qi} role="radiogroup" aria-label={`คำถามที่ ${qi + 1}`} data-state={questionTone(qi)} onKeyDown={(e) => { if (!locked) radioKeys(e, q.choices.length, selected[qi], (ci) => choose(qi, ci)); }} className="flex flex-col gap-2.5">
          <div>
            <p className="text-[15px] font-medium text-fg"><MixedText text={q.question.th} /></p>
            <p lang="en" className="text-xs text-muted">{q.question.en}</p>
          </div>
          <div className="flex flex-col gap-2.5">
            {q.choices.map((choice, ci) => {
              const chosen = selected[qi] === ci;
              let tone: Tone = chosen ? "selected" : "idle";
              if (seen) tone = ci === q.answer ? "right" : chosen ? "wrong" : "idle";
              const mark = seen ? (ci === q.answer ? true : chosen ? false : undefined) : undefined;
              return (
                <ChoiceButton key={ci} index={ci} selectedIndex={selected[qi]} selected={chosen} tone={tone} mark={mark} disabled={locked} onClick={() => choose(qi, ci)}>
                  {choice}
                </ChoiceButton>
              );
            })}
          </div>
        </div>
      ))}
      <CheckButton hidden={result !== undefined} disabled={locked || !complete} onClick={check} />
    </ExerciseShell>
  );
}
