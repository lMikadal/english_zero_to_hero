// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Exercise } from "../schema";
import type { LoadedLesson } from "../loader";
import { COLOUR_WORDS, checkCastProps, propClaims } from "./cast-props";
import { buildContext } from "./context";
import path from "node:path";
import { readContent } from "../loader";
import { data, exId, instruction, lessonFile, vocabFile, vocabItem } from "./test-support";

const claims = (t: string) => propClaims(t).map((c) => [c.owner, c.noun, c.colour]);
const read = (day: number, text: string, n = 1): Exercise => ({
  id: exId(day, "read", n), type: "read_passage", instruction, text,
  questions: [{ question: { en: "Q?", th: "คำถาม" }, choices: ["a", "b"], answer: 0 }],
});
const lessons = (...specs: [number, string][]): LoadedLesson[] => specs.map(([d, t]) => lessonFile(d, [], [read(d, t)]));
const bank = [vocabItem({ id: "v-cat" }), ...COLOUR_WORDS.filter((c) => c !== "gray").map((c) => vocabItem({ id: `v-${c}`, word: c, pos: "adjective" }))];
const check = (ls: LoadedLesson[]) => checkCastProps(buildContext(data(ls, [vocabFile(bank)])));

describe("propClaims", () => {
  it("reads \"Name's NOUN is COLOUR\"", () => {
    expect(claims("Nan's umbrella is orange.")).toEqual([["Nan", "umbrella", "orange"]]);
    expect(claims("Rose's bag is grey. Nan's bag is pink.")).toEqual([["Rose", "bag", "grey"], ["Nan", "bag", "pink"]]);
  });
  it("reads \"Name has a COLOUR NOUN\" and a first-person list for the single speaker", () => {
    expect(claims("Nan has a green umbrella.")).toEqual([["Nan", "umbrella", "green"]]);
    expect(claims("Hello! I am Nan. I have a red bag, a blue pen and an orange umbrella.")).toEqual([["Nan", "bag", "red"], ["Nan", "pen", "blue"], ["Nan", "umbrella", "orange"]]);
  });
  it("reads \"My NOUN is COLOUR\" and \"My COLOUR NOUN\" only when the text has one speaker", () => {
    expect(claims("Hi! I am Nan. My bag is brown. My pink hat is new.")).toEqual([["Nan", "bag", "brown"], ["Nan", "hat", "pink"]]);
    expect(claims("My bag is brown.")).toEqual([]);
    expect(claims("I am Ann. I am Ben. My bag is brown.")).toEqual([]);
  });
  it("uses the label of a dialogue line as the speaker of that line", () => {
    expect(claims("Nan: My bag is pink.\nRose: My bag is grey.")).toEqual([["Nan", "bag", "pink"], ["Rose", "bag", "grey"]]);
  });
  it("reads gray as grey and ignores things that are not a colour claim", () => {
    expect(claims("Rose's bag is gray.")).toEqual([["Rose", "bag", "grey"]]);
    expect(claims("Nan's bag is new.")).toEqual([]);
    expect(claims("I am Nan. I have an orange and an apple.")).toEqual([]);
    expect(claims("The bag is red. It is a red bag.")).toEqual([]);
  });
});

describe("cast-props: one owner, one noun, one colour within a week", () => {
  it("warns when the same owner's noun has two colours in one week, naming both places", () => {
    const out = check(lessons([23, "Nan's umbrella is orange."], [28, "Hi! I am Nan. I have a green umbrella."]));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ rule: "cast-props", severity: "warning", file: "content/lessons/day-028.json", id: "d028-read-01" });
    for (const t of ['"Nan"', "umbrella", "orange", "green", "day-023.json", "d023-read-01", "d028-read-01"]) expect(out[0].message).toContain(t);
  });
  it("is silent when the colours agree, when the nouns or owners differ, or across weeks", () => {
    expect(check(lessons([23, "Nan's umbrella is orange."], [24, "I am Nan. My umbrella is orange."]))).toEqual([]);
    expect(check(lessons([23, "Nan's umbrella is orange."], [24, "Rose's umbrella is green."]))).toEqual([]);
    expect(check(lessons([23, "Nan's umbrella is orange."], [24, "Nan's bag is green."]))).toEqual([]);
    expect(check(lessons([28, "Nan's umbrella is orange."], [29, "Nan's umbrella is green."]))).toEqual([]);
  });
  it("one warning per owner and noun", () => {
    expect(check(lessons([23, "Nan's bag is red."], [24, "Nan's bag is blue."], [25, "Nan's bag is green."]))).toHaveLength(1);
  });
});

describe("COLOUR_WORDS", () => {
  it("is the closed list of colour words (spellings folded), all of them vocab-bank words except the US spelling", () => {
    expect(COLOUR_WORDS).toEqual(expect.arrayContaining(["red", "blue", "green", "yellow", "black", "white", "brown", "orange", "pink", "grey"]));
  });
});

describe("COLOUR_WORDS and the real vocab bank", () => {
  it("every colour word except the US spelling is an entry of the bank", () => {
    const { vocab } = readContent(path.resolve(import.meta.dirname, "../../../../content"));
    const heads = new Set(vocab.flatMap(({ items }) => items.map((i) => i.word.toLowerCase())));
    expect(COLOUR_WORDS.filter((c) => c !== "gray" && !heads.has(c))).toEqual([]);
  });
});
