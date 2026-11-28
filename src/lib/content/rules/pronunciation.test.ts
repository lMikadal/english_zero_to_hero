// @vitest-environment node
import { describe, expect, it } from "vitest";
import { formatProblem } from "../loader";
import type { Exercise } from "../schema";
import { buildContext } from "./context";
import { HETERONYMS, checkPronunciation, ipaContains, namedIpaSymbols } from "./pronunciation";
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
  it("finds a symbol written right after Thai text, but not Thai words between slashes", () => {
    expect(namedIpaSymbols("เสียง/ɔː/ในคำ")).toEqual(["ɔː"]);
    expect(namedIpaSymbols("เลือกหรือ/และ/ก็ได้")).toEqual([]);
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

describe("ipaContains: whole phonemes, longest match", () => {
  it("does not find /ɪ/ inside aɪ, /e/ inside eɪ, /ɔː/ inside ɔɪ, /t/ inside tʃ", () => {
    expect(ipaContains("/maɪ/", "ɪ")).toBe(false);
    expect(ipaContains("/eɪ/", "e")).toBe(false);
    expect(ipaContains("/tʃɪn/", "t")).toBe(false);
    expect(ipaContains("/dʒɪm/", "d")).toBe(false);
  });
  it("finds whole phonemes, including long vowels and stressed syllables", () => {
    expect(ipaContains("/ðɪs ɪz/", "ɪ")).toBe(true);
    expect(ipaContains("/ˌfɔːrˈtiːn/", "ɔː")).toBe(true);
    expect(ipaContains("/ˌfɔːrˈtiːn/", "iː")).toBe(true);
    expect(ipaContains("/maɪ/", "aɪ")).toBe(true);
    expect(ipaContains("/pen/", "e")).toBe(true);
    expect(ipaContains("/tʃiːz/", "tʃ")).toBe(true);
  });
  it("does not mistake a long vowel for its short one", () => {
    expect(ipaContains("/siːt/", "ɪ")).toBe(false);
    expect(ipaContains("/siːt/", "i")).toBe(false);
  });
});

describe("ipaContains: typing variants are normalised, a short ɑ/ɔ/ɜ written without ː matches the bank's long vowel", () => {
  it("ASCII g = ɡ, ʧ = tʃ, ʤ = dʒ, ɹ = r (either side)", () => {
    expect(ipaContains("/ɡʊd/", "g")).toBe(true);
    expect(ipaContains("/gʊd/", "ɡ")).toBe(true);
    expect(ipaContains("/tʃiːz/", "ʧ")).toBe(true);
    expect(ipaContains("/dʒɪm/", "ʤ")).toBe(true);
    expect(ipaContains("/ˈfɑːðər/", "ɹ")).toBe(true);
    expect(ipaContains("/ʧiːz/", "tʃ")).toBe(true);
  });
  it("/ɑ/ matches ɑː, /ɔ/ matches ɔː, /ɜ/ matches ɜː, but not the other way round", () => {
    expect(ipaContains("/kɑːr/", "ɑ")).toBe(true);
    expect(ipaContains("/fɔːr/", "ɔ")).toBe(true);
    expect(ipaContains("/ɡɜːrl/", "ɜ")).toBe(true);
    expect(ipaContains("/kɑr/", "ɑː")).toBe(false);
  });
  it("real mistakes are still caught", () => {
    expect(ipaContains("/ˈhæpi/", "iː")).toBe(false); // happy
    expect(ipaContains("/eɪt/", "e")).toBe(false); // eight
    expect(ipaContains("/faɪv/", "ɪ")).toBe(false); // five
    expect(ipaContains("/ðɪs/", "d")).toBe(false); // this
    expect(ipaContains("/ˈmʌðər/", "θ")).toBe(false); // mother
    expect(ipaContains("/siːt/", "i")).toBe(false);
  });
});
