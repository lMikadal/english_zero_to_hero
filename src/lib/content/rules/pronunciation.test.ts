// @vitest-environment node
import { describe, expect, it } from "vitest";
import { formatProblem } from "../loader";
import type { Exercise } from "../schema";
import { buildContext } from "./context";
import { HETERONYMS, checkPronunciation, namedIpaSymbols } from "./pronunciation";
import { data, exId, instruction, lessonFile, vocabFile, vocabItem } from "./test-support";

const check = (exercises: Exercise[], items = [vocabItem({ id: "v-cat", word: "cat" })]) =>
  checkPronunciation(buildContext(data([lessonFile(1, ["v-cat"], exercises)], [vocabFile(items)])));
const repeat = (text: string, ipa?: string, th = "ฟังแล้วพูดตาม"): Exercise => ({
  id: exId(1, "pron"), type: "repeat_after_me", instruction: { th }, text, ...(ipa ? { ipa } : {}),
});

describe("namedIpaSymbols", () => {
  it("finds symbols between slashes in Thai text, ignoring slash-separated words", () => {
    expect(namedIpaSymbols("ฝึกเสียง /ɔː/ และ /æ/ นะ")).toEqual(["ɔː", "æ"]);
    expect(namedIpaSymbols("(/iː/ ที่เรียนไป)")).toEqual(["iː"]);
    expect(namedIpaSymbols("am / is / are และ and/or/not")).toEqual([]);
    expect(namedIpaSymbols("ไม่มีเสียง")).toEqual([]);
  });
});

describe("pronunciation: IPA word count", () => {
  it("accepts matching counts (punctuation and slashes ignored)", () => {
    expect(check([repeat("Hello, Sam! Nice cat!", "/həˈloʊ sæm naɪs kæt/")])).toEqual([]);
  });
  it("flags an IPA line with a different number of words, naming file and exercise", () => {
    const out = check([repeat("Nice cat!", "/həˈloʊ sæm naɪs kæt/")]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ rule: "pronunciation", file: "content/lessons/day-001.json", id: "d001-pron-01" });
    expect(formatProblem(out[0])).toContain("4 word(s)");
    expect(out[0].message).toContain("2 word(s)");
  });
  it("does not require ipa to be present", () => expect(check([repeat("Nice cat!")])).toEqual([]));
});

describe("pronunciation: heteronyms in minimal pairs", () => {
  const pair = (a: string, b: string): Exercise => ({ id: exId(1, "pron", 2), type: "minimal_pair", instruction, pairs: [{ a, b, answer: "a" }] });
  it("lists the usual suspects", () => {
    for (const w of ["live", "read", "lead", "wind", "tear", "close", "bow", "row", "use", "present", "record", "object", "minute"]) expect(HETERONYMS).toContain(w);
  });
  it("flags a heteronym on either side (case-insensitive) and names the word", () => {
    const out = check([pair("Live", "leave")]);
    expect(out).toHaveLength(1);
    expect(out[0].message).toContain('"live"');
    expect(check([pair("beach", "read")])).toHaveLength(1);
  });
  it("accepts ordinary words", () => expect(check([pair("bad", "bed")])).toEqual([]));
});

describe("pronunciation: IPA symbols named in the instruction", () => {
  it("flags a symbol that the item's ipa does not contain", () => {
    const out = check([repeat("A big cat.", "/ə bɪɡ kæt/", "ฝึกเสียง /ɔː/ ในประโยคนี้")]);
    expect(out).toHaveLength(1);
    expect(out[0].message).toContain("/ɔː/");
  });
  it("accepts a symbol the ipa contains", () => expect(check([repeat("A cat.", "/ə kæt/", "ฝึกเสียง /æ/")])).toEqual([]));
  it("flags a named symbol when the item has no ipa at all", () => {
    expect(check([repeat("A cat.", undefined, "ฝึกเสียง /æ/")])).toHaveLength(1);
  });
  it("phoneme_intro: the symbol must be in its own ipa or the ipa of an example word; the tip may name other sounds", () => {
    const intro = (th: string, tipTh: string, examples = ["cat"]): Exercise => ({ id: exId(1, "pron", 3), type: "phoneme_intro", instruction: { th }, phoneme: "ae", ipa: "/æ/", tipTh, examples });
    expect(check([intro("ฟังเสียง /æ/", "ต่างจาก /ɑː/ ใน hot")])).toEqual([]);
    const out = check([intro("ฟังเสียง /ɔː/", "x")]);
    expect(out).toHaveLength(1);
    const items = [{ ...vocabItem({ id: "v-cat", word: "cat" }), ipa: { us: "/kɔːt/", uk: "/kɔːt/" } }];
    expect(check([intro("ฟังเสียง /ɔː/", "x")], items)).toEqual([]);
  });
});
