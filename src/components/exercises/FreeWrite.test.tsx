import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FreeWrite } from "./FreeWrite";
import { baseProps, exercise, renderWithAudio } from "./text-test-helpers";

const ex = exercise("d007-write-01", "free_write");
const box = () => screen.getByRole("textbox");
const check = () => screen.getByRole("button", { name: "ตรวจคำตอบ" });
const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ");

describe("FreeWrite", () => {
  it("shows the Thai instruction, the prompt and a 0 / minWords counter", () => {
    renderWithAudio(<FreeWrite {...baseProps()} exercise={ex} />);
    expect(screen.getByText(ex.instruction.th)).toBeInTheDocument();
    expect(screen.getByText(ex.prompt)).toBeInTheDocument();
    expect(screen.getByTestId("word-count")).toHaveTextContent(`0 / ${ex.minWords} คำ`);
    expect(box()).toHaveAttribute("lang", "en");
  });

  it("counts words live (ignoring punctuation-only tokens) and gates check on minWords", () => {
    renderWithAudio(<FreeWrite {...baseProps()} exercise={ex} />);
    fireEvent.change(box(), { target: { value: `${words(ex.minWords - 1)} - ,` } });
    expect(screen.getByTestId("word-count")).toHaveTextContent(`${ex.minWords - 1} / ${ex.minWords} คำ`);
    expect(check()).toBeDisabled();
    fireEvent.change(box(), { target: { value: words(ex.minWords) } });
    expect(check()).toBeEnabled();
  });

  it("answers once with the text and then shows a neutral saved note", () => {
    const props = baseProps();
    renderWithAudio(<FreeWrite {...props} exercise={ex} />);
    const text = words(ex.minWords);
    fireEvent.change(box(), { target: { value: text } });
    fireEvent.click(check());
    fireEvent.click(check());
    expect(props.onAnswer).toHaveBeenCalledTimes(1);
    expect(props.onAnswer).toHaveBeenCalledWith({ kind: "text", text });
    expect(screen.getByText("บันทึกแล้ว")).toBeInTheDocument();
    expect(box()).toBeDisabled();
  });

  it("locks the box after a result and never styles it as right or wrong", () => {
    const props = baseProps();
    const { rerender } = renderWithAudio(<FreeWrite {...props} exercise={ex} />);
    fireEvent.change(box(), { target: { value: words(ex.minWords) } });
    fireEvent.click(check());
    rerender(<FreeWrite {...props} exercise={ex} result={{ correct: true, score: null }} />);
    expect(box()).toBeDisabled();
    expect(box()).not.toHaveAttribute("data-state", "right");
    expect(box()).not.toHaveAttribute("data-state", "wrong");
    expect(screen.getByText("บันทึกแล้ว")).toBeInTheDocument();
  });
});
