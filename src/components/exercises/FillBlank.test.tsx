import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FillBlank } from "./FillBlank";
import { baseProps, exercise, renderWithAudio } from "./text-test-helpers";

const one = exercise("d003-write-03", "fill_blank");
const two = { ...one, text: "My ___ is Ann and I'm ___ Thailand.", answer: ["name", "from"] };
const check = () => screen.getByRole("button", { name: "ตรวจคำตอบ" });

describe("FillBlank", () => {
  it("renders the Thai instruction, the sentence and one input per ___", () => {
    renderWithAudio(<FillBlank {...baseProps()} exercise={one} />);
    expect(screen.getByText("เติมคำที่หายไป")).toBeInTheDocument();
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    expect(screen.getByText(/Where are you/)).toBeInTheDocument();
    expect(screen.queryByText(/___/)).toBeNull();
  });

  it("renders one input per blank for several blanks", () => {
    renderWithAudio(<FillBlank {...baseProps()} exercise={two} />);
    expect(screen.getAllByRole("textbox")).toHaveLength(2);
    expect(screen.getAllByRole("textbox")[0]).toHaveAttribute("autocapitalize", "none");
    expect(screen.getAllByRole("textbox")[0]).toHaveAttribute("spellcheck", "false");
  });

  it("keeps each input together with the punctuation next to it", () => {
    renderWithAudio(<FillBlank {...baseProps()} exercise={one} />);
    const box = screen.getByRole("textbox");
    expect(box.parentElement).toHaveClass("whitespace-nowrap");
    expect(box.parentElement).toHaveTextContent("?");
    expect(box.parentElement).not.toHaveTextContent("Where");
  });

  it("handles punctuation on both sides and blanks next to each other", () => {
    renderWithAudio(<FillBlank {...baseProps()} exercise={{ ...one, text: "Say (___), then ___.", answer: ["a", "b"] }} />);
    const [a, b] = screen.getAllByRole("textbox");
    expect(a.parentElement).toHaveTextContent("(),");
    expect(b.parentElement).toHaveTextContent(".");
    expect(screen.getByText(/Say/)).toBeInTheDocument();
  });

  it("asks for a done key on the keyboard", () => {
    renderWithAudio(<FillBlank {...baseProps()} exercise={one} />);
    expect(screen.getByRole("textbox")).toHaveAttribute("enterkeyhint", "done");
  });

  it("locks check until every blank is filled, then answers once with texts (right)", () => {
    const props = baseProps();
    renderWithAudio(<FillBlank {...props} exercise={two} />);
    const [a, b] = screen.getAllByRole("textbox");
    expect(check()).toBeDisabled();
    fireEvent.change(a, { target: { value: "name" } });
    expect(check()).toBeDisabled();
    fireEvent.change(b, { target: { value: "from" } });
    fireEvent.click(check());
    fireEvent.click(check());
    expect(props.onAnswer).toHaveBeenCalledTimes(1);
    expect(props.onAnswer).toHaveBeenCalledWith({ kind: "texts", texts: ["name", "from"] });
  });

  it("sends a wrong answer as typed", () => {
    const props = baseProps();
    renderWithAudio(<FillBlank {...props} exercise={one} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "to" } });
    fireEvent.click(check());
    expect(props.onAnswer).toHaveBeenCalledWith({ kind: "texts", texts: ["to"] });
  });

  it("locks inputs and highlights each blank from result.items", () => {
    const props = baseProps();
    const { rerender } = renderWithAudio(<FillBlank {...props} exercise={two} />);
    const [a, b] = screen.getAllByRole("textbox");
    fireEvent.change(a, { target: { value: "name" } });
    fireEvent.change(b, { target: { value: "in" } });
    fireEvent.click(check());
    rerender(<FillBlank {...props} exercise={two} result={{ correct: false, score: 0.5, items: [true, false] }} />);
    const boxes = screen.getAllByRole("textbox");
    expect(boxes[0]).toHaveAttribute("readonly");
    expect(boxes[1]).toHaveAttribute("readonly");
    expect(screen.queryByRole("button", { name: "ตรวจคำตอบ" })).toBeNull();
    expect(screen.getAllByText("ถูก")).toHaveLength(1);
    expect(screen.getAllByText("ผิด")).toHaveLength(1);
    expect(boxes[0]).not.toHaveAttribute("aria-invalid", "true");
    expect(boxes[1]).toHaveAttribute("aria-invalid", "true");
    expect(boxes[0]).toHaveAttribute("data-state", "right");
    expect(boxes[1]).toHaveAttribute("data-state", "wrong");
  });
});
