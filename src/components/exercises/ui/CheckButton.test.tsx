import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CheckButton } from "./CheckButton";

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
});
