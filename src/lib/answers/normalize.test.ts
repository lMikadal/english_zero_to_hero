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

describe("matchesAny", () => {
  it("matches after normalising both sides", () => {
    expect(matchesAny("i’m from bangkok.", ["I'm from Bangkok"])).toBe(true);
  });
  it("is false when nothing matches", () => {
    expect(matchesAny("I am from Bangkok", ["I'm from Bangkok"])).toBe(false);
  });
  it("is false for an empty accepted list and for input that normalises to nothing", () => {
    expect(matchesAny("x", [])).toBe(false);
    expect(matchesAny("", ["!"])).toBe(false); // empty input never matches, even an accepted "!" that normalises to ""
    expect(matchesAny(" ?! ", [""])).toBe(false);
  });
});
