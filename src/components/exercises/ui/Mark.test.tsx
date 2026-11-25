import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CheckButton } from "./CheckButton";
import { Mark } from "./Mark";

describe("Mark", () => {
  it("shows a check with hidden Thai text for right", () => {
    render(<Mark ok />);
    expect(screen.getByText("ถูก")).toHaveClass("sr-only");
    expect(screen.getByText("✓")).toHaveAttribute("aria-hidden", "true");
  });
  it("shows a cross with hidden Thai text for wrong", () => {
    render(<Mark ok={false} />);
    expect(screen.getByText("ผิด")).toHaveClass("sr-only");
    expect(screen.getByText("✗")).toHaveAttribute("aria-hidden", "true");
  });
});

describe("CheckButton", () => {
  it("renders nothing when hidden", () => {
    render(<CheckButton disabled={false} hidden />);
    expect(screen.queryByRole("button")).toBeNull();
  });
  it("renders the Thai label otherwise", () => {
    render(<CheckButton disabled />);
    expect(screen.getByRole("button", { name: "ตรวจคำตอบ" })).toBeDisabled();
  });
});
