import { describe, expect, it } from "vitest";
import { A1_WORDS_WITHOUT_ENTRY_YET, FUNCTION_WORDS, LETTERS, NUMBER_WORDS_WITHOUT_ENTRY, PROPER_NAMES, USED_BEFORE_TAUGHT } from "./allowlists";

describe("allowlists", () => {
  it("word lists are lower case, single words, and have no duplicates across lists", () => {
    const all = [...FUNCTION_WORDS, ...A1_WORDS_WITHOUT_ENTRY_YET, ...Object.keys(USED_BEFORE_TAUGHT), ...NUMBER_WORDS_WITHOUT_ENTRY];
    for (const w of [...all, ...LETTERS]) expect(w).toMatch(/^[a-z]+$/);
    expect(new Set(all).size).toBe(all.length);
  });
  it("proper names are capitalised single words without duplicates", () => {
    for (const n of PROPER_NAMES) expect(n).toMatch(/^\p{Lu}[a-z]+$/u);
    expect(new Set(PROPER_NAMES).size).toBe(PROPER_NAMES.length);
  });
  it("no proper name is also an ordinary allowlisted word", () => {
    const words = new Set([...FUNCTION_WORDS, ...A1_WORDS_WITHOUT_ENTRY_YET, ...Object.keys(USED_BEFORE_TAUGHT), ...NUMBER_WORDS_WITHOUT_ENTRY]);
    for (const n of PROPER_NAMES) expect(words.has(n.toLowerCase()), n).toBe(false);
  });
});
