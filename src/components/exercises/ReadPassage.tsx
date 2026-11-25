"use client";
import { useState } from "react";
import type { ExerciseProps } from "./types";
import { CheckButton } from "./ui/CheckButton";
import { Instruction } from "./ui/Instruction";
import { ChoiceButton } from "./ui/ChoiceButton";
import { radioKeys } from "./ui/radio";
import { rightWrong, type Tone } from "./ui/tone";

export function ReadPassage({ exercise, onAnswer, result }: ExerciseProps<"read_passage">) {
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
  const questionTone = (qi: number): Tone => (result ? rightWrong(result.items ? result.items[qi] === true : result.correct) : "idle");

  return (
    <section>
      <Instruction th={exercise.instruction.th} en={exercise.instruction.en} />
      <p data-testid="passage" lang="en" className="whitespace-pre-line break-words rounded-xl bg-amber-50 p-3 text-lg leading-relaxed text-slate-900">
        {exercise.text}
      </p>
      {glossary.length > 0 ? (
        <dl className="mt-2 rounded-xl bg-slate-100 p-3 text-sm">
          {glossary.map(([word, th]) => (
            <div key={word} className="flex flex-wrap gap-x-2">
              <dt lang="en" className="font-semibold text-slate-900">{word}</dt>
              <dd className="text-slate-700">{th}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {exercise.questions.map((q, qi) => (
        <div key={qi} role="radiogroup" aria-label={`คำถามที่ ${qi + 1}`} data-state={questionTone(qi)} onKeyDown={(e) => { if (!locked) radioKeys(e, q.choices.length, selected[qi], (ci) => choose(qi, ci)); }} className="mt-5">
          <p className="font-semibold text-slate-900">{q.question.th}</p>
          <p lang="en" className="mb-2 text-sm text-slate-600">{q.question.en}</p>
          <div className="flex flex-col gap-2">
            {q.choices.map((choice, ci) => {
              const chosen = selected[qi] === ci;
              let tone: Tone = chosen ? "selected" : "idle";
              if (result) tone = ci === q.answer ? "right" : chosen ? "wrong" : "idle";
              const mark = result ? (ci === q.answer ? true : chosen ? false : undefined) : undefined;
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
    </section>
  );
}
