// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Exercise } from "../schema";
import { buildContext } from "./context";
import { GRAMMAR_NOTE_MAX_BODY, GRAMMAR_NOTE_MAX_ROWS, bodyLength, checkGrammarNoteLength } from "./grammar-note-length";
import { data, exId, instruction, lessonFile, vocabFile, vocabItem } from "./test-support";

const note = (over: Record<string, unknown>): Exercise => ({
  id: exId(36, "read"), type: "grammar_note", instruction, titleTh: "ก", bodyTh: "อธิบายสั้น ๆ", examples: [{ en: "She likes tea.", th: "ก" }], structures: ["third-person-s"], ...over,
}) as Exercise;
const run = (ex: Exercise) => checkGrammarNoteLength(buildContext(data([lessonFile(36, [], [ex])], [vocabFile([vocabItem({ id: "v-cat" })])])));

describe("bodyLength counts what the learner sees: Thai vowel signs and tone marks do not add to the count", () => {
  it("counts base letters, spaces, Latin and symbols, not combining marks", () => {
    expect(bodyLength("abc")).toBe(3);
    expect(bodyLength("ก่")).toBe(1); // consonant + tone mark
    expect(bodyLength("กิน")).toBe(2); // ก ิ น: the vowel sign above is not counted
    expect(bodyLength("เก็บ")).toBe(3); // เ ก ็ บ
    expect(bodyLength("a ✗ → b ✓")).toBe(9);
  });
  it("the limits are 400 characters and 6 table rows including the header", () => {
    expect([GRAMMAR_NOTE_MAX_BODY, GRAMMAR_NOTE_MAX_ROWS]).toEqual([400, 6]);
  });
});

describe("grammar-note-length (a body over 400 characters is an error; the other checks warn)", () => {
  it("is quiet at exactly 400 characters and 6 rows, and without a table", () => {
    expect(run(note({ bodyTh: "ก".repeat(400), table: Array.from({ length: 6 }, () => ["ก", "ข"]) }))).toEqual([]);
  });
  it("warns for a body of 401 characters, saying the count and the target", () => {
    const out = run(note({ bodyTh: "ก".repeat(401) }));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ rule: "grammar-note-length", file: "content/lessons/day-036.json", id: "d036-read-01" });
    expect(out[0].severity).toBeUndefined();
    expect(out[0].message).toContain("401");
    expect(out[0].message).toContain("400");
    expect(out[0].message).toContain("350");
  });
  it("tone marks do not push a body over the limit", () => {
    expect(run(note({ bodyTh: "ก่".repeat(400) }))).toEqual([]);
  });
  it("warns for a table of 7 rows (header included), saying how to shorten it", () => {
    const out = run(note({ table: Array.from({ length: 7 }, () => ["ก", "ข"]) }));
    expect(out).toHaveLength(1);
    expect(out[0].message).toContain("7 rows");
    expect(out[0].message).toContain("at most 6");
  });
  it("warns when a 'ผิดบ่อย' wrong form (✗) has no right form (✓) after it (the incident)", () => {
    const out = run(note({ bodyTh: "ผิดบ่อย: I have tea always ✗ และ I don't never drink coffee ✗ sometimes วางต้นประโยคได้" }));
    expect(out).toHaveLength(1);
    expect(out[0].message).toContain('"I have tea always"');
    expect(out[0].message).toContain("✗ → ");
    expect(out[0].message).toContain("✓");
  });
  it("a compact list is fine: 'A ✗ / B ✗ → A2 ✓ / B2 ✓' and one right form for two wrong ones", () => {
    expect(run(note({ bodyTh: "ผิดบ่อย: No, I not ✗ / No, she don't ✗ → No, I don't ✓ / No, she doesn't ✓" }))).toEqual([]);
    expect(run(note({ bodyTh: "ผิดบ่อย: she go ✗ / she gos ✗ → she goes ✓ ออกเสียง goes /ɡoʊz/" }))).toEqual([]);
  });
  it("warns for the last wrong form when only the first has its right form", () => {
    const out = run(note({ bodyTh: "ผิดบ่อย: I have tea always ✗ → I always have tea ✓ และ I never not drink ✗ จบ" }));
    expect(out).toHaveLength(1);
    expect(out[0].message).toContain('"I never not drink"');
    expect(out[0].message).not.toContain('"I have tea always"');
  });
  it("accepts every wrong form followed by its right form", () => {
    expect(run(note({ bodyTh: "ผิดบ่อย: I have tea always ✗ → I always have tea ✓ และ I don't never drink coffee ✗ → I never drink coffee ✓ ส่วน sometimes วางต้นประโยคได้" }))).toEqual([]);
    expect(run(note({ bodyTh: "ใช้เมื่อพูดถึงสิ่งที่ทำเป็นประจำ ✗ ไม่ใช่ส่วนผิดบ่อย" }))).toEqual([]); // only the ผิดบ่อย segment is read
  });
});
