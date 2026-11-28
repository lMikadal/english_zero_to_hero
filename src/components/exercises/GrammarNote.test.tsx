import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { fakeAudio, renderWithAudio } from "@/components/exercises/test-helpers";
import { LessonPlayer } from "@/components/player/LessonPlayer";
import { readLesson } from "@/lib/answers/test-content";
import type { ExerciseOf } from "@/lib/content/schema";
import type { SyncSink } from "@/lib/offline/sink";
import { GrammarNote } from "./GrammarNote";
import { renderExercise } from "./registry";
import { smallTargets } from "./touch-target-check";

const exercise: ExerciseOf<"grammar_note"> = {
  id: "d036-read-01", type: "grammar_note", instruction: { th: "อ่านคำอธิบาย" }, titleTh: "กริยาเติม s",
  bodyTh: "ประธานเอกพจน์บุรุษที่สามใช้กริยาเติม s\nประธานอื่นใช้กริยาเดิม",
  table: [["ประธาน", "กริยา"], ["I / you / we / they", "like"], ["he / she / it", "likes"]],
  examples: [{ en: "She likes tea.", th: "เธอชอบชา" }, { en: "I like tea.", th: "ฉันชอบชา" }], structures: ["third-person-s"],
};
const longCell = "ประธานที่ยาวมากมากมากมากมากมากมากมากมากมากมากมาก / extraordinarily-long-english-cell-without-spaces";

function setup(ex = exercise, available = true) {
  const onAnswer = vi.fn();
  const onContinue = vi.fn();
  const source = fakeAudio(available);
  renderWithAudio(<GrammarNote exercise={ex} vocab={{}} onAnswer={onAnswer} onContinue={onContinue} />, source);
  return { onAnswer, onContinue, source };
}

