// Guard for the monthly checkpoint (docs/plans/checkpoint-plan.md D5, PR 4): with `reveal={false}` an answered exercise locks
// exactly as before but shows nothing about right or wrong. It walks every exercise of days 1-7 (all graded types, phoneme_intro)
// plus the grammar_note fixture, and the same walk with the default (reveal) proves the checks can fail.
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { vocabIdsFor } from "@/app/(learn)/day/[day]/vocab-ids";
import type { Grade } from "@/lib/answers/grade";
import { weekOne } from "@/lib/answers/test-content";
import { getVocabLookup } from "@/lib/content/repo";
import { exerciseSchema, type Exercise } from "@/lib/content/schema";
import sample from "./fixtures/grammar-note.sample.json";
import { renderExercise } from "./registry";
import { renderWithAudio } from "./test-helpers";

const handlers = { onAnswer: () => {}, onContinue: () => {} };
type Vocab = ReturnType<typeof getVocabLookup>;

const itemCount = (e: Exercise): number | undefined => {
  switch (e.type) {
    case "minimal_pair": return e.pairs.length;
    case "read_passage": return e.questions.length;
    case "vocab_match": return e.pairs.length;
    case "fill_blank": return e.text.split("___").length - 1;
    default: return undefined;
  }
};
const grade = (e: Exercise, ok: boolean): Grade => {
  const n = itemCount(e);
  return { correct: ok, score: ok ? 1 : 0, ...(n === undefined ? {} : { items: Array.from({ length: n }, () => ok) }) };
};

const cases = [
  ...weekOne.flatMap((lesson) => {
    const vocab = getVocabLookup(vocabIdsFor(lesson));
    return lesson.sections.flatMap((s) => s.exercises.map((e) => ({ e, vocab })));
  }),
  { e: exerciseSchema.parse(sample), vocab: {} as Vocab },
];
/** Types that show right / wrong today. The others (self-rated, free_write, teaching cards) never do. */
const SHOWS_RESULT = new Set(["minimal_pair", "listen_choose", "dictation", "read_passage", "arrange_words", "fill_blank", "translate_th_en", "vocab_match"]);
const TEACHING = new Set(["phoneme_intro", "grammar_note"]);

const show = (e: Exercise, vocab: Vocab, reveal: boolean | undefined, result?: Grade): ReactElement => (
  <>{renderExercise(e, { ...handlers, vocab, result, reveal })}</>
);

