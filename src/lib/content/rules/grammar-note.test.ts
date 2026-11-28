// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Exercise } from "../schema";
import type { LoadedLesson } from "../loader";
import { buildContext } from "./context";
import { GRAMMAR_NOTE_REQUIRED_SEVERITY, checkGrammarNote, checkGrammarNoteRequired } from "./grammar-note";
import { GRAMMAR_STRUCTURES } from "./grammar-not-yet";
import { checkTaughtWords } from "./taught-words";
import { checkGrammarNotYet } from "./grammar-not-yet";
import { data, exId, instruction, lessonFile, vocabFile, vocabItem } from "./test-support";

const note = (day: number, over: Record<string, unknown> = {}, n = 1): Exercise => ({
  id: exId(day, "read", n), type: "grammar_note", instruction, titleTh: "กริยาเติม s", bodyTh: "อธิบาย",
  examples: [{ en: "She likes tea.", th: "เธอชอบชา" }], structures: ["third-person-s"], ...over,
}) as Exercise;
const say = (day: number, text: string, n = 1): Exercise => ({ id: exId(day, "speak", n), type: "repeat_after_me", instruction, text });
const bank = ["like", "tea", "she", "he", "i", "you"].map((w) => vocabItem({ id: `v-${w}`, word: w, pos: w === "like" ? "verb" : "noun" }));
const ctxOf = (ls: LoadedLesson[]) => buildContext(data(ls, [vocabFile(bank)]));
const lessonWith = (day: number, sections: Exercise[][], skills: string[] = []): LoadedLesson => {
  const f = lessonFile(day, ["v-like", "v-tea"], sections[0]);
  f.lesson.sections = sections.map((exs, i) => ({ skill: (skills[i] ?? "reading") as never, title: { en: "x", th: "ก" }, exercises: exs }));
  return f;
};

describe("grammar-note: structure ids, placement, table", () => {
  it("passes a note that is the first exercise of a reading section, with known structure ids", () => {
    expect(checkGrammarNote(ctxOf([lessonWith(36, [[note(36), say(36, "I like tea.")]])]))).toEqual([]);
  });
  it("flags an unknown structure id and lists the valid ones", () => {
    const out = checkGrammarNote(ctxOf([lessonWith(36, [[note(36, { structures: ["third-person"] })]])]));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ rule: "grammar-note", file: "content/lessons/day-036.json", id: "d036-read-01" });
    expect(out[0].severity).toBeUndefined();
    expect(out[0].message).toContain('"third-person"');
    for (const id of Object.keys(GRAMMAR_STRUCTURES)) expect(out[0].message).toContain(id);
  });
  it("flags a note that is not the first exercise of its section", () => {
    const out = checkGrammarNote(ctxOf([lessonWith(36, [[say(36, "I like tea."), note(36)]])]));
    expect(out).toHaveLength(1);
    expect(out[0].message).toContain("first exercise of its section");
  });
  it("flags a note in a pronunciation section", () => {
    const out = checkGrammarNote(ctxOf([lessonWith(36, [[note(36)]], ["pronunciation"])]));
    expect(out).toHaveLength(1);
    expect(out[0].message).toContain("pronunciation");
  });
  it("allows one note per SECTION, each first in its section, so every card sits before the practice it explains", () => {
    expect(checkGrammarNote(ctxOf([lessonWith(37, [[note(37, { structures: ["do-does-question"] })], [note(37, { structures: ["do-not"] }, 2)]], ["listening", "writing"])]))).toEqual([]);
  });
  it("flags a structure listed in two notes of one lesson, naming both cards", () => {
    const out = checkGrammarNote(ctxOf([lessonWith(36, [[note(36)], [note(36, {}, 2)]], ["reading", "writing"])]));
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("d036-read-02");
    expect(out[0].message).toContain('"third-person-s"');
    expect(out[0].message).toContain("d036-read-01");
    expect(out[0].message).toContain("only one grammar_note");
  });
  it("flags a structure that is not taught before its day (a note cannot bring a form in early)", () => {
    const out = checkGrammarNote(ctxOf([lessonWith(10, [[note(10, { structures: ["has", "third-person-s", "do-not"] })]])]));
    expect(out).toHaveLength(3);
    expect(out[0].message).toContain('structure "has" is not taught before day 29');
    expect(out[1].message).toContain("day 36");
    expect(checkGrammarNote(ctxOf([lessonWith(29, [[note(29, { structures: ["has"] })]])]))).toEqual([]);
    expect(checkGrammarNote(ctxOf([lessonWith(36, [[note(36)]])]))).toEqual([]);
  });
  it("flags table rows with different numbers of cells", () => {
    const out = checkGrammarNote(ctxOf([lessonWith(36, [[note(36, { table: [["a", "b"], ["c"]] })]])]));
    expect(out).toHaveLength(1);
    expect(out[0].message).toContain("row 2");
  });
});

