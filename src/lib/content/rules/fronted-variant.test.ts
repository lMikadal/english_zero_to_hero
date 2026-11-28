// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Exercise } from "../schema";
import { buildContext } from "./context";
import { checkFrontedVariant, frontedVariants } from "./fronted-variant";
import { data, exId, instruction, lessonFile, vocabFile, vocabItem } from "./test-support";

const arrange = (answer: string, accept?: string[]): Exercise => ({ id: exId(1, "write"), type: "arrange_words", instruction, words: answer.split(" "), answer, ...(accept ? { accept } : {}) });
const translate = (accept: string[]): Exercise => ({ id: exId(1, "write", 2), type: "translate_th_en", instruction, th: "ก", accept });
const bank = [vocabItem({ id: "v-go", word: "go", pos: "verb" }), vocabItem({ id: "v-open", word: "open", pos: "verb" }), vocabItem({ id: "v-school", word: "school" })];
const run = (ex: Exercise) => checkFrontedVariant(buildContext(data([lessonFile(1, [], [ex])], [vocabFile(bank)])));
const variants = (s: string) => frontedVariants(s).map((v) => v.variant);

describe("frontedVariants: the sentence with a frontable element first", () => {
  it("sometimes / usually move to the front; the first word loses its capital unless it is I or a name", () => {
    expect(variants("We sometimes watch a film")).toEqual(["Sometimes we watch a film"]);
    expect(variants("Nan usually takes a train to school")).toEqual(["Usually Nan takes a train to school"]);
    expect(variants("I sometimes watch TV")).toEqual(["Sometimes I watch TV"]);
    expect(variants("She is usually late")).toEqual(["Usually she is late"]);
  });
  it("a trailing time or place phrase moves to the front", () => {
    expect(variants("I walk to school every day")).toEqual(["Every day I walk to school"]);
    expect(variants("I sing and dance every week")).toEqual(["Every week I sing and dance"]);
    expect(variants("My son plays football after school")).toEqual(["After school my son plays football"]);
    expect(variants("I play a game after dinner")).toEqual(["After dinner I play a game"]);
    expect(variants("I swim at the weekend")).toEqual(["At the weekend I swim"]);
    expect(variants("She drinks tea in the morning")).toEqual(["In the morning she drinks tea"]);
    expect(variants("We dance on Saturday")).toEqual(["On Saturday we dance"]);
    expect(variants("He eats before bed")).toEqual(["Before bed he eats"]);
  });
  it("never fronts always, never or often, and demands nothing when the element already starts the sentence", () => {
    for (const s of ["She always drinks tea", "I never drink coffee", "He often works late", "Sometimes I watch TV", "Every day I walk to school", "After school I play"]) expect(variants(s), s).toEqual([]);
  });
  it("skips questions, imperatives, a comma or and/but/or before the adverb, look after, and a phrase inside a noun phrase", () => {
    for (const s of ["Do you sometimes watch TV", "How often do you walk every day", "Is she usually late", "Go home after school", "Open the door every day", "Please go after school",
      "I run and sometimes swim", "We eat, and we sometimes cook", "I look after my baby", "The class before lunch is big", "What do you do after school"]) expect(variants(s), s).toEqual([]);
  });
});

describe("fronted-variant (warning): the fronted sentence must be accepted", () => {
  it("flags the incident items, naming the exercise and the sentence to add", () => {
    const out = run(arrange("We sometimes watch a film"));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ rule: "fronted-variant", severity: "warning", file: "content/lessons/day-001.json", id: "d001-write-01" });
    expect(out[0].message).toContain('"We sometimes watch a film"');
    expect(out[0].message).toContain('"Sometimes we watch a film"');
    expect(out[0].message).toContain("accept");
    expect(run(translate(["I walk to school every day"]))[0].message).toContain('"Every day I walk to school"');
  });
  it("is satisfied by the variant in accept (case and commas ignored), also for translate_th_en", () => {
    expect(run(arrange("We sometimes watch a film", ["Sometimes we watch a film"]))).toEqual([]);
    expect(run(arrange("My son plays football after school", ["After school, my son plays football"]))).toEqual([]);
    expect(run(translate(["I play a game after dinner", "After dinner I play a game"]))).toEqual([]);
  });
  it("looks at every accepted sentence and reports the exercise once", () => {
    expect(run(translate(["I play a game after dinner", "I play games after dinner"]))).toHaveLength(1);
    expect(run(translate(["After dinner I play a game", "I play a game after dinner", "After dinner I play games", "I play games after dinner"]))).toEqual([]);
  });
  it("does not look at dictation, fill_blank or sentences that need nothing", () => {
    const dict: Exercise = { id: exId(1, "listen"), type: "dictation", instruction, audioText: "We sometimes watch a film" };
    expect(run(dict)).toEqual([]);
    expect(run(arrange("She always drinks tea"))).toEqual([]);
  });
});
