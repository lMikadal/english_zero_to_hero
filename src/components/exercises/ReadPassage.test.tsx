import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReadPassage } from "./ReadPassage";
import { baseProps, exercise, renderWithAudio } from "./text-test-helpers";

const ex = exercise("d001-read-01", "read_passage");
const check = () => screen.getByRole("button", { name: "ตรวจคำตอบ" });
const group = (i: number) => within(screen.getAllByRole("group")[i]);

describe("ReadPassage", () => {
  it("shows the instruction, passage lines with speaker labels, the glossary and every question", () => {
    renderWithAudio(<ReadPassage {...baseProps()} exercise={ex} />);
    expect(screen.getByText(ex.instruction.th)).toBeInTheDocument();
    const passage = screen.getByTestId("passage");
    expect(passage.textContent).toBe(ex.text);
    expect(passage).toHaveClass("whitespace-pre-line");
    expect(screen.getByText("too")).toBeInTheDocument();
    expect(screen.getByText("ด้วยเช่นกัน")).toBeInTheDocument();
    expect(screen.getAllByRole("group")).toHaveLength(ex.questions.length);
    expect(screen.getByText(ex.questions[0].question.th)).toBeInTheDocument();
  });

  it("locks check until every question has an answer, and lets the learner change an answer", () => {
    renderWithAudio(<ReadPassage {...baseProps()} exercise={ex} />);
    expect(check()).toBeDisabled();
    ex.questions.forEach((q, i) => {
      fireEvent.click(group(i).getByRole("button", { name: q.choices[0] }));
      if (i < ex.questions.length - 1) expect(check()).toBeDisabled();
    });
    expect(check()).toBeEnabled();
    const q0 = ex.questions[0];
    fireEvent.click(group(0).getByRole("button", { name: q0.choices[1] }));
    expect(group(0).getByRole("button", { name: q0.choices[1] })).toHaveAttribute("aria-pressed", "true");
    expect(group(0).getByRole("button", { name: q0.choices[0] })).toHaveAttribute("aria-pressed", "false");
  });

  it("answers once with the selected indexes (correct)", () => {
    const props = baseProps();
    renderWithAudio(<ReadPassage {...props} exercise={ex} />);
    ex.questions.forEach((q, i) => fireEvent.click(group(i).getByRole("button", { name: q.choices[q.answer] })));
    fireEvent.click(check());
    fireEvent.click(check());
    expect(props.onAnswer).toHaveBeenCalledTimes(1);
    expect(props.onAnswer).toHaveBeenCalledWith({ kind: "choices", selected: ex.questions.map((q) => q.answer) });
  });

  it("sends a wrong selection as chosen", () => {
    const props = baseProps();
    renderWithAudio(<ReadPassage {...props} exercise={ex} />);
    ex.questions.forEach((q, i) => fireEvent.click(group(i).getByRole("button", { name: q.choices[(q.answer + 1) % q.choices.length] })));
    fireEvent.click(check());
    expect(props.onAnswer).toHaveBeenCalledWith({ kind: "choices", selected: ex.questions.map((q) => (q.answer + 1) % q.choices.length) });
  });

  it("locks the choices and highlights per question from result.items", () => {
    const props = baseProps();
    const { rerender } = renderWithAudio(<ReadPassage {...props} exercise={ex} />);
    ex.questions.forEach((q, i) => fireEvent.click(group(i).getByRole("button", { name: q.choices[q.answer] })));
    fireEvent.click(check());
    const items = ex.questions.map((_, i) => i !== 0);
    rerender(<ReadPassage {...props} exercise={ex} result={{ correct: false, score: 0.5, items }} />);
    for (const b of screen.getAllByRole("button")) expect(b).toBeDisabled();
    const qs = screen.getAllByRole("group");
    expect(qs[0]).toHaveAttribute("data-state", "wrong");
    if (qs.length > 1) expect(qs[1]).toHaveAttribute("data-state", "right");
  });
});
