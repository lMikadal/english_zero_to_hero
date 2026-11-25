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
const pair = (i: number, j: number) => {
  fireEvent.click(en().getByRole("button", { name: word(i) }));
  fireEvent.click(th().getByRole("button", { name: meaning(j) }));
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

  it("undoes a pair by tapping either side of it, and re-pairing works", () => {
    renderWithAudio(<VocabMatch {...baseProps()} exercise={ex} />);
    ex.pairs.forEach((_, i) => pair(i, i));
    expect(check()).toBeEnabled();
    fireEvent.click(en().getByRole("button", { name: word(0) }));
    expect(check()).toBeDisabled();
    expect(en().getByRole("button", { name: word(0) })).toHaveAttribute("data-state", "idle");
    expect(th().getByRole("button", { name: meaning(0) })).toHaveAttribute("data-state", "idle");
    pair(0, 0);
    fireEvent.click(th().getByRole("button", { name: meaning(1) }));
    expect(check()).toBeDisabled();
    expect(en().getByRole("button", { name: word(1) })).toHaveAttribute("data-state", "idle");
  });

  it("tapping a meaning first does nothing; selecting another word switches the selection", () => {
    renderWithAudio(<VocabMatch {...baseProps()} exercise={ex} />);
    fireEvent.click(th().getByRole("button", { name: meaning(0) }));
    expect(th().getByRole("button", { name: meaning(0) })).toHaveAttribute("data-state", "idle");
    fireEvent.click(en().getByRole("button", { name: word(0) }));
    fireEvent.click(en().getByRole("button", { name: word(1) }));
    expect(en().getByRole("button", { name: word(0) })).toHaveAttribute("data-state", "idle");
    expect(en().getByRole("button", { name: word(1) })).toHaveAttribute("data-state", "selected");
  });

  it("locks everything and highlights each pair from result.items", () => {
    const props = baseProps();
    const { rerender } = renderWithAudio(<VocabMatch {...props} exercise={ex} />);
    pair(0, 1);
    pair(1, 0);
    for (let i = 2; i < ex.pairs.length; i++) pair(i, i);
    fireEvent.click(check());
    rerender(<VocabMatch {...props} exercise={ex} result={{ correct: false, score: 4 / 6, items: [false, false, true, true, true, true] }} />);
    for (const b of [...en().getAllByRole("button"), ...th().getAllByRole("button")]) expect(b).toBeDisabled();
    expect(en().getByRole("button", { name: word(0) })).toHaveAttribute("data-state", "wrong");
    expect(en().getByRole("button", { name: word(2) })).toHaveAttribute("data-state", "right");
    expect(th().getByRole("button", { name: meaning(1) })).toHaveAttribute("data-state", "wrong");
  });
});
