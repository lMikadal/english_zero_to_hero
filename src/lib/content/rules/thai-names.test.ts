// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Exercise } from "../schema";
import { PLACE_NAMES, PROPER_NAMES, THAI_NAME_IS_A_WORD, THAI_NAMES } from "./allowlists";
import { buildContext } from "./context";
import { checkThaiNames, thaiNameMismatches } from "./thai-names";
import { data, exId, instruction, lessonFile, vocabFile, vocabItem } from "./test-support";

const forms = { Leo: "ลีโอ", Nan: "แนน", Ann: "แอน", Dan: "แดน", Pim: "พิม", Mai: "ไหม", Rose: "โรส" };
const names = (text: string, present = Object.keys(forms), table = forms) =>
  thaiNameMismatches(text, Object.fromEntries(Object.entries(table).filter(([n]) => present.includes(n)))).map((m) => [m.found, m.name]);

describe("thaiNameMismatches: a near-miss of a listed Thai spelling, found between particles", () => {
  it("finds the incidents: ลีโอว for ลีโอ, นัน for แนน", () => {
    expect(names("ลูกบอลของลีโอวอยู่ที่ไหน")).toEqual([["ลีโอว", "Leo"]]);
    expect(names("กระเป๋าของนันสีอะไร")).toEqual([["นัน", "Nan"]]);
    expect(names("นันอายุเท่าไร")).toEqual([["นัน", "Nan"]]);
  });
  it("accepts the exact spelling, and a name followed by a word that starts like a letter of it (ลีโอ + อยู่)", () => {
    expect(names("ลูกบอลของลีโออยู่ที่ไหน")).toEqual([]);
    expect(names("แนนอายุเท่าไร")).toEqual([]);
    expect(names("พ่อของแดนอายุเท่าไร")).toEqual([]);
    expect(names("แนนกับโรสอยู่ที่ไหน")).toEqual([]);
  });
  it("another listed name is never a misspelling (แอน is 1 edit from แนน)", () => {
    expect(names("กระเป๋าของแอนสีอะไร")).toEqual([]);
    expect(names("แดนกับแนน")).toEqual([]);
  });
  it("an ordinary word that merely shares letters is not a name (พ่อ, แนะนำ, กัน, ไม่)", () => {
    expect(names("พ่อของพ่ออายุเท่าไร")).toEqual([]);
    expect(names("แนะนำตัวกับเพื่อน")).toEqual([]);
    expect(names("ไม่ใช่ครับ ไหม")).toEqual([]);
  });
  it("names whose Thai spelling is an everyday word are not checked (ไหม the particle)", () => {
    expect(names("โรงเรียนใหญ่ไหม", ["Mai"])).toEqual([]);
    expect(names("ใหม่หรือไม่", ["Mai"])).toEqual([]);
  });
  it("a name that is not in the lesson's English is not checked", () => {
    expect(names("ลูกบอลของลีโอวอยู่ที่ไหน", ["Nan"])).toEqual([]);
  });
});

const read = (th: string): Exercise => ({ id: exId(1, "read"), type: "read_passage", instruction: { th }, text: "Leo is here.", questions: [{ question: { en: "Where is Leo?", th }, choices: ["a", "b"], answer: 0 }] });
const check = (ex: Exercise, table: Record<string, string> = { Leo: "ลีโอ" }, day = 1) => checkThaiNames(buildContext(data([lessonFile(day, [], [ex])], [vocabFile([vocabItem({ id: "v-cat" })])])), table);

describe("thai-names: lesson check", () => {
  it("errors on a mismatch, naming the file, exercise, both spellings and where to fix", () => {
    const out = check(read("ลูกบอลของลีโอวอยู่ที่ไหน"));
    expect(out.length).toBeGreaterThan(0);
    expect(out[0]).toMatchObject({ rule: "thai-names", file: "content/lessons/day-001.json", id: "d001-read-01" });
    expect(out[0].severity).toBeUndefined();
    expect(out[0].message).toContain("ลีโอว");
    expect(out[0].message).toContain("ลีโอ");
    expect(out[0].message).toContain('"Leo"');
    expect(out[0].message).toContain("THAI_NAMES");
  });
  it("passes the exact spelling", () => expect(check(read("ลูกบอลของลีโออยู่ที่ไหน"))).toEqual([]));
  it("warns once per name that appears in a lesson without a Thai spelling, saying exactly what to add and where", () => {
    const out = check(read("ลูกบอลของลีโออยู่ที่ไหน"), {});
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe("warning");
    expect(out[0].message).toContain('add the Thai spelling of "Leo" to THAI_NAMES in src/lib/content/rules/allowlists.ts');
  });
  it("does not warn for places or for names that do not appear in any lesson", () => {
    expect(checkThaiNames(buildContext(data([lessonFile(1, [], [{ id: exId(1, "read"), type: "repeat_after_me", instruction, text: "I am in Bangkok." } as Exercise])], [vocabFile([vocabItem({ id: "v-cat" })])])), {})).toEqual([]);
  });
});

describe("the real table", () => {
  it("lists only names of PROPER_NAMES, never a place, and each form is Thai", () => {
    for (const [n, th] of Object.entries(THAI_NAMES)) {
      expect(PROPER_NAMES, n).toContain(n);
      expect(PLACE_NAMES, n).not.toContain(n);
      expect(th).toMatch(/^[฀-๿]+$/);
    }
    for (const n of THAI_NAME_IS_A_WORD) expect(THAI_NAMES, n).toHaveProperty(n);
  });
  it("every person in PROPER_NAMES has a Thai spelling (a new name must add its own)", () => {
    expect(PROPER_NAMES.filter((n) => !PLACE_NAMES.includes(n) && !(n in THAI_NAMES))).toEqual([]);
  });
  it("two names never share a spelling", () => {
    const forms = Object.values(THAI_NAMES);
    expect(new Set(forms).size).toBe(forms.length);
  });
});