describe("GrammarNote", () => {
  it("shows the title, each body line, the table cells and every example in English and Thai", () => {
    setup();
    const text = document.body.textContent ?? "";
    for (const t of ["กริยาเติม s", "ประธานเอกพจน์บุรุษที่สามใช้กริยาเติม s", "ประธานอื่นใช้กริยาเดิม", "he / she / it", "likes", "She likes tea.", "เธอชอบชา", "I like tea."]) expect(text, t).toContain(t);
  });
  it("body lines are separate paragraphs", () => {
    setup();
    expect(screen.getByText("ประธานอื่นใช้กริยาเดิม").closest("p")).not.toBe(screen.getByText(/ประธานเอกพจน์บุรุษที่สาม/).closest("p"));
  });
  it("is labelled as grammar (not a graded exercise): a visible ไวยากรณ์ label and no answer controls", () => {
    setup();
    expect(screen.getByText("ไวยากรณ์")).toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "ตรวจคำตอบ" })).not.toBeInTheDocument();
  });
  it("heading order: the instruction is h3 and the title is the h4 under it", () => {
    setup();
    expect(screen.getByRole("heading", { level: 3, name: "อ่านคำอธิบาย" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 4 }).textContent).toBe("กริยาเติม s");
  });
  it("the table has a name, column headers with scope=col, and one data row per body row", () => {
    setup();
    const table = screen.getByRole("table", { name: /กริยาเติม s/ });
    const heads = within(table).getAllByRole("columnheader");
    expect(heads.map((h) => h.textContent)).toEqual(["ประธาน", "กริยา"]);
    for (const h of heads) expect(h).toHaveAttribute("scope", "col");
    expect(within(table).getAllByRole("row")).toHaveLength(3);
    expect(within(table).getAllByRole("cell")).toHaveLength(4);
  });
  it("English in the table, body and examples carries lang=en", () => {
    setup();
    const table = screen.getByRole("table");
    expect(within(table).getByText("likes")).toHaveAttribute("lang", "en");
    expect(screen.getByText("She likes tea.")).toHaveAttribute("lang", "en");
  });
  it("without a table, no table is rendered", () => {
    setup({ ...exercise, table: undefined });
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
  it("each example's play buttons name the sentence, and play it at both speeds", async () => {
    const { source } = setup();
    await userEvent.click(screen.getByRole("button", { name: "ฟัง I like tea." }));
    expect(source.play).toHaveBeenLastCalledWith("I like tea.", expect.objectContaining({ rate: 1 }));
    await userEvent.click(screen.getByRole("button", { name: "ฟังช้า 0.75× She likes tea." }));
    expect(source.play).toHaveBeenLastCalledWith("She likes tea.", expect.objectContaining({ rate: 0.75 }));
  });
  it("never records an attempt: the button only continues", async () => {
    const { onAnswer, onContinue } = setup();
    await userEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(onAnswer).not.toHaveBeenCalled();
  });
  it("without audio: examples stay visible, the learner is told, and ถัดไป is the only way on", async () => {
    const { onContinue } = setup(exercise, false);
    await screen.findByText("อุปกรณ์นี้ไม่มีเสียงภาษาอังกฤษ");
    expect(screen.getByText("She likes tea.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "ข้าม" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });
  it("two examples with the same English text both render", () => {
    setup({ ...exercise, examples: [{ en: "I like tea.", th: "ก" }, { en: "I like tea.", th: "ข" }] });
    expect(screen.getAllByText("I like tea.")).toHaveLength(2);
  });
  it("every interactive element has a 44px minimum height class", () => {
    const { container } = renderWithAudio(<GrammarNote exercise={exercise} vocab={{}} onAnswer={vi.fn()} onContinue={vi.fn()} />, fakeAudio(true));
    expect(smallTargets(container)).toEqual([]);
  });
  it("360px guard (class-based, jsdom has no layout): the table scrolls inside its own wrapper, cells wrap, nothing is nowrap", () => {
    const long = { ...exercise, table: [["ประธาน", "กริยา", "ตัวอย่าง"], [longCell, "x", "y"]], bodyTh: longCell };
    const { container } = renderWithAudio(<GrammarNote exercise={long} vocab={{}} onAnswer={vi.fn()} onContinue={vi.fn()} />, fakeAudio(true));
    const table = screen.getByRole("table");
    const wrapper = table.parentElement!;
    expect(wrapper.className).toContain("overflow-x-auto");
    expect(wrapper).toHaveAttribute("tabindex", "0"); // keyboard users can scroll it
    expect(wrapper).toHaveAccessibleName(/กริยาเติม s/);
    for (const cell of within(table).getAllByRole("cell")) expect(cell.className).toContain("break-words");
    expect(container.innerHTML).not.toMatch(/whitespace-nowrap|\bw-\[\d|min-w-\[/);
  });
  it("the registry renders it", () => {
    expect(renderExercise(exercise, { vocab: {}, onAnswer: () => {}, onContinue: () => {} })).not.toBeNull();
  });
});

describe("GrammarNote inside the lesson player", () => {
  const sink = () => ({
    sendAttempt: vi.fn(), completeLesson: async () => ({ status: "queued" as const }), completePractice: async () => ({ status: "queued" as const }),
    sendReview: vi.fn(), completeReview: async () => ({ status: "queued" as const }), pendingCount: () => 0, subscribe: () => () => {},
  }) satisfies SyncSink;
  it("has exactly one primary action, enabled at once, and moving on sends nothing", async () => {
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    const s = sink();
    const lesson = { ...readLesson(1), sections: [{ skill: "reading" as const, title: { en: "Reading", th: "อ่าน" }, exercises: [exercise, { ...exercise, id: "d036-read-02" }] }] };
    renderWithAudio(<LessonPlayer lesson={lesson} vocab={{}} sink={s} />, fakeAudio(true));
    const next = screen.getByRole("button", { name: "ถัดไป" });
    expect(next).toBeEnabled();
    expect(screen.queryAllByRole("button", { name: "ตรวจคำตอบ" })).toHaveLength(0);
    expect(screen.getAllByRole("button", { name: "ถัดไป" })).toHaveLength(1);
    await userEvent.click(next);
    expect(screen.getByText("ข้อ 2 / 2")).toBeInTheDocument();
    expect(s.sendAttempt).not.toHaveBeenCalled();
  });
});
