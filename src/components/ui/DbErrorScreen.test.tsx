import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DbErrorScreen } from "./DbErrorScreen";

describe("DbErrorScreen", () => {
  it("says in Thai that the database cannot be reached and offers a reload link", () => {
    render(<DbErrorScreen retryHref="/day/1" />);
    expect(screen.getByRole("alert")).toHaveTextContent("เชื่อมต่อฐานข้อมูลไม่ได้ ลองใหม่อีกครั้ง");
    expect(screen.getByRole("link", { name: "ลองใหม่" })).toHaveAttribute("href", "/day/1");
  });

  it("under the main nav it is not a full-screen page: the retry link sits right under the message, not pinned to the bottom where the nav floats", () => {
    const { container } = render(<DbErrorScreen retryHref="/" underNav />);
    expect(screen.getByRole("link", { name: "ลองใหม่" })).toHaveAttribute("href", "/");
    expect(container.querySelector(".min-h-dvh")).toBeNull();
    expect(container.querySelector(".flex-1")).toBeNull();
  });

  it("without a nav it fills the screen", () => {
    const { container } = render(<DbErrorScreen retryHref="/day/1" />);
    expect(container.querySelector(".min-h-dvh")).not.toBeNull();
  });
});
