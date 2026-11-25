"use client";
import { useMemo, useState } from "react";
import type { ExerciseProps } from "./types";
import { CheckButton } from "./ui/CheckButton";
import { Instruction } from "./ui/Instruction";
import { shuffleSeeded } from "./ui/shuffle";
import { rightWrong, toneClass, type Tone } from "./ui/tone";

const OPTION = "relative flex min-h-11 w-full items-center justify-between gap-2 rounded-xl border-2 px-3 py-2 text-left text-base disabled:opacity-90";

export function VocabMatch({ exercise, vocab, onAnswer, result }: ExerciseProps<"vocab_match">) {
  const ids = exercise.pairs.map((p) => p.vocabId);
  // pairs[wordId] = the id whose Thai meaning the learner matched to that word
  const [pairs, setPairs] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const locked = submitted || result !== undefined;
  const complete = ids.every((id) => pairs[id] !== undefined);

  // Meanings are shown in a deterministic shuffle that differs from the word order.
  const meaningOrder = useMemo(
    () => shuffleSeeded(ids, exercise.id, (order) => order.every((id, i) => id === ids[i])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [exercise],
  );

  const leftOf = (rightId: string) => ids.find((id) => pairs[id] === rightId);
  const itemTone = (leftId: string): Tone => {
    if (!result) return "selected";
    const i = ids.indexOf(leftId);
    return rightWrong(result.items ? result.items[i] === true : result.correct);
  };

  function unpair(leftId: string) {
    setPairs(Object.fromEntries(Object.entries(pairs).filter(([k]) => k !== leftId)));
  }
  function tapWord(id: string) {
    if (locked) return;
    if (pairs[id] !== undefined) unpair(id);
    else setSelected(id);
  }
  function tapMeaning(id: string) {
    if (locked) return;
    const owner = leftOf(id);
    if (owner !== undefined) unpair(owner);
    else if (selected !== null) {
      setPairs({ ...pairs, [selected]: id });
      setSelected(null);
    }
  }
  function check() {
    if (locked || !complete) return;
    setSubmitted(true);
    onAnswer({ kind: "match", pairs: Object.fromEntries(ids.map((id) => [id, pairs[id]])) });
  }

  const badge = (leftId: string) => (
    <span aria-hidden="true" className="flex size-6 shrink-0 items-center justify-center rounded-full bg-slate-800 text-sm text-white">
      {ids.indexOf(leftId) + 1}
    </span>
  );

  return (
    <section>
      <Instruction th={exercise.instruction.th} en={exercise.instruction.en} />
      <p className="mb-3 text-sm text-slate-600">แตะคำภาษาอังกฤษ แล้วแตะความหมายภาษาไทย แตะคู่ที่จับแล้วเพื่อยกเลิก</p>
      <div className="grid grid-cols-2 gap-3">
        <div role="group" aria-label="คำภาษาอังกฤษ" className="flex flex-col gap-2">
          {ids.map((id) => {
            const paired = pairs[id] !== undefined;
            const tone: Tone = paired ? itemTone(id) : selected === id ? "selected" : "idle";
            return (
              <button key={id} type="button" lang="en" disabled={locked} data-state={tone} onClick={() => tapWord(id)} className={`${OPTION} ${toneClass(tone)} ${selected === id ? "ring-2 ring-sky-400" : ""}`}>
                <span>{vocab[id]?.word ?? id}</span>
                {paired ? badge(id) : null}
              </button>
            );
          })}
        </div>
        <div role="group" aria-label="ความหมายภาษาไทย" className="flex flex-col gap-2">
          {meaningOrder.map((id) => {
            const owner = leftOf(id);
            const tone: Tone = owner !== undefined ? itemTone(owner) : "idle";
            return (
              <button key={id} type="button" disabled={locked} data-state={tone} onClick={() => tapMeaning(id)} className={`${OPTION} ${toneClass(tone)}`}>
                <span>{vocab[id]?.th ?? id}</span>
                {owner !== undefined ? badge(owner) : null}
              </button>
            );
          })}
        </div>
      </div>
      <CheckButton disabled={locked || !complete} onClick={check} />
    </section>
  );
}
