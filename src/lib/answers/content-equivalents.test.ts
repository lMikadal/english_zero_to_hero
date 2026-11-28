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
  // 's is only folded when what follows cannot be a verb: written out by hand here (determiners, numbers, a few prepositions/places, -ing words, plain adjectives)
  const NOT_PARTICIPLE = "(?= (?:not )?(?:a|an|the|my|your|his|her|our|their|this|that|these|those|in|at|on|from|here|there|\\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|\\w{2,}ing|happy|big|nice|fine|good|hot|old|well|ready|late|sorry|tall|short|busy)\\b)";
  for (const [full, short] of PAIRS) {
    const guard = short.endsWith("'s") ? NOT_PARTICIPLE : "";
    swaps.push([new RegExp(`(?<![\\w'])${full}(?![\\w'])${guard}`, "gi"), short], [new RegExp(`(?<![\\w'])${short}(?![\\w'])${guard}`, "gi"), full]);
  }
  for (const w of ["he", "she", "it", "that", "there", "what", "where", "who", "how"]) {
    swaps.push([new RegExp(`(?<![\\w'])${w} has (?=been|got)`, "gi"), `${w}'s `], [new RegExp(`(?<![\\w'])${w}'s (?=been|got)`, "gi"), `${w} has `]);
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
const isStrict = (ex: Exercise) => "strict" in ex && ex.strict === true;
function typedAnswers(): Item[] {
  const { lessons } = readContent(root);
  const items: Item[] = [];
  for (const { lesson } of lessons) for (const s of lesson.sections) for (const ex of s.exercises) {
    if (isStrict(ex)) continue;
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

describe("over-acceptance: wrong answers stay wrong", () => {
  const translate = (accept: string[]) => ({ id: "d001-write-01", type: "translate_th_en", instruction: { th: "ก" }, th: "ก", accept }) as unknown as Exercise;
  const grade = (accept: string[], input: string) => {
    const g = gradeExercise(translate(accept), { kind: "text", text: input });
    return "error" in g ? false : g.correct;
  };
  it.each([
    [["He's been to Japan"], "He is been to Japan"],
    [["What's happened"], "What is happened"],
    [["He's got a cat"], "He is got a cat"],
    [["He's come home"], "He is come home"],
    [["He's had lunch"], "He is had lunch"],
    [["He's sat down"], "He is sat down"],
    [["He's bought a car"], "He is bought a car"],
    [["He's come home"], "He has come home"],
    [["He's never been to Japan"], "He is never been to Japan"],
    [["She's just finished"], "She is just finished"],
    [["He's used my pen"], "He is used my pen"],
    [["What's he done"], "What is he done"],
    [["It's a door"], "Its a door"],
    [["Its door is big"], "It's door is big"],
    [["His door"], "He's door"],
    [["He is two"], "He is to"],
    [["He is four"], "He is for"],
    [["He is fourteen"], "He is 40"],
    [["He is forty"], "He is 14"],
    [["a hundred"], "a 100"],
    [["ten"], "110"],
  ])("%j does not accept %j", (accept, input) => expect(grade(accept, input)).toBe(false));

  it("over real content: swapping a number for a different one is wrong unless it is itself accepted", () => {
    const next: Record<string, string> = Object.fromEntries(NUMBERS.map(([w], i) => [w, NUMBERS[(i + 1) % NUMBERS.length][0]]));
    const re = new RegExp(`\\b(${NUMBERS.map(([w]) => w).join("|")})\\b`, "i");
    const failures: string[] = [];
    let tried = 0;
    for (const { id, ex, text, blank } of typedAnswers()) {
      const m = re.exec(text);
      if (!m || blank !== undefined || isStrict(ex)) continue;
      const wrong = text.replace(re, next[m[1].toLowerCase()]);
      const g = gradeExercise(ex, { kind: "text", text: wrong });
      tried++;
      const alsoAccepted = (ex.type === "dictation" ? [ex.audioText, ...(ex.accept ?? [])] : ex.type === "translate_th_en" ? ex.accept : []).some((a) => a === wrong);
      if (!alsoAccepted && !("error" in g) && g.correct) failures.push(`${id}: "${wrong}"`);
    }
    expect(tried).toBeGreaterThan(3);
    expect(failures).toEqual([]);
  });
});
