import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Page from "./page";

describe("progress placeholder page", () => {
  it("has its Thai heading and one honest line that the feature is not available yet", () => {
    render(<Page />);
    expect(screen.getByRole("heading", { level: 1, name: "พัฒนาการ" })).toBeInTheDocument();
    expect(screen.getByText("ยังไม่เปิดใช้ในเวอร์ชันนี้")).toBeInTheDocument();
  });

  it("has no buttons, links or inputs (nothing fake to press)", () => {
    render(<Page />);
    expect(screen.queryAllByRole("button")).toEqual([]);
    expect(screen.queryAllByRole("link")).toEqual([]);
    expect(screen.queryAllByRole("textbox")).toEqual([]);
  });
});
