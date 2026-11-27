import { describe, expect, it } from "vitest";
import { surfaceForms, tokenize, usageForms } from "./lexicon";
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

describe("surfaceForms: no unrelated words", () => {
  const f = (word: string, pos: string, forms?: Record<string, string>) => surfaceForms(vocabItem({ id: `v-${word}`, word, pos, forms }));
  it.each([
    ["be", "verb", { present: "am / is / are", past: "was / were", pastParticiple: "been" }, ["bed", "bes", "bee"]],
    ["go", "verb", { past: "went", pastParticiple: "gone" }, ["god", "goed", "gos"]],
    ["see", "verb", { past: "saw", pastParticiple: "seen" }, ["seed", "sees!"]],
    ["plan", "noun", undefined, ["planes", "plane"]],
    ["car", "noun", undefined, ["cares", "care"]],
  ] as const)("%s does not match %j", (word, pos, forms, bad) => {
    const s = f(word, pos, forms as Record<string, string> | undefined);
    for (const b of bad) expect(s.has(b), b).toBe(false);
  });
  it("accepts real forms", () => {
    expect(f("cat", "noun").has("cats")).toBe(true);
    expect(f("bus", "noun").has("buses")).toBe(true);
    expect(f("go", "verb", { past: "went" }).has("goes")).toBe(true);
    expect(f("go", "verb", { past: "went" }).has("going")).toBe(true);
    expect(f("study", "verb").has("studies")).toBe(true);
    expect(f("like", "verb").has("liked")).toBe(true);
    expect(f("like", "verb").has("liking")).toBe(true);
    expect(f("stop", "verb", { past: "stopped" }).has("stopped")).toBe(true);
    expect(f("watch", "verb").has("watches")).toBe(true);
    expect(f("see", "verb", { past: "saw" }).has("seeing")).toBe(true);
  });
  it("does not add -ed to a verb whose entry lists its own past", () => {
    expect(f("come", "verb", { past: "came", pastParticiple: "come" }).has("commed")).toBe(false);
    expect(f("come", "verb", { past: "came" }).has("comed")).toBe(false);
  });
  it("gives adjectives only their listed forms", () => {
    expect(f("big", "adjective", { comparative: "bigger" }).has("bigs")).toBe(false);
    expect(f("big", "adjective", { comparative: "bigger" }).has("bigger")).toBe(true);
  });
});

describe("multi-word entries", () => {
  const wake = vocabItem({ id: "v-wake-up", word: "wake up", pos: "verb", forms: { past: "woke up" } });
  it("inflects the head word of a phrasal verb", () => {
    const s = surfaceForms(wake);
    for (const w of ["wakes", "waking", "woke", "up"]) expect(s.has(w), w).toBe(true);
  });
  it("counts as used by the head word's forms, never by the bare particle", () => {
    const u = usageForms(wake);
    for (const w of ["wake", "wakes", "waking", "woke"]) expect(u.has(w), w).toBe(true);
    expect(u.has("up")).toBe(false);
  });
});
