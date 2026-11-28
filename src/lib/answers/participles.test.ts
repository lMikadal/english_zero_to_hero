// @vitest-environment node
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readContent } from "@/lib/content/loader";
import { PARTICIPLES, isParticipleLike } from "./equivalents";

describe("PARTICIPLES (one table for grading and the answer-forms rule)", () => {
  it.each(["been", "had", "done", "gone", "come", "seen", "gotten", "made", "said", "taken", "given", "known", "thought", "told", "found",
    "left", "felt", "become", "put", "kept", "begun", "brought", "bought", "written", "sat", "stood", "heard", "run", "read", "met", "paid",
    "sent", "built", "spent", "lost", "cut", "eaten", "drunk", "driven", "spoken", "broken", "chosen", "forgotten", "fallen", "grown",
    "shown", "slept", "sold", "taught", "understood", "won", "worn", "caught", "held", "let", "set", "hit", "hurt", "cost", "flown",
    "drawn", "thrown", "risen", "ridden", "sung", "swum"])("contains %s", (w) => expect(PARTICIPLES.has(w)).toBe(true));

  it("short -ed words are participle-like too, except real non-participles", () => {
    for (const w of ["used", "died", "tied", "lied", "fled"]) expect(isParticipleLike(w), w).toBe(true);
    for (const w of ["need", "feed", "seed", "shed", "red"]) expect(isParticipleLike(w), w).toBe(false);
    for (const w of ["meant", "learnt", "beaten", "sought", "crept"]) expect(PARTICIPLES.has(w), w).toBe(true);
  });
  it("isParticipleLike: table, or an -ed word of 4+ letters that is not on the exception list", () => {
    expect(isParticipleLike("bought")).toBe(true);
    expect(isParticipleLike("tired")).toBe(true);
    expect(isParticipleLike("red")).toBe(false);
    expect(isParticipleLike("hundred")).toBe(false);
    expect(isParticipleLike("happy")).toBe(false);
  });

  it("every past / pastParticiple form in the vocab bank satisfies isParticipleLike itself, so the bank can never get ahead of grading", () => {
    const { vocab } = readContent(path.resolve(import.meta.dirname, "../../../content"));
    const missing: string[] = [];
    for (const { items } of vocab) {
      for (const item of items) {
        for (const key of ["past", "pastParticiple"]) {
          for (const form of (item.forms?.[key] ?? "").toLowerCase().split("/").map((f) => f.trim().split(" ")[0]).filter(Boolean)) {
            if (!isParticipleLike(form)) missing.push(`${item.id}.${key}="${form}"`);
          }
        }
      }
    }
    expect(missing).toEqual([]);
  });
});
