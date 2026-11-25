import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { fakeAudio, renderWithAudio } from "@/components/audio/audio-test-utils";
import { get } from "@/lib/answers/test-content";
import type { ExerciseOf } from "@/lib/content/schema";
import { MinimalPair } from "./MinimalPair";

// pairs: bad/bed (a), man/men (b), cat/cut (a)
const exercise = get("d001-pron-02") as ExerciseOf<"minimal_pair">;

function setup(props: Partial<React.ComponentProps<typeof MinimalPair>> = {}, available = true) {
  const onAnswer = vi.fn();
  const onContinue = vi.fn();
  const source = fakeAudio(available);
  const view = renderWithAudio(<MinimalPair exercise={exercise} vocab={{}} onAnswer={onAnswer} onContinue={onContinue} {...props} />, source);
  return { onAnswer, onContinue, source, ...view };
}
const pair = (i: number) => screen.getAllByRole("radiogroup")[i];
const card = (i: number) => screen.getAllByRole("group")[i];
const pick = (i: number, word: string) => userEvent.click(within(pair(i)).getByRole("radio", { name: word }));

describe("MinimalPair", () => {
  it("shows the Thai instruction and one group of two words per pair", () => {
    setup();
    expect(screen.getByText("ฟังแล้วเลือกคำที่ได้ยิน")).toBeInTheDocument();
    expect(screen.getAllByRole("radiogroup")).toHaveLength(3);
    expect(within(pair(1)).getAllByRole("radio").map((r) => r.textContent)).toEqual(["man", "men"]);
  });

  it("plays the word that is the answer of each pair", async () => {
    const { source } = setup();
    await userEvent.click(within(card(1)).getByRole("button", { name: "ฟัง" }));
    expect(source.play).toHaveBeenLastCalledWith("men", expect.objectContaining({ rate: 1 }));
    await userEvent.click(within(card(2)).getByRole("button", { name: /ฟังช้า/ }));
    expect(source.play).toHaveBeenLastCalledWith("cat", expect.objectContaining({ rate: 0.75 }));
  });

  it("cannot check until every pair has a choice", async () => {
    setup();
    await pick(0, "bad");
    await pick(1, "men");
    expect(screen.getByRole("button", { name: "ตรวจคำตอบ" })).toBeDisabled();
    await pick(2, "cut");
    expect(screen.getByRole("button", { name: "ตรวจคำตอบ" })).toBeEnabled();
  });

  it("sends a/b per pair once, right or wrong", async () => {
    const { onAnswer } = setup();
    await pick(0, "bed"); // wrong
    await pick(1, "men");
    await pick(2, "cat");
    await userEvent.click(screen.getByRole("button", { name: "ตรวจคำตอบ" }));
    await userEvent.click(screen.getByRole("button", { name: "ตรวจคำตอบ" }));
    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(onAnswer).toHaveBeenCalledWith({ kind: "pairs", selected: ["b", "b", "a"] });
  });

  it("can change a choice before checking", async () => {
    const { onAnswer } = setup();
    await pick(0, "bed");
    await pick(0, "bad");
    await pick(1, "men");
    await pick(2, "cat");
    await userEvent.click(screen.getByRole("button", { name: "ตรวจคำตอบ" }));
    expect(onAnswer).toHaveBeenCalledWith({ kind: "pairs", selected: ["a", "b", "a"] });
  });

  it("locks and marks each pair from result.items", async () => {
    const { rerender } = setup();
    await pick(0, "bed");
    await pick(1, "men");
    await pick(2, "cat");
    rerender(
      <MinimalPair exercise={exercise} vocab={{}} onAnswer={() => {}} onContinue={() => {}} result={{ correct: false, score: 2 / 3, items: [false, true, true] }} />,
    );
    expect(pair(0)).toHaveAttribute("data-state", "wrong");
    expect(pair(1)).toHaveAttribute("data-state", "correct");
    expect(pair(2)).toHaveAttribute("data-state", "correct");
    expect(within(pair(0)).getByRole("radio", { name: /bad/ })).toHaveAttribute("data-state", "correct"); // the right word is shown
    expect(within(pair(0)).getByRole("radio", { name: /bed/ })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "ตรวจคำตอบ" })).not.toBeInTheDocument();
  });

  it("without audio: a note and skip through onContinue only; the answer words are never listed", async () => {
    const { onAnswer, onContinue } = setup({}, false);
    expect(await screen.findByText("อุปกรณ์นี้ยังเล่นเสียงภาษาอังกฤษไม่ได้ ข้ามข้อนี้ไปก่อน")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "แสดงข้อความ" })).not.toBeInTheDocument();
    expect(screen.queryByText("bad, men, cat")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "ข้าม" }));
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it("marks the words lang=en", () => {
    setup();
    expect(within(pair(0)).getByRole("radio", { name: "bad" })).toHaveAttribute("lang", "en");
  });

  it("marks each pair and word with a glyph and hidden Thai text after the result", async () => {
    const { rerender } = setup();
    await pick(0, "bed");
    await pick(1, "men");
    await pick(2, "cat");
    rerender(
      <MinimalPair exercise={exercise} vocab={{}} onAnswer={() => {}} onContinue={() => {}} result={{ correct: false, score: 2 / 3, items: [false, true, true] }} />,
    );
    expect(card(0)).toHaveTextContent("ผิด");
    expect(card(0)).toHaveTextContent("✗");
    expect(card(1)).toHaveTextContent("ถูก");
    expect(card(1)).toHaveTextContent("✓");
  });

  it("moves and selects with the arrow keys inside a pair", async () => {
    setup();
    const radios = within(pair(0)).getAllByRole("radio");
    radios[0].focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(radios[1]).toHaveAttribute("aria-checked", "true");
    expect(radios[1]).toHaveFocus();
  });
});
