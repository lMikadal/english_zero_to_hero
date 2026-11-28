// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Exercise } from "../schema";
import { buildContext } from "./context";
import { checkPhonemeTags } from "./phoneme-tags";
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
