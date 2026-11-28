// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Exercise } from "../schema";
import { buildContext } from "./context";
import { checkStressClaims, primaryStressIndex, stressClaims as stressClaimsRaw } from "./stress-claims";
import { data, exId, lessonFile, vocabFile, vocabItem } from "./test-support";

const stressClaims = (t: string) => stressClaimsRaw(t).map(({ word, index }) => ({ word, index }));
const w = (word: string, us: string, uk = us) => ({ ...vocabItem({ id: `v-${word}`, word }), ipa: { us, uk } });
const repeat = (th: string): Exercise => ({ id: exId(1, "pron"), type: "repeat_after_me", instruction: { th }, text: "Hello." });
const BANK = [w("weekend", "/ˈwiːkend/", "/ˌwiːkˈend/"), w("banana", "/bəˈnænə/"), w("thirteen", "/ˌθɜːrˈtiːn/", "/ˌθɜːˈtiːn/")];
const run = (th: string, items = BANK) => checkStressClaims(buildContext(data([lessonFile(1, [], [repeat(th)])], [vocabFile(items)])));

describe("stressClaims reads capitals inside a word as the stressed syllable", () => {
  it("WEEKend = syllable 0, weekEND = 1, baNAna = 1, thirTEEN = 1, THIRty = 0", () => {
    expect(stressClaims("ออก WEEKend ให้ชัด")).toEqual([{ word: "weekend", index: 0 }]);
    expect(stressClaims("weekEND และ baNAna")).toEqual([{ word: "weekend", index: 1 }, { word: "banana", index: 1 }]);
    expect(stressClaims("thirTEEN กับ THIRty")).toEqual([{ word: "thirteen", index: 1 }, { word: "thirty", index: 0 }]);
  });
  it("ignores normal words, a capital first letter, all-capital words and abbreviations", () => {
    expect(stressClaims("Sam, OK, TV, UK และ Hello")).toEqual([]);
  });
});

describe("primaryStressIndex counts the vowels before the primary stress mark", () => {
  it("per accent, undefined for a one-syllable word", () => {
    expect(primaryStressIndex("/ˈwiːkend/")).toBe(0);
    expect(primaryStressIndex("/ˌwiːkˈend/")).toBe(1);
    expect(primaryStressIndex("/bəˈnænə/")).toBe(1);
    expect(primaryStressIndex("/kæt/")).toBeUndefined();
  });
});

describe("stress-claims (warning): a stress claim must agree with the vocab IPA", () => {
  it("flags weekend: WEEKend alone (US only) when UK stresses the second syllable; the message says to mention both", () => {
    const out = run("ออกเสียง WEEKend ให้เน้นพยางค์แรก");
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ rule: "stress-claims", severity: "warning", file: "content/lessons/day-001.json", id: "d001-pron-01" });
    for (const t of ['"weekend"', "US", "UK", "WEEKend", "/ˈwiːkend/", "/ˌwiːkˈend/", "syllable 1", "syllable 2", "both"]) expect(out[0].message).toContain(t);
  });
  it("accepts a claim that names both stress patterns when US and UK differ", () => {
    expect(run("weekend สำเนียงอเมริกัน WEEKend สำเนียงอังกฤษ weekEND")).toEqual([]);
  });
  it("accepts a claim that matches when both accents agree, flags one that matches neither", () => {
    expect(run("baNAna")).toEqual([]);
    const out = run("BAnana");
    expect(out).toHaveLength(1);
    expect(out[0].message).toContain("neither");
  });
  it("skips a word with no vocab entry and checks instruction.en and tipTh too", () => {
    expect(run("phoTOgraph")).toEqual([]);
    const tip: Exercise = { id: exId(1, "pron", 2), type: "phoneme_intro", instruction: { th: "ก" }, phoneme: "ae", ipa: "/æ/", tipTh: "baNAna กับ BAnana", examples: ["cat"] };
    expect(checkStressClaims(buildContext(data([lessonFile(1, [], [tip])], [vocabFile(BANK)])))).toHaveLength(1);
  });
});
