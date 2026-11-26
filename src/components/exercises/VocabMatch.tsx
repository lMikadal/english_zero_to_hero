"use client";
import { useMemo, useState } from "react";
import type { ExerciseProps } from "./types";
import { CheckButton } from "./ui/CheckButton";
import { Instruction } from "./ui/Instruction";
import { Mark } from "./ui/Mark";
import { shuffleSeeded } from "./ui/shuffle";
import { rightWrong, toneClass, type Tone } from "./ui/tone";

const OPTION = "relative flex min-h-11 w-full items-center justify-between gap-2 rounded-xl border-2 px-3 py-2 text-left text-base";

export function VocabMatch({ exercise, vocab, onAnswer, result }: ExerciseProps<"vocab_match">) {
  const ids = exercise.pairs.map((p) => p.vocabId);
  // pairs[wordId] = the id whose Thai meaning the learner matched to that word
  const [pairs, setPairs] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const locked = submitted || result !== undefined;
  const complete = ids.every((id) => pairs[id] !== undefined);
  const wordOf = (id: string) => vocab[id]?.word ?? id;
  const meaningOf = (id: string) => vocab[id]?.th ?? id;

  // Meanings are shown in a deterministic shuffle that differs from the word order.
  const meaningOrder = useMemo(
    () => shuffleSeeded(ids, exercise.id, (order) => order.every((id, i) => id === ids[i])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [exercise],
  );

  const leftOf = (rightId: string) => ids.find((id) => pairs[id] === rightId);
  const resultTone = (leftId: string): Tone => {
    const i = ids.indexOf(leftId);
    return rightWrong(result?.items ? result.items[i] === true : (result?.correct ?? false));
  };
  /** Right / wrong after the result, "paired" before it. */
  const pairedTone = (leftId: string): Tone => (result ? resultTone(leftId) : "paired");

  function unpair(leftId: string) {
    setPairs(Object.fromEntries(Object.entries(pairs).filter(([k]) => k !== leftId)));
  }
  function tapWord(id: string) {
    if (locked) return;
    if (pairs[id] !== undefined) unpair(id);
    else setSelected(selected === id ? null : id);
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
    <span aria-hidden="true" className="flex size-6 shrink-0 items-center justify-center rounded-full bg-fg text-sm text-bg">
      {ids.indexOf(leftId) + 1}
    </span>
  );
  const trailing = (leftId: string) => (
    <span className="flex items-center gap-1">
      {result ? <Mark ok={resultTone(leftId) === "right"} /> : null}
      {badge(leftId)}
    </span>
  );

  return (
    <section>
      <Instruction th={exercise.instruction.th} en={exercise.instruction.en} />
      <p className="mb-3 text-sm text-muted">แตะคำภาษาอังกฤษ แล้วแตะความหมายภาษาไทย แตะคู่ที่จับแล้วเพื่อยกเลิก</p>
      <div className="grid grid-cols-2 gap-3">
        <div role="group" aria-label="คำภาษาอังกฤษ" className="flex flex-col gap-2">
          {ids.map((id) => {
            const partner = pairs[id];
            const tone: Tone = partner !== undefined ? pairedTone(id) : selected === id ? "selected" : "idle";
            const wrong = result !== undefined && partner !== undefined && resultTone(id) === "wrong";
            return (
              <div key={id}>
                <button
                  type="button"
                  lang="en"
                  disabled={locked}
                  aria-pressed={selected === id}
                  aria-label={partner !== undefined ? `${wordOf(id)} จับคู่กับ ${meaningOf(partner)}` : undefined}
                  data-state={tone}
                  onClick={() => tapWord(id)}
                  className={`${OPTION} ${toneClass(tone)} ${selected === id ? "ring-4 ring-ring" : ""}`}
                >
                  <span>{wordOf(id)}</span>
                  {partner !== undefined ? trailing(id) : null}
                </button>
                {wrong ? (
                  <p data-testid={`reveal-${id}`} className="mt-1 text-sm font-semibold text-bad-fg">
                    <Mark ok={false} /> <span lang="en">{wordOf(id)}</span> → {meaningOf(id)}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
        <div role="group" aria-label="ความหมายภาษาไทย" className="flex flex-col gap-2">
          {meaningOrder.map((id) => {
            const owner = leftOf(id);
            const tone: Tone = owner !== undefined ? pairedTone(owner) : "idle";
            return (
              <button
                key={id}
                type="button"
                disabled={locked}
                aria-label={owner !== undefined ? `${meaningOf(id)} จับคู่กับ ${wordOf(owner)}` : undefined}
                data-state={tone}
                onClick={() => tapMeaning(id)}
                className={`${OPTION} ${toneClass(tone)}`}
              >
                <span>{meaningOf(id)}</span>
                {owner !== undefined ? trailing(owner) : null}
              </button>
            );
          })}
        </div>
      </div>
      <CheckButton hidden={result !== undefined} disabled={locked || !complete} onClick={check} />
    </section>
  );
}
