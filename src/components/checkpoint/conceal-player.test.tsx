// Player-level version of conceal-guard.test.tsx (plan D5): the whole checkpoint player plays the fixture twice with the SAME
// learner inputs, once with the answer key set so they are right and once so they are wrong. Every screen before the result
// (frame, live region, focus, buttons, progress bar) must be identical, and nothing may be graded on the device.
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { fakeAudio, renderWithAudio } from "@/components/exercises/test-helpers";
import { LessonPlayer } from "@/components/player/LessonPlayer";
import { checkpointFixture, readLesson } from "@/lib/answers/test-content";
import type { Checkpoint } from "@/lib/content/checkpoint-schema";
import type { Exercise } from "@/lib/content/schema";
import { CheckpointPlayer } from "./CheckpointPlayer";
import { confirm, fakeCheckpointSink, fillIn, fixtureVocab, nextButton, SESSION } from "./test-support";

vi.spyOn(window, "scrollTo").mockImplementation(() => {});

/** The fixture with every answer key made right for "zzz" / the first option, or wrong for it. Keys only: nothing the learner sees. */
function keyed(cp: Checkpoint, right: boolean): Checkpoint {
  const flip = <T,>(a: T, b: T) => (right ? a : b);
  const fix = (e: Exercise): Exercise => {
    switch (e.type) {
      case "listen_choose": return { ...e, answer: flip(0, 1) };
      case "minimal_pair": return { ...e, pairs: e.pairs.map((p) => ({ ...p, answer: flip("a", "b") })) };
      case "read_passage": return { ...e, questions: e.questions.map((q) => ({ ...q, answer: flip(0, 1) })) };
      case "dictation": return { ...e, audioText: flip("zzz", e.audioText), accept: flip(["zzz"], e.accept) };
      case "translate_th_en": return { ...e, accept: flip(["zzz"], ["qqq"]) };
      case "fill_blank": return { ...e, answer: e.answer.map(() => flip("zzz", "qqq")) };
      default: return e; // arrange_words (the key shapes the pool) and vocab_match (no key in the content) are covered by conceal-guard
    }
  };
  return { ...cp, sections: cp.sections.map((s) => ({ ...s, exercises: s.exercises.map(fix) })) };
}

const describeFocus = () => {
  const a = document.activeElement as HTMLElement | null;
  return a ? `${a.tagName}|${a.getAttribute("aria-label") ?? ""}|${(a.textContent ?? "").trim().slice(0, 20)}` : "none";
};

async function walk(cp: Checkpoint) {
  const fake = fakeCheckpointSink();
  const view = renderWithAudio(
    <CheckpointPlayer checkpoint={cp} vocab={fixtureVocab} sink={fake.sink} sessionId={SESSION} practised={new Set()} onRestart={() => {}} />,
    fakeAudio(true),
  );
  const user = userEvent.setup();
  const frames: string[] = [];
  const snap = (label: string) => frames.push(`${label}\n${describeFocus()}\n${view.container.innerHTML}`);
  for (const e of cp.sections.flatMap((s) => s.exercises)) {
    snap(`${e.id} shown`);
    await fillIn(e, user);
    snap(`${e.id} filled`);
    await confirm(e, user);
    snap(`${e.id} answered`);
    await user.click(nextButton());
  }
  await screen.findByRole("heading", { level: 1, name: /ผลแบบทดสอบ/ });
  view.unmount();
  return frames;
}

describe("the checkpoint player shows nothing that depends on right or wrong", () => {
  it("plays the whole fixture with a right and with a wrong answer key: every screen, live region and focus is identical", async () => {
    const right = await walk(keyed(checkpointFixture, true));
    const wrong = await walk(keyed(checkpointFixture, false));
    expect(right.length).toBe(16 * 3);
    right.forEach((frame, i) => expect(wrong[i], `frame ${i}`).toBe(frame));
  }, 60_000);

  it("self-test: the lesson player, which does reveal, does differ between the same two runs (so this comparison can fail)", async () => {
    const run = async (right: boolean) => {
      const e = keyed(checkpointFixture, right).sections[1].exercises[0]; // listen_choose
      const lesson = { ...readLesson(1), sections: [{ skill: "listening" as const, title: { en: "L", th: "ฟัง" }, exercises: [e] }] };
      const fake = fakeCheckpointSink();
      const view = renderWithAudio(<LessonPlayer lesson={lesson} vocab={{}} sink={fake.sink} />, fakeAudio(true));
      const user = userEvent.setup();
      await user.click(screen.getAllByRole("radio")[0]);
      await user.click(screen.getByRole("button", { name: "ตรวจคำตอบ" }));
      const html = view.container.innerHTML;
      view.unmount();
      return html;
    };
    expect(await run(true)).not.toBe(await run(false));
  });
});
