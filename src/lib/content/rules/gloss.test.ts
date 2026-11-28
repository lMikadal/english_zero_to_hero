// @vitest-environment node
import { describe, expect, it } from "vitest";
import { formatProblem } from "../loader";
import { buildContext } from "./context";
import { checkGlossUniqueness, glossBase, glossItems } from "./gloss";
import { data, exId, instruction, lessonFile, vocabFile, vocabItem } from "./test-support";

const dictation = (day: number) => ({ id: exId(day, "listen"), type: "dictation" as const, instruction, audioText: "Hi." });

describe("glossItems", () => {
  it("splits on commas outside parentheses and keeps the qualifier (the card shows it)", () => {
    expect(glossItems("สบายดี, ไม่เป็นไร")).toEqual(["สบายดี", "ไม่เป็นไร"]);
    expect(glossItems("ไม่ (วางหลัง am / is / are)")).toEqual(["ไม่ (วางหลัง am / is / are)"]);
    expect(glossItems("ได้รู้จัก, พบ (ใครสักคน)")).toEqual(["ได้รู้จัก", "พบ (ใครสักคน)"]);
    expect(glossItems("ยี่สิบ (20, ตัวเลข)")).toEqual(["ยี่สิบ (20, ตัวเลข)"]);
  });
  it("handles nested parentheses", () => {
    expect(glossItems("ก (ข (ค, ง), จ), ฉ")).toEqual(["ก (ข (ค, ง), จ)", "ฉ"]);
  });
  it("drops empty items; trims; collapses whitespace; strips zero-width characters; normalises to NFC", () => {
    expect(glossItems(" ดี ,, , ")).toEqual(["ดี"]);
    expect(glossItems("ดี   (  ก   ข )")).toEqual(["ดี ( ก ข )"]);
    expect(glossItems("ด\u200Bี")).toEqual(["ดี"]);
    expect(glossItems("e\u0301")).toEqual(["\u00e9"]);
  });
  it("also splits on the Thai/fullwidth comma", () => expect(glossItems("ดี，เยี่ยม")).toEqual(["ดี", "เยี่ยม"]));
});

describe("glossBase", () => {
  it("removes every qualifier", () => {
    expect(glossBase("ไม่ (วางหลัง am / is / are)")).toBe("ไม่");
    expect(glossBase("ก (ข (ค)) ง")).toBe("ก ง");
  });
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

  it("allows the same word with different qualifiers (different cards) but warns about the near-clash", () => {
    const qual = [vocabItem({ id: "v-no", th: "ไม่ (คำตอบ)" }), vocabItem({ id: "v-not", th: "ไม่ (วางหลัง is)" })];
    const out = checkGlossUniqueness(buildContext(data([lessonFile(1, ["v-no", "v-not"], [dictation(1)])], [vocabFile(qual)])));
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe("warning");
    expect(out[0].message).toContain("near-clash");
    expect(out[0].id).toBe("v-not");
  });
  it("still fails when the qualifiers are identical too", () => {
    const same = [vocabItem({ id: "v-no", th: "ไม่ (คำตอบ)" }), vocabItem({ id: "v-not", th: "ไม่  (คำตอบ)" })];
    const out = checkGlossUniqueness(buildContext(data([lessonFile(1, ["v-no", "v-not"], [dictation(1)])], [vocabFile(same)])));
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBeUndefined();
  });
});
