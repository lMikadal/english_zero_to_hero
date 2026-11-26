import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Card, CardList } from "./Card";
import { ExerciseShell } from "./ExerciseShell";

describe("Card", () => {
  it("is a bordered card surface; tone is exposed as data-state and colours the border", () => {
    render(<Card data-testid="c">x</Card>);
    expect(screen.getByTestId("c").className).toMatch(/\bbg-card\b/);
    expect(screen.getByTestId("c").className).toMatch(/\bborder\b/);
    expect(screen.getByTestId("c").className).toMatch(/\bborder-line\b/);
    expect(screen.getByTestId("c")).toHaveAttribute("data-state", "idle");
  });

  it("right / wrong tones change the border colour and set data-state", () => {
    render(<><Card tone="right" data-testid="r">a</Card><Card tone="wrong" data-testid="w">b</Card></>);
    expect(screen.getByTestId("r").className).toMatch(/border-good/);
    expect(screen.getByTestId("r")).toHaveAttribute("data-state", "right");
    expect(screen.getByTestId("w").className).toMatch(/border-bad/);
  });

  it("CardList is a list with dividers and keeps its aria attributes", () => {
    render(<CardList aria-label="รายการ"><li>a</li><li>b</li></CardList>);
    const list = screen.getByRole("list", { name: "รายการ" });
    expect(list.className).toMatch(/divide-y/);
    expect(list.className).toMatch(/\bbg-card\b/);
  });
});

describe("ExerciseShell", () => {
  it("grows to fill the step so the check button can sit at the bottom", () => {
    const { container } = render(<ExerciseShell>x</ExerciseShell>);
    expect(container.firstElementChild?.tagName).toBe("SECTION");
    expect(container.firstElementChild?.className).toMatch(/\bflex-1\b/);
  });

  it("renders a form when onSubmit is given and prevents the page reload", () => {
    let called = 0;
    const { container } = render(<ExerciseShell onSubmit={() => { called++; }}><button type="submit">go</button></ExerciseShell>);
    expect(container.firstElementChild?.tagName).toBe("FORM");
    screen.getByRole("button", { name: "go" }).click();
    expect(called).toBe(1);
  });
});
