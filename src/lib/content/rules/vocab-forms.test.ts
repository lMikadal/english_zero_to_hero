// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildContext } from "./context";
import { checkVocabForms } from "./vocab-forms";
import { data, lessonFile, vocabFile, vocabItem } from "./test-support";

const run = (...items: ReturnType<typeof vocabItem>[]) => checkVocabForms(buildContext(data([lessonFile(1, [], [])], [vocabFile(items)])));

describe("vocab-forms: adjectives list comparative and superlative", () => {
  it("passes an adjective that lists both", () => {
    expect(run(vocabItem({ id: "v-big", pos: "adjective", forms: { comparative: "bigger", superlative: "biggest" } }))).toEqual([]);
  });
  it("flags an adjective with neither, naming the entry and the keys to add", () => {
    const out = run(vocabItem({ id: "v-big", pos: "adjective" }));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ rule: "vocab-forms", file: "content/vocab/oxford-3000/a1.json", id: "v-big" });
    expect(out[0].message).toContain("comparative");
    expect(out[0].message).toContain("superlative");
    expect(out[0].message).toContain('"gradable": "no"');
  });
  it("flags an adjective that lists only one", () => {
    expect(run(vocabItem({ id: "v-big", pos: "adjective", forms: { comparative: "bigger" } }))).toHaveLength(1);
  });
  it("lets a non-gradable adjective say so, and ignores other parts of speech", () => {
    expect(run(vocabItem({ id: "v-dead", pos: "adjective", forms: { gradable: "no" } }), vocabItem({ id: "v-cat", pos: "noun" }))).toEqual([]);
  });
});
