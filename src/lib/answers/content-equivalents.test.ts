// @vitest-environment node
// Contract over ALL real content: a learner who types a contracted / full or digit / word variant of an
// accepted answer is marked right. The enumerator below is written independently of equivalents.ts
// (its own small tables, written out by hand) so the test is not circular.
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readContent } from "@/lib/content/loader";
import type { Exercise } from "@/lib/content/schema";
import { gradeExercise } from "./grade";

const root = path.resolve(import.meta.dirname, "../../../content");

const PAIRS: [string, string][] = [
  ["I am", "I'm"], ["you are", "you're"], ["he is", "he's"], ["she is", "she's"], ["it is", "it's"], ["we are", "we're"],
  ["they are", "they're"], ["that is", "that's"], ["is not", "isn't"], ["are not", "aren't"], ["do not", "don't"],
  ["does not", "doesn't"], ["cannot", "can't"], ["I will", "I'll"], ["what is", "what's"], ["where is", "where's"],
];
const NUMBERS: [string, string][] = [
  ["one", "1"], ["two", "2"], ["three", "3"], ["four", "4"], ["five", "5"], ["six", "6"], ["seven", "7"], ["eight", "8"],
  ["nine", "9"], ["ten", "10"], ["eleven", "11"], ["twelve", "12"], ["thirteen", "13"], ["fourteen", "14"], ["fifteen", "15"],
  ["sixteen", "16"], ["seventeen", "17"], ["eighteen", "18"], ["nineteen", "19"], ["twenty", "20"], ["thirty", "30"],
  ["forty", "40"], ["fifty", "50"], ["sixty", "60"], ["seventy", "70"], ["eighty", "80"], ["ninety", "90"],
];

/** Every combination of switching each contractible pair / number in `sentence` to its other form (the sentence itself included). */
function variants(sentence: string): string[] {
  let out = [sentence];
  const swaps: [RegExp, string][] = [];
  for (const [full, short] of PAIRS) {
    swaps.push([new RegExp(`(?<![\\w'])${full}(?![\\w'])`, "gi"), short], [new RegExp(`(?<![\\w'])${short}(?![\\w'])`, "gi"), full]);
  }
  for (const [word, digit] of NUMBERS) {
    swaps.push([new RegExp(`(?<![\\w'-])${word}(?![\\w'-])`, "gi"), digit], [new RegExp(`(?<![\\w'.-])${digit}(?![\\w'.-])`, "g"), word]);
  }
  for (const [re, to] of swaps) {
    if (out.length > 4000) break;
    out = [...new Set(out.flatMap((s) => [s, s.replace(re, to)]))];
  }
  return out;
}

type Item = { id: string; ex: Exercise; text: string; blank?: number };
function typedAnswers(): Item[] {
  const { lessons } = readContent(root);
  const items: Item[] = [];
  for (const { lesson } of lessons) for (const s of lesson.sections) for (const ex of s.exercises) {
    if (ex.type === "dictation") for (const t of [ex.audioText, ...(ex.accept ?? [])]) items.push({ id: ex.id, ex, text: t });
    if (ex.type === "translate_th_en") for (const t of ex.accept) items.push({ id: ex.id, ex, text: t });
    if (ex.type === "fill_blank") ex.answer.forEach((t, i) => items.push({ id: ex.id, ex, text: t, blank: i }));
  }
  return items;
}

describe("real content: contraction and digit variants of every accepted answer are marked right", () => {
  const items = typedAnswers();
  it("has typed answers to check", () => expect(items.length).toBeGreaterThan(20));

  it("the enumerator finds variants in real content (guards against a vacuous test)", () => {
    const withVariants = items.filter((i) => variants(i.text).length > 1);
    expect(withVariants.length).toBeGreaterThan(5);
  });

  it("every variant grades correct", () => {
    const failures: string[] = [];
    for (const { id, ex, text, blank } of items) {
      for (const v of variants(text)) {
        const answer = blank === undefined
          ? { kind: "text" as const, text: v }
          : { kind: "texts" as const, texts: (ex as Extract<Exercise, { type: "fill_blank" }>).answer.map((a, i) => (i === blank ? v : a)) };
        const g = gradeExercise(ex, answer);
        if ("error" in g || !g.correct) failures.push(`${id}: "${v}" (variant of "${text}")`);
      }
    }
    expect(failures).toEqual([]);
  });
});
