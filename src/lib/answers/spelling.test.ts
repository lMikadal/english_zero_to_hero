// @vitest-environment node
// UK and US spellings of the same word are one answer. The table is CLOSED (explicit pairs and inflections); there is no
// suffix rule, because "-our -> -or" would turn four / hour / your / flour into other words.
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readContent } from "@/lib/content/loader";
import { canonicalAnswer } from "./equivalents";
import { matchesAny } from "./normalize";
import { SPELLING_PAIRS, foldSpelling, otherSpelling } from "./spelling";

describe("UK and US spellings fold in grading (both directions)", () => {
  it.each([
    ["What colour is it", "What color is it"], ["It is grey", "It is gray"], ["It is my favourite", "It is my favorite"],
    ["It is in the centre", "It is in the center"], ["It is ten metres", "It is ten meters"], ["We are at the theatre", "We are at the theater"],
    ["My mum is ten", "My mom is ten"], ["She is my neighbour", "She is my neighbor"], ["We are travelling", "We are traveling"],
    ["He travelled", "He traveled"], ["I practise English", "I practice English"], ["We organise it", "We organize it"],
    ["I realise it", "I realize it"], ["My pyjamas are blue", "My pajamas are blue"], ["It is an aeroplane", "It is an airplane"],
    ["It is jewellery", "It is jewelry"], ["It is a licence", "It is a license"], ["It is defence", "It is defense"],
    ["It is a catalogue", "It is a catalog"], ["It is a dialogue", "It is a dialog"], ["I like yoghurt", "I like yogurt"],
    ["I like doughnuts", "I like donuts"], ["The colours are nice", "The colors are nice"], ["The greyer bag", "The grayer bag"],
    ["It is a programme", "It is a program"], ["He is coloured", "He is colored"], ["I like maths", "I like math"], ["It is a tyre", "It is a tire"],
  ])("%s = %s", (a, b) => {
    expect(matchesAny(a, [b]), a).toBe(true);
    expect(matchesAny(b, [a]), b).toBe(true);
  });
  it("is off with strict: true", () => expect(matchesAny("It is gray", ["It is grey"], { strict: true })).toBe(false));
  it("canonicalAnswer writes the UK spelling", () => {
    expect(canonicalAnswer("my mom likes gray color")).toBe("my mum likes grey colour");
  });
  it("only whole tokens: no suffix rule", () => {
    for (const [a, b] of [["four", "for"], ["hour", "hor"], ["hours", "hors"], ["your", "yor"], ["flour", "floor"], ["court", "cort"], ["tired", "tire"], ["check", "cheque"],
      ["colour", "colur"], ["tired", "tyred"], ["story", "storey"]]) {
      expect(matchesAny(a, [b]), `${a} vs ${b}`).toBe(false);
    }
    expect(matchesAny("four", ["four"])).toBe(true);
  });
});

describe("the closed table", () => {
  it("every pair is two different lower-case words, and no word is on two sides or in two pairs", () => {
    expect(SPELLING_PAIRS.length).toBeGreaterThan(60);
    const seen = new Set<string>();
    for (const [uk, us] of SPELLING_PAIRS) {
      expect(uk, uk).toMatch(/^[a-z]+$/);
      expect(us, us).toMatch(/^[a-z]+$/);
      expect(uk).not.toBe(us);
      for (const w of [uk, us]) { expect(seen.has(w), `${w} appears twice`).toBe(false); seen.add(w); }
    }
  });
  it("contains none of the words that would be a different word on the other side (traps)", () => {
    const TRAPS = ["check", "checks", "cheque", "tired", "for", "four", "hour", "hours", "your", "flour", "court", "story", "storey", "whisky", "whiskey", "spelt", "smelt", "lead", "led"];
    const words = new Set(SPELLING_PAIRS.flat());
    expect(TRAPS.filter((w) => words.has(w))).toEqual([]);
  });
  it("foldSpelling maps US to UK and leaves everything else", () => {
    expect(foldSpelling("color")).toBe("colour");
    expect(foldSpelling("colour")).toBe("colour");
    expect(foldSpelling("hour")).toBe("hour");
  });
  it("otherSpelling gives the partner in either direction", () => {
    expect(otherSpelling("colour")).toBe("color");
    expect(otherSpelling("color")).toBe("colour");
    expect(otherSpelling("hour")).toBeUndefined();
  });
  it("no table word on one side is a DIFFERENT word of the vocab bank (an entry may only hold its own pair)", () => {
    const { vocab } = readContent(path.resolve(import.meta.dirname, "../../../content"));
    const heads = new Set(vocab.flatMap(({ items }) => items.map((i) => i.word.toLowerCase())));
    const clashes = SPELLING_PAIRS.filter(([uk, us]) => heads.has(uk) && heads.has(us)).map(([uk, us]) => `${uk}/${us}`);
    expect(clashes).toEqual([]);
  });
});
