import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DbErrorScreen } from "./DbErrorScreen";

describe("DbErrorScreen", () => {
  it("says in Thai that the database cannot be reached and offers a reload link", () => {
    render(<DbErrorScreen retryHref="/day/1" />);
    expect(screen.getByRole("alert")).toHaveTextContent("เชื่อมต่อฐานข้อมูลไม่ได้ ลองใหม่อีกครั้ง");
    expect(screen.getByRole("link", { name: "ลองใหม่" })).toHaveAttribute("href", "/day/1");
  });
});
