// @vitest-environment node
// 's is folded to "is" only in a closed list of contexts that cannot be a verb (an ALLOW-list). Anything else is not folded:
// grading rejects the other form and the answer-forms rule demands that the author lists both. An unknown word can only
// under-accept, never over-accept. Property tests below try the words a deny-list would have missed.
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readContent } from "@/lib/content/loader";
import { ADJECTIVES, PARTICIPLES, isParticipleLike, sReading } from "./equivalents";
import { matchesAny } from "./normalize";

describe("over-acceptance reported by review round 3: all must grade wrong", () => {
  it.each([
    ["He is never been to Japan", "He's never been to Japan"],
    ["He is already eaten", "He's already eaten"],
    ["She is just finished her homework", "She's just finished her homework"],
    ["It is just started", "It's just started"],
    ["What is he done", "What's he done"],
    ["Where is she gone", "Where's she gone"],
    ["He is used my pen", "He's used my pen"],
    ["She is died", "She's died"],
    ["He is tied the rope", "He's tied the rope"],
    ["He is lied to me", "He's lied to me"],
    ["He is meant to go", "He's meant to go"],
    ["He is learnt English", "He's learnt English"],
    ["She is beaten me", "She's beaten me"],
    ["He is sought help", "He's sought help"],
    ["It is crept away", "It's crept away"],
    ["He is not been to Japan", "He's not been to Japan"],
  ])("%s is wrong for accepted %s", (wrong, right) => expect(matchesAny(wrong, [right]), wrong).toBe(false));

  it("and the other direction is not folded either", () => {
    expect(matchesAny("He's never been to Japan", ["He has never been to Japan"])).toBe(false);
    expect(matchesAny("He has never been to Japan", ["He's never been to Japan"])).toBe(false);
  });
});

describe("property: no word after 's can be folded into 'is' unless it is provably not a verb", () => {
  const EDS = ["used", "died", "tied", "lied", "meant", "learnt", "beaten", "sought", "crept", "opened", "closed", "painted", "wanted", "needed",
    "asked", "helped", "walked", "talked", "washed", "cooked", "visited", "started", "finished", "arrived", "stopped", "planned", "worked", "played",
    "liked", "loved", "moved", "named", "called", "turned", "tried", "carried", "married", "fed", "wed", "shed", "bled", "fled", "sped", "led"];
  const words = [...new Set([...PARTICIPLES, ...EDS])];
  for (const adverb of ["", "never ", "already ", "just ", "not ", "also ", "really "]) {
    it(`"He is ${adverb}<w> my pen" is wrong for "He's ${adverb}<w> my pen" (${words.length} words)`, () => {
      const bad = words.filter((w) => matchesAny(`He is ${adverb}${w} my pen`, [`He's ${adverb}${w} my pen`]));
      expect(bad).toEqual([]);
    });
  }
  it("the same through what/where/there/name-less subjects", () => {
    for (const w of words) for (const s of ["she", "it", "that", "who"]) {
      expect(matchesAny(`${s} is ${w} it`, [`${s}'s ${w} it`]), `${s} ${w}`).toBe(false);
    }
  });
});

describe("what still folds (provably not a verb)", () => {
  it.each([
    ["He is a teacher", "He's a teacher"], ["She is my friend", "She's my friend"], ["It is the door", "It's the door"],
    ["That is 10", "That's ten"], ["He is in the park", "He's in the park"], ["It is on the table", "It's on the table"],
    ["He is from Japan", "He's from Japan"], ["She is here", "She's here"], ["He is reading", "He's reading"],
    ["She is happy", "She's happy"], ["He is not happy", "He's not happy"], ["He is not a teacher", "He's not a teacher"],
    ["What is your name", "What's your name"], ["Where is the bus", "Where's the bus"], ["My name is Ann", "My name's Ann"],
    ["He has been to Japan", "He's been to Japan"], ["She has got a cat", "She's got a cat"],
  ])("%s = %s", (a, b) => {
    expect(matchesAny(a, [b]), a).toBe(true);
    expect(matchesAny(b, [a]), b).toBe(true);
  });
});

describe("round 4 allow-list groups: weather, days/months, nationalities, object pronouns after he/she/it only", () => {
  it.each([
    ["It is sunny", "It's sunny"], ["It is rainy", "It's rainy"], ["It is Monday", "It's Monday"], ["It is May", "It's May"],
    ["He is Thai", "He's Thai"], ["She is Japanese", "She's Japanese"], ["It is me", "It's me"], ["That is mine", "That's mine"],
    ["He is him", "He's him"], ["It is theirs", "It's theirs"],
  ])("%s = %s", (a, b) => { expect(matchesAny(a, [b]), a).toBe(true); expect(matchesAny(b, [a]), b).toBe(true); });
  it("pronouns after a wh-word are NOT folded (What's him done is not English, but What's he done is has)", () => {
    expect(matchesAny("What is me", ["What's me"])).toBe(false);
    expect(matchesAny("What is he", ["What's he"])).toBe(false);
    expect(matchesAny("Who is them", ["Who's them"])).toBe(false);
  });
  it("that + pronoun is not folded, 'half' is not added", () => { expect(matchesAny("That is mine", ["That's mine"])).toBe(false); expect(matchesAny("It is half", ["It's half"])).toBe(false); });
});

describe("sReading: the one predicate", () => {
  const read = (s: string) => sReading(s.split(" "), s.split(" ").findIndex((t) => t.endsWith("'s")));
  it("is / has / not folded", () => {
    expect(read("he's a doctor")).toBe("is");
    expect(read("he's not a doctor")).toBe("is");
    expect(read("he's been here")).toBe("has");
    expect(read("he's not been here")).toBeNull();
    expect(read("he's never been here")).toBeNull();
    expect(read("he's gone")).toBeNull();
    expect(read("he's")).toBeNull();
  });
});

describe("closed lists", () => {
  it("ADJECTIVES holds no participle-like word, so a plain adjective can never hide a verb", () => {
    expect([...ADJECTIVES].filter((a) => isParticipleLike(a) || PARTICIPLES.has(a))).toEqual([]);
  });
  it("every adjective of the vocab bank is in ADJECTIVES or is participle-like (the bank cannot get ahead of grading)", () => {
    const { vocab } = readContent(path.resolve(import.meta.dirname, "../../../content"));
    const missing = vocab.flatMap(({ items }) => items.filter((i) => i.pos === "adjective" && !isParticipleLike(i.word.toLowerCase()) && !ADJECTIVES.has(i.word.toLowerCase())).map((i) => i.word));
    expect(missing).toEqual([]);
  });
});
