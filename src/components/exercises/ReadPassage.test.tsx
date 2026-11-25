import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReadPassage } from "./ReadPassage";
import { baseProps, exercise, renderWithAudio } from "./test-helpers";

const ex = exercise("d001-read-01", "read_passage");
const check = () => screen.getByRole("button", { name: "ตรวจคำตอบ" });
const group = (i: number) => within(screen.getAllByRole("radiogroup")[i]);

describe("ReadPassage", () => {
  it("shows the instruction, passage lines with speaker labels, the glossary and every question", () => {
    renderWithAudio(<ReadPassage {...baseProps()} exercise={ex} />);
    expect(screen.getByText(ex.instruction.th)).toBeInTheDocument();
    const passage = screen.getByTestId("passage");
    expect(passage.textContent).toBe(ex.text);
    expect(passage).toHaveClass("whitespace-pre-line");
    expect(screen.getByText("too")).toBeInTheDocument();
    expect(screen.getByText("ด้วยเช่นกัน")).toBeInTheDocument();
    expect(screen.getAllByRole("radiogroup")).toHaveLength(ex.questions.length);
    expect(screen.getByText(ex.questions[0].question.th)).toBeInTheDocument();
  });

  it("locks check until every question has an answer, and lets the learner change an answer", () => {
    renderWithAudio(<ReadPassage {...baseProps()} exercise={ex} />);
    expect(check()).toBeDisabled();
    ex.questions.forEach((q, i) => {
      fireEvent.click(group(i).getByRole("radio", { name: q.choices[0] }));
      if (i < ex.questions.length - 1) expect(check()).toBeDisabled();
    });
    expect(check()).toBeEnabled();
    const q0 = ex.questions[0];
    fireEvent.click(group(0).getByRole("radio", { name: q0.choices[1] }));
    expect(group(0).getByRole("radio", { name: q0.choices[1] })).toHaveAttribute("aria-checked", "true");
    expect(group(0).getByRole("radio", { name: q0.choices[0] })).toHaveAttribute("aria-checked", "false");
  });

  it("answers once with the selected indexes (correct)", () => {
    const props = baseProps();
    renderWithAudio(<ReadPassage {...props} exercise={ex} />);
    ex.questions.forEach((q, i) => fireEvent.click(group(i).getByRole("radio", { name: q.choices[q.answer] })));
    fireEvent.click(check());
    fireEvent.click(check());
    expect(props.onAnswer).toHaveBeenCalledTimes(1);
    expect(props.onAnswer).toHaveBeenCalledWith({ kind: "choices", selected: ex.questions.map((q) => q.answer) });
  });

  it("sends a wrong selection as chosen", () => {
    const props = baseProps();
    renderWithAudio(<ReadPassage {...props} exercise={ex} />);
    ex.questions.forEach((q, i) => fireEvent.click(group(i).getByRole("radio", { name: q.choices[(q.answer + 1) % q.choices.length] })));
    fireEvent.click(check());
    expect(props.onAnswer).toHaveBeenCalledWith({ kind: "choices", selected: ex.questions.map((q) => (q.answer + 1) % q.choices.length) });
  });

  it("locks the choices, highlights per question from result.items and marks right and wrong with text", () => {
    const props = baseProps();
    const { rerender } = renderWithAudio(<ReadPassage {...props} exercise={ex} />);
    ex.questions.forEach((q, i) => {
      const pick = i === 0 ? (q.answer + 1) % q.choices.length : q.answer;
      fireEvent.click(group(i).getByRole("radio", { name: q.choices[pick] }));
    });
    fireEvent.click(check());
    const items = ex.questions.map((_, i) => i !== 0);
    rerender(<ReadPassage {...props} exercise={ex} result={{ correct: false, score: 0.5, items }} />);
    for (const b of screen.getAllByRole("radio")) expect(b).toBeDisabled();
    expect(screen.queryByRole("button", { name: "ตรวจคำตอบ" })).toBeNull();
    const qs = screen.getAllByRole("radiogroup");
    expect(qs[0]).toHaveAttribute("data-state", "wrong");
    if (qs.length > 1) expect(qs[1]).toHaveAttribute("data-state", "right");
    // question 1: the wrong pick says "ผิด" and the right choice says "ถูก"
    expect(within(qs[0]).getByText("ผิด")).toBeInTheDocument();
    expect(within(qs[0]).getByText("ถูก")).toBeInTheDocument();
    if (qs.length > 1) {
      expect(within(qs[1]).getByText("ถูก")).toBeInTheDocument();
      expect(within(qs[1]).queryByText("ผิด")).toBeNull();
    }
  });
});
