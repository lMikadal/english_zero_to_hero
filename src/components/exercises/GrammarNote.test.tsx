import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { fakeAudio, renderWithAudio } from "@/components/exercises/test-helpers";
import type { ExerciseOf } from "@/lib/content/schema";
import { GrammarNote } from "./GrammarNote";
import { renderExercise } from "./registry";

const exercise: ExerciseOf<"grammar_note"> = {
  id: "d036-read-01", type: "grammar_note", instruction: { th: "อ่านคำอธิบาย" }, titleTh: "กริยาเติม s", bodyTh: "ประธานเอกพจน์บุรุษที่สามใช้กริยาเติม s",
  table: [["ประธาน", "กริยา"], ["I / you / we / they", "like"], ["he / she / it", "likes"]],
  examples: [{ en: "She likes tea.", th: "เธอชอบชา" }, { en: "I like tea.", th: "ฉันชอบชา" }], structures: ["third-person-s"],
};

describe("GrammarNote (placeholder card until the real design lands)", () => {
  function setup() {
    const onAnswer = vi.fn();
    const onContinue = vi.fn();
    renderWithAudio(<GrammarNote exercise={exercise} vocab={{}} onAnswer={onAnswer} onContinue={onContinue} />, fakeAudio(true));
    return { onAnswer, onContinue };
  }
  it("shows the title, the body, the table cells and every example in English and Thai", () => {
    setup();
    // MixedText splits Latin words into their own spans, so Thai text with English inside is compared on the whole text
    const text = document.body.textContent ?? "";
    for (const t of [exercise.titleTh, exercise.bodyTh, "ประธาน", "he / she / it", "likes", "She likes tea.", "เธอชอบชา", "I like tea."]) expect(text, t).toContain(t);
  });
  it("never records an attempt: the button only continues", async () => {
    const { onAnswer, onContinue } = setup();
    await userEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(onAnswer).not.toHaveBeenCalled();
  });
  it("the registry renders it (the player must not show 'not supported')", () => {
    expect(renderExercise(exercise, { vocab: {}, onAnswer: () => {}, onContinue: () => {} })).not.toBeNull();
  });
});