/** Fills in what a learner would have done before pressing the check button, so the locked screen has an own answer to keep. */
function answerLikeALearner(root: HTMLElement, e: Exercise, vocab: Vocab) {
  for (const input of root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input[type=text], textarea")) fireEvent.change(input, { target: { value: "xyz abc" } });
  for (const group of root.querySelectorAll("[role=radiogroup]")) {
    const first = group.querySelector<HTMLElement>("[role=radio]");
    if (first) fireEvent.click(first);
  }
  if (e.type === "vocab_match") {
    for (const p of e.pairs) {
      fireEvent.click(screen.getByRole("button", { name: vocab[p.vocabId].word }));
      fireEvent.click(screen.getByRole("button", { name: vocab[p.vocabId].th }));
    }
  }
  if (e.type === "arrange_words") {
    const pool = root.querySelector("[aria-label='คำที่เหลือ']")!;
    for (let i = 0; i < e.words.length; i++) fireEvent.click(pool.querySelector("button")!);
  }
}

/** Every sign of right / wrong that the reveal draws. Empty means nothing is revealed. */
export function revealSignals(root: HTMLElement): string[] {
  const out: string[] = [];
  for (const el of root.querySelectorAll("[data-state='right'], [data-state='wrong']")) out.push(`data-state=${el.getAttribute("data-state")} on <${el.tagName.toLowerCase()}>`);
  for (const el of root.querySelectorAll("[aria-invalid]")) out.push(`aria-invalid on <${el.tagName.toLowerCase()}>`);
  for (const el of root.querySelectorAll("[data-testid^='reveal-']")) out.push(`reveal text ${el.getAttribute("data-testid")}`);
  for (const el of root.querySelectorAll(".sr-only")) if (/ถูก|ผิด/.test(el.textContent ?? "")) out.push(`sr-only "${el.textContent}"`);
  const text = root.textContent ?? "";
  if (/[✓✗]/.test(text)) out.push("check or cross glyph");
  if (text.includes("คำตอบที่ถูกต้อง")) out.push("correct answer text");
  for (const el of root.querySelectorAll("[class]")) {
    if (el.getAttribute("data-testid") === "word-count") continue; // "enough words" colour, not correctness
    if (/(^|[\s:-])(text|border|bg|ring)-(good|bad)/.test(el.getAttribute("class") ?? "")) out.push(`good/bad colour class on <${el.tagName.toLowerCase()}>`);
  }
  return out;
}

/** Controls the learner could still use after the answer was confirmed (play and skip chips are not answer controls). */
function openControls(root: HTMLElement): string[] {
  const out: string[] = [];
  for (const el of root.querySelectorAll<HTMLInputElement>("input, textarea")) if (!el.disabled && !el.readOnly) out.push(`<${el.tagName.toLowerCase()}> ${el.getAttribute("aria-label") ?? ""}`);
  for (const el of root.querySelectorAll<HTMLButtonElement>("button")) {
    const name = (el.textContent ?? "").trim();
    if (/^(ฟัง|ข้าม)/.test(name)) continue;
    if (!el.disabled) out.push(`<button> ${name}`);
  }
  return out;
}

describe("reveal={false} hides right and wrong on every exercise", () => {
  it.each(cases.filter((c) => !TEACHING.has(c.e.type)).map((c) => [c.e.id, c] as const))("%s: locked, nothing revealed, and the same screen for a right and a wrong answer", (_id, { e, vocab }) => {
    const view = renderWithAudio(show(e, vocab, false));
    answerLikeALearner(view.container, e, vocab);
    view.rerender(show(e, vocab, false, grade(e, false)));
    expect(revealSignals(view.container), `${e.id} wrong`).toEqual([]);
    expect(openControls(view.container), `${e.id} locked`).toEqual([]);
    expect(screen.queryByRole("button", { name: /ตรวจคำตอบ|ยืนยันคำตอบ/ })).toBeNull();
    const wrongHtml = view.container.innerHTML;
    view.rerender(show(e, vocab, false, grade(e, true)));
    expect(revealSignals(view.container), `${e.id} right`).toEqual([]);
    expect(view.container.innerHTML, `${e.id}: the screen must not depend on whether the answer was right`).toBe(wrongHtml);
  });

  it.each(cases.filter((c) => SHOWS_RESULT.has(c.e.type)).map((c) => [c.e.id, c] as const))("%s: the same walk with the default still reveals (the guard can fail)", (_id, { e, vocab }) => {
    const view = renderWithAudio(show(e, vocab, undefined));
    answerLikeALearner(view.container, e, vocab);
    view.rerender(show(e, vocab, undefined, grade(e, false)));
    expect(revealSignals(view.container).length, `${e.id} default`).toBeGreaterThan(0);
  });

  it("explicit reveal={true} equals the default", () => {
    for (const { e, vocab } of cases.filter((c) => SHOWS_RESULT.has(c.e.type))) {
      const a = renderWithAudio(show(e, vocab, undefined, grade(e, false)));
      const b = renderWithAudio(show(e, vocab, true, grade(e, false)));
      expect(b.container.innerHTML, e.id).toBe(a.container.innerHTML);
      a.unmount(); b.unmount();
    }
  });

  it("covers every registered type", () => {
    expect(new Set(cases.map((c) => c.e.type))).toEqual(new Set([
      "phoneme_intro", "minimal_pair", "listen_choose", "dictation", "repeat_after_me", "shadowing", "speak_answer", "read_passage",
      "arrange_words", "fill_blank", "translate_th_en", "free_write", "vocab_match", "grammar_note",
    ]));
  });

  it("self-test: revealSignals notices every kind of signal", () => {
    const { container } = render(
      <div>
        <button data-state="wrong">x</button>
        <input aria-invalid="true" />
        <p data-testid="reveal-v-cat">a</p>
        <span className="sr-only">ถูก</span>
        <p>✓</p>
        <p>คำตอบที่ถูกต้อง</p>
        <p className="text-good-fg">ok</p>
        <p data-testid="word-count" className="text-good-fg">3 / 3</p>
      </div>,
    );
    expect(revealSignals(container)).toHaveLength(7);
  });
});
