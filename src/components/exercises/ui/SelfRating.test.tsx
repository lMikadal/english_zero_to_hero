import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SelfRating } from "./SelfRating";

describe("SelfRating", () => {
  it("offers พูดได้ and ยังไม่คล่อง and reports the choice", () => {
    const onRate = vi.fn();
    render(<SelfRating chosen={null} locked={false} onRate={onRate} />);
    fireEvent.click(screen.getByRole("button", { name: "ยังไม่คล่อง" }));
    expect(onRate).toHaveBeenCalledWith("unsure");
    fireEvent.click(screen.getByRole("button", { name: "พูดได้" }));
    expect(onRate).toHaveBeenLastCalledWith("ok");
  });

  it("marks the chosen one with aria-pressed and disables both when locked", () => {
    render(<SelfRating chosen="ok" locked onRate={() => {}} />);
    expect(screen.getByRole("button", { name: "พูดได้" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "ยังไม่คล่อง" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "พูดได้" })).toBeDisabled();
  });
});
