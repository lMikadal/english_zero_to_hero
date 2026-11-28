// @vitest-environment node
// Checkpoint files are "units" of text: the text rules (phrase-lint, the phoneme tag sound check) read them too, while the
// lesson-only rules (grammar notes, new-word load) must stay silent on them.
import { describe, expect, it } from "vitest";
import { checkpointFixture } from "@/lib/answers/test-content";
import type { Exercise } from "../schema";
import { checkpointFile, baseSections, baseLessons, baseVocab, cpId, section, world } from "./checkpoint-test-support";
import { buildContext } from "./context";
import { checkGrammarNote, checkGrammarNoteRequired } from "./grammar-note";
import { checkPhonemeTagSounds } from "./phoneme-tags";
import { checkPhraseLint } from "./phrase-lint";
import { checkNewWordsPerDay, checkVocabMatch, checkWeekRecycle, checkWordExposure } from "./word-load";
import { instruction } from "./test-support";

const say = (id: string, text: string, extra: Record<string, unknown> = {}): Exercise => ({ id, type: "repeat_after_me", instruction, text, ...extra }) as Exercise;
const withExtra = (ex: Exercise, skill: "speaking" | "pronunciation" = "speaking") => {
  const sections = baseSections().map((s) => (s.skill === skill ? { ...s, exercises: [...s.exercises, ex] } : s));
  return buildContext(world({ checkpoints: [checkpointFile({ sections })] }));
};

describe("text rules run on checkpoint units", () => {
  it("phrase-lint warns on a phrasing in a checkpoint file", () => {
    const out = checkPhraseLint(withExtra(say(cpId("speak", 9), "I order a coffee, please.")));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ rule: "phrase-lint", severity: "warning", file: "content/checkpoints/checkpoint-030.json", id: cpId("speak", 9) });
  });
  it("the phoneme tag sound check reads a checkpoint item tagged with a code whose sound it lacks", () => {
    const bad = say(cpId("pron", 9), "A cat.", { ipa: "/ə kæt/", phonemes: ["ae"] });
    const intro: Exercise = { id: "d001-pron-09", type: "phoneme_intro", instruction, phoneme: "y", ipa: "/j/", tipTh: "ก", examples: ["yes"] };
    const lessons = baseLessons();
    lessons[0].lesson.sections[0].exercises.push(intro);
    const sections = baseSections().map((s) => (s.skill === "pronunciation" ? { ...s, exercises: [...s.exercises, say(cpId("pron", 9), "A cat.", { ipa: "/ə kæt/", phonemes: ["y"] })] } : s));
    const out = checkPhonemeTagSounds(buildContext(world({ lessons, checkpoints: [checkpointFile({ sections })] })));
    const mine = out.filter((p) => p.id === cpId("pron", 9)); // the fixture's other items have placeholder IPA and trip it too
    expect(mine.map((p) => p.file)).toEqual(["content/checkpoints/checkpoint-030.json"]);
    expect(mine[0].message).toContain("/j/");
    expect(bad.type).toBe("repeat_after_me");
  });
});

describe("lesson-only rules stay silent on a checkpoint", () => {
  const ctx = buildContext({ ...world(), checkpoints: [checkpointFile(), { file: "content/checkpoints/checkpoint-030.json", checkpoint: checkpointFixture }].slice(0, 1) });
  const fixtureCtx = buildContext({ lessons: baseLessons(), vocab: baseVocab(), checkpoints: [{ file: "content/checkpoints/checkpoint-030.json", checkpoint: checkpointFixture }] });
  it.each([
    ["grammar-note", checkGrammarNote], ["grammar-note-required", checkGrammarNoteRequired], ["word-exposure", (c: typeof ctx) => checkWordExposure(c, 1)],
    ["week-recycle", (c: typeof ctx) => checkWeekRecycle(c, 1)], ["vocab-match", (c: typeof ctx) => checkVocabMatch(c, 1)], ["new-words-per-day", (c: typeof ctx) => checkNewWordsPerDay(c, 1)],
  ])("%s reports nothing for a checkpoint", (_name, rule) => {
    expect(rule(ctx).filter((p) => p.file.includes("checkpoint"))).toEqual([]);
    expect(rule(fixtureCtx).filter((p) => p.file.includes("checkpoint"))).toEqual([]);
  });
  it("a grammar_note planted in a checkpoint is the checkpoint rule's business (banned), not these", () => {
    const note: Exercise = { id: cpId("write", 9), type: "grammar_note", instruction, titleTh: "ก", bodyTh: "ก", examples: [{ en: "Hello cat.", th: "ก" }], structures: ["nope"] };
    const sections = baseSections().map((s) => (s.skill === "writing" ? { ...s, exercises: [note, ...s.exercises] } : s));
    expect(checkGrammarNote(buildContext(world({ checkpoints: [checkpointFile({ sections })] })))).toEqual([]);
    expect(section("writing", 0, []).skill).toBe("writing");
  });
});
