import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { gradeExercise } from "@/lib/answers/grade";
import { ArrangeWords } from "./ArrangeWords";
import { baseProps, exercise, renderWithAudio } from "./text-test-helpers";

const ex = exercise("d001-write-01", "arrange_words");
const placed = () => within(screen.getByRole("list", { name: "คำตอบของคุณ" }));
const pool = () => within(screen.getByRole("list", { name: "คำที่เหลือ" }));
const poolWords = () => pool().queryAllByRole("button").map((b) => b.textContent);
const tap = (w: string) => fireEvent.click(pool().getByRole("button", { name: w }));
const check = () => screen.getByRole("button", { name: "ตรวจคำตอบ" });

describe("ArrangeWords", () => {
  it("shows the Thai instruction and every tile, not in the correct order", () => {
    renderWithAudio(<ArrangeWords {...baseProps()} exercise={ex} />);
    expect(screen.getByText("เรียงคำให้เป็นประโยค")).toBeInTheDocument();
    expect([...poolWords()].sort()).toEqual([...ex.words].sort());
    expect(poolWords().join(" ")).not.toBe(ex.answer);
    expect(poolWords().join(" ")).not.toBe(ex.accept![0]);
  });

  it("is stable between renders (deterministic shuffle)", () => {
    const { unmount } = renderWithAudio(<ArrangeWords {...baseProps()} exercise={ex} />);
    const first = poolWords();
    unmount();
    renderWithAudio(<ArrangeWords {...baseProps()} exercise={ex} />);
    expect(poolWords()).toEqual(first);
  });

  it("locks check until every tile is used; tap to add and tap a placed tile to remove", () => {
    renderWithAudio(<ArrangeWords {...baseProps()} exercise={ex} />);
    expect(check()).toBeDisabled();
    tap("My");
    tap("name");
    expect(placed().getAllByRole("button").map((b) => b.textContent)).toEqual(["My", "name"]);
    expect(poolWords()).not.toContain("My");
    fireEvent.click(placed().getByRole("button", { name: "My" }));
    expect(placed().getAllByRole("button").map((b) => b.textContent)).toEqual(["name"]);
    expect(poolWords()).toContain("My");
    tap("My");
    tap("is");
    tap("Sam");
    expect(check()).toBeEnabled();
  });

  it("answers once with the tiles joined by single spaces (correct)", () => {
    const props = baseProps();
    renderWithAudio(<ArrangeWords {...props} exercise={ex} />);
    for (const w of ["My", "name", "is", "Sam"]) tap(w);
    fireEvent.click(check());
    fireEvent.click(check());
    expect(props.onAnswer).toHaveBeenCalledTimes(1);
    expect(props.onAnswer).toHaveBeenCalledWith({ kind: "text", text: "My name is Sam" });
  });

  it("can produce the accept alternative and a wrong order", () => {
    const a = baseProps();
    const r = renderWithAudio(<ArrangeWords {...a} exercise={ex} />);
    for (const w of ["Sam", "is", "My", "name"]) tap(w);
    fireEvent.click(check());
    const [alt] = a.onAnswer.mock.calls[0];
    expect(alt).toEqual({ kind: "text", text: "Sam is My name" });
    expect(gradeExercise(ex, alt)).toMatchObject({ correct: true });
    r.unmount();

    const b = baseProps();
    renderWithAudio(<ArrangeWords {...b} exercise={ex} />);
    for (const w of ["is", "Sam", "My", "name"]) tap(w);
    fireEvent.click(check());
    expect(gradeExercise(ex, b.onAnswer.mock.calls[0][0])).toMatchObject({ correct: false });
  });

  it("handles repeated words as separate tiles", () => {
    const dup = { ...ex, words: ["the", "cat", "the", "dog"], answer: "the cat the dog", accept: undefined };
    const props = baseProps();
    renderWithAudio(<ArrangeWords {...props} exercise={dup} />);
    for (const b of pool().getAllByRole("button")) fireEvent.click(b);
    expect(check()).toBeEnabled();
    expect(placed().getAllByRole("button")).toHaveLength(4);
  });

  it("locks the tiles and marks the answer after a result", () => {
    const props = baseProps();
    const { rerender } = renderWithAudio(<ArrangeWords {...props} exercise={ex} />);
    for (const w of ["is", "Sam", "My", "name"]) tap(w);
    fireEvent.click(check());
    rerender(<ArrangeWords {...props} exercise={ex} result={{ correct: false, score: 0 }} />);
    for (const b of placed().getAllByRole("button")) expect(b).toBeDisabled();
    expect(check()).toBeDisabled();
    expect(screen.getByRole("list", { name: "คำตอบของคุณ" })).toHaveAttribute("data-state", "wrong");
  });
});
