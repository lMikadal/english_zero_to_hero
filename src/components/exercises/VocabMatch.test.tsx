import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { gradeExercise } from "@/lib/answers/grade";
import { VocabMatch } from "./VocabMatch";
import { baseProps, exercise, renderWithAudio, vocabLookup } from "./text-test-helpers";

const ex = exercise("d003-write-04", "vocab_match");
const vocab = vocabLookup();
const en = () => within(screen.getByRole("group", { name: "คำภาษาอังกฤษ" }));
const th = () => within(screen.getByRole("group", { name: "ความหมายภาษาไทย" }));
const check = () => screen.getByRole("button", { name: "ตรวจคำตอบ" });
const word = (i: number) => vocab[ex.pairs[i].vocabId].word;
const meaning = (i: number) => vocab[ex.pairs[i].vocabId].th;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// the accessible name starts with the word and, once paired, continues "... จับคู่กับ ..."
const enBtn = (i: number) => en().getByRole("button", { name: new RegExp(`^${esc(word(i))}( |$)`) });
const thBtn = (i: number) => th().getByRole("button", { name: new RegExp(`^${esc(meaning(i))}( |$)`) });
const pair = (i: number, j: number) => {
  fireEvent.click(enBtn(i));
  fireEvent.click(thBtn(j));
};

describe("VocabMatch", () => {
  it("shows the Thai instruction, every English word and every meaning, meanings not in word order", () => {
    renderWithAudio(<VocabMatch {...baseProps()} exercise={ex} />);
    expect(screen.getByText("จับคู่คำกับความหมายภาษาไทย")).toBeInTheDocument();
    expect(en().getAllByRole("button").map((b) => b.textContent)).toEqual(ex.pairs.map((_, i) => word(i)));
    const meanings = th().getAllByRole("button").map((b) => b.textContent);
    expect([...meanings].sort()).toEqual(ex.pairs.map((_, i) => meaning(i)).sort());
    expect(meanings).not.toEqual(ex.pairs.map((_, i) => meaning(i)));
  });

  it("keeps check locked until every word is paired, then answers once with a complete map", () => {
    const props = baseProps();
    renderWithAudio(<VocabMatch {...props} exercise={ex} />);
    expect(check()).toBeDisabled();
    ex.pairs.forEach((_, i) => {
      pair(i, i);
      if (i < ex.pairs.length - 1) expect(check()).toBeDisabled();
    });
    expect(check()).toBeEnabled();
    fireEvent.click(check());
    fireEvent.click(check());
    expect(props.onAnswer).toHaveBeenCalledTimes(1);
    const answer = props.onAnswer.mock.calls[0][0];
    expect(answer).toEqual({ kind: "match", pairs: Object.fromEntries(ex.pairs.map((p) => [p.vocabId, p.vocabId])) });
    expect(gradeExercise(ex, answer)).toMatchObject({ correct: true });
  });

  it("supports a wrong pairing", () => {
    const props = baseProps();
    renderWithAudio(<VocabMatch {...props} exercise={ex} />);
    pair(0, 1);
    pair(1, 0);
    for (let i = 2; i < ex.pairs.length; i++) pair(i, i);
    fireEvent.click(check());
    const answer = props.onAnswer.mock.calls[0][0];
    expect(Object.keys(answer.pairs)).toHaveLength(ex.pairs.length);
    expect(gradeExercise(ex, answer)).toMatchObject({ correct: false, items: [false, false, true, true, true, true] });
  });

  it("describes a pairing in the accessible name of both sides", () => {
    renderWithAudio(<VocabMatch {...baseProps()} exercise={ex} />);
    pair(0, 1);
    expect(en().getByRole("button", { name: `${word(0)} จับคู่กับ ${meaning(1)}` })).toBeInTheDocument();
    expect(th().getByRole("button", { name: `${meaning(1)} จับคู่กับ ${word(0)}` })).toBeInTheDocument();
  });

  it("undoes a pair by tapping either side of it, and re-pairing works", () => {
    renderWithAudio(<VocabMatch {...baseProps()} exercise={ex} />);
    ex.pairs.forEach((_, i) => pair(i, i));
    expect(check()).toBeEnabled();
    fireEvent.click(enBtn(0));
    expect(check()).toBeDisabled();
    expect(enBtn(0)).toHaveAttribute("data-state", "idle");
    expect(thBtn(0)).toHaveAttribute("data-state", "idle");
    pair(0, 0);
    fireEvent.click(thBtn(1));
    expect(check()).toBeDisabled();
    expect(enBtn(1)).toHaveAttribute("data-state", "idle");
  });

  it("selected now looks different from already paired, uses aria-pressed, and tapping again deselects", () => {
    renderWithAudio(<VocabMatch {...baseProps()} exercise={ex} />);
    pair(0, 0);
    fireEvent.click(enBtn(1));
    expect(enBtn(1)).toHaveAttribute("aria-pressed", "true");
    expect(enBtn(1)).toHaveAttribute("data-state", "selected");
    expect(enBtn(0)).toHaveAttribute("aria-pressed", "false");
    expect(enBtn(0)).toHaveAttribute("data-state", "paired");
    expect(enBtn(1).className).not.toBe(enBtn(0).className);
    fireEvent.click(enBtn(1));
    expect(enBtn(1)).toHaveAttribute("aria-pressed", "false");
    expect(enBtn(1)).toHaveAttribute("data-state", "idle");
    fireEvent.click(thBtn(1)); // nothing selected, so nothing is paired
    expect(thBtn(1)).toHaveAttribute("data-state", "idle");
  });

  it("tapping a meaning first does nothing; selecting another word switches the selection", () => {
    renderWithAudio(<VocabMatch {...baseProps()} exercise={ex} />);
    fireEvent.click(thBtn(0));
    expect(thBtn(0)).toHaveAttribute("data-state", "idle");
    fireEvent.click(enBtn(0));
    fireEvent.click(enBtn(1));
    expect(enBtn(0)).toHaveAttribute("data-state", "idle");
    expect(enBtn(1)).toHaveAttribute("data-state", "selected");
  });

  it("after a result: locks, hides check, marks with text, and reveals the right meaning of each wrong pair", () => {
    const props = baseProps();
    const { rerender } = renderWithAudio(<VocabMatch {...props} exercise={ex} />);
    pair(0, 1);
    pair(1, 0);
    for (let i = 2; i < ex.pairs.length; i++) pair(i, i);
    fireEvent.click(check());
    rerender(<VocabMatch {...props} exercise={ex} result={{ correct: false, score: 4 / 6, items: [false, false, true, true, true, true] }} />);
    for (const b of [...en().getAllByRole("button"), ...th().getAllByRole("button")]) expect(b).toBeDisabled();
    expect(screen.queryByRole("button", { name: "ตรวจคำตอบ" })).toBeNull();
    expect(enBtn(0)).toHaveAttribute("data-state", "wrong");
    expect(enBtn(2)).toHaveAttribute("data-state", "right");
    expect(thBtn(1)).toHaveAttribute("data-state", "wrong");
    expect(screen.getAllByText("ผิด").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("ถูก").length).toBeGreaterThanOrEqual(4);
    // the right answer for each wrong pair is spelled out
    expect(screen.getByTestId(`reveal-${ex.pairs[0].vocabId}`)).toHaveTextContent(`${word(0)} → ${meaning(0)}`);
    expect(screen.getByTestId(`reveal-${ex.pairs[1].vocabId}`)).toHaveTextContent(`${word(1)} → ${meaning(1)}`);
    expect(screen.queryByTestId(`reveal-${ex.pairs[2].vocabId}`)).toBeNull();
  });
});
