// Machine check: every interactive element of every week-1 exercise carries a class that guarantees a 44px
// minimum height (min-h-11 or taller). jsdom has no layout, so this reads the class list, not a measured size;
// the real size is only confirmed in a browser (docs/FEATURE_MAP.md). Width: buttons that are not full width carry min-w-11.
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { vocabIdsFor } from "@/app/(learn)/day/[day]/vocab-ids";
import type { Grade } from "@/lib/answers/grade";
import { weekOne } from "@/lib/answers/test-content";
import { getVocabLookup } from "@/lib/content/repo";
import type { Exercise } from "@/lib/content/schema";
import { renderExercise } from "./registry";
import { renderWithAudio } from "./test-helpers";

const INTERACTIVE = "button, a, input, textarea, [role=radio]";
/** Elements sized another way (none today). Add a selector here only with a reason. */
const ALLOW: string[] = [];
/** h-11 (44px) or taller, min- or fixed. */
const TALL_ENOUGH = /(^|\s)(min-)?h-(1[1-9]|[2-9]\d)(\s|$)/;

export function smallTargets(root: ParentNode): string[] {
  return Array.from(root.querySelectorAll(INTERACTIVE))
    .filter((el) => !ALLOW.some((s) => el.matches(s)))
    .filter((el) => !TALL_ENOUGH.test(el.getAttribute("class") ?? ""))
    .map((el) => `<${el.tagName.toLowerCase()} class="${el.getAttribute("class") ?? ""}"> ${(el.textContent ?? "").trim().slice(0, 20)}`);
}

const handlers = { onAnswer: () => {}, onContinue: () => {} };
const cases = weekOne.flatMap((lesson) => {
  const vocab = getVocabLookup(vocabIdsFor(lesson));
  return lesson.sections.flatMap((s) => s.exercises.map((e) => ({ e, vocab })));
});
const show = (e: Exercise, vocab: ReturnType<typeof getVocabLookup>, result?: Grade): ReactElement => <>{renderExercise(e, { ...handlers, vocab, result })}</>;

describe("touch targets", () => {
  it.each(cases.map((c) => [c.e.id, c] as const))("%s: every interactive element has a 44px minimum height class", (_id, { e, vocab }) => {
    const view = renderWithAudio(show(e, vocab));
    expect(smallTargets(view.container)).toEqual([]);
    if (e.type === "vocab_match") for (const p of e.pairs) fireEvent.click(screen.getByRole("button", { name: vocab[p.vocabId].word }));
    view.rerender(show(e, vocab, { correct: false, score: 0 }));
    expect(smallTargets(view.container)).toEqual([]);
  });

  it("covers all 13 exercise types", () => {
    expect(new Set(cases.map((c) => c.e.type)).size).toBe(13);
  });

  it("self-test: a small button, link, input and radio are caught; min-h-11 and h-12 pass", () => {
    const { container } = render(
      <div>
        <button className="px-2 text-sm">x</button>
        <a href="/" className="h-6">y</a>
        <input className="h-10" />
        <textarea className="w-full" />
        <span role="radio" className="min-h-8" />
        <button className="min-h-11">ok</button>
        <button className="h-12">ok</button>
        <button className="min-h-1 px-2">small</button>
      </div>,
    );
    expect(smallTargets(container)).toHaveLength(6);
  });
});
