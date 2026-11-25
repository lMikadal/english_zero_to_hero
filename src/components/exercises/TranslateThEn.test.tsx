import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TranslateThEn } from "./TranslateThEn";
import { baseProps, exercise, renderWithAudio } from "./text-test-helpers";

const ex = exercise("d001-write-02", "translate_th_en");
const input = () => screen.getByRole("textbox");
const check = () => screen.getByRole("button", { name: "ตรวจคำตอบ" });

describe("TranslateThEn", () => {
  it("shows the Thai instruction, the Thai prompt and an English-friendly input", () => {
    renderWithAudio(<TranslateThEn {...baseProps()} exercise={ex} />);
    expect(screen.getByText("แปลเป็นภาษาอังกฤษ")).toBeInTheDocument();
    expect(screen.getByText(ex.th)).toBeInTheDocument();
    expect(input()).toHaveAttribute("autocapitalize", "none");
    expect(input()).toHaveAttribute("autocorrect", "off");
    expect(input()).toHaveAttribute("spellcheck", "false");
    expect(input()).toHaveAttribute("lang", "en");
  });

  it("keeps check disabled until something is typed", () => {
    renderWithAudio(<TranslateThEn {...baseProps()} exercise={ex} />);
    expect(check()).toBeDisabled();
    fireEvent.change(input(), { target: { value: "   " } });
    expect(check()).toBeDisabled();
    fireEvent.change(input(), { target: { value: "Nice to meet you" } });
    expect(check()).toBeEnabled();
  });

  it("answers once with the typed text (right and wrong)", () => {
    const props = baseProps();
    renderWithAudio(<TranslateThEn {...props} exercise={ex} />);
    fireEvent.change(input(), { target: { value: "Nice to meet you" } });
    fireEvent.click(check());
    fireEvent.click(check());
    expect(props.onAnswer).toHaveBeenCalledTimes(1);
    expect(props.onAnswer).toHaveBeenCalledWith({ kind: "text", text: "Nice to meet you" });
  });

  it("submits with Enter and sends the wrong text as typed", () => {
    const props = baseProps();
    renderWithAudio(<TranslateThEn {...props} exercise={ex} />);
    fireEvent.change(input(), { target: { value: "see you" } });
    fireEvent.submit(input().closest("form")!);
    expect(props.onAnswer).toHaveBeenCalledWith({ kind: "text", text: "see you" });
  });

  it("locks the input and marks right or wrong once there is a result", () => {
    const props = baseProps();
    const { rerender } = renderWithAudio(<TranslateThEn {...props} exercise={ex} />);
    fireEvent.change(input(), { target: { value: "see you" } });
    fireEvent.click(check());
    rerender(<TranslateThEn {...props} exercise={ex} result={{ correct: false, score: 0 }} />);
    expect(input()).toBeDisabled();
    expect(check()).toBeDisabled();
    expect(input()).toHaveAttribute("data-state", "wrong");
    rerender(<TranslateThEn {...props} exercise={ex} result={{ correct: true, score: 1 }} />);
    expect(input()).toHaveAttribute("data-state", "right");
  });
});
