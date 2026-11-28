// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildContext } from "./context";
import { checkVocabSpelling } from "./vocab-spelling";
import { surfaceForms } from "./lexicon";
import { data, lessonFile, vocabFile, vocabItem } from "./test-support";

const run = (...items: ReturnType<typeof vocabItem>[]) => checkVocabSpelling(buildContext(data([lessonFile(1, [], [])], [vocabFile(items)])));

describe("vocab-spelling: a headword in the UK/US table carries the other spelling in forms", () => {
  it("flags a UK headword without forms.usSpelling, naming the key and the value to add", () => {
    const out = run(vocabItem({ id: "v-colour", word: "colour" }));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ rule: "vocab-spelling", file: "content/vocab/oxford-3000/a1.json", id: "v-colour" });
    expect(out[0].severity).toBeUndefined();
    expect(out[0].message).toContain('"usSpelling": "color"');
    expect(out[0].message).toContain('"colour"');
  });
  it("flags a US headword without forms.ukSpelling", () => {
    const out = run(vocabItem({ id: "v-mom", word: "mom" }));
    expect(out).toHaveLength(1);
    expect(out[0].message).toContain('"ukSpelling": "mum"');
  });
  it("passes when the key holds the table's other spelling", () => {
    expect(run(vocabItem({ id: "v-colour", word: "colour", forms: { plural: "colours", usSpelling: "color" } }))).toEqual([]);
    expect(run(vocabItem({ id: "v-mom", word: "mom", forms: { ukSpelling: "mum" } }))).toEqual([]);
  });
  it("flags a wrong value and says what it should be", () => {
    const out = run(vocabItem({ id: "v-colour", word: "colour", forms: { usSpelling: "colr" } }));
    expect(out).toHaveLength(1);
    expect(out[0].message).toContain('"color"');
    expect(out[0].message).toContain('"colr"');
  });
  it("the wrong key (ukSpelling on a UK headword) is flagged too", () => {
    expect(run(vocabItem({ id: "v-colour", word: "colour", forms: { ukSpelling: "color" } }))).toHaveLength(1);
  });
  it("ignores other words, and multi-word headwords", () => {
    expect(run(vocabItem({ id: "v-hour", word: "hour" }), vocabItem({ id: "v-four", word: "four" }), vocabItem({ id: "v-ice-cream", word: "ice cream" }))).toEqual([]);
  });
});

describe("the spelling keys are word forms (taught-words sees them), unlike gradable", () => {
  it("usSpelling and ukSpelling are surface forms; gradable is not", () => {
    expect(surfaceForms(vocabItem({ id: "v-grey", word: "grey", pos: "adjective", forms: { usSpelling: "gray", gradable: "no" } }))).toEqual(new Set(["grey", "gray"].concat([])));
  });
});