describe("a grammar_note makes its own structures allowed inside the note, and only there", () => {
  const gateCheck = (ls: LoadedLesson[]) => checkGrammarNotYet(ctxOf(ls));
  it("'likes' in the note's example on day 15 is allowed because the note names third-person-s; the same text elsewhere is not", () => {
    const bankVerb = [vocabItem({ id: "v-like", word: "like", pos: "verb" }), vocabItem({ id: "v-tea", word: "tea" })];
    const ls = [lessonWith(15, [[note(15, { table: [["he / she / it", "likes"]] }), say(15, "She likes tea.")]])];
    const out = checkGrammarNotYet(buildContext(data(ls, [vocabFile(bankVerb)])));
    expect(out.map((p) => p.id)).toEqual(["d015-speak-01"]);
    expect(gateCheck([lessonWith(15, [[note(15)]])]).filter((p) => p.id === "d015-read-01")).toEqual([]);
  });
  it("a note that does NOT name the structure does not make it allowed", () => {
    const bankVerb = [vocabItem({ id: "v-like", word: "like", pos: "verb" }), vocabItem({ id: "v-tea", word: "tea" })];
    const out = checkGrammarNotYet(buildContext(data([lessonWith(15, [[note(15, { structures: ["has"] })]])], [vocabFile(bankVerb)])));
    expect(out.map((p) => p.id)).toEqual(["d015-read-01"]);
  });
  it("English examples and English table cells are read by taught-words: an untaught word in a note is reported", () => {
    const out = checkTaughtWords(ctxOf([lessonWith(15, [[note(15, { examples: [{ en: "She likes zebras.", th: "ก" }], table: [["he", "zebra"]] })]])]));
    const msg = out.map((p) => p.message).join("\n");
    expect(msg).toContain('"zebras"');
    expect(msg).toContain("table[0][1]");
  });
});

describe("grammar-note-required: the first lesson that USES a gated structure carries a note for it", () => {
  const verbs = [vocabItem({ id: "v-like", word: "like", pos: "verb" }), vocabItem({ id: "v-tea", word: "tea" })];
  const run = (ls: LoadedLesson[]) => checkGrammarNoteRequired(buildContext(data(ls, [vocabFile(verbs)])));
  it("is a WARNING for now, switchable to an error with one constant", () => {
    expect(GRAMMAR_NOTE_REQUIRED_SEVERITY).toBe("warning");
  });
  it("warns when the first use of the structure has no note, naming the structure and what to add", () => {
    const out = run([lessonWith(36, [[say(36, "She likes tea.")]])]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ rule: "grammar-note-required", severity: "warning", file: "content/lessons/day-036.json" });
    expect(out[0].message).toContain('"third-person-s"');
    expect(out[0].message).toContain("grammar_note");
    expect(out[0].message).toContain("structures");
  });
  it("is satisfied by a note in the same lesson naming the structure", () => {
    expect(run([lessonWith(36, [[note(36), say(36, "She likes tea.")]])])).toEqual([]);
  });
  it("later lessons that use the structure again need no note", () => {
    expect(run([lessonWith(36, [[note(36), say(36, "She likes tea.")]]), lessonWith(37, [[say(37, "He likes tea.")]])])).toEqual([]);
  });
  it("a note on the FIRST using day is what counts, even if a later day has none", () => {
    expect(run([lessonWith(36, [[say(36, "She likes tea.")]]), lessonWith(37, [[note(37), say(37, "He likes tea.")]])])).toHaveLength(1);
  });
  it("a note naming another structure does not satisfy it", () => {
    expect(run([lessonWith(36, [[note(36, { structures: ["has"] }), say(36, "She likes tea.")]])])).toHaveLength(1);
  });
  it("text without a gated form is quiet", () => expect(run([lessonWith(36, [[say(36, "I like tea.")]])])).toEqual([]));
});
