// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Exercise } from "../schema";
import { buildContext } from "./context";
import { checkPhonemeTagSounds, checkPhonemeTags } from "./phoneme-tags";
import { data, exId, instruction, lessonFile, vocabFile, vocabItem } from "./test-support";

const intro = (phoneme: string, ipa: string, n = 1): Exercise => ({
  id: exId(1, "pron", n), type: "phoneme_intro", instruction, phoneme, ipa, tipTh: "ทิป", examples: ["cat"],
});
const pair = (n: number, phonemes?: string[]): Exercise => ({
  id: exId(1, "pron", n), type: "minimal_pair", instruction, pairs: [{ a: "bad", b: "bed", answer: "a" }], ...(phonemes ? { phonemes } : {}),
});
const repeat = (n: number, phonemes?: string[]): Exercise => ({
  id: exId(1, "pron", n), type: "repeat_after_me", instruction, text: "A cat.", ...(phonemes ? { phonemes } : {}),
});
const check = (exercises: Exercise[], skill = "pronunciation") => {
  const file = lessonFile(1, [], exercises);
  file.lesson.sections[0].skill = skill as never;
  return checkPhonemeTags(buildContext(data([file], [vocabFile([vocabItem({ id: "v-cat" })])])));
};

describe("phoneme-tags: a pronunciation section that teaches more than one sound must tag every minimal_pair and repeat_after_me", () => {
  it("flags untagged items when the phoneme_intro introduces two sounds (day 18: /θ/ /ð/)", () => {
    const out = check([intro("th", "/θ/ /ð/"), pair(2), repeat(3)]);
    expect(out.map((p) => p.id)).toEqual(["d001-pron-02", "d001-pron-03"]);
    expect(out[0]).toMatchObject({ rule: "phoneme-tags", file: "content/lessons/day-001.json" });
    expect(out[0].severity).toBeUndefined();
    expect(out[0].message).toContain('"phonemes"');
    expect(out[0].message).toContain("/θ/");
    expect(out[0].message).toContain("/ð/");
    expect(out[0].message).toContain('"th"');
  });
  it("passes when every such item has its own phonemes array", () => {
    expect(check([intro("th", "/θ/ /ð/"), pair(2, ["th", "dh"]), repeat(3, ["dh"])])).toEqual([]);
  });
  it("flags only the items that are missing it", () => {
    expect(check([intro("th", "/θ/ /ð/"), pair(2, ["th", "dh"]), repeat(3)]).map((p) => p.id)).toEqual(["d001-pron-03"]);
  });
  it("flags a section whose items contrast two phoneme codes (day 19: v vs w) even if the intro names one", () => {
    const out = check([intro("w", "/w/"), pair(2, ["v", "w"]), repeat(3)]);
    expect(out.map((p) => p.id)).toEqual(["d001-pron-03"]);
    expect(out[0].message).toContain('"phonemes"');
  });
  it("flags a section with two phoneme_intro items", () => {
    expect(check([intro("v", "/v/"), intro("w", "/w/", 2), pair(3)]).map((p) => p.id)).toEqual(["d001-pron-03"]);
  });
  it("does not flag a section with one sound (default tag = the intro's phoneme)", () => {
    expect(check([intro("v", "/v/"), pair(2), repeat(3)])).toEqual([]);
    expect(check([intro("v", "/v/"), pair(2, ["v"]), repeat(3)])).toEqual([]);
  });
  it("does not flag sections without a phoneme_intro, or other sections", () => {
    expect(check([pair(2), repeat(3)])).toEqual([]);
    expect(check([intro("th", "/θ/ /ð/"), pair(2)], "speaking")).toEqual([]);
  });
});

describe("phoneme-tag-sounds: an item's IPA must contain at least one of the sounds its tags stand for", () => {
  const introY = (): Exercise => ({ id: exId(1, "pron", 1), type: "phoneme_intro", instruction, phoneme: "y", ipa: "/j/", tipTh: "ทิป", examples: ["yes"] });
  const introV = (): Exercise => ({ id: exId(1, "pron", 4), type: "phoneme_intro", instruction, phoneme: "v", ipa: "/v/", tipTh: "ทิป", examples: ["very"] });
  const rep = (n: number, text: string, ipa: string | undefined, phonemes: string[]): Exercise => ({ id: exId(1, "pron", n), type: "repeat_after_me", instruction, text, ...(ipa ? { ipa } : {}), phonemes });
  const bankWord = (w: string, ipa: string) => ({ ...vocabItem({ id: `v-${w}`, word: w }), ipa: { us: ipa, uk: ipa } });
  const run = (exs: Exercise[], items = [vocabItem({ id: "v-cat" })]) => {
    const file = lessonFile(1, [], exs);
    return checkPhonemeTagSounds(buildContext(data([file], [vocabFile(items)])));
  };
  it("flags an item tagged y whose ipa has no /j/ (the incident), naming the tag, the sound and the ipa", () => {
    const out = run([introY(), rep(2, "A big cat.", "/ə bɪɡ kæt/", ["y"])]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ rule: "phoneme-tags", file: "content/lessons/day-001.json", id: "d001-pron-02" });
    expect(out[0].severity).toBeUndefined();
    for (const t of ['"y"', "/j/", "/ə bɪɡ kæt/", "phonemes"]) expect(out[0].message).toContain(t);
  });
  it("passes when one of the tagged sounds is there (a contrast v/w needs only one of them)", () => {
    expect(run([introY(), rep(2, "Yes, a cat.", "/jes ə kæt/", ["y"])])).toEqual([]);
    expect(run([introV(), introY(), rep(2, "Very big.", "/ˈveri bɪɡ/", ["v", "y"])])).toEqual([]);
  });
  it("looks the words up in the vocab bank when the item has no ipa, but only judges when every word is known", () => {
    const items = [bankWord("big", "/bɪɡ/"), bankWord("cat", "/kæt/")];
    expect(run([introY(), rep(2, "A big cat", undefined, ["y"])], [...items, bankWord("a", "/ə/")])).toHaveLength(1);
    expect(run([introY(), rep(2, "A big dog", undefined, ["y"])], items)).toEqual([]);
  });
  it("checks minimal_pair words through the bank", () => {
    const mp: Exercise = { id: exId(1, "pron", 3), type: "minimal_pair", instruction, pairs: [{ a: "big", b: "bag", answer: "a" }], phonemes: ["y"] };
    expect(run([introY(), mp], [bankWord("big", "/bɪɡ/"), bankWord("bag", "/bæɡ/")])).toHaveLength(1);
    expect(run([introY(), mp], [bankWord("big", "/jɪɡ/"), bankWord("bag", "/bæɡ/")])).toEqual([]);
  });
  it("skips a tag no phoneme_intro defines (nothing to compare with) and untagged items", () => {
    expect(run([rep(2, "A big cat.", "/ə bɪɡ kæt/", ["zz"])])).toEqual([]);
    expect(run([introY(), { id: exId(1, "pron", 5), type: "repeat_after_me", instruction, text: "A cat.", ipa: "/ə kæt/" } as Exercise])).toEqual([]);
  });
});
