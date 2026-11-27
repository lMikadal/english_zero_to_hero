// @vitest-environment node
import { describe, expect, it } from "vitest";
import { formatProblem } from "../loader";
import { buildContext } from "./context";
import { checkGlossUniqueness, glossItems } from "./gloss";
import { data, exId, instruction, lessonFile, vocabFile, vocabItem } from "./test-support";

const dictation = (day: number) => ({ id: exId(day, "listen"), type: "dictation" as const, instruction, audioText: "Hi." });

describe("glossItems", () => {
  it("splits on commas and ignores anything in parentheses", () => {
    expect(glossItems("สบายดี, ไม่เป็นไร")).toEqual(["สบายดี", "ไม่เป็นไร"]);
    expect(glossItems("ไม่ (วางหลัง am / is / are)")).toEqual(["ไม่"]);
    expect(glossItems("ได้รู้จัก, พบ (ใครสักคน)")).toEqual(["ได้รู้จัก", "พบ"]);
    expect(glossItems("ยี่สิบ (20, ตัวเลข)")).toEqual(["ยี่สิบ"]);
  });
  it("drops empty items and trims", () => expect(glossItems(" ดี ,, (x) , ")).toEqual(["ดี"]));
  it("also splits on the Thai/fullwidth comma", () => expect(glossItems("ดี，เยี่ยม")).toEqual(["ดี", "เยี่ยม"]));
});

describe("checkGlossUniqueness", () => {
  const items = [
    vocabItem({ id: "v-good", th: "ดี" }),
    vocabItem({ id: "v-nice", th: "น่ายินดี, ดี" }),
    vocabItem({ id: "v-fine", th: "สบายดี" }),
    vocabItem({ id: "v-later", th: "ดี (ยังไม่สอน)" }),
  ];
  const ctx = (taught: string[]) => buildContext(data([lessonFile(1, taught, [dictation(1)])], [vocabFile(items)]));

  it("flags two taught entries that share an identical gloss item, naming both ids and the item", () => {
    const out = checkGlossUniqueness(ctx(["v-good", "v-nice", "v-fine"]));
    expect(out).toHaveLength(1);
    expect(out[0].rule).toBe("gloss-unique");
    const msg = formatProblem(out[0]);
    expect(msg).toContain("content/vocab/oxford-3000/a1.json [v-nice]");
    expect(msg).toContain('"ดี"');
    expect(msg).toContain("v-good");
    expect(msg).toContain("disambiguate");
  });
  it("is quiet when the items differ (a substring is not a clash)", () => {
    expect(checkGlossUniqueness(ctx(["v-good", "v-fine"]))).toEqual([]);
  });
  it("ignores entries that are not taught in any lesson", () => {
    expect(checkGlossUniqueness(ctx(["v-good"]))).toEqual([]);
  });
});
