import { describe, expect, it } from "vitest";
import { surfaceForms, tokenize } from "./lexicon";
import { vocabItem } from "./test-support";

describe("tokenize", () => {
  it("lower-cases and splits words, dropping punctuation", () => {
    expect(tokenize("Hello, Sam! Nice cat?")).toEqual(["hello", "sam", "nice", "cat"]);
  });
  it("expands contractions to their words (CONTRACTIONS table)", () => {
    expect(tokenize("Hello, I'm Ann.")).toEqual(["hello", "i", "am", "ann"]);
    expect(tokenize("They don't work. It isn't big")).toEqual(["they", "do", "not", "work", "it", "is", "not", "big"]);
  });
  it("accepts curly apostrophes", () => expect(tokenize("I’m fine")).toEqual(["i", "am", "fine"]));
  it("drops a possessive 's but keeps the owner", () => expect(tokenize("Sam's pen")).toEqual(["sam", "pen"]));
  it("keeps o'clock-style words whole", () => expect(tokenize("at five o'clock")).toEqual(["at", "five", "o'clock"]));
  it("splits hyphenated letters and ignores digits and dashes", () => {
    expect(tokenize("B-U-S")).toEqual(["b", "u", "s"]);
    expect(tokenize("Numbers 11–20 and 3")).toEqual(["numbers", "and"]);
  });
  it("keeps real hyphenated compounds apart", () => expect(tokenize("twenty-one")).toEqual(["twenty", "one"]));
  it("returns nothing for Thai or blanks", () => expect(tokenize("สวัสดี  ")).toEqual([]));
});

describe("surfaceForms", () => {
  const forms = (word: string, pos: string, f?: Record<string, string>) => surfaceForms(vocabItem({ id: `v-${word}`, word, pos, forms: f }));

  it("includes the headword and regular noun plurals", () => {
    const s = forms("pen", "noun");
    expect(s.has("pen")).toBe(true);
    expect(s.has("pens")).toBe(true);
    expect(s.has("penny")).toBe(false);
  });
  it("covers -es, -ies, -ing, -ed for verbs", () => {
    const s = forms("spell", "verb");
    for (const w of ["spell", "spells", "spelling", "spelled"]) expect(s.has(w), w).toBe(true);
    const c = forms("come", "verb");
    for (const w of ["comes", "coming"]) expect(c.has(w), w).toBe(true);
    const sit = forms("sit", "verb");
    expect(sit.has("sitting")).toBe(true);
    const study = forms("study", "verb");
    expect(study.has("studies")).toBe(true);
    expect(study.has("studied")).toBe(true);
  });
  it("adds every value of `forms`, splitting 'am / is / are'", () => {
    const s = forms("be", "verb", { present: "am / is / are", past: "was / were", pastParticiple: "been" });
    for (const w of ["be", "am", "is", "are", "was", "were", "been", "being"]) expect(s.has(w), w).toBe(true);
  });
  it("adds irregular forms", () => {
    const s = forms("see", "verb", { past: "saw", pastParticiple: "seen" });
    expect(s.has("saw")).toBe(true);
    expect(s.has("seen")).toBe(true);
    expect(forms("do", "auxiliary verb", { past: "did" }).has("does")).toBe(true);
  });
  it("does not inflect pronouns, numbers or prepositions beyond their listed forms", () => {
    expect(forms("he", "pronoun", { object: "him", possessive: "his" }).has("hes")).toBe(false);
    expect(forms("on", "preposition").has("ons")).toBe(false);
    expect(forms("two", "number").has("twos")).toBe(false);
  });
  it("splits a multi-word headword into its words", () => {
    const s = forms("wake up", "verb");
    expect(s.has("wake")).toBe(true);
    expect(s.has("up")).toBe(true);
  });
});
