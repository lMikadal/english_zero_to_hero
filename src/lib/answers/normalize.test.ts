import { describe, expect, it } from "vitest";
import { matchesAny, normalizeAnswer } from "./normalize";

describe("normalizeAnswer", () => {
  it("lower-cases", () => expect(normalizeAnswer("Nice To MEET You")).toBe("nice to meet you"));
  it("collapses and trims whitespace", () => {
    expect(normalizeAnswer("  nice   to\tmeet\n you  ")).toBe("nice to meet you");
  });
  it.each([".", "!", "?", ","])("removes %s at the end", (p) => {
    expect(normalizeAnswer(`Hello${p}`)).toBe("hello");
  });
  it("removes punctuation anywhere, replacing it with a space", () => {
    expect(normalizeAnswer("Hello,Sam!Nice? cat.")).toBe("hello sam nice cat");
    expect(normalizeAnswer("B, U, S")).toBe("b u s");
    expect(normalizeAnswer("...Hi!!!")).toBe("hi");
  });
  it("treats curly apostrophes as straight ones", () => {
    expect(normalizeAnswer("I’m from Bangkok")).toBe("i'm from bangkok");
    expect(normalizeAnswer("I‘m")).toBe("i'm");
  });
  it("keeps other characters (hyphen, straight apostrophe)", () => {
    expect(normalizeAnswer("B-U-S")).toBe("b-u-s");
  });
  it("returns an empty string for empty or punctuation-only input", () => {
    expect(normalizeAnswer("")).toBe("");
    expect(normalizeAnswer("  ?! , ")).toBe("");
  });
});

describe("normalizeAnswer: unicode hardening", () => {
  it("treats the ellipsis character like the punctuation it removes", () => {
    expect(normalizeAnswer("Nice to meet you…")).toBe("nice to meet you");
    expect(normalizeAnswer("wait…what")).toBe("wait what");
  });
  it("folds fullwidth forms (NFKC)", () => {
    expect(normalizeAnswer("Where are you from？")).toBe("where are you from");
    expect(normalizeAnswer("Ｈｅｌｌｏ！Ｓａｍ，ｈｉ")).toBe("hello sam hi");
  });
  it("strips zero-width characters, even inside a word", () => {
    expect(normalizeAnswer("Nice to me\u200Det you")).toBe("nice to meet you");
    for (const z of ["\u200B", "\u200C", "\u200D", "\uFEFF"]) expect(normalizeAnswer(`ca${z}t`)).toBe("cat");
  });
  it.each(["\u2019", "\u2018", "\u02BC", "\u00B4", "`"])("maps the apostrophe look-alike %j to '", (a) => {
    expect(normalizeAnswer(`I${a}m from Bangkok`)).toBe("i'm from bangkok");
  });
  it("real content: d001-listen-02 accepts the ellipsis and fullwidth variants", () => {
    expect(matchesAny("Nice to meet you…", ["Nice to meet you."])).toBe(true);
    expect(matchesAny("Nice to meet you！", ["Nice to meet you."])).toBe(true);
    expect(matchesAny("Nice to meet\u200D you", ["Nice to meet you."])).toBe(true);
  });
});

describe("matchesAny", () => {
  it("treats a contraction and its full form as the same answer (equivalents.ts)", () => {
    expect(matchesAny("I am from Bangkok", ["I'm from Bangkok"])).toBe(true);
  });
  it("matches after normalising both sides", () => {
    expect(matchesAny("i’m from bangkok.", ["I'm from Bangkok"])).toBe(true);
  });
  it("is false when nothing matches", () => {
    expect(matchesAny("I am from Chiang Mai", ["I'm from Bangkok"])).toBe(false);
  });
  it("is false for an empty accepted list and for input that normalises to nothing", () => {
    expect(matchesAny("x", [])).toBe(false);
    expect(matchesAny("", ["!"])).toBe(false); // empty input never matches, even an accepted "!" that normalises to ""
    expect(matchesAny(" ?! ", [""])).toBe(false);
  });
});
