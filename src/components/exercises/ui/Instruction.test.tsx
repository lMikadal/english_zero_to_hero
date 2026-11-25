import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Instruction } from "./Instruction";

describe("Instruction", () => {
  it("shows the Thai text as a heading and the English line marked lang=en", () => {
    render(<Instruction th="ฟังแล้วเลือก" en="Listen and choose" />);
    expect(screen.getByRole("heading", { name: "ฟังแล้วเลือก" })).toBeInTheDocument();
    expect(screen.getByText("Listen and choose")).toHaveAttribute("lang", "en");
  });

  it("omits the English line when there is none", () => {
    const { container } = render(<Instruction th="ฟังแล้วเลือก" />);
    expect(container.querySelector("[lang=en]")).toBeNull();
  });
});
