import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import NotFound from "./not-found";

describe("not-found page", () => {
  it("is a Thai status screen with ways back to the home page and the practice list", () => {
    render(<NotFound />);
    expect(screen.getByRole("heading", { level: 1, name: "ไม่พบหน้านี้" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "กลับหน้าแรก" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "ไปหน้าฝึกเพิ่ม" })).toHaveAttribute("href", "/practice");
  });
});
