// Machine checks for two classes of problem that review found more than once (see docs/FEATURE_MAP.md):
//  1. right/wrong shown by colour only: every element whose data-state is right/wrong must carry text a screen reader
//     can read ("ถูก" / "ผิด" from <Mark>), not only a border colour;
//  2. English learner content without lang="en": every text node with Latin letters, in any exercise component or in
//     the player's feedback, must sit under an element whose lang starts with "en".
// It renders every registered component on the real exercises of days 1-7, before and after a graded result.
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { vocabIdsFor } from "@/app/(learn)/day/[day]/vocab-ids";
import type { Grade } from "@/lib/answers/grade";
import { weekOne } from "@/lib/answers/test-content";
import { getVocabLookup } from "@/lib/content/repo";
import type { Exercise } from "@/lib/content/schema";
import { LessonPlayer } from "@/components/player/LessonPlayer";
import { fakeAudio, renderWithAudio } from "./test-helpers";
import { renderExercise } from "./registry";

const handlers = { onAnswer: () => {}, onContinue: () => {} };

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

/** vocab_match shows right/wrong only on paired tiles: pair every word with its own meaning like a learner would. */
function pairAll(e: Exercise, vocab: ReturnType<typeof getVocabLookup>) {
  if (e.type !== "vocab_match") return;
  for (const p of e.pairs) {
    const v = vocab[p.vocabId];
    fireEvent.click(screen.getByRole("button", { name: v.word }));
    fireEvent.click(screen.getByRole("button", { name: v.th }));
  }
}

const isControl = (el: Element) => el.matches("input, textarea, select");
const isContainer = (el: Element) => el.querySelector("[data-state='right'], [data-state='wrong']") !== null;

/** Problems with right/wrong state conveyed without text. */
export function colourOnlyProblems(root: ParentNode): string[] {
  const problems: string[] = [];
  for (const el of root.querySelectorAll("[data-state='right'], [data-state='wrong']")) {
    const state = el.getAttribute("data-state");
    const word = state === "right" ? "ถูก" : "ผิด";
    const scope = isControl(el) ? (el.parentElement ?? el) : el;
    const texts = Array.from(scope.querySelectorAll(".sr-only")).map((n) => n.textContent ?? "");
    const ok = isContainer(el) ? /ถูก|ผิด/.test(scope.textContent ?? "") : texts.includes(word);
    const label = `${el.tagName.toLowerCase()}[${el.getAttribute("role") ?? el.getAttribute("aria-label") ?? ""}] data-state=${state}`;
    if (!ok) problems.push(`${label}: no sr-only "${word}" text`);
  }
  return problems;
}

/** Text with Latin letters that is not under an element with lang="en*". */
export function missingLangEn(root: HTMLElement): string[] {
  const out: string[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = (n.textContent ?? "").trim();
    if (!/[A-Za-z]/.test(text)) continue;
    const lang = n.parentElement?.closest("[lang]")?.getAttribute("lang") ?? "";
    if (!lang.startsWith("en")) out.push(text);
  }
  return out;
}

/** Thai text that sits under an element with lang="en*" (a screen reader would read it with an English voice). */
export function thaiUnderEn(root: HTMLElement): string[] {
  const out: string[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = (n.textContent ?? "").trim();
    if (!/[\u0E00-\u0E7F]/.test(text)) continue;
    const lang = n.parentElement?.closest("[lang]")?.getAttribute("lang") ?? "";
    if (lang.startsWith("en")) out.push(text);
  }
  return out;
}

const cases = weekOne.flatMap((lesson) => {
  const vocab = getVocabLookup(vocabIdsFor(lesson));
  return lesson.sections.flatMap((s) => s.exercises.map((e) => ({ day: lesson.day, e, vocab })));
});

function show(e: Exercise, vocab: ReturnType<typeof getVocabLookup>, result?: Grade): ReactElement {
  return <>{renderExercise(e, { ...handlers, vocab, result })}</>;
}

describe("accessibility guards on every week-1 exercise", () => {
  it.each(cases.map((c) => [c.e.id, c] as const))("%s: English is lang=en before and after a result", async (_id, { e, vocab }) => {
    const view = renderWithAudio(show(e, vocab));
    expect(missingLangEn(view.container).join(" | "), `${e.id} before result`).toBe("");
    pairAll(e, vocab);
    for (const ok of [true, false]) {
      view.rerender(show(e, vocab, grade(e, ok)));
      expect(missingLangEn(view.container).join(" | "), `${e.id} ${ok ? "right" : "wrong"} result`).toBe("");
    }
  });

  it.each(cases.map((c) => [c.e.id, c] as const))("%s: Thai is never under lang=en", (_id, { e, vocab }) => {
    const view = renderWithAudio(show(e, vocab));
    expect(thaiUnderEn(view.container).join(" | "), `${e.id} before result`).toBe("");
    pairAll(e, vocab);
    for (const ok of [true, false]) {
      view.rerender(show(e, vocab, grade(e, ok)));
      expect(thaiUnderEn(view.container).join(" | "), `${e.id} ${ok ? "right" : "wrong"} result`).toBe("");
    }
  });

  it.each(cases.map((c) => [c.e.id, c] as const))("%s: right/wrong is never colour only", (_id, { e, vocab }) => {
    const view = renderWithAudio(show(e, vocab));
    pairAll(e, vocab);
    for (const ok of [true, false]) {
      view.rerender(show(e, vocab, grade(e, ok)));
      expect(colourOnlyProblems(view.container).join(" | "), `${e.id} ${ok ? "right" : "wrong"} result`).toBe("");
    }
  });

  it("the guard really notices a colour-only mark and English without lang (it is not vacuous)", () => {
    const { container } = render(
      <div>
        <button data-state="wrong" lang="en">no text</button>
        <p>Hello there</p>
        <p lang="en">fine</p>
      </div>,
    );
    expect(colourOnlyProblems(container)).toHaveLength(1);
    expect(missingLangEn(container)).toEqual(["Hello there"]);
    const thai = render(<ul lang="en"><li>cat</li><li>ถูก</li><li lang="th">ผิด</li></ul>);
    expect(thaiUnderEn(thai.container)).toEqual(["ถูก"]);
  });

  it("sees right/wrong states at all (marks exist on the real components)", () => {
    const some = cases.filter((c) => c.e.type === "listen_choose")[0];
    const view = renderWithAudio(show(some.e, some.vocab, grade(some.e, false)));
    expect(view.container.querySelectorAll("[data-state='right'], [data-state='wrong']").length).toBeGreaterThan(0);
  });

  it("the player's feedback after a wrong answer is lang=en for the correct answer and Thai elsewhere", async () => {
    const listen = cases.find((c) => c.e.id === "d001-listen-01")!;
    const lesson = { ...weekOne[0], sections: [{ ...weekOne[0].sections[0], exercises: [listen.e] }] };
    const sink = { sendAttempt: () => {}, completeLesson: async () => ({ status: "queued" as const }), completePractice: async () => ({ status: "queued" as const }), pendingCount: () => 0, subscribe: () => () => {} };
    const view = renderWithAudio(<LessonPlayer lesson={lesson} vocab={listen.vocab} sink={sink} />, fakeAudio());
    fireEvent.click(screen.getByRole("radio", { name: "Ann" }));
    fireEvent.click(screen.getByRole("button", { name: "ตรวจคำตอบ" }));
    expect(within(screen.getByRole("status")).getByText("Sam")).toBeInTheDocument();
    expect(missingLangEn(view.container)).toEqual([]);
    expect(colourOnlyProblems(view.container)).toEqual([]);
  });
});
