// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Exercise } from "../schema";
import type { LoadedLesson } from "../loader";
import { buildContext } from "./context";
import { checkCastFacts, frequencyClaims } from "./cast-facts";
import { data, exId, instruction, lessonFile, vocabFile, vocabItem } from "./test-support";

const claims = (t: string) => frequencyClaims(t).map((c) => [c.who, c.adverb, c.verb, c.head]);
const read = (day: number, text: string, n = 1): Exercise => ({
  id: exId(day, "read", n), type: "read_passage", instruction, text, questions: [{ question: { en: "Q?", th: "ค" }, choices: ["a", "b"], answer: 0 }],
});
const lessons = (...specs: [number, string][]): LoadedLesson[] => specs.map(([d, t]) => lessonFile(d, [], [read(d, t)]));
const check = (ls: LoadedLesson[]) => checkCastFacts(buildContext(data(ls, [vocabFile([vocabItem({ id: "v-cat" })])])));

describe("frequencyClaims", () => {
  it("reads 'Name ADVERB verb (object)': the verb is made a base form, determiners and 'to' are skipped", () => {
    expect(claims("Leo sometimes watches TV.")).toEqual([["Leo", "sometimes", "watch", "tv"]]);
    expect(claims("Leo often listens to music. Dan always arrives early.")).toEqual([["Leo", "often", "listen", "music"], ["Dan", "always", "arrive", "early"]]);
    expect(claims("Rose never drinks coffee.")).toEqual([["Rose", "never", "drink", "coffee"]]);
    expect(claims("Nan usually takes the train.")).toEqual([["Nan", "usually", "take", "train"]]);
    expect(claims("Dan often studies a book.")).toEqual([["Dan", "often", "study", "book"]]);
  });
  it("reads a sentence-initial adverb and a be-sentence", () => {
    expect(claims("Sometimes Leo watches TV.")).toEqual([["Leo", "sometimes", "watch", "tv"]]);
    expect(claims("Rose is never late.")).toEqual([["Rose", "never", "be", "late"]]);
  });
  it("reads he/she after a sentence that names exactly one person, and I after a single speaker or a label", () => {
    expect(claims("This is Dan. He always arrives early.")).toEqual([["Dan", "always", "arrive", "early"]]);
    expect(claims("Dan and Rose are here. She always arrives early.")).toEqual([]);
    expect(claims("Hi! I am Leo. I sometimes watch TV.")).toEqual([["Leo", "sometimes", "watch", "tv"]]);
    expect(claims("Nan: I often watch films.\nRose: I never shop at weekends.")).toEqual([["Nan", "often", "watch", "film"], ["Rose", "never", "shop", "weekend"]]);
    expect(claims("I sometimes watch TV.")).toEqual([]);
  });
  it("reads nothing from a general statement, a question or a negation", () => {
    expect(claims("People often watch TV. Do you often watch TV? Leo does not often cook.")).toEqual([]);
  });
});

describe("frequencyClaims: the claim includes a following prepositional phrase, and never reads but/and as an object", () => {
  it("keeps the phrase after the object head as the claim's tail", () => {
    expect(frequencyClaims("Rose usually goes to school by bus.").map((c) => [c.who, c.verb, c.head, c.tail])).toEqual([["Rose", "go", "school", "by bus"]]);
    expect(frequencyClaims("Dan often eats rice for dinner.").map((c) => [c.head, c.tail])).toEqual([["rice", "for dinner"]]);
    expect(frequencyClaims("Dan often eats rice.").map((c) => [c.head, c.tail])).toEqual([["rice", ""]]);
    expect(frequencyClaims("Leo often listens to music.").map((c) => [c.head, c.tail])).toEqual([["music", ""]]);
  });
  it("splits at but / and: one claim for each person, and 'but' is never an object", () => {
    expect(claims("Dan never cooks but Rose always cooks.")).toEqual([["Dan", "never", "cook", ""], ["Rose", "always", "cook", ""]]);
    expect(claims("Leo often walks and Nan sometimes drives.")).toEqual([["Leo", "often", "walk", ""], ["Nan", "sometimes", "drive", ""]]);
    expect(claims("Dan never cooks but he often washes the plates.")).toEqual([["Dan", "never", "cook", ""]]);
  });
});

describe("cast-facts (warning): one person, one verb, one thing, one frequency within a week", () => {
  it("warns when the same person+verb+object has two adverbs in one week, naming both places (the week-7 Leo and Dan)", () => {
    const out = check(lessons([44, "Leo often watches TV."], [47, "Leo sometimes watches TV."]));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ rule: "cast-facts", severity: "warning", file: "content/lessons/day-047.json", id: "d047-read-01" });
    for (const t of ['"Leo"', "watch", "tv", "often", "sometimes", "day-044.json", "d044-read-01", "d047-read-01"]) expect(out[0].message).toContain(t);
  });
  it("is silent when the adverbs agree, when the verb or object differs, for different people, and across weeks", () => {
    expect(check(lessons([44, "Leo often watches TV."], [45, "Leo often watches TV."]))).toEqual([]);
    expect(check(lessons([44, "Leo often watches TV."], [45, "Leo sometimes listens to music."]))).toEqual([]);
    expect(check(lessons([44, "Leo often watches TV."], [45, "Dan sometimes watches TV."]))).toEqual([]);
    expect(check(lessons([49, "Leo often watches TV."], [50, "Leo sometimes watches TV."]))).toEqual([]);
  });
  it("different habits are different claims: by bus vs on foot, rice vs rice for dinner", () => {
    expect(check(lessons([44, "Rose usually goes to school by bus."], [45, "Rose sometimes goes to school on foot."]))).toEqual([]);
    expect(check(lessons([44, "Dan often eats rice."], [45, "Dan always eats rice for dinner."]))).toEqual([]);
    expect(check(lessons([44, "Rose usually goes to school by bus."], [45, "Rose always goes to school by bus."]))).toHaveLength(1);
  });
  it("one warning per person and fact, and he/she through a one-name sentence counts", () => {
    expect(check(lessons([44, "Dan often arrives early."], [45, "Dan usually arrives early."], [46, "Dan always arrives early."]))).toHaveLength(1);
    expect(check(lessons([48, "This is Dan. He always arrives early."], [49, "Dan often arrives early."]))).toHaveLength(1);
  });
});
