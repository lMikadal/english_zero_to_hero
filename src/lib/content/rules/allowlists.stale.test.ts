// @vitest-environment node
// Soft exceptions must not rot: these tests fail when an allowlist item is no longer needed or no longer true.
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readContent } from "../loader";
import { A1_WORDS_WITHOUT_ENTRY_YET, FUNCTION_WORDS, NUMBER_WORDS_WITHOUT_ENTRY, USED_BEFORE_TAUGHT } from "./allowlists";
import { buildContext } from "./context";
import { surfaceForms } from "./lexicon";
import { untaughtUses } from "./taught-words";

const ctx = buildContext(readContent(path.resolve(import.meta.dirname, "../../../../content")));
const entryFor = (word: string) => [...ctx.bank.values()].find(({ item }) => surfaceForms(item).has(word));

describe("allowlists stay honest (real content)", () => {
  it.each([
    ["FUNCTION_WORDS", FUNCTION_WORDS],
    ["NUMBER_WORDS_WITHOUT_ENTRY", NUMBER_WORDS_WITHOUT_ENTRY],
    ["A1_WORDS_WITHOUT_ENTRY_YET", A1_WORDS_WITHOUT_ENTRY_YET],
  ])("%s: no item is a form of a word that now has a vocab entry", (_name, list) => {
    const redundant = list.filter((w) => entryFor(w)).map((w) => `${w} (entry ${entryFor(w)!.item.id}): delete it from the list`);
    expect(redundant).toEqual([]);
  });

  it("USED_BEFORE_TAUGHT: every word has an entry taught later than its limit, and is still used untaught", () => {
    const problems: string[] = [];
    for (const [word, latest] of Object.entries(USED_BEFORE_TAUGHT)) {
      const e = entryFor(word);
      const taught = e ? ctx.taughtIn.get(e.item.id)?.day : undefined;
      if (!e || taught === undefined) {
        problems.push(`${word}: no taught vocab entry; give it one, or move it to A1_WORDS_WITHOUT_ENTRY_YET`);
        continue;
      }
      if (latest >= taught) problems.push(`${word}: limit day ${latest} is not before the teaching day ${taught}`);
      const uses = untaughtUses(ctx, word);
      if (uses.length === 0) problems.push(`${word}: no longer used before day ${taught}; delete it from USED_BEFORE_TAUGHT`);
      else if (Math.max(...uses) > latest) problems.push(`${word}: used untaught on day ${Math.max(...uses)}, after its limit ${latest}`);
      else if (Math.max(...uses) < latest) problems.push(`${word}: last untaught use is day ${Math.max(...uses)}; lower the limit from ${latest}`);
    }
    expect(problems).toEqual([]);
  });
});
