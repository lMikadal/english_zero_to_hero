import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CheckButton, CheckLabelContext } from "./CheckButton";

describe("CheckButton", () => {
  it("is a plain button by default and a submit button on request", () => {
    const { rerender } = render(<CheckButton disabled={false} />);
    expect(screen.getByRole("button", { name: "ตรวจคำตอบ" })).toHaveAttribute("type", "button");
    rerender(<CheckButton disabled={false} type="submit" />);
    expect(screen.getByRole("button", { name: "ตรวจคำตอบ" })).toHaveAttribute("type", "submit");
  });

  it("renders nothing once hidden (after a result)", () => {
    render(<CheckButton disabled={false} hidden />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("reads its label from CheckLabelContext, and defaults to ตรวจคำตอบ", () => {
    const { rerender } = render(<CheckButton disabled={false} />);
    expect(screen.getByRole("button")).toHaveTextContent("ตรวจคำตอบ");
    rerender(<CheckLabelContext.Provider value="ยืนยันคำตอบ"><CheckButton disabled={false} /></CheckLabelContext.Provider>);
    expect(screen.getByRole("button", { name: "ยืนยันคำตอบ" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "ตรวจคำตอบ" })).toBeNull();
  });

  it("the label applies to every exercise's own check button", async () => {
    const { renderExercise } = await import("../registry");
    const { weekOne } = await import("@/lib/answers/test-content");
    const { renderWithAudio } = await import("../test-helpers");
    const e = weekOne.flatMap((l) => l.sections.flatMap((s) => s.exercises)).find((x) => x.type === "translate_th_en")!;
    renderWithAudio(<CheckLabelContext.Provider value="ยืนยันคำตอบ">{renderExercise(e, { vocab: {}, onAnswer: () => {}, onContinue: () => {} })}</CheckLabelContext.Provider>);
    expect(screen.getByRole("button", { name: "ยืนยันคำตอบ" })).toBeInTheDocument();
  });
});
