// @vitest-environment node
// Mutation check on the real lessons: spoil each exact Thai name spelling and the rule must notice (recall), and the unspoiled
// lessons must be clean (precision; also enforced by content:validate).
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readContent } from "../loader";
import { THAI_NAMES, THAI_NAME_IS_A_WORD } from "./allowlists";
import { buildContext } from "./context";
import { isKnownThaiWord, thaiNameMismatches } from "./thai-names";

const content = readContent(path.resolve(import.meta.dirname, "../../../../content"));
const { lessons } = content;
const isWord = isKnownThaiWord(buildContext(content));
const THAI = /[฀-๿]/;
function* thaiStrings(o: unknown, key = ""): Generator<string> {
  if (typeof o === "string") { if (THAI.test(o) && key !== "tipTh") yield o; }
  else if (Array.isArray(o)) for (const v of o) yield* thaiStrings(v, key);
  else if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) yield* thaiStrings(v, k);
}
const checked = Object.fromEntries(Object.entries(THAI_NAMES).filter(([n]) => !THAI_NAME_IS_A_WORD.includes(n)));

describe("thai-names on the real lessons", () => {
  it("finds a spoiled spelling (measured recall 183/306 = 0.598: an extra ว, a doubled last letter or an extra ค) wherever the exact spelling stands before/after a particle", () => {
    let total = 0, found = 0;
    for (const { lesson } of lessons) {
      for (const text of thaiStrings(lesson)) {
        for (const [name, form] of Object.entries(checked)) {
          if (!text.includes(form) || thaiNameMismatches(text, { [name]: form }, THAI_NAMES, isWord).length > 0) continue;
          for (const spoiled of [text.replace(form, `${form}ว`), text.replace(form, `${form}${[...form].at(-1)}`), text.replace(form, `${form}ค`)]) {
            total++;
            if (thaiNameMismatches(spoiled, { [name]: form }, THAI_NAMES, isWord).length > 0) found++;
          }
        }
      }
    }
    expect(total).toBeGreaterThan(20);
    console.info(`thai-names recall on spoiled real spellings: ${found}/${total} = ${(found / total).toFixed(3)}`);
    expect(found / total).toBeGreaterThan(0.55); // the misses: next to a particle that is not in BEFORE/AFTER
  });
});
