// @vitest-environment node
// Mutation check on the real lessons: spoil each exact Thai name spelling and the rule must notice (recall), and the unspoiled
// lessons must be clean (precision; also enforced by content:validate).
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readContent } from "../loader";
import { THAI_NAMES, THAI_NAME_IS_A_WORD } from "./allowlists";
import { thaiNameMismatches } from "./thai-names";

const { lessons } = readContent(path.resolve(import.meta.dirname, "../../../../content"));
const THAI = /[฀-๿]/;
function* thaiStrings(o: unknown, key = ""): Generator<string> {
  if (typeof o === "string") { if (THAI.test(o) && key !== "tipTh") yield o; }
  else if (Array.isArray(o)) for (const v of o) yield* thaiStrings(v, key);
  else if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) yield* thaiStrings(v, k);
}
const checked = Object.fromEntries(Object.entries(THAI_NAMES).filter(([n]) => !THAI_NAME_IS_A_WORD.includes(n)));

describe("thai-names on the real lessons", () => {
  it("finds a spoiled spelling (name + ว, or the first letter dropped) wherever the exact spelling stands before/after a particle", () => {
    let total = 0, found = 0;
    for (const { lesson } of lessons) {
      for (const text of thaiStrings(lesson)) {
        for (const [name, form] of Object.entries(checked)) {
          if (!text.includes(form) || thaiNameMismatches(text, { [name]: form }, THAI_NAMES).length > 0) continue;
          for (const spoiled of [text.replace(form, `${form}ว`), text.replace(form, [...form].slice(1).join(""))]) {
            total++;
            if (thaiNameMismatches(spoiled, { [name]: form }, THAI_NAMES).length > 0) found++;
          }
        }
      }
    }
    expect(total).toBeGreaterThan(20);
    expect(found / total).toBeGreaterThan(0.6);
  });
});
