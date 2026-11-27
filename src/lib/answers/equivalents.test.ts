import { describe, expect, it } from "vitest";
import { CONTRACTIONS, NUMBER_WORDS, canonicalAnswer } from "./equivalents";
import { matchesAny } from "./normalize";

describe("canonicalAnswer: contractions", () => {
  it.each([
    ["i'm ten", "i am ten"],
    ["he's ten", "he is ten"],
    ["she's a doctor", "she is a doctor"],
    ["it's a window", "it is a window"],
    ["that's a window", "that is a window"],
    ["we're in the park", "we are in the park"],
    ["they're happy", "they are happy"],
    ["you're my friend", "you are my friend"],
    ["it isn't a door", "it is not a door"],
    ["they aren't here", "they are not here"],
    ["i don't know", "i do not know"],
    ["she doesn't work", "she does not work"],
    ["i can't spell it", "i can not spell it"],
    ["i cannot spell it", "i can not spell it"],
    ["i'll go", "i will go"],
    ["my name's ann", "my name is ann"],
  ])("%s -> %s", (input, expected) => expect(canonicalAnswer(input)).toBe(expected));

  it("leaves a full form unchanged", () => expect(canonicalAnswer("he is ten")).toBe("he is ten"));
  it("does not turn the possessive its/his or a name's 's into 'is'", () => {
    expect(canonicalAnswer("its door")).toBe("its door");
    expect(canonicalAnswer("his door")).toBe("his door");
    expect(canonicalAnswer("sam's door")).toBe("sam's door");
  });
  it("does not expand 's before got (it may be 'has')", () => expect(canonicalAnswer("he's got a pen")).toBe("he's got a pen"));
  it("only whole tokens are touched", () => expect(canonicalAnswer("he'sx")).toBe("he'sx"));
});

describe("canonicalAnswer: number words and digits", () => {
  it.each([
    ["he is 10", "he is ten"],
    ["i am 20", "i am twenty"],
    ["1 tea please", "one tea please"],
    ["30 40 90", "thirty forty ninety"],
    ["100", "one hundred"],
    ["a hundred baht", "one hundred baht"],
  ])("%s -> %s", (input, expected) => expect(canonicalAnswer(input)).toBe(expected));

  it("does not touch digits inside longer numbers or words", () => {
    expect(canonicalAnswer("110")).toBe("110");
    expect(canonicalAnswer("1100")).toBe("1100");
    expect(canonicalAnswer("a10")).toBe("a10");
    expect(canonicalAnswer("10th")).toBe("10th");
    expect(canonicalAnswer("1 0")).toBe("one 0");
  });
  it("tables cover one..twenty, the tens up to ninety, and one hundred", () => {
    const words = NUMBER_WORDS.map(([, w]) => w);
    for (const w of ["one", "two", "ten", "eleven", "twenty", "thirty", "ninety"]) expect(words).toContain(w);
    expect(NUMBER_WORDS.find(([d]) => d === "100")?.[1]).toBe("one hundred");
  });
});

describe("tables", () => {
  it("every contraction has a lower-case straight-apostrophe key and a non-empty full form", () => {
    for (const [c, full] of CONTRACTIONS) {
      expect(c).toBe(c.toLowerCase());
      expect(c).not.toMatch(/[’‘]/);
      expect(full.length).toBeGreaterThan(0);
    }
  });
  it("has no duplicate keys", () => {
    const keys = CONTRACTIONS.map(([c]) => c);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("matchesAny with equivalents", () => {
  it("accepts a contraction for the full form and the other way round", () => {
    expect(matchesAny("He's 10", ["He is ten"])).toBe(true);
    expect(matchesAny("He is ten", ["He's 10."])).toBe(true);
    expect(matchesAny("I’m from Bangkok", ["I am from Bangkok"])).toBe(true);
    expect(matchesAny("I am from Bangkok", ["I'm from Bangkok"])).toBe(true);
  });
  it("does not over-accept", () => {
    expect(matchesAny("His ten", ["He is ten"])).toBe(false);
    expect(matchesAny("Its a door", ["It's a door"])).toBe(false);
    expect(matchesAny("It is a door", ["Its a door"])).toBe(false);
    expect(matchesAny("He is 11", ["He is 1"])).toBe(false);
    expect(matchesAny("He is 110", ["He is ten"])).toBe(false);
    expect(matchesAny("He is eleven", ["He is 1 1"])).toBe(false);
  });
});
