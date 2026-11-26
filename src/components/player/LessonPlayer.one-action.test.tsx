// Machine guard for the rule "only one primary action at the bottom of an exercise step" (design screens 03/04/15/19):
//   before the answer is checked: ตรวจคำตอบ (disabled until there is an answer), or the rating buttons for self-rated steps;
//   after it is checked: the feedback and ถัดไป. Never both ตรวจคำตอบ and ถัดไป. phoneme_intro has ถัดไป from the start.
// Runs the real LessonPlayer on every exercise of days 1-7 (all 13 types) and answers it through the UI.
import { act, fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { fakeAudio, renderWithAudio } from "@/components/exercises/test-helpers";
import { allExercises, get, readLesson } from "@/lib/answers/test-content";
import { getVocabLookup } from "@/lib/content/repo";
import { vocabIdsFor } from "@/app/(learn)/day/[day]/vocab-ids";
import type { Exercise, Lesson } from "@/lib/content/schema";
import type { SyncSink } from "@/lib/offline/sink";
import { LessonPlayer } from "./LessonPlayer";

vi.spyOn(window, "scrollTo").mockImplementation(() => {}); // jsdom has no layout

const sink = (): SyncSink => ({
  sendAttempt: vi.fn(),
  completeLesson: async () => ({ status: "queued" as const }),
  completePractice: async () => ({ status: "queued" as const }),
  pendingCount: () => 0,
  subscribe: () => () => {},
});

function lessonOf(day: number, exercises: Exercise[]): Lesson {
  return { ...readLesson(day), sections: [{ skill: "listening", title: { en: "Test", th: "ทดสอบ" }, exercises }] };
}
function render(day: number, exercises: Exercise[], audio = true) {
  const lesson = lessonOf(day, exercises);
  const vocab = getVocabLookup(vocabIdsFor(lesson));
  return { vocab, ...renderWithAudio(<LessonPlayer lesson={lesson} vocab={vocab} sink={sink()} />, fakeAudio(audio)) };
}

const SELF_RATED = ["repeat_after_me", "shadowing", "speak_answer"];
const FORM_TYPES = ["dictation", "translate_th_en", "fill_blank"];
const checkButtons = () => screen.queryAllByRole("button", { name: "ตรวจคำตอบ" });
const nextButtons = () => screen.queryAllByRole("button", { name: "ถัดไป" });
const radio = (scope: HTMLElement | typeof screen, name: string) => within(scope as HTMLElement).getByRole("radio", { name });

/** Everything needed to answer an exercise except the final "check". Resolves when the controls are on screen. */
async function fillIn(e: Exercise, vocab: ReturnType<typeof getVocabLookup>) {
  switch (e.type) {
    case "minimal_pair":
      for (const [i, p] of e.pairs.entries()) fireEvent.click(radio(await screen.findByRole("radiogroup", { name: `คู่ที่ ${i + 1}` }), p[p.answer]));
      return;
    case "listen_choose":
      fireEvent.click(radio(await screen.findByRole("radiogroup"), e.choices[e.answer]));
      return;
    case "read_passage":
      for (const [i, q] of e.questions.entries()) fireEvent.click(radio(await screen.findByRole("radiogroup", { name: `คำถามที่ ${i + 1}` }), q.choices[q.answer]));
      return;
    case "dictation":
      fireEvent.change(await screen.findByRole("textbox"), { target: { value: e.audioText } });
      return;
    case "translate_th_en":
      fireEvent.change(screen.getByRole("textbox"), { target: { value: e.accept[0] } });
      return;
    case "fill_blank":
      for (const [i, box] of screen.getAllByRole("textbox").entries()) fireEvent.change(box, { target: { value: e.answer[i] ?? e.answer[0] } });
      return;
    case "free_write":
      fireEvent.change(screen.getByRole("textbox"), { target: { value: Array.from({ length: e.minWords }, () => "word").join(" ") } });
      return;
    case "arrange_words": {
      const pool = screen.getByRole("list", { name: "คำที่เหลือ" });
      for (let i = 0; i < e.words.length; i++) fireEvent.click(within(pool).getAllByRole("button")[0]);
      return;
    }
    case "vocab_match":
      for (const p of e.pairs) {
        fireEvent.click(screen.getByRole("button", { name: vocab[p.vocabId].word }));
        fireEvent.click(screen.getByRole("button", { name: vocab[p.vocabId].th }));
      }
      return;
    default:
      throw new Error(`no answer recipe for ${e.type}`);
  }
}

const all = allExercises().map((l) => [l.exercise.id, l] as const);

describe("one primary action at a time (days 1-7, every exercise)", () => {
  it("covers all 13 exercise types", () => {
    expect(new Set(all.map(([, l]) => l.exercise.type)).size).toBe(13);
  });

  it.each(all)("%s", async (_id, { lesson, exercise: e }) => {
    const { vocab } = render(lesson.day, [e]);

    if (e.type === "phoneme_intro") {
      // nothing to answer: ถัดไป is there from the start, exactly once, and there is no check button
      expect(nextButtons()).toHaveLength(1);
      expect(checkButtons()).toHaveLength(0);
      return;
    }

    if (SELF_RATED.includes(e.type)) {
      // before rating: the rating buttons are the action; neither ตรวจคำตอบ nor ถัดไป is rendered
      expect(await screen.findByRole("button", { name: "พูดได้" })).toBeEnabled();
      expect(checkButtons()).toHaveLength(0);
      expect(nextButtons()).toHaveLength(0);
      await userEvent.click(screen.getByRole("button", { name: "พูดได้" }));
    } else {
      // before an answer: ตรวจคำตอบ only, and disabled
      const check = await waitForCheck();
      expect(check).toBeDisabled();
      expect(nextButtons()).toHaveLength(0);
      await fillIn(e, vocab);
      // answered but not yet checked: still only ตรวจคำตอบ, now enabled
      expect(checkButtons()).toHaveLength(1);
      expect(nextButtons()).toHaveLength(0);
      expect(checkButtons()[0]).toBeEnabled();
      await userEvent.click(checkButtons()[0]);
    }

    // after the check: the feedback and ถัดไป only
    expect(checkButtons()).toHaveLength(0);
    expect(nextButtons()).toHaveLength(1);
    expect(nextButtons()[0]).toBeEnabled();
    expect(screen.getByTestId("action-bar")).toContainElement(nextButtons()[0]);
    expect(screen.getByRole("status")).not.toBeEmptyDOMElement();
    // focus moved to the button that replaced the checked one, not lost to <body>
    expect(document.activeElement).toBe(nextButtons()[0]);
  });
});

async function waitForCheck() {
  return screen.findByRole("button", { name: "ตรวจคำตอบ" });
}

describe("Enter submits the three form exercises and focus follows to ถัดไป", () => {
  it.each(["d001-listen-02", "d001-write-02", "d003-write-03"])("%s", async (id) => {
    const e = get(id);
    expect(FORM_TYPES).toContain(e.type);
    const { vocab } = render(e.type === "fill_blank" ? 3 : 1, [e]);
    await fillIn(e, vocab);
    const field = screen.getAllByRole("textbox").at(-1)!;
    field.focus();
    await userEvent.keyboard("{Enter}");
    expect(checkButtons()).toHaveLength(0);
    expect(nextButtons()).toHaveLength(1);
    expect(document.activeElement).toBe(nextButtons()[0]);
  });
});

describe("the other paths keep a single action", () => {
  it("retry round: a wrong answer comes back once, with ตรวจคำตอบ and no ถัดไป until checked again", async () => {
    render(1, [get("d001-listen-01"), get("d001-listen-02")]);
    fireEvent.click(radio(await screen.findByRole("radiogroup"), "Ann")); // wrong
    await userEvent.click(checkButtons()[0]);
    expect(nextButtons()).toHaveLength(1);
    await userEvent.click(nextButtons()[0]);
    // second exercise: skip through it by answering
    fireEvent.change(await screen.findByRole("textbox"), { target: { value: "x" } });
    await userEvent.click(checkButtons()[0]);
    await userEvent.click(nextButtons()[0]);
    // retry round of the first
    expect(await screen.findByText("ทบทวนข้อที่ตอบผิด")).toBeInTheDocument();
    expect(checkButtons()).toHaveLength(1);
    expect(nextButtons()).toHaveLength(0);
    fireEvent.click(radio(screen.getByRole("radiogroup"), "Sam"));
    await userEvent.click(checkButtons()[0]);
    expect(checkButtons()).toHaveLength(0);
    expect(nextButtons()).toHaveLength(1);
  });

  it("no audio: ข้าม (a chip in the content) is the way on; ถัดไป is not shown and ตรวจคำตอบ stays disabled", async () => {
    render(1, [get("d001-listen-01")], false);
    await screen.findByRole("button", { name: "ข้าม" });
    expect(nextButtons()).toHaveLength(0);
    expect(checkButtons().every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
  });

  it("after ถัดไป the next exercise gets the heading focus, not the button", async () => {
    render(1, [get("d001-pron-01"), get("d001-listen-01")]);
    await userEvent.click(nextButtons()[0]);
    await act(async () => {});
    expect(document.activeElement).toBe(screen.getByRole("heading", { level: 2 }));
  });
});
